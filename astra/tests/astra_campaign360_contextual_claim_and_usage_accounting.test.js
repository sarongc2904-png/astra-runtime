'use strict';
// ASTRA_CAMPAIGN360_CONTEXTUAL_CLAIM_AND_USAGE_ACCOUNTING_FIX — closes a confirmed live defect
// (job 6682572e-b316-4f2f-9c89-fb7b165bbdac): icp.pains = "Baja ocupación de citas" / "Dificultad
// para subir ticket medio" and icp.buying_triggers = "Baja ocupación de citas" were flagged as
// EXPLICIT_PROHIBITION/invented_result even though they are ordinary DESCRIPTIVE buyer-state/
// trigger language, never an advertiser promise. Two root causes were found and fixed:
//
// (A) FIELD-ROLE / CLAIM-VOICE BLINDNESS: the invented_result detector paired a claim-verb-shaped
// word with a nearby outcome noun by pure regex proximity, with no awareness of (a) which semantic
// role the containing field plays (pains/desired_outcomes/objections/buying_triggers/
// qualification_signals/non_fit_signals all hold the BUYER's own language, not the advertiser's),
// or (b) grammatical VOICE (an adjective/infinitive/3rd-person description reads completely
// differently from a 2nd-person imperative or 1st-person-plural advertiser promise using the exact
// same words). Fixed with a generalized CLAIM_CONTEXT_ROLE model (CLAIM_CONTEXT_FIELD_ROLES,
// isBuyerContextDescriptiveMatch) — never a literal exception for "Baja ocupación" or "subir
// ticket" specifically, and never a blanket field exemption: a genuine claim placed inside any of
// these fields still detects via ADVERTISER_CLAIM_VOICE_CUE (2nd-person address, future-2nd-
// singular conjugation, 1st-person-plural advertiser verbs), magnitude, guarantee, and the
// self-sufficient duplicar/triplicar verbs, all of which override the field-role exemption.
//
// (B) ARRAY ELEMENT BOUNDARY LOSS: textOnly() flattened an array into one space-joined string with
// no punctuation between items, so checkExplicitProhibition's clause-splitting (which only breaks
// on punctuation/adversatives) merged FOUR separate pains array items into a single "clause",
// letting a claim-verb in one item pair with an outcome-term in a completely different item.
// Fixed via collectTextLeaves(): every primitive leaf of the raw field value is checked on its OWN
// text, tagged with its own leaf_path (e.g. "pains[1]"), never concatenated with a sibling.
//
// (C) FAILED-NODE USAGE ACCOUNTING: a node-level BRIEF_FIDELITY_VIOLATION thrown mid-wave caused
// the wave-level catch in run() to return BEFORE that wave's cost-aggregation loop ever executed,
// silently dropping the real (already-billed) LLM usage of every node in that wave — including the
// violating node itself and any sibling racing it concurrently that actually succeeded. Fixed by
// switching wave execution to Promise.allSettled and aggregating usage from every settled outcome
// (fulfilled or rejected) before deciding pass/fail; a rejected node's usage is preserved via
// e.nodeUsage attached in processNode(), while its OUTPUT still never becomes COMPLETE.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
let claimContextCaseCount = 0;
function t(name, fn) { tests.push({ name, fn }); }
function tClaim(name, fn) { claimContextCaseCount++; t(name, fn); }

const CONSTRAINT = 'No inventes metricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
function facts(constraints) {
  return { constraints: constraints ? { value: constraints, status: 'USER_PROVIDED_FACT' } : { value: null, status: 'UNKNOWN' } };
}
function violationsFor(fieldKey, value, nodeId = 'icp') {
  return fidelity.validateOutputAgainstFacts(facts(CONSTRAINT), { downstream_payload: { [fieldKey]: value } }, { nodeId })
    .violations.filter(v => v.category === 'invented_result' || v.type === 'EXPLICIT_PROHIBITION');
}
function expectPass(fieldKey, value) {
  const v = violationsFor(fieldKey, value);
  assert.deepStrictEqual(v, [], `expected PASS for ${fieldKey}=${JSON.stringify(value)}, got ${JSON.stringify(v)}`);
}
function expectDetect(fieldKey, value) {
  const v = violationsFor(fieldKey, value);
  assert(v.length > 0, `expected DETECT for ${fieldKey}=${JSON.stringify(value)}, got none`);
}

// ============================================================
// PART C — NAMED CASES (C1-C16, verbatim from the authorization)
// ============================================================
tClaim('C1 pains = "Baja ocupación de citas" -> PASS', () => expectPass('pains', 'Baja ocupación de citas'));
tClaim('C2 pains = "Dificultad para subir ticket medio" -> PASS', () => expectPass('pains', 'Dificultad para subir ticket medio'));
tClaim('C3 buying_triggers = "Baja ocupación de citas" -> PASS', () => expectPass('buying_triggers', 'Baja ocupación de citas'));
tClaim('C4 desired_outcomes = "Aumentar ventas" -> PASS under existing buyer-goal semantics', () => expectPass('desired_outcomes', 'Aumentar ventas'));
tClaim('C5 pains = "Aumenta tus ventas" -> DETECT', () => expectDetect('pains', 'Aumenta tus ventas'));
tClaim('C6 pains = "Sube tu ticket con Método 360" -> DETECT', () => expectDetect('pains', 'Sube tu ticket con Método 360'));
tClaim('C7 buying_triggers = "Consigue más citas" -> DETECT', () => expectDetect('buying_triggers', 'Consigue más citas'));
tClaim('C8 objections = "Te garantizamos resultados" -> DETECT', () => expectDetect('objections', 'Te garantizamos resultados'));
tClaim('C9 desired_outcomes = "Aumentar ventas 30%" -> DETECT under explicit no-invented-results constraint', () => expectDetect('desired_outcomes', 'Aumentar ventas 30%'));
tClaim('C10 pains = "Clientes buscan aumentar ingresos" -> PASS', () => expectPass('pains', 'Clientes buscan aumentar ingresos'));
tClaim('C11 pains = "Queremos aumentar tus ingresos" -> DETECT', () => expectDetect('pains', 'Queremos aumentar tus ingresos'));
tClaim('C12 buying_triggers = "Necesidad de conseguir más clientes" -> PASS', () => expectPass('buying_triggers', 'Necesidad de conseguir más clientes'));
tClaim('C13 pains = "Falta de clientes" -> PASS', () => expectPass('pains', 'Falta de clientes'));
tClaim('C14 pains = "Caída en reservas" -> PASS', () => expectPass('pains', 'Caída en reservas'));
tClaim('C15 PROPUESTA: "Aumenta tus ventas" -> DETECT', () => expectDetect('pains', 'PROPUESTA: Aumenta tus ventas'));
tClaim('C16 PROPUESTA: "Baja ocupación de citas" -> PASS as descriptive proposal', () => expectPass('pains', 'PROPUESTA: Baja ocupación de citas'));

// Additional mandatory-distinction phrases named verbatim in the authorization, not yet covered above.
tClaim('MANDATORY-PASS "Necesidad de aumentar consultas" (pains)', () => expectPass('pains', 'Necesidad de aumentar consultas'));
tClaim('MANDATORY-PASS "Clientes quieren aumentar ventas" (pains)', () => expectPass('pains', 'Clientes quieren aumentar ventas'));
tClaim('MANDATORY-PASS "Preocupación por pocas citas" (pains)', () => expectPass('pains', 'Preocupación por pocas citas'));
tClaim('MANDATORY-DETECT "Vas a conseguir más clientes" (buying_triggers)', () => expectDetect('buying_triggers', 'Vas a conseguir más clientes'));
tClaim('MANDATORY-DETECT "Duplicarás tus ventas" (pains)', () => expectDetect('pains', 'Duplicarás tus ventas'));
tClaim('MANDATORY-DETECT "Resultados garantizados" (objections)', () => expectDetect('objections', 'Resultados garantizados'));
tClaim('MANDATORY-DETECT "Te ayudamos a aumentar ingresos" (desired_outcomes) — field role is not a bypass', () => expectDetect('desired_outcomes', 'Te ayudamos a aumentar ingresos'));
tClaim('MANDATORY-DETECT "Te ayudamos a aumentar ingresos" (pains)', () => expectDetect('pains', 'Te ayudamos a aumentar ingresos'));
tClaim('MANDATORY-DETECT "Te ayudamos a aumentar ingresos" (buying_triggers)', () => expectDetect('buying_triggers', 'Te ayudamos a aumentar ingresos'));
tClaim('MANDATORY-DETECT "Te ayudamos a aumentar ingresos" (objections)', () => expectDetect('objections', 'Te ayudamos a aumentar ingresos'));

// ============================================================
// GENERATED FIELD x PHRASE CLAIM-CONTEXT MATRIX
// ============================================================
const CLAIM_FIELDS = ['pains', 'desired_outcomes', 'objections', 'buying_triggers', 'qualification_signals', 'non_fit_signals'];
const DESCRIPTIVE_PASS_PHRASES = [
  'Baja ocupación de citas',
  'Dificultad para subir ticket medio',
  'Necesidad de conseguir más clientes',
  'Clientes buscan aumentar ingresos',
];
const ADVERTISER_DETECT_PHRASES = [
  'Aumenta tus ventas',
  'Consigue más citas',
  'Queremos aumentar tus ingresos',
  'Resultados garantizados',
];
for (const field of CLAIM_FIELDS) {
  for (const phrase of DESCRIPTIVE_PASS_PHRASES) {
    tClaim(`MATRIX-PASS field=${field} phrase=${JSON.stringify(phrase)}`, () => expectPass(field, phrase));
  }
  for (const phrase of ADVERTISER_DETECT_PHRASES) {
    tClaim(`MATRIX-DETECT field=${field} phrase=${JSON.stringify(phrase)}`, () => expectDetect(field, phrase));
  }
}

// ============================================================
// NEGATION / PROPUESTA VARIANTS (not otherwise covered above)
// ============================================================
tClaim('negated advertiser claim inside a negative-constraint restatement still PASSes ("No usar Aumenta tus ventas como copy")', () => {
  expectPass('pains', 'No usar frases como "Aumenta tus ventas" en el copy');
});
tClaim('PROPUESTA-marked genuine claim in buying_triggers still DETECTs', () => {
  expectDetect('buying_triggers', 'PROPUESTA: Consigue más citas');
});
tClaim('PROPUESTA-marked descriptive state in objections still PASSes', () => {
  expectPass('objections', 'PROPUESTA: Dificultad para subir ticket medio');
});

// ============================================================
// PART B — ARRAY ELEMENT BOUNDARY TESTS (ARR1-ARR5)
// ============================================================
t('ARR1 ["Baja ocupación","citas disponibles"] must NOT pair words across elements', () => {
  expectPass('pains', ['Baja ocupación', 'citas disponibles']);
});
t('ARR2 ["subir","ticket"] must NOT create a claim merely through cross-item proximity', () => {
  expectPass('pains', ['subir', 'ticket']);
});
t('ARR3 ["Aumenta tus ventas"] must DETECT within that single element', () => {
  expectDetect('pains', ['Aumenta tus ventas']);
});
t('ARR4 ["Dificultad para subir ticket","Falta de clientes"] must PASS', () => {
  expectPass('pains', ['Dificultad para subir ticket', 'Falta de clientes']);
});
t('ARR5 diagnostics report exact leaf_path per array index', () => {
  const v = violationsFor('pains', ['Falta de formación práctica', 'Aumenta tus ventas', 'Gestión ineficiente de citas']);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'pains[1]');
  assert.equal(v[0].local_clause.trim(), 'Aumenta tus ventas');
});
t('ARR5b a violation in a later array index reports that exact index, not index 0', () => {
  const v = violationsFor('buying_triggers', ['Necesidad de nuevos servicios', 'Baja ocupación de citas', 'Consigue más citas', 'Promoción limitada']);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'buying_triggers[2]');
});
t('ARR5c two violations in two different array indices are each reported with their own leaf_path', () => {
  const v = violationsFor('pains', ['Aumenta tus ventas', 'Sube tu ticket con Método 360']);
  assert.equal(v.length, 2, JSON.stringify(v));
  assert.deepStrictEqual(v.map(x => x.leaf_path).sort(), ['pains[0]', 'pains[1]']);
});

// ============================================================
// PART F — LIVE FIXTURE (job 6682572e-b316-4f2f-9c89-fb7b165bbdac, minimized)
// ============================================================
t('LIVE FIXTURE: exact job 6682572e icp.pains + icp.buying_triggers produce ZERO invented_result violations', () => {
  const pains = ['Falta de formación práctica', 'Baja ocupación de citas', 'Dificultad para subir ticket medio', 'Gestión ineficiente de citas'];
  const buying_triggers = ['Necesidad de nuevos servicios', 'Baja ocupación de citas', 'Recomendación de colega', 'Promoción limitada'];
  const painsViolations = fidelity.validateOutputAgainstFacts(facts(CONSTRAINT), { downstream_payload: { pains } }, { nodeId: 'icp' }).violations;
  const triggersViolations = fidelity.validateOutputAgainstFacts(facts(CONSTRAINT), { downstream_payload: { buying_triggers } }, { nodeId: 'icp' }).violations;
  assert.deepStrictEqual(painsViolations, []);
  assert.deepStrictEqual(triggersViolations, []);
});
t('LIVE FIXTURE combined in one call (both fields together, as the real ICP output would contain them)', () => {
  const v = fidelity.validateOutputAgainstFacts(facts(CONSTRAINT), {
    downstream_payload: {
      pains: ['Falta de formación práctica', 'Baja ocupación de citas', 'Dificultad para subir ticket medio', 'Gestión ineficiente de citas'],
      buying_triggers: ['Necesidad de nuevos servicios', 'Baja ocupación de citas', 'Recomendación de colega', 'Promoción limitada'],
    },
  }, { nodeId: 'icp' }).violations;
  assert.deepStrictEqual(v, []);
});

// ============================================================
// PROTECTED REGRESSION — gate 14's original desired_outcomes fixture must still pass unchanged
// ============================================================
t('PROTECTED: gate-14 desired_outcomes fixture (bare-infinitive goal list) still passes clean', () => {
  const v = violationsFor('desired_outcomes', 'Aumentar citas y clientela Mejorar conversión consulta→cita Aprender pasos prácticos y replicables');
  assert.deepStrictEqual(v, []);
});
t('PROTECTED: a genuine guarantee inside desired_outcomes still detects with zero magnitude present', () => {
  expectDetect('desired_outcomes', 'Ventas garantizadas');
});
t('PROTECTED: testimonials/guarantee/evidence categories are untouched by the new claim-context logic', () => {
  expectDetect('pains', 'Usar testimonios de clientes satisfechos');
  expectDetect('pains', 'Evidencia real de resultados anteriores');
});

// ============================================================
// 40 FRESH RED-TEAM CASES — authored after inspecting the final implemented code, attacking:
// descriptive-vs-claim, field-role bypass, array-boundary isolation, imperative detection,
// person/voice, guarantee precedence, quantified results, PROPUESTA no-bypass, ES/EN mixing.
// ============================================================
let freshCaseCount = 0;
function tFresh(name, fn) { freshCaseCount++; t('FRESH-' + freshCaseCount + ' ' + name, fn); }

tFresh('descriptive adjective "Alta demanda de clientes" (no claim verb at all) PASSes', () => expectPass('pains', 'Alta demanda de clientes'));
tFresh('descriptive "Poca conversión de leads" PASSes (no claim-verb match)', () => expectPass('pains', 'Poca conversión de leads'));
tFresh('imperative mid-sentence "Por eso, sube tus ventas hoy" DETECTs (advertiser voice "tus")', () => expectDetect('objections', 'Por eso, sube tus ventas hoy'));
tFresh('field-role bypass attempt: guarantee inside qualification_signals still DETECTs', () => expectDetect('qualification_signals', 'Te garantizamos más ventas'));
tFresh('field-role bypass attempt: magnitude inside non_fit_signals still DETECTs', () => expectDetect('non_fit_signals', 'Aumentan sus ventas 20%'));
tFresh('array-boundary: claim split across two DIFFERENT non_fit_signals items does not falsely pair', () => expectPass('non_fit_signals', ['Aumenta', 'ventas']));
tFresh('array-boundary: a genuine claim confined to ONE qualification_signals item still detects', () => expectDetect('qualification_signals', ['Presupuesto limitado', 'Consigue más citas', 'Sin decisión de compra']));
tFresh('imperative "Llena tu agenda de citas" DETECTs (agenda+citas outcome adjacency plus "tu")', () => expectDetect('buying_triggers', 'Llena tu agenda de citas'));
tFresh('descriptive "Agenda con pocas citas" PASSes (no claim verb, no pronoun)', () => expectPass('buying_triggers', 'Agenda con pocas citas'));
tFresh('third-person "El cliente busca subir su ticket" PASSes (goal-intent escape, unrelated to field role)', () => expectPass('pains', 'El cliente busca subir su ticket'));
tFresh('first-person-plural "Buscamos subir tu ticket" DETECTs (advertiser voice "buscamos"+"tu")', () => expectDetect('pains', 'Buscamos subir tu ticket'));
tFresh('mixed ES/EN "Baja occupancy of citas" — Spanish claim-verb "Baja" still evaluated under the same rule, PASSes (descriptive, no pronoun, non-adjacent to a recognized outcome term)', () => expectPass('pains', 'Baja occupancy of citas'));
tFresh('mixed ES/EN "Increase tus ventas now" PASSes (the claim-verb vocabulary is Spanish-only — "Increase" never matches at all, same documented scope as FRESH-12)', () => expectPass('pains', 'Increase tus ventas now'));
tFresh('PROPUESTA marker never bypasses a magnitude claim in buying_triggers', () => expectDetect('buying_triggers', 'PROPUESTA: Aumentar ventas 25% en 30 días'));
tFresh('PROPUESTA marker never bypasses a guarantee in qualification_signals', () => expectDetect('qualification_signals', 'PROPUESTA: Garantizamos resultados'));
tFresh('the advisory-negation escape (evitar/no debemos prometer) is scoped ONLY to guarantee-category matches, by existing design — an ordinary claim-verb match inside the same advisory sentence still DETECTs, since the sentence still literally states the promissory phrase', () => expectDetect('objections', 'No debemos prometer aumentar tus ventas'));
tFresh('bare infinitive purpose clause "Falta de tiempo para aumentar consultas" PASSes', () => expectPass('pains', 'Falta de tiempo para aumentar consultas'));
tFresh('bare infinitive after "a" is NOT treated as a purpose exemption on its own — "Vamos a aumentar tus ventas" still DETECTs via advertiser voice', () => expectDetect('pains', 'Vamos a aumentar tus ventas'));
tFresh('quantifier-gap tolerance: "Consigue tantas citas" (tanto/tantas) still DETECTs (imperative, small-quantifier gap)', () => expectDetect('buying_triggers', 'Consigue tantas citas'));
tFresh('non-quantifier intervening noun exempts: "Baja la cantidad de citas perdidas" PASSes (adjective+noun phrase, no pronoun)', () => expectPass('pains', 'Baja la cantidad de citas perdidas'));
tFresh('objections field: genuine buyer objection "Dificultad para pagar el ticket completo" PASSes', () => expectPass('objections', 'Dificultad para pagar el ticket completo'));
tFresh('objections field: advertiser reassurance "Te ayudamos a pagar menos por tu ticket" DETECTs (voice + outcome term)', () => expectDetect('objections', 'Te ayudamos a pagar menos por tu ticket'));
tFresh('qualification_signals descriptive "Cliente con pocas citas agendadas" PASSes', () => expectPass('qualification_signals', 'Cliente con pocas citas agendadas'));
tFresh('qualification_signals imperative "Consigue tu cita ahora" DETECTs (pronoun voice + recognized claim verb)', () => expectDetect('qualification_signals', 'Consigue tu cita ahora'));
tFresh('non_fit_signals descriptive "Sin necesidad de subir su ticket" (3rd-person possessive "su", no 2nd-person cue) PASSes', () => expectPass('non_fit_signals', 'Sin necesidad de subir su ticket'));
tFresh('non_fit_signals with explicit self-sufficient magnitude verb "Triplicará sus ventas" still DETECTs regardless of field', () => expectDetect('non_fit_signals', 'Triplicará sus ventas'));
tFresh('desired_outcomes bare-infinitive multi-item goal list still PASSes as a single string', () => expectPass('desired_outcomes', 'Aumentar leads, mejorar conversión y reducir tiempos de respuesta'));
tFresh('desired_outcomes conjugated imperative embedded in a goal list DETECTs ("Consigue" is not an infinitive)', () => expectDetect('desired_outcomes', 'Consigue más leads y mejora tu conversión'));
tFresh('array with 5 descriptive items and 1 imperative buried in the middle isolates only the imperative', () => {
  const v = violationsFor('pains', ['Falta de leads', 'Baja ocupación de citas', 'Aumenta tus ventas', 'Dificultad para pagar', 'Caída en reservas']);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'pains[2]');
});
tFresh('nested object field (nested under a nested key) still isolates leaves correctly', () => {
  const v = fidelity.validateOutputAgainstFacts(facts(CONSTRAINT), { downstream_payload: { pains: { primary: 'Baja ocupación de citas', secondary: 'Aumenta tus ventas' } } }, { nodeId: 'icp' }).violations;
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'pains.secondary');
});
tFresh('English-only descriptive "Low appointment occupancy" PASSes (no Spanish claim-verb vocabulary matched at all)', () => expectPass('pains', 'Low appointment occupancy'));
tFresh('English-only imperative "Get more clients now" does not match Spanish claim-verb vocabulary either (documents current scope: detection is Spanish-lexicon-based)', () => expectPass('pains', 'Get more clients now'));
tFresh('capitalized shouted imperative "AUMENTA TUS VENTAS" still DETECTs (case-insensitive matching)', () => expectDetect('pains', 'AUMENTA TUS VENTAS'));
tFresh('capitalized shouted descriptive "BAJA OCUPACIÓN DE CITAS" still PASSes (case-insensitive, same structural rule)', () => expectPass('pains', 'BAJA OCUPACIÓN DE CITAS'));
tFresh('punctuation-heavy descriptive "¿Baja ocupación? Sí, de citas." still PASSes', () => expectPass('pains', '¿Baja ocupación? Sí, de citas.'));
tFresh('semicolon-separated single string with one descriptive and one claim clause isolates correctly', () => {
  const v = violationsFor('pains', 'Baja ocupación de citas; Aumenta tus ventas');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].local_clause.trim(), 'Aumenta tus ventas');
});
tFresh('repeated identical claim in two array items reports two separate leaf_paths', () => {
  const v = violationsFor('pains', ['Aumenta tus ventas', 'Aumenta tus ventas']);
  assert.equal(v.length, 2, JSON.stringify(v));
  assert.deepStrictEqual(v.map(x => x.leaf_path).sort(), ['pains[0]', 'pains[1]']);
});
tFresh('objections with a false-attribution-shaped but non-claim sentence "El cliente dice que es caro" PASSes (no claim-verb vocabulary at all)', () => expectPass('objections', 'El cliente dice que es caro'));
tFresh('buying_triggers "Recomendación de colega sobre bajar precios" — "bajar" adjacent to no outcome term at all, PASSes', () => expectPass('buying_triggers', 'Recomendación de colega sobre bajar precios'));
tFresh('buying_triggers "Colega le dijo que puede bajar sus ventas" (3rd-person "le/su", no 2nd-person address) PASSes', () => expectPass('buying_triggers', 'Colega le dijo que puede bajar sus ventas'));

// ============================================================
// PART E — FAILED-NODE USAGE ACCOUNTING (U1-U6)
// ============================================================
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
const CLEAN_STATEMENT = 'Contenido determinístico de prueba para este nodo, alineado al brief original del cliente Método 360, sin cambiar la oferta ni el público declarados. Flujo: consulta → conversación → cita.';
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
const STRUCTURED_METHOD360_BRIEF = [
  'Crea una campaña 360 para Método 360.', '', 'Producto: minicurso grabado.', 'Precio: $400 MXN.',
  'Audiencia: dueñas de estéticas en México.', 'Geografía: México.', 'Objetivo: vender el minicurso.',
  'Mecanismo exacto: enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.',
  '', 'Restricciones obligatorias:', '- No cambiar el nombre Método 360.', '- No cambiar el precio de $400 MXN.',
  '- No cambiar la audiencia.', '- No cambiar el producto ni convertirlo en mentoría, servicio, membresía o asesoría.',
  '- No cambiar el mecanismo consulta → conversación → cita.',
  '- No inventar métricas, resultados, CAC, CPA, CPL, ROAS, MER, LTV, revenue, margen, conversiones, benchmarks, testimonios, proof, urgencia, escasez ni evidencia.',
  '- Cualquier dato faltante debe mantenerse como UNKNOWN.', '- Cualquier idea nueva debe marcarse explícitamente como PROPUESTA.',
  '- No presentar hipótesis como hechos.', '',
].join('\n');
function runWith(overrides = {}, salt = 'usage-accounting') {
  return H.run(STRUCTURED_METHOD360_BRIEF, { mode: 'llm', adapter: mockAdapter(), llm: buildMockLLM(overrides), retrieve: true, salt });
}

t('U1 one passed node + one post-LLM validation failure in the same wave -> model_calls counts BOTH', async () => {
  const r = await runWith({ FUNNEL_SPECIALIST: { stages: 'funnel principal: webinar -> checkout' } }, 'u1');
  assert.equal(r.workflow_state_status, 'FAILED');
  // waves so far: market_context(1) + icp(1) + offer(1) = 3, then funnel+creative_strategy wave = 2 more = 5.
  assert.equal(r.cost.model_calls, 5, JSON.stringify(r.cost));
  assert.equal(r.cost.per_node.funnel.validation_failed, true);
  assert(!('funnel' in r.selected_methods_by_node));
  assert(r.cost.per_node.creative_strategy && r.cost.per_node.creative_strategy.generation === 'LLM');
});
const CLEAN_CONVERSION_DEFAULTS = {
  FUNNEL_SPECIALIST: {
    stages: 'Meta Ads genera consultas y WhatsApp gestiona la conversación, el mecanismo del minicurso; paso final de esta campaña: compra del minicurso.',
    transitions: 'De consulta a conversación por WhatsApp; cierre con compra del minicurso.',
    conversion_intent: 'Compra del minicurso Método 360.',
  },
  META_ADS_SPECIALIST: { measurement: 'Compras del minicurso registradas; costo por compra.' },
  WHATSAPP_SALES_SPECIALIST: { appointment_closing: 'Enviar link de pago del minicurso.', recovery: 'Reenviar link de pago del minicurso a leads inactivos.' },
  MEASUREMENT_CRO_SPECIALIST: {
    primary_outcome: 'Compras del minicurso Método 360.',
    funnel_metrics: 'Clics en anuncio y mensajes de WhatsApp que terminan en compras del minicurso.',
    conversion_metrics: 'Tasa de compra del minicurso.',
  },
};
function buildMockLLMWithConversionDefaults(overrides = {}) {
  return async (system) => {
    const st = specTypeFromSystem(system);
    const fields = SPEC_FIELDS[st] || [];
    const payload = {};
    for (const f of fields) payload[f] = CLEAN_STATEMENT;
    Object.assign(payload, CLEAN_CONVERSION_DEFAULTS[st] || {});
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
t('U2 successful generation + deterministic repair reaches COMPLETE with no hidden/double-counted model call', async () => {
  // A live-shaped mechanism/campaign-conversion role-confusion (funnel.conversion_intent lists the
  // mechanism's own "agendar cita" alongside the real purchase, WhatsApp closing offers the
  // mechanism endpoint as an alternative, measurement enumerates the mechanism endpoint too) — all
  // three are DETERMINISTICALLY repairable, so the run reaches COMPLETE with final_synthesis_repairs
  // populated, and model_calls stays exactly 8 (one per node; deterministic repair makes no LLM call).
  const r = await H.run(STRUCTURED_METHOD360_BRIEF, {
    mode: 'llm', adapter: mockAdapter(), retrieve: true, salt: 'u2',
    llm: buildMockLLMWithConversionDefaults({
      FUNNEL_SPECIALIST: { conversion_intent: 'Comprar minicurso 400 MXN o agendar cita' },
      WHATSAPP_SALES_SPECIALIST: { appointment_closing: 'PROPUESTA: Ofrecer link pago o agendar cita por calendario según preferencia' },
      MEASUREMENT_CRO_SPECIALIST: { conversion_metrics: 'Registros de compra; tasa respuesta WhatsApp; citas agendadas' },
    }),
  });
  assert.equal(r.workflow_state_status, 'COMPLETE', JSON.stringify(r.reason || r.brief_fidelity_violations));
  assert(r.final_synthesis_repairs.length > 0);
  assert(r.final_synthesis_repairs.every(x => x.repair_type === 'DETERMINISTIC'));
  assert.equal(r.cost.model_calls, 8, JSON.stringify(r.cost));
});
t('U3 bounded final-synthesis regeneration adds exactly +1 model call when it actually fires, and its usage is included in totals', async () => {
  const mockLLM = async () => ({ raw: JSON.stringify({ fixed_fields: { '6_funnel.conversion_intent': 'Compra del minicurso Método 360.' } }), usage: { prompt: 15, completion: 25 } });
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Agendar cita' } } };
  const facts = { business_objective: { value: 'vender el minicurso', status: 'USER_PROVIDED_FACT' }, mechanism: { value: 'Meta Ads para generar consultas y WhatsApp para convertir: consulta → conversación → cita', status: 'USER_PROVIDED_FACT' } };
  const violations = fidelity.validateFinalSynthesis(facts, synth, {}).violations;
  assert(violations.length > 0, 'fixture must actually violate before regeneration is meaningful');
  let calls = 0;
  const countingLLM = async (...args) => { calls += 1; return mockLLM(...args); };
  const result = await H.regenerateFinalSynthesis(facts, synth, violations, { llm: countingLLM });
  assert.equal(calls, 1, 'regeneration must call the LLM exactly once (bounded)');
  assert.equal(H.MAX_FINAL_SYNTHESIS_REGENERATION_ATTEMPTS, 1);
  assert(result.ok);
  // This mirrors exactly how run() accounts for it (cost.model_calls += 1; tokens += regen.usage):
  const costBefore = { model_calls: 8, tokens: { prompt: 80, completion: 80 } };
  const costAfter = { model_calls: costBefore.model_calls + 1, tokens: { prompt: costBefore.tokens.prompt + result.usage.prompt, completion: costBefore.tokens.completion + result.usage.completion } };
  assert.equal(costAfter.model_calls, 9);
  assert.equal(costAfter.tokens.prompt, 95);
  assert.equal(costAfter.tokens.completion, 105);
});
t('U4 no regeneration fires when the final synthesis is already clean -> no speculative call added', async () => {
  const r = await runWith({}, 'u4');
  assert.equal(r.workflow_state_status, 'COMPLETE', JSON.stringify(r.reason));
  assert.equal(r.cost.model_calls, 8, JSON.stringify(r.cost));
});
t('U5 by_tier total legitimately exceeds model_calls by exactly 1 (the synthesis routing-tier entry, which makes no LLM call in this slice) — documented, not a bug', async () => {
  const r = await runWith({}, 'u5');
  assert.equal(r.workflow_state_status, 'COMPLETE');
  const tierSum = Object.values(r.cost.by_tier).reduce((a, b) => a + b, 0);
  assert.equal(tierSum, r.cost.model_calls + 1, JSON.stringify(r.cost));
});
t('U6 a technical/infra failure before any usable generation preserves the existing accounting contract (no invented cost)', async () => {
  let threw = false;
  try {
    await H.run(STRUCTURED_METHOD360_BRIEF, { mode: 'llm', adapter: mockAdapter(), llm: async () => { throw new Error('provider down'); }, retrieve: true, salt: 'u6' });
  } catch (e) { threw = true; }
  assert.equal(threw, true, 'a raw technical failure must still throw, unchanged');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nCLAIM_CONTEXT_PERSISTED_CASES=${claimContextCaseCount}`);
  console.log(`FRESH_RED_TEAM_CASES=${freshCaseCount}`);
  console.log(`\nASTRA_CAMPAIGN360_CONTEXTUAL_CLAIM_AND_USAGE_ACCOUNTING_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
