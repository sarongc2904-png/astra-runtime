'use strict';
// ASTRA_CAMPAIGN360_COMPACT_METRIC_PUNCTUATION_HARDENING — closes a confirmed gap surfaced by the
// prior bilingual-positive-prohibition gate's own fresh red-team: "ROAS?4x" produced ZERO
// violations under the canonical constraint "No inventes métricas, resultados, CAC, ROAS, LTV,
// testimonios ni evidencia."
//
// ROOT CAUSE (traced before any code change): the metric-value matcher itself (INVENTED_METRIC_
// CLAIM) was never the problem — it already pairs an acronym with an adjacent magnitude correctly.
// The miss is that checkExplicitProhibitionOnLeaf's GENERIC clause splitter treats "?" (like "."
// and "!") as a hard clause boundary for EVERY prohibition category — "ROAS?4x" is split into two
// separate clauses ("ROAS" and "4x") before any category-specific regex ever runs, so the acronym
// and its magnitude are never evaluated together. Weakening the general clause splitter was
// explicitly prohibited (it protects every other category's negation/enumeration semantics), so
// the fix is a NARROW, ADDITIONAL matcher (checkCompactMetricPunctuationClaims) that runs on each
// leaf's raw, un-split text and looks only for a protected metric acronym directly adjacent to a
// concrete magnitude/value with nothing but compact punctuation (? : = / - — parentheses) between
// them — never a full word, so it can never span two genuinely unrelated clauses. Where this new
// matcher's separator is NOT actually a clause boundary (":", "=", "/", "-", "(", ")" — those were
// already reachable through the ordinary clause matcher's [\s\S]{0,10} gap tolerance), the two
// paths can find the SAME physical occurrence; a dedup step (by category + start offset within the
// leaf) collapses that back to exactly one violation, preferring the clause-based path's fuller
// diagnostic (the whole surrounding clause) when both fire.
//
// The prior gate's OTHER fresh finding — "Appointments, get more" not detecting — was separately
// adjudicated (see APPOINTMENTS_COMMA_CASE below) as ARTIFICIAL/NON_CLAIM and left unfixed: it is a
// different family entirely (claim-verb + outcome-term, not metric-acronym + value), requires a
// grammatically-backwards word order no real specialist output would produce, and the identical
// semantic content already detects correctly in its natural order ("Get more appointments").
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
let persistedCaseCount = 0;
function t(name, fn) { tests.push({ name, fn }); }
function tPersist(name, fn) { persistedCaseCount++; t(name, fn); }

const CONSTRAINT = 'No inventes metricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
function facts(constraints) {
  return { constraints: constraints ? { value: constraints, status: 'USER_PROVIDED_FACT' } : { value: null, status: 'UNKNOWN' } };
}
function violationsFor(fieldKey, value, constraints = CONSTRAINT, nodeId = 'ads') {
  return fidelity.validateOutputAgainstFacts(facts(constraints), { downstream_payload: { [fieldKey]: value } }, { nodeId })
    .violations.filter(v => v.type === 'EXPLICIT_PROHIBITION');
}
function expectPass(fieldKey, value) {
  const v = violationsFor(fieldKey, value);
  assert.deepStrictEqual(v, [], `expected PASS for ${fieldKey}=${JSON.stringify(value)}, got ${JSON.stringify(v)}`);
}
function expectDetectOnce(fieldKey, value) {
  const v = violationsFor(fieldKey, value);
  assert.equal(v.length, 1, `expected exactly 1 violation for ${fieldKey}=${JSON.stringify(value)}, got ${JSON.stringify(v)}`);
}

// ============================================================
// REPRODUCTION — confirmed on the unmodified base head before any code change
// ============================================================
t('REPRODUCTION: "ROAS?4x" is now correctly detected exactly once (was ZERO on the base head)', () => {
  expectDetectOnce('limitations', 'ROAS?4x');
});

// ============================================================
// FORWARD METRIC-VALUE MATCHING — all mandated separators, both currency and %/x magnitudes
// ============================================================
const FORWARD_CASES = [
  ['ROAS?4x'], ['ROAS:4x'], ['ROAS=4x'], ['ROAS—4x'], ['ROAS/4x'], ['ROAS-4x'], ['ROAS(4x)'],
  ['CAC?$20'], ['CAC:$20'], ['CAC=$20'], ['CAC—$20'], ['CAC/$20'], ['CAC-$20'], ['CAC($20)'],
  ['LTV?$500'], ['LTV:$500'], ['LTV=$500'],
  ['CTR?4%'], ['CTR:4%'], ['CPA?$100'], ['CPA:$100'],
];
for (const [text] of FORWARD_CASES) {
  tPersist(`FORWARD "${text}" -> DETECT exactly once`, () => expectDetectOnce('limitations', text));
}

// ============================================================
// REVERSE METRIC-VALUE MATCHING
// ============================================================
const REVERSE_CASES = ['4x ROAS', '$20 CAC', '$500 LTV', '4x?ROAS', '$20?CAC', '$500?LTV', '4x:ROAS', '$20:CAC'];
for (const text of REVERSE_CASES) {
  tPersist(`REVERSE "${text}" -> DETECT exactly once`, () => expectDetectOnce('limitations', text));
}

// ============================================================
// SAFE / QUESTION-ONLY REFERENCES
// ============================================================
const SAFE_CASES = [
  'ROAS?', 'CAC?', 'LTV?', 'ROAS unknown', 'CAC: unknown', 'LTV = not provided',
  'Measure ROAS', 'Track CAC', 'Monitor LTV', 'What is ROAS?', 'Ask for CAC', 'Request actual LTV',
  'No ROAS claim', 'Do not state CAC', 'ROAS unavailable', 'ROAS? Check the report for an unrelated 4x zoom mention',
];
for (const text of SAFE_CASES) {
  tPersist(`SAFE "${text}" -> PASS`, () => expectPass('limitations', text));
}

// ============================================================
// QUESTION-MARK SEMANTICS — explicit adjudication
// ============================================================
tPersist('QUESTION "ROAS?" alone (no value) -> PASS (question/reference only)', () => expectPass('limitations', 'ROAS?'));
tPersist('QUESTION "ROAS?4x" (value immediately follows) -> DETECT (compact label/value shorthand)', () => expectDetectOnce('limitations', 'ROAS?4x'));
tPersist('QUESTION "ROAS? 4x" (space after ?, value still immediately adjacent) -> DETECT, consistent with "ROAS?4x"', () => expectDetectOnce('limitations', 'ROAS? 4x'));
tPersist('QUESTION "ROAS? Ask user" (no value at all) -> PASS', () => expectPass('limitations', 'ROAS? Ask user'));

// ============================================================
// UNKNOWN-VALUE SEMANTICS
// ============================================================
tPersist('UNKNOWN "ROAS: unknown" -> PASS', () => expectPass('limitations', 'ROAS: unknown'));
tPersist('UNKNOWN "CAC?not provided" (compact separator, but value is a word not a number) -> PASS', () => expectPass('limitations', 'CAC?not provided'));

// ============================================================
// NEGATION PRESERVATION (compact-family-scoped negation guard)
// ============================================================
tPersist('NEGATION "No ROAS:4x" -> PASS (negated even in compact form)', () => expectPass('limitations', 'No ROAS:4x'));
tPersist('NEGATION "Avoid CAC:$20" -> PASS', () => expectPass('limitations', 'Avoid CAC:$20'));
tPersist('NEGATION "Sin ROAS:4x" -> PASS', () => expectPass('limitations', 'Sin ROAS:4x'));
tPersist('NEGATION "Nunca ROAS:4x" -> PASS', () => expectPass('limitations', 'Nunca ROAS:4x'));

// ============================================================
// MULTI-OCCURRENCE SCOPE
// ============================================================
t('MULTI "ROAS unknown; ROAS?4x" -> exactly 1 violation (second occurrence only)', () => {
  const v = violationsFor('limitations', 'ROAS unknown; ROAS?4x');
  assert.equal(v.length, 1, JSON.stringify(v));
});
t('MULTI "No ROAS claim. ROAS:4x" -> exactly 1 violation (positive occurrence only)', () => {
  const v = violationsFor('limitations', 'No ROAS claim. ROAS:4x');
  assert.equal(v.length, 1, JSON.stringify(v));
});
t('MULTI "ROAS? Ask user. CAC:$20" -> exactly 1 violation (CAC only)', () => {
  const v = violationsFor('limitations', 'ROAS? Ask user. CAC:$20');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert(/CAC/.test(v[0].matched_text));
});

// ============================================================
// ARRAY / NESTED ISOLATION — exact leaf_path preserved
// ============================================================
t('ARRAY ["ROAS unknown", "ROAS?4x"] -> only index 1 detects, leaf_path exact', () => {
  const v = violationsFor('limitations', ['ROAS unknown', 'ROAS?4x']);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations[1]');
});
t('NESTED {es: "ROAS desconocido", en: "ROAS?4x"} -> only "en" leaf detects', () => {
  const v = violationsFor('limitations', { es: 'ROAS desconocido', en: 'ROAS?4x' });
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations.en');
});
t('ARRAY-OF-OBJECTS [{note:"ROAS?4x"},{note:"CAC?"}] -> only index 0 detects', () => {
  const v = violationsFor('limitations', [{ note: 'ROAS?4x' }, { note: 'CAC?' }]);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations[0].note');
});
t('No regex proximity crosses array elements: ["ROAS?", "4x"] -> PASS (question and value in different elements)', () => {
  assert.deepStrictEqual(violationsFor('limitations', ['ROAS?', '4x']), []);
});

// ============================================================
// PROTECTED — dedup does not cause double-counting for separators the ordinary clause matcher
// already reached without splitting (":", "=", "/", "-", "(", ")")
// ============================================================
t('PROTECTED: "ROAS:4x" produces exactly 1 violation, not 2 (no double-count between the compact and clause-based matchers)', () => {
  expectDetectOnce('limitations', 'ROAS:4x');
});
t('PROTECTED: "Proposed ROAS: 4x" (space-colon-space, full sentence) still carries the fuller clause-based diagnostic', () => {
  const v = violationsFor('limitations', 'ROAS unknown. Proposed ROAS: 4x.');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert(/Proposed ROAS: 4x/i.test(v[0].local_clause));
});
t('PROTECTED: canonical product price "$400 MXN" still never triggers invented_metric', () => {
  assert.deepStrictEqual(violationsFor('offer_structure', 'PROPUESTA: Minicurso grabado 400 MXN venta directa'), []);
});
t('PROTECTED: measurement instructions still PASS regardless of any nearby punctuation', () => {
  expectPass('limitations', 'Track CAC (weekly)');
  expectPass('limitations', 'Measure ROAS: ongoing');
});

// ============================================================
// APPOINTMENTS COMMA CASE — adjudicated, architecture unchanged
// ============================================================
t('ADJUDICATED: "Appointments, get more" documents current, unchanged behavior — a different family (claim-verb+outcome-term, not metric-acronym+value) crossing the existing, protected comma clause boundary; the same content already detects in natural word order', () => {
  const reordered = violationsFor('limitations', 'Appointments, get more');
  const natural = violationsFor('limitations', 'Get more appointments');
  assert.deepStrictEqual(reordered, []); // unchanged, by design — out of this gate's scope
  assert(natural.length > 0); // the identical semantic content already works in natural order
});

// ============================================================
// 20 FRESH RED-TEAM CASES — authored after implementation, attacking compact punctuation and
// metric/value association specifically.
// ============================================================
let freshCaseCount = 0;
function tFresh(name, fn) { freshCaseCount++; t('FRESH-' + freshCaseCount + ' ' + name, fn); }

tFresh('double punctuation "ROAS::4x" -> DETECT', () => expectDetectOnce('limitations', 'ROAS::4x'));
tFresh('double punctuation "CAC??​$20" style "CAC??$20" -> DETECT', () => expectDetectOnce('limitations', 'CAC??$20'));
tFresh('mixed punctuation "ROAS:=4x" -> DETECT', () => expectDetectOnce('limitations', 'ROAS:=4x'));
tFresh('parentheses both sides "(ROAS:4x)" -> DETECT', () => expectDetectOnce('limitations', '(ROAS:4x)'));
tFresh('lowercase "roas?4x" -> DETECT (case-insensitive)', () => expectDetectOnce('limitations', 'roas?4x'));
tFresh('uppercase "ROAS?4X" -> DETECT', () => expectDetectOnce('limitations', 'ROAS?4X'));
tFresh('CTR percentage compact "CTR=4%" -> DETECT', () => expectDetectOnce('limitations', 'CTR=4%'));
tFresh('CPC compact "CPC:$2" -> DETECT', () => expectDetectOnce('limitations', 'CPC:$2'));
tFresh('CPM compact "CPM—$15" -> DETECT', () => expectDetectOnce('limitations', 'CPM—$15'));
tFresh('MER compact "MER?3x" -> DETECT', () => expectDetectOnce('limitations', 'MER?3x'));
tFresh('decimal value compact "ROAS:3.5x" -> DETECT', () => expectDetectOnce('limitations', 'ROAS:3.5x'));
tFresh('decimal currency compact "CAC:$19.99" -> DETECT', () => expectDetectOnce('limitations', 'CAC:$19.99'));
tFresh('question then unrelated number far away "ROAS? See section 4" -> PASS (no adjacency)', () => expectPass('limitations', 'ROAS? See section 4'));
tFresh('acronym embedded in a longer word must not false-positive: "CACHE:4x" -> PASS (word boundary protects "CAC")', () => expectPass('limitations', 'CACHE:4x'));
tFresh('acronym followed by unrelated compact-punctuated word (not a value) "ROAS:pending" -> PASS', () => expectPass('limitations', 'ROAS:pending'));
tFresh('array with compact form buried in a longer string element isolates correctly', () => {
  const v = violationsFor('limitations', ['Track CAC weekly', 'Final numbers: CAC:$20 confirmed']);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations[1]');
});
tFresh('nested object with compact form in a deeply nested key isolates correctly', () => {
  const v = violationsFor('limitations', { report: { summary: 'ROAS?4x' } });
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations.report.summary');
});
tFresh('multiple distinct compact claims in one string both detect, each once', () => {
  const v = violationsFor('limitations', 'ROAS:4x and CAC:$20');
  assert.equal(v.length, 2, JSON.stringify(v));
});
tFresh('PROPUESTA marker never bypasses a compact metric claim: "PROPUESTA: ROAS:4x" -> DETECT', () => expectDetectOnce('limitations', 'PROPUESTA: ROAS:4x'));
tFresh('field-role placement (icp.pains) does not bypass a compact metric claim: "CAC:$20" -> DETECT', () => {
  const v = fidelity.validateOutputAgainstFacts(facts(CONSTRAINT), { downstream_payload: { pains: 'CAC:$20' } }, { nodeId: 'icp' }).violations.filter(x => x.type === 'EXPLICIT_PROHIBITION');
  assert.equal(v.length, 1, JSON.stringify(v));
});

// ============================================================
// USAGE ACCOUNTING PRESERVATION (no accounting code touched this gate)
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
function buildMockLLM(overrides = {}) {
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
t('USAGE-ACCOUNTING-PRESERVED: ads (post-LLM validation failure via a compact-punctuation metric claim) + whatsapp_conversion (fulfilled) in the same wave -> both real LLM calls counted', async () => {
  const r = await H.run(STRUCTURED_METHOD360_BRIEF, {
    mode: 'llm', adapter: mockAdapter(), retrieve: true, salt: 'compact-metric-usage-regression',
    llm: buildMockLLM({ META_ADS_SPECIALIST: { structure: 'Estructura de anuncio: ROAS?4x' } }),
  });
  assert.equal(r.workflow_state_status, 'FAILED');
  const ids = r.node_outputs.map(n => n.work_unit_id);
  assert.deepStrictEqual(ids, ['market_context', 'icp', 'offer', 'funnel', 'creative_strategy']);
  assert(!ids.includes('ads')); assert(!ids.includes('whatsapp_conversion'));
  assert.equal(r.cost.model_calls, 7, JSON.stringify(r.cost));
  assert.equal(r.cost.per_node.ads.validation_failed, true);
  assert.equal(r.cost.per_node.whatsapp_conversion.generation, 'LLM');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nPERSISTED_CASES=${persistedCaseCount}`);
  console.log(`FRESH_RED_TEAM_CASES=${freshCaseCount}`);
  console.log(`\nASTRA_CAMPAIGN360_COMPACT_METRIC_PUNCTUATION_HARDENING_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
