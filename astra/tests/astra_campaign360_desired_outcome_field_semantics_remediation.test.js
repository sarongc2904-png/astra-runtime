'use strict';
// ASTRA_CAMPAIGN360_DESIRED_OUTCOME_FIELD_SEMANTICS_REMEDIATION — confirmed live false positive
// (job 02293f22-6736-4fe3-bf77-a52805e68939, request e67673b4-c7d1-4e87-b3f1-1bffa5c695dc):
// icp.desired_outcomes = "Aumentar citas y clientela Mejorar conversión consulta→cita Aprender
// pasos prácticos y replicables" was flagged EXPLICIT_PROHIBITION/invented_result on "Aumentar",
// "citas" and "Mejorar".
//
// ROOT CAUSE: checkExplicitProhibition()'s invented_result branch (and its GOAL/INTENT escape,
// astra_campaign360_result_claim_intent_context_remediation) analyzed only the clause TEXT — it
// never used the semantic meaning already carried by the field_key/schema. GOAL_INTENT_ESCAPE_CUE
// requires an explicit textual cue ("quieren"/"buscan"/"objetivo es"/...) to recognize a sentence
// as describing someone else's goal rather than the system's own claim. desired_outcomes is a
// field the ICP_SPECIALIST schema itself defines to hold the BUYER's own desired outcomes (see
// SPEC_FIELDS.ICP_SPECIALIST in llm_specialists.js) — its schema purpose already IS that goal/
// intent framing, so a bare qualitative wish list inside it ("Aumentar citas", "Mejorar
// conversión") needs no textual cue to read as intent, not a claim the system is making.
//
// FIX: isDesiredOutcomeQualitativeGoal(fieldKey, clauseText) — field-key-scoped (only
// 'desired_outcomes'), and still requires the clause to carry NO magnitude (number/%/Nx/timeframe)
// so a genuinely numeric/timebound claim inside desired_outcomes ("Aumentar ventas 30% en 30
// días") remains detected. No hardcoded exception for "Aumentar citas"/"Mejorar conversión"
// specifically — any qualitative CLAIM_VERB+OUTCOME_TERM pairing inside this one field escapes,
// any field outside it is fully unaffected, and every OTHER prohibition category (guarantee,
// invented_evidence, invented_metric, testimonials, ...) is untouched even inside
// desired_outcomes.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

const STRUCTURED_METHOD360_BRIEF = [
  'Crea una campaña 360 para Método 360.',
  '',
  'Producto: minicurso grabado.',
  'Precio: $400 MXN.',
  'Audiencia: dueñas de estéticas en México.',
  'Geografía: México.',
  'Objetivo: vender el minicurso.',
  'Mecanismo exacto: enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.',
  '',
  'Restricciones obligatorias:',
  '- No cambiar el nombre Método 360.',
  '- No cambiar el precio de $400 MXN.',
  '- No cambiar la audiencia.',
  '- No cambiar el producto ni convertirlo en mentoría, servicio, membresía o asesoría.',
  '- No cambiar el mecanismo consulta → conversación → cita.',
  '- No inventar métricas, resultados, CAC, CPA, CPL, ROAS, MER, LTV, revenue, margen, conversiones, benchmarks, testimonios, proof, urgencia, escasez ni evidencia.',
  '- Cualquier dato faltante debe mantenerse como UNKNOWN.',
  '- Cualquier idea nueva debe marcarse explícitamente como PROPUESTA.',
  '- No presentar hipótesis como hechos.',
  '',
].join('\n');
const FACTS = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);

function violations(nodeId, fieldKey, text) {
  return fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { [fieldKey]: text } }, { nodeId }).violations;
}
function category(v) { return v.map(x => x.category).filter(Boolean); }

// ========== LIVE FIXTURE — reproduce exactly, before asserting the fix ==========
const LIVE_CLAUSE = 'Aumentar citas y clientela Mejorar conversión consulta→cita Aprender pasos prácticos y replicables';
t('LIVE_FIXTURE: the exact live clause produces 0 invented_result violations after the fix', () => {
  const v = violations('icp', 'desired_outcomes', LIVE_CLAUSE);
  assert.deepStrictEqual(category(v).filter(c => c === 'invented_result'), []);
});

// ========== CASE 1-5: qualitative desired_outcomes => PASS ==========
t('CASE 1: desired_outcomes "Aumentar citas" -> PASS invented_result', () => {
  assert.deepStrictEqual(category(violations('icp', 'desired_outcomes', 'Aumentar citas.')).filter(c => c === 'invented_result'), []);
});
t('CASE 2: desired_outcomes "Mejorar conversión consulta→cita" -> PASS invented_result', () => {
  assert.deepStrictEqual(category(violations('icp', 'desired_outcomes', 'Mejorar conversión consulta→cita.')).filter(c => c === 'invented_result'), []);
});
t('CASE 3: desired_outcomes "Conseguir más clientes" -> PASS invented_result', () => {
  assert.deepStrictEqual(category(violations('icp', 'desired_outcomes', 'Conseguir más clientes.')).filter(c => c === 'invented_result'), []);
});
t('CASE 4: desired_outcomes "Mejorar ingresos" -> PASS invented_result', () => {
  assert.deepStrictEqual(category(violations('icp', 'desired_outcomes', 'Mejorar ingresos.')).filter(c => c === 'invented_result'), []);
});
t('CASE 5: desired_outcomes "Aprender pasos prácticos y replicables" -> PASS (control, no claim verb at all)', () => {
  assert.deepStrictEqual(category(violations('icp', 'desired_outcomes', 'Aprender pasos prácticos y replicables.')), []);
});

// ========== CASE 6-8: the SAME qualitative phrasing OUTSIDE desired_outcomes => DETECT ==========
t('CASE 6: ad_copy "Aumenta tus citas" -> DETECT invented_result (field not in the goal/intent allow-list)', () => {
  assert(category(violations('ads', 'ad_copy', 'Aumenta tus citas.')).includes('invented_result'));
});
t('CASE 7: hook "Consigue más clientes" -> DETECT invented_result', () => {
  assert(category(violations('creative_strategy', 'hook', 'Consigue más clientes.')).includes('invented_result'));
});
t('CASE 8: cta "Mejora tu conversión" -> DETECT invented_result', () => {
  assert(category(violations('ads', 'cta', 'Mejora tu conversión.')).includes('invented_result'));
});

// ========== CASE 9-11: no blanket escape inside desired_outcomes ==========
t('CASE 9: desired_outcomes "Aumentar ventas 30% en 30 días" -> still DETECT invented_result (magnitude present, not a bare qualitative wish)', () => {
  assert(category(violations('icp', 'desired_outcomes', 'Aumentar ventas 30% en 30 días.')).includes('invented_result'));
});
t('CASE 11: desired_outcomes "Resultados probados por clientes" -> evidence control remains active, unaffected by this fix', () => {
  assert(category(violations('icp', 'desired_outcomes', 'Resultados probados por clientes.')).includes('invented_evidence'));
});
t('extra: desired_outcomes "usar testimonios" -> testimonials control remains active, unaffected by this fix', () => {
  assert(category(violations('icp', 'desired_outcomes', 'usar testimonios de clientes')).includes('testimonials'));
});
t('extra: desired_outcomes "CAC esperado bajo" -> invented_metric control remains active, unaffected by this fix', () => {
  assert(category(violations('icp', 'desired_outcomes', 'CAC esperado bajo')).includes('invented_metric'));
});

// ========== CASE 12-14: market_assumptions keeps relying on the EXISTING text-cue GOAL/INTENT
// handling, not this field-based escape (this fix must not widen to other fields) ==========
t('CASE 12/13: market_assumptions "Las dueñas quieren aumentar ventas" -> PASS via the existing text-cue GOAL/INTENT handling (unaffected by this fix)', () => {
  assert.deepStrictEqual(category(violations('icp', 'market_assumptions', 'Las dueñas quieren aumentar ventas.')).filter(c => c === 'invented_result'), []);
});
t('CASE 14: market_assumptions "Aumenta tus ventas" -> DETECT (no text cue, and market_assumptions is not in the goal/intent field allow-list)', () => {
  assert(category(violations('icp', 'market_assumptions', 'Aumenta tus ventas.')).includes('invented_result'));
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_DESIRED_OUTCOME_FIELD_SEMANTICS_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
