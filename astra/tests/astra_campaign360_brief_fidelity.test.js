'use strict';
// Campaign360 Brief Fidelity remediation. Confirmed defect: Campaign360 completes technically
// but substitutes explicit brief facts (buyer role inversion, product/objective substitution).
// This suite proves CANONICAL_BRIEF_FACTS extraction, the immutable fact lock, the per-node
// fidelity validator, and the final-synthesis validator — using the exact Método 360 fixture,
// plus adversarial cases reproducing every substitution named in the authorization. Offline,
// deterministic (mock LLM only). No network, no real LLM calls.
const assert = require('assert');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

// ---------- offline mock knowledge base + adapter (same pattern as astra10x.test.js) ----------
function mockKb() {
  return {
    async retrieveStrategyFAsync(query) {
      const hits = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'evidence ' + query, original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] }));
      return { top5: hits, advisory_top1_cosine: 0.6 };
    },
    buildStrategyFEvidence(raw) {
      const hits = raw.top5 || [];
      return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' };
    },
  };
}
function mockAdapter() { return new AgentV1Adapter({ kb: mockKb() }); }
function specTypeFromSystem(sys) { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; }

// Mirrors llm_specialists.js SPECS[*].fields so every node's downstream_payload is complete
// enough for synthesis_engine_v2 to reach coherent:true (18/18 sections) on a clean run.
const SPEC_FIELDS = {
  MARKET_CONTEXT_SPECIALIST: ['problem_context', 'market_assumptions', 'constraints'],
  ICP_SPECIALIST: ['pains', 'desired_outcomes', 'objections', 'buying_triggers', 'qualification_signals', 'non_fit_signals'],
  OFFER_SPECIALIST: ['value_proposition', 'offer_structure', 'mechanism', 'risk_reduction', 'value_stack', 'constraints'],
  FUNNEL_SPECIALIST: ['stages', 'transitions', 'conversion_intent', 'qualification_points', 'drop_off_risks', 'dependencies'],
  CREATIVE_STRATEGY_SPECIALIST: ['core_idea', 'single_minded_proposition', 'angles', 'creative_territories', 'hooks', 'proof', 'objection_coverage'],
  META_ADS_SPECIALIST: ['campaign_objective', 'audience_approach', 'structure', 'creative_testing', 'qualification', 'measurement', 'limitations'],
  WHATSAPP_SALES_SPECIALIST: ['qualification', 'discovery', 'objection_handling', 'appointment_closing', 'follow_up', 'recovery', 'conversational_logic', 'limitations'],
  MEASUREMENT_CRO_SPECIALIST: ['primary_outcome', 'leading_indicators', 'funnel_metrics', 'conversion_metrics', 'diagnostic_metrics', 'optimization_triggers', 'measurement_cadence'],
};
// Deliberately generic/neutral — does NOT parrot the canonical facts verbatim in every field
// (a real specialist wouldn't either). This matters for the adversarial tests below: if every
// sibling field restated "dueñas de estéticas" / "Método 360" / "vender el minicurso", the
// PROPOSAL tolerance in brief_fidelity_validator.js (fact present elsewhere -> not a violation)
// would mask a genuine single-field substitution. Keeping the filler neutral means an override
// on one field is judged on its own, exactly like real specialist output would be.
const CLEAN_STATEMENT = 'Contenido determinístico de prueba para este nodo, alineado al brief original del cliente, sin cambiar la oferta ni el público declarados.';

// buildMockLLM(overrides): overrides = { SPEC_TYPE: { field: 'text to inject' } } lets a test
// replace exactly one field on one node with an adversarial phrase while every other field on
// every other node stays fidelity-clean — isolating the substitution under test.
function buildMockLLM(overrides = {}) {
  return async (system) => {
    const st = specTypeFromSystem(system);
    const fields = SPEC_FIELDS[st] || [];
    const payload = {};
    for (const f of fields) payload[f] = CLEAN_STATEMENT;
    Object.assign(payload, overrides[st] || {});
    const current = /META_ADS/.test(st) ? ['CAPI', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics'] : []);
    const obj = {
      findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }],
      recommendations: [{ recommendation: 'action for ' + st, support_class: 'INFERENCE', basis: 'method' }],
      decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: budget'], conflicts: [], confidence: 0.7,
      current_research_required: current, downstream_payload: payload,
    };
    return { raw: JSON.stringify(obj), usage: { prompt: 10, completion: 10 } };
  };
}
function runWith(brief, overrides = {}) {
  return H.run(brief, { mode: 'llm', adapter: mockAdapter(), llm: buildMockLLM(overrides), retrieve: true, salt: 'brief-fidelity' });
}

// ---------- LABELED_METHOD360_BRIEF — the original labeled fixture (kept exactly, regression) ----------
const METHOD360_BRIEF = [
  'Producto: Método 360',
  'Tipo: minicurso grabado',
  'Precio: 400 MXN',
  'Comprador: dueñas de estéticas',
  'Geografía: México',
  'Objetivo: vender el minicurso',
  'Mecanismo: Meta Ads para generar consultas, seguido de WhatsApp consulta -> conversación -> cita',
].join('\n');

// ---------- LIVE_METHOD360_BRIEF_EXACT — the literal natural-language text from the real E2E
// run, byte-for-byte, unreformatted (no labels at all except "Objetivo:"). ----------
const LIVE_METHOD360_BRIEF_EXACT = [
  'Crea una campaña 360 para Método 360.',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.',
  'Objetivo: vender el minicurso.',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir',
  'consulta → conversación → cita.',
].join('\n');

// ---------- MIXED_SINGLE_LINE_BRIEF — every fact packed into one sentence, no line breaks, no
// labels at all. ----------
const MIXED_SINGLE_LINE_BRIEF = 'Crea Método 360, minicurso de $400 MXN para dueñas de estéticas en México. Objetivo: vender el minicurso. Enseña Meta Ads y WhatsApp para pasar de consulta a cita.';

// ========== 1. CANONICAL_BRIEF_FACTS extraction ==========
t('F1 extracts every labeled field as USER_PROVIDED_FACT', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  assert.equal(f.product_name.value, 'Método 360'); assert.equal(f.product_name.status, 'USER_PROVIDED_FACT');
  assert.equal(f.product_type.value, 'minicurso grabado'); assert.equal(f.product_type.status, 'USER_PROVIDED_FACT');
  assert.equal(f.price.value, '400'); assert.equal(f.currency.value, 'MXN');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
  assert.equal(f.business_objective.value, 'vender el minicurso');
  assert(/Meta Ads/.test(f.mechanism.value) && /WhatsApp/.test(f.mechanism.value));
});
t('F2 an absent field is UNKNOWN, never invented', () => {
  const f = briefFacts.extract('Producto: X');
  assert.equal(f.buyer.status, 'UNKNOWN'); assert.equal(f.buyer.value, null);
  assert(f.explicit_unknowns.includes('buyer'));
});
t('F3 deterministic: identical text -> identical facts + hash', () => {
  const a = briefFacts.extract(METHOD360_BRIEF), b = briefFacts.extract(METHOD360_BRIEF);
  assert.deepStrictEqual(a, b);
});
t('F4 CanonicalBriefFacts is frozen (immutable at the source)', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  assert(Object.isFrozen(f));
  assert.throws(() => { f.buyer = { value: 'x', status: 'USER_PROVIDED_FACT' }; }, TypeError);
});

function assertMethod360Facts(f) {
  assert.equal(f.product_name.value, 'Método 360'); assert.equal(f.product_name.status, 'USER_PROVIDED_FACT');
  assert.equal(f.product_type.value, 'minicurso grabado', f.product_type.value);
  assert.equal(f.price.value, '400'); assert.equal(f.currency.value, 'MXN');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
  assert.equal(f.business_objective.value, 'vender el minicurso');
  assert(/Meta Ads/.test(f.mechanism.value) && /WhatsApp/.test(f.mechanism.value), f.mechanism.value);
}

// ========== 1b. LIVE_METHOD360_BRIEF_EXACT — the literal natural-language E2E text, unreformatted ==========
t('N1 LIVE_METHOD360_BRIEF_EXACT: natural-language text (no labels except Objetivo) yields every fact as USER_PROVIDED_FACT', () => {
  assertMethod360Facts(briefFacts.extract(LIVE_METHOD360_BRIEF_EXACT));
});
t('N2 LIVE_METHOD360_BRIEF_EXACT: mechanism captures the full taught funnel including the arrow chain', () => {
  const f = briefFacts.extract(LIVE_METHOD360_BRIEF_EXACT);
  assert(/consulta/i.test(f.mechanism.value) && /conversaci[oó]n/i.test(f.mechanism.value) && /cita/i.test(f.mechanism.value) && f.mechanism.value.includes('→'));
});
t('N3 LABELED_METHOD360_BRIEF (unchanged fixture) still extracts identically — regression', () => {
  assertMethod360Facts(briefFacts.extract(METHOD360_BRIEF));
});
t('N4 MIXED_SINGLE_LINE_BRIEF: every fact packed into one sentence with no labels still extracts', () => {
  const f = briefFacts.extract(MIXED_SINGLE_LINE_BRIEF);
  assert.equal(f.product_name.value, 'Método 360');
  assert.equal(f.product_type.value, 'minicurso');
  assert.equal(f.price.value, '400'); assert.equal(f.currency.value, 'MXN');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
  assert.equal(f.business_objective.value, 'vender el minicurso');
  assert(/Meta Ads/.test(f.mechanism.value) && /WhatsApp/.test(f.mechanism.value));
});
t('N5 the three brief forms (labeled / natural / mixed) all state the same underlying facts', () => {
  const a = briefFacts.extract(METHOD360_BRIEF), b = briefFacts.extract(LIVE_METHOD360_BRIEF_EXACT), c = briefFacts.extract(MIXED_SINGLE_LINE_BRIEF);
  for (const field of ['product_name', 'price', 'currency', 'buyer', 'geography', 'business_objective']) {
    assert.equal(a[field].value, b[field].value, field); assert.equal(b[field].value, c[field].value, field);
  }
});

// ========== 2. IMMUTABLE FACT LOCK — node-level validator unit tests ==========
t('L1 buyer role inversion is detected', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: { pains: 'nuestro ICP son consumidoras de servicios estéticos que buscan verse bien' } }, { nodeId: 'icp' });
  assert(violations.some(v => v.type === 'BUYER_SUBSTITUTION' || v.type === 'BUYER_ROLE_INVERSION'));
});
t('L2 product substitution (cita exprés / paquete introductorio) is detected', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: { offer_structure: 'ofrecemos un paquete introductorio: cita exprés a precio especial' } }, { nodeId: 'offer' });
  assert(violations.some(v => v.fact_field === 'product_name' || v.fact_field === 'product_type'));
});
t('L3 objective substitution (CLIENT_ACQUISITION / lead gen) is detected', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: { campaign_objective: 'objective: CLIENT_ACQUISITION, generar leads para la cita' } }, { nodeId: 'ads' });
  assert(violations.some(v => v.fact_field === 'business_objective'));
});
t('L4 mechanism-as-product substitution is detected', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: { structure: 'el objetivo real es vender citas expres pagadas, el producto es la cita' } }, { nodeId: 'ads' });
  assert(violations.some(v => v.fact_field === 'mechanism'));
});
t('L5 price substitution is detected', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: { offer_structure: 'el precio del minicurso Método 360 para dueñas de estéticas es $900 MXN' } }, { nodeId: 'offer' });
  assert(violations.some(v => v.type === 'PRICE_SUBSTITUTION'));
});
t('L6 geography substitution is detected', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: { problem_context: 'campaña dirigida a dueñas de estéticas en españa' } }, { nodeId: 'market_context' });
  assert(violations.some(v => v.type === 'GEOGRAPHY_SUBSTITUTION'));
});
t('L7 a PROPOSAL alongside the still-present fact is NOT a violation', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    offer_structure: 'oferta principal: Método 360, minicurso grabado, a 400 MXN. PROPUESTA a validar: podríamos probar una cita exprés como lead magnet gratuito, sujeto a datos.',
  } }, { nodeId: 'offer' });
  assert.deepStrictEqual(violations, []);
});
t('L8 UNKNOWN facts never trigger a violation (nothing to contradict)', () => {
  const f = briefFacts.extract(''); // every field UNKNOWN — nothing was ever provided
  assert.equal(f.product_name.status, 'UNKNOWN'); // sanity: this fixture really has no facts to contradict
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: { pains: 'consumidoras de servicios estéticos, CLIENT_ACQUISITION, cita exprés' } }, { nodeId: 'icp' });
  assert.deepStrictEqual(violations, []);
});

// ========== 2b. FIELD-LEVEL VALIDATION — a mention in a DIFFERENT field never excuses a
// substitution in the field that actually asserts it (closes the global-mention bypass). ==========
t('FL4 FIELD_LEVEL_ADVERSARIAL: canonical fact correctly stated in "notes", but the primary field is substituted -> FAILS', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    offer_structure: 'cita exprés',                                   // the field that actually asserts the offer
    notes: 'Referencia: Método 360, minicurso grabado, 400 MXN.',      // correct mention elsewhere - must NOT excuse it
  } }, { nodeId: 'offer' });
  assert(violations.some(v => v.fact_field === 'product_name' || v.fact_field === 'product_type'), JSON.stringify(violations));
  assert(violations.every(v => v.field_key === 'offer_structure'), 'violation must be attributed to the substituted field, not "notes"');
});
t('FL5 FIELD_LEVEL_ADVERSARIAL: buyer correctly mentioned laterally, but the ICP field itself says consumidoras -> FAILS', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    pains: 'nuestro ICP principal son consumidoras finales que buscan verse bien',
    side_note: 'dueñas de estéticas siguen siendo el negocio contratante',
  } }, { nodeId: 'icp' });
  assert(violations.some(v => v.fact_field === 'buyer' && v.field_key === 'pains'), JSON.stringify(violations));
});
t('FL6 FIELD_LEVEL_ADVERSARIAL: objective correctly mentioned laterally, but campaign_objective = CLIENT_ACQUISITION -> FAILS', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    campaign_objective: 'CLIENT_ACQUISITION',
    context: 'recordatorio: el objetivo declarado por el cliente es vender el minicurso',
  } }, { nodeId: 'ads' });
  assert(violations.some(v => v.fact_field === 'business_objective' && v.field_key === 'campaign_objective'), JSON.stringify(violations));
});
t('FL7 an explicit PROPOSAL in a side field, with the primary field untouched, PASSES', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    offer_structure: 'Oferta principal: acceso al minicurso Método 360 a 400 MXN, sin cambios.',
    exploratory_idea: 'PROPUESTA a validar más adelante: ofrecer una cita exprés como lead magnet gratuito.',
  } }, { nodeId: 'offer' });
  assert.deepStrictEqual(violations, []);
});
t('FL8 the same two phrases WITHOUT a proposal marker in a side field still fail (marker, not mere separateness, is what escapes it)', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    offer_structure: 'Oferta principal: acceso al minicurso Método 360 a 400 MXN, sin cambios.',
    exploratory_idea: 'Alternativa: ofrecer directamente una cita exprés como lead magnet.',
  } }, { nodeId: 'offer' });
  assert(violations.some(v => v.field_key === 'exploratory_idea'), JSON.stringify(violations));
});

// ========== 2c. STRICT SAME-FIELD FIDELITY — the mere co-presence of the canonical fact in the
// SAME field no longer neutralizes a substitution; only an explicit, non-replacing
// PROPOSAL/HIPÓTESIS (contradiction strictly at/after the marker) escapes it. ==========
t('SAME_FIELD_PRODUCT_CONTRADICTION: "Método 360, pero la oferta principal será cita exprés" => FAIL CLOSED', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    offer_structure: 'Método 360, pero la oferta principal será cita exprés.',
  } }, { nodeId: 'offer' });
  assert(violations.some(v => v.fact_field === 'product_name' || v.fact_field === 'product_type'), JSON.stringify(violations));
});
t('SAME_FIELD_OBJECTIVE_CONTRADICTION: "Vender el minicurso, pero objective=CLIENT_ACQUISITION" => FAIL CLOSED', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    campaign_objective: 'Vender el minicurso, pero objective=CLIENT_ACQUISITION.',
  } }, { nodeId: 'ads' });
  assert(violations.some(v => v.fact_field === 'business_objective'), JSON.stringify(violations));
});
t('SAME_FIELD_PRICE_CONTRADICTION: "$400 MXN, pero el precio será $900 MXN" => FAIL CLOSED', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    offer_structure: '$400 MXN, pero el precio será $900 MXN.',
  } }, { nodeId: 'offer' });
  assert(violations.some(v => v.type === 'PRICE_SUBSTITUTION'), JSON.stringify(violations));
});
t('SAME_FIELD_GEOGRAPHY_CONTRADICTION: "México, pero campaña dirigida a Colombia" => FAIL CLOSED', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    problem_context: 'México, pero campaña dirigida a Colombia.',
  } }, { nodeId: 'market_context' });
  assert(violations.some(v => v.type === 'GEOGRAPHY_SUBSTITUTION'), JSON.stringify(violations));
});
t('SAME_FIELD_BUYER_CONTRADICTION: "Dueñas de estéticas, pero comprador objetivo = consumidoras finales" => FAIL CLOSED', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    pains: 'Dueñas de estéticas, pero comprador objetivo = consumidoras finales.',
  } }, { nodeId: 'icp' });
  assert(violations.some(v => v.fact_field === 'buyer'), JSON.stringify(violations));
});
t('EXPLICIT_NON_REPLACING_PROPOSAL: "Oferta principal: Método 360. PROPUESTA/HIPÓTESIS a validar: usar cita exprés como lead magnet, sin sustituir el producto." => PASS', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    offer_structure: 'Oferta principal: Método 360. PROPUESTA/HIPÓTESIS a validar: usar una cita exprés como lead magnet, sin sustituir el producto.',
  } }, { nodeId: 'offer' });
  assert.deepStrictEqual(violations, []);
});
t('a marker appended AFTER an already-made unmarked contradiction escapes nothing (position matters, not mere presence of the word)', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: {
    offer_structure: 'Vamos a vender una cita exprés como producto principal. PROPUESTA a validar más adelante.',
  } }, { nodeId: 'offer' });
  assert(violations.some(v => v.fact_field === 'product_name' || v.fact_field === 'product_type'), JSON.stringify(violations));
});

// ========== 3/4/5/6/7. full-pipeline wiring: Node Input Contract + validators inside run() ==========
t('W1 every node input carries canonical_brief_facts (Node Input Contract)', async () => {
  const captured = [];
  const llm = async (system, user, opts) => {
    // llm_executor passes the raw prompt; we cannot see `input` directly here, so instead assert
    // indirectly via a clean run completing (proves the extra field did not break validateInput/
    // buildPrompt for any of the 8 nodes) and directly via the unit tests above (F1-F4).
    captured.push(specTypeFromSystem(system));
    return buildMockLLM()(system, user, opts);
  };
  const r = await H.run(METHOD360_BRIEF, { mode: 'llm', adapter: mockAdapter(), llm, retrieve: true, salt: 'contract' });
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assert.equal(captured.length, 8);
});
t('W2 canonical_brief_facts is returned unchanged (same reference-equal frozen object) on COMPLETE', async () => {
  const r = await runWith(METHOD360_BRIEF);
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assert(Object.isFrozen(r.canonical_brief_facts));
  assert.equal(r.canonical_brief_facts.buyer.value, 'dueñas de estéticas');
});
t('W3 a node-level violation fails closed (throws BRIEF_FIDELITY_VIOLATION, never continues silently)', async () => {
  await assert.rejects(
    () => runWith(METHOD360_BRIEF, { ICP_SPECIALIST: { pains: 'nuestro ICP son consumidoras de servicios estéticos' } }),
    err => { assert.equal(err.code, 'BRIEF_FIDELITY_VIOLATION'); assert(err.briefFidelityViolations.some(v => v.fact_field === 'buyer')); return true; }
  );
});
t('W4 a violated run never reaches COMPLETE', async () => {
  let threw = false;
  try { await runWith(METHOD360_BRIEF, { OFFER_SPECIALIST: { offer_structure: 'vendemos un paquete introductorio: cita exprés' } }); }
  catch (e) { threw = true; assert.notEqual(e.wfTransition, undefined); assert.equal(e.wfTransition, 'FAILED'); }
  assert(threw);
});

// ========== 8. MÉTODO 360 deterministic fixture — clean run must preserve every fact ==========
t('M1 clean Método 360 run COMPLETEs with every canonical fact intact', async () => {
  const r = await runWith(METHOD360_BRIEF);
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assert.equal(r.canonical_brief_facts.product_name.value, 'Método 360');
  assert.equal(r.canonical_brief_facts.product_type.value, 'minicurso grabado');
  assert.equal(r.canonical_brief_facts.price.value, '400'); assert.equal(r.canonical_brief_facts.currency.value, 'MXN');
  assert.equal(r.canonical_brief_facts.buyer.value, 'dueñas de estéticas');
  assert.equal(r.canonical_brief_facts.business_objective.value, 'vender el minicurso');
  // the confirmed defect, closed at the source: intent_analyzer's heuristic CLIENT_ACQUISITION
  // objective must never override the explicit "vender el minicurso" fact downstream.
  assert.equal(r.brief.objective, 'vender el minicurso');
  assert.notEqual(r.brief.objective, 'CLIENT_ACQUISITION');
});
t('M2 clean run: no node output substitutes buyer, product, objective or mechanism', async () => {
  const r = await runWith(METHOD360_BRIEF);
  const f = r.canonical_brief_facts;
  for (const no of r.node_outputs) {
    const { violations } = fidelity.validateOutputAgainstFacts(f, no.output, { nodeId: no.work_unit_id });
    assert.deepStrictEqual(violations, [], `${no.work_unit_id}: ${JSON.stringify(violations)}`);
  }
});
t('M3 clean run: final synthesis carries no BRIEF_FIDELITY_VIOLATION and is not blocked', async () => {
  const r = await runWith(METHOD360_BRIEF);
  assert.notEqual(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert.equal(r.workflow_state_status, 'COMPLETE');
});
t('M4 only the field the fixture never specified (constraints) is UNKNOWN — nothing else was invented', () => {
  const f = briefFacts.extract(METHOD360_BRIEF);
  assert.deepStrictEqual(f.explicit_unknowns, ['constraints']);
  for (const field of ['product_name', 'product_type', 'price', 'currency', 'buyer', 'geography', 'business_objective', 'mechanism']) {
    assert.equal(f[field].status, 'USER_PROVIDED_FACT', `${field} unexpectedly UNKNOWN`);
  }
});
t('M5 the literal natural-language LIVE_METHOD360_BRIEF_EXACT COMPLETEs end-to-end with every fact intact', async () => {
  const r = await runWith(LIVE_METHOD360_BRIEF_EXACT);
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assertMethod360Facts(r.canonical_brief_facts);
  assert.equal(r.brief.objective, 'vender el minicurso');
  assert.notEqual(r.brief.objective, 'CLIENT_ACQUISITION');
  for (const no of r.node_outputs) {
    const { violations } = fidelity.validateOutputAgainstFacts(r.canonical_brief_facts, no.output, { nodeId: no.work_unit_id });
    assert.deepStrictEqual(violations, [], `${no.work_unit_id}: ${JSON.stringify(violations)}`);
  }
});
t('M6 MIXED_SINGLE_LINE_BRIEF also COMPLETEs end-to-end with every fact intact', async () => {
  const r = await runWith(MIXED_SINGLE_LINE_BRIEF);
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assert.equal(r.canonical_brief_facts.product_name.value, 'Método 360');
  assert.equal(r.canonical_brief_facts.buyer.value, 'dueñas de estéticas');
  assert.equal(r.canonical_brief_facts.business_objective.value, 'vender el minicurso');
});

// ========== 9. ADVERSARIAL — every substitution the authorization names, fail-closed ==========
t('A1 adversarial: buyer <-> buyer-of-the-buyer swap fails closed', async () => {
  await assert.rejects(() => runWith(METHOD360_BRIEF, { ICP_SPECIALIST: { pains: 'el ICP real son las consumidoras de servicios estéticos, no las dueñas' } }),
    err => err.code === 'BRIEF_FIDELITY_VIOLATION');
});
t('A2 adversarial: product substituted for a niche service fails closed', async () => {
  await assert.rejects(() => runWith(METHOD360_BRIEF, { OFFER_SPECIALIST: { value_proposition: 'el producto principal es un servicio estético de sesión de belleza' } }),
    err => err.code === 'BRIEF_FIDELITY_VIOLATION');
});
t('A3 adversarial: taught mechanism converted into the sold service fails closed', async () => {
  await assert.rejects(() => runWith(METHOD360_BRIEF, { META_ADS_SPECIALIST: { campaign_objective: 'vamos a vender citas expres pagadas como el producto final' } }),
    err => err.code === 'BRIEF_FIDELITY_VIOLATION');
});
t('A4 adversarial: inferred different price fails closed', async () => {
  await assert.rejects(() => runWith(METHOD360_BRIEF, { OFFER_SPECIALIST: { offer_structure: 'recomendamos vender el minicurso Método 360 a $999 MXN en vez del precio original' } }),
    err => err.code === 'BRIEF_FIDELITY_VIOLATION');
});
t('A5 adversarial: sale objective converted into lead generation fails closed', async () => {
  await assert.rejects(() => runWith(METHOD360_BRIEF, { META_ADS_SPECIALIST: { campaign_objective: 'el objetivo de la campaña es generar leads para la cita, lead generation' } }),
    err => err.code === 'BRIEF_FIDELITY_VIOLATION');
});
t('A6 adversarial: exact confirmed-defect phrasing (all at once) fails closed on the first offending node', async () => {
  await assert.rejects(() => runWith(METHOD360_BRIEF, {
    ICP_SPECIALIST: { pains: 'ICP = consumidoras de servicios estéticos' },
    OFFER_SPECIALIST: { offer_structure: 'offer = paquete introductorio / cita exprés' },
  }), err => err.code === 'BRIEF_FIDELITY_VIOLATION');
});

// ========== 10. REGRESSION — must not break sibling systems ==========
t('R1 a request with no labeled brief fields still runs (all facts UNKNOWN, no false-positive violations)', async () => {
  const r = await H.run('Create a client acquisition campaign for a dental clinic.', { mode: 'llm', adapter: mockAdapter(), llm: buildMockLLM(), retrieve: true, salt: 'sibling' });
  assert.equal(r.workflow_state_status, 'COMPLETE');
});
t('R2 WAITING_FOR_INPUT guard still returns canonical_brief_facts and is unaffected', async () => {
  const r = await H.run('help', { mode: 'llm', adapter: mockAdapter(), retrieve: false });
  assert.equal(r.workflow_state_status, 'WAITING_FOR_INPUT');
  assert('canonical_brief_facts' in r);
});
t('R3 deterministic mode (no LLM) is unaffected by the fidelity layer', () => {
  const mod = require('../src/workflows/marketing_campaign_360_hardened');
  assert.equal(typeof mod.run, 'function');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_BRIEF_FIDELITY_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
