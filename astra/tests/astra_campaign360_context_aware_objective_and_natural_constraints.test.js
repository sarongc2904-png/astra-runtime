'use strict';
// ASTRA_CAMPAIGN360_CONTEXT_AWARE_OBJECTIVE_AND_NATURAL_CONSTRAINTS — closes two confirmed live
// E2E defects (job ea7d1090-e38a-40af-a84a-59472934393c):
//
// DEFECT A — BUSINESS_OBJECTIVE_SUBSTITUTION false positive: whatsapp_conversion.appointment_closing
// saying "agendar una cita" (compatible with the canonical mechanism consulta -> conversación ->
// cita) was flagged as a business_objective substitution. Fixed by making the check field-aware:
// it only evaluates when the field itself is objective-bearing (business_objective,
// campaign_objective, objective, primary_objective, goal, primary_goal) OR the field's own text
// explicitly asserts an objective ("el objetivo ... es", "objetivo principal", "campaign
// objective", "goal is"). ads.campaign_objective protection is unchanged and still fails closed.
//
// DEFECT B — a natural-language constraint sentence ("No inventes métricas, resultados, CAC,
// ROAS, LTV, testimonios ni evidencia.") with no "Restricciones:"/"Restricciones obligatorias:"
// heading was left UNKNOWN. campaign_brief_facts.js now captures such sentences verbatim as a
// fallback (only when the structured block/label is absent), activating the existing
// EXPLICIT_PROHIBITION gate. Nothing is reinterpreted, expanded, or invented.
//
// Deterministic/fail-closed only — no LLM-based semantic detection anywhere. Offline, no network.
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

const LIVE_NATURAL_BRIEF = [
  'Crea una campaña 360 para Método 360.',
  '',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.',
  '',
  'Objetivo: vender el minicurso.',
  '',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.',
  '',
  'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.',
].join('\n');

// ========== A. WHATSAPP_APPOINTMENT_CLOSING_VALID ==========
t('A. "Avanzar la conversación para agendar una cita." in whatsapp_conversion.appointment_closing does NOT trigger BUSINESS_OBJECTIVE_SUBSTITUTION', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { appointment_closing: 'Avanzar la conversación para agendar una cita.' } }, { nodeId: 'whatsapp_conversion' });
  assert.deepStrictEqual(violations.filter(v => v.type === 'BUSINESS_OBJECTIVE_SUBSTITUTION'), []);
});

// ========== B. WHATSAPP_EXPLICIT_OBJECTIVE_INVALID ==========
t('B. "El objetivo principal de la campaña es agendar citas." in appointment_closing DOES trigger BUSINESS_OBJECTIVE_SUBSTITUTION', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { appointment_closing: 'El objetivo principal de la campaña es agendar citas.' } }, { nodeId: 'whatsapp_conversion' });
  assert(violations.some(v => v.type === 'BUSINESS_OBJECTIVE_SUBSTITUTION'), JSON.stringify(violations));
});

// ========== C. ADS_OBJECTIVE_SUBSTITUTION_STILL_FAILS ==========
t('C. ads.campaign_objective = "Generar leads para agendar citas." still fails closed (protection not relaxed)', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { campaign_objective: 'Generar leads para agendar citas.' } }, { nodeId: 'ads' });
  assert(violations.some(v => v.type === 'BUSINESS_OBJECTIVE_SUBSTITUTION'), JSON.stringify(violations));
});

// ========== D. OBJECTIVE_CANONICAL_PASS ==========
t('D. ads.campaign_objective = "Vender el minicurso Método 360." passes (matches canonical objective)', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { campaign_objective: 'Vender el minicurso Método 360.' } }, { nodeId: 'ads' });
  assert.deepStrictEqual(violations.filter(v => v.type === 'BUSINESS_OBJECTIVE_SUBSTITUTION'), []);
});

// ========== E. NATURAL_NO_INVENTES_CONSTRAINT ==========
t('E. the exact live natural brief (no labels except Objetivo:) extracts every fact, mechanism, and the natural constraint sentence verbatim', () => {
  const f = briefFacts.extract(LIVE_NATURAL_BRIEF);
  assert.equal(f.product_name.value, 'Método 360');
  assert.equal(f.product_type.value, 'minicurso grabado');
  assert.equal(f.price.value, '400'); assert.equal(f.currency.value, 'MXN');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
  assert.equal(f.business_objective.value, 'vender el minicurso');
  assert(/Meta Ads/.test(f.mechanism.value) && /WhatsApp/.test(f.mechanism.value) && /consulta/i.test(f.mechanism.value));
  assert.equal(f.constraints.status, 'USER_PROVIDED_FACT');
  assert(f.constraints.value.includes('No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia'), f.constraints.value);
});

// ========== F. NATURAL_CONSTRAINT_ACTIVATES_PROHIBITION ==========
t('F. with that natural constraint captured, "usar testimonios" in a node output triggers EXPLICIT_PROHIBITION', () => {
  const f = briefFacts.extract(LIVE_NATURAL_BRIEF);
  const { violations } = fidelity.validateOutputAgainstFacts(f, { downstream_payload: { creative_testing: 'usar testimonios' } }, { nodeId: 'ads' });
  assert(violations.some(v => v.type === 'EXPLICIT_PROHIBITION'), JSON.stringify(violations));
});

// ========== G. NATURAL_CONSTRAINT_NO_FALSE_EXTENSION ==========
t('G. the natural extractor never invents prohibitions the user did not write (urgencia/escasez/deadline/CPA/MER absent from the captured value)', () => {
  const f = briefFacts.extract(LIVE_NATURAL_BRIEF);
  assert(!/urgencia|escasez|deadline|\bcpa\b|\bmer\b/i.test(f.constraints.value), f.constraints.value);
});

// ========== H. STRUCTURED_CONSTRAINTS_UNCHANGED ==========
t('H. the structured Método 360 brief (9-bullet "Restricciones obligatorias:" block) still extracts identically, taking precedence over natural-sentence capture', () => {
  const f = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  const lines = f.constraints.value.split('\n');
  assert.equal(lines.length, 9, JSON.stringify(lines));
  assert(/No cambiar el nombre Método 360/.test(f.constraints.value));
  assert(/No inventar m[ée]tricas/.test(f.constraints.value));
});

// ========== I. LIVE_FAILURE_FIXTURE ==========
t('I. recreating the exact live failure (whatsapp_conversion.appointment_closing, mechanism-compatible text) passes', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, {
    downstream_payload: { appointment_closing: 'Confirmamos los detalles y avanzamos a agendar la cita para continuar la conversación.' },
  }, { nodeId: 'whatsapp_conversion' });
  assert.deepStrictEqual(violations.filter(v => v.type === 'BUSINESS_OBJECTIVE_SUBSTITUTION'), []);
});

// ========== J. TRUE_OBJECTIVE_DRIFT_FIXTURE ==========
t('J. "El objetivo de la campaña es conseguir citas, no vender el minicurso." in appointment_closing fails (true drift, not a false positive)', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, {
    downstream_payload: { appointment_closing: 'El objetivo de la campaña es conseguir citas, no vender el minicurso.' },
  }, { nodeId: 'whatsapp_conversion' });
  assert(violations.some(v => v.type === 'BUSINESS_OBJECTIVE_SUBSTITUTION'), JSON.stringify(violations));
});

// ========== extra: PRODUCT/BUYER/PRICE/GEOGRAPHY/MECHANISM checks untouched ==========
t('extra: mechanism substitution (webinar -> checkout) still fails closed, unaffected by the objective field-awareness change', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { stages: 'funnel: webinar -> checkout' } }, { nodeId: 'funnel' });
  assert(violations.some(v => v.type === 'MECHANISM_SUBSTITUTION'), JSON.stringify(violations));
});
t('extra: price substitution still fails closed, unaffected by the objective field-awareness change', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { offer_structure: 'ahora el precio es $999 MXN' } }, { nodeId: 'offer' });
  assert(violations.some(v => v.type === 'PRICE_SUBSTITUTION'), JSON.stringify(violations));
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_CONTEXT_AWARE_OBJECTIVE_AND_NATURAL_CONSTRAINTS_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
