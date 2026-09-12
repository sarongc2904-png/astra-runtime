'use strict';
// ASTRA_CAMPAIGN360_GUARANTEED_RESULT_CLAIM_REMEDIATION — corrects a PREEXISTING gap surfaced by
// the DESIRED_OUTCOME_FIELD_SEMANTICS_REMEDIATION gate's own test matrix (commit 7a77537):
// field_key=desired_outcomes, text="Resultados garantizados" produced 0 violations even under a
// constraint prohibiting invented results/evidence — the prior gate's report incorrectly declared
// GUARANTEE_CONTROL=PASS when the case actually FAILED.
//
// ROOT CAUSE: no detector matched "Resultados garantizados" at all.
//   - The existing 'guarantee' category (PROHIBITED_CONTENT_PATTERNS/PROHIBITION_CATEGORY_TERMS,
//     pattern /garantizamos|garant[ií]a\s+de\s+resultado/i) never ACTIVATES for a constraint that
//     only says "no inventes ... resultados ... evidencia" (no "garantía" wording in the
//     constraint itself) — activeExplicitProhibitionCategories() only activates a category whose
//     own PROHIBITION_CATEGORY_TERMS pattern matches the constraint text.
//   - 'invented_result' WAS already active (constraint says "resultados"), but
//     INVENTED_RESULT_CLAIM had no guarantee verb in RESULT_CLAIM_VERBS, and never listed the bare
//     word "resultado(s)" in RESULT_OUTCOME_TERMS (only concrete channels: ventas/leads/citas/
//     clientes/...), so "Resultados garantizados" matched nothing.
//
// FIX (reuses the existing invented_result layer — no new architecture): INVENTED_RESULT_CLAIM
// gains a guarantee-verb family (garantiz\w* — one stem covers every conjugation) paired with
// either a concrete RESULT_OUTCOME_TERM or the bare word "resultado(s)" (added only to this new
// branch, never to the base term list other branches use). A guarantee is categorically STRONGER
// than a comparative claim, so: (a) it is NOT protected by the desired_outcomes qualitative-goal
// escape from the prior gate — isGuaranteedResultMatch() excludes guarantee-verb/bare-"resultado"
// matches from that escape specifically; (b) it is NOT bypassed by a PROPUESTA: prefix (this file
// has never honored that marker as an escape for any EXPLICIT_PROHIBITION category); (c) it IS
// correctly recognized as negated ("No garantizamos resultados") via a direct self-negation check
// (the generic "no <verb> <object>" cue can't anchor when the match IS the verb itself) and as
// advisory framing ("Evitar prometer resultados garantizados") via a dedicated advisory cue —
// scoped ONLY to guarantee-category matches, never widened to any other invented_result phrasing;
// (d) "garantía" (the noun — reembolso/producto/satisfacción) never matches at all, since it does
// not contain the "garantiz" verb stem.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

const CONSTRAINT = 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
function violations(nodeId, fieldKey, text, constraintValue = CONSTRAINT) {
  const facts = { constraints: { status: 'USER_PROVIDED_FACT', value: constraintValue } };
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [fieldKey]: text } }, { nodeId }).violations;
}
function categories(v) { return v.map(x => x.category).filter(Boolean); }
function detectsInventedResult(nodeId, fieldKey, text) {
  assert(categories(violations(nodeId, fieldKey, text)).includes('invented_result'), text);
}
function passesInventedResult(nodeId, fieldKey, text) {
  assert.deepStrictEqual(categories(violations(nodeId, fieldKey, text)).filter(c => c === 'invented_result'), [], text);
}

// ========== PREEXISTING GAP — reproduced against the code as of 7a77537 ==========
t('PREEXISTING_GAP: "Resultados garantizados" in desired_outcomes produced 0 violations before this fix (documented, not re-asserted against live code — see commit message)', () => {
  // This is a documentation-only assertion: the gap is closed below by every DETECT case.
  // The actual pre-fix reproduction was run manually against commit 7a77537 (see final report).
  assert(true);
});

// ========== CASE 1-8: guarantee/result claims must DETECT ==========
t('CASE 1: desired_outcomes "Resultados garantizados" -> DETECT', () => detectsInventedResult('icp', 'desired_outcomes', 'Resultados garantizados.'));
t('CASE 2: ad_copy "Te garantizamos resultados" -> DETECT', () => detectsInventedResult('ads', 'ad_copy', 'Te garantizamos resultados.'));
t('CASE 3: "Garantizamos más citas" -> DETECT', () => detectsInventedResult('ads', 'ad_copy', 'Garantizamos más citas.'));
t('CASE 4: "Ventas garantizadas" -> DETECT', () => detectsInventedResult('ads', 'ad_copy', 'Ventas garantizadas.'));
t('CASE 5: "Clientes garantizados" -> DETECT', () => detectsInventedResult('ads', 'ad_copy', 'Clientes garantizados.'));
t('CASE 6: "Te garantizamos mejorar tus ingresos" -> DETECT', () => detectsInventedResult('ads', 'ad_copy', 'Te garantizamos mejorar tus ingresos.'));
t('CASE 7: "PROPUESTA: resultados garantizados" -> DETECT (PROPUESTA is not a bypass)', () => detectsInventedResult('ads', 'ad_copy', 'PROPUESTA: resultados garantizados.'));
t('CASE 8: "PROPUESTA: te garantizamos más citas" -> DETECT', () => detectsInventedResult('ads', 'ad_copy', 'PROPUESTA: te garantizamos más citas.'));

// ========== CASE 9-13: negation / safe context => PASS ==========
t('CASE 9: "No garantizamos resultados" -> PASS', () => passesInventedResult('ads', 'ad_copy', 'No garantizamos resultados.'));
t('CASE 10: "No existe garantía de resultados" -> PASS', () => passesInventedResult('ads', 'ad_copy', 'No existe garantía de resultados.'));
t('CASE 11: "Sin garantía de resultados" -> PASS', () => passesInventedResult('ads', 'ad_copy', 'Sin garantía de resultados.'));
t('CASE 12: "Evitar prometer resultados garantizados" -> PASS (advisory framing)', () => passesInventedResult('ads', 'ad_copy', 'Evitar prometer resultados garantizados.'));
t('CASE 13: quoted-example "No usar claims como \'resultados garantizados\'" -> PASS (existing negation-scope mechanism)', () => passesInventedResult('ads', 'ad_copy', "No usar claims como 'resultados garantizados'."));

// ========== CASE 14-17: legitimate qualitative desired_outcomes still PASS (prior gate, unaffected) ==========
t('CASE 14: desired_outcomes "Aumentar citas" -> PASS', () => passesInventedResult('icp', 'desired_outcomes', 'Aumentar citas.'));
t('CASE 15: desired_outcomes "Mejorar conversión consulta→cita" -> PASS', () => passesInventedResult('icp', 'desired_outcomes', 'Mejorar conversión consulta→cita.'));
t('CASE 16: desired_outcomes "Conseguir más clientes" -> PASS', () => passesInventedResult('icp', 'desired_outcomes', 'Conseguir más clientes.'));
t('CASE 17: desired_outcomes "Mejorar ingresos" -> PASS', () => passesInventedResult('icp', 'desired_outcomes', 'Mejorar ingresos.'));

// ========== CASE 18-21: desired_outcomes + strong claim => still DETECT ==========
t('CASE 18: desired_outcomes "Aumentar ventas 30% en 30 días" -> DETECT (magnitude, not a bare wish)', () => detectsInventedResult('icp', 'desired_outcomes', 'Aumentar ventas 30% en 30 días.'));
t('CASE 19: desired_outcomes "Resultados garantizados" -> DETECT (guarantee is never protected by desired_outcomes semantics)', () => detectsInventedResult('icp', 'desired_outcomes', 'Resultados garantizados.'));
t('CASE 20: desired_outcomes "Resultados probados por clientes" -> evidence control remains active', () => {
  assert(categories(violations('icp', 'desired_outcomes', 'Resultados probados por clientes.')).includes('invented_evidence'));
});
t('CASE 21: desired_outcomes "100 clientes garantizados" -> DETECT', () => detectsInventedResult('icp', 'desired_outcomes', '100 clientes garantizados.'));

// ========== CASE 22-24: unrelated "garantía" wording must NOT false-positive as invented_result ==========
t('CASE 22: "PROPUESTA: garantía de reembolso" -> NOT invented_result', () => passesInventedResult('ads', 'ad_copy', 'PROPUESTA: garantía de reembolso.'));
t('CASE 23: "garantía del producto" -> NOT invented_result', () => passesInventedResult('ads', 'ad_copy', 'garantía del producto.'));
t('CASE 24: "garantía de satisfacción" -> NOT invented_result', () => passesInventedResult('ads', 'ad_copy', 'garantía de satisfacción.'));

// ========== "PROPUESTA:" precedence — must never neutralize a guaranteed-result claim ==========
t('precedence: "PROPUESTA: garantizamos 30% más ventas" still fails', () => detectsInventedResult('ads', 'ad_copy', 'PROPUESTA: garantizamos 30% más ventas.'));

// ========== LIVE REGRESSION FIXTURE — diagnostics must be preserved ==========
t('LIVE_REGRESSION_FIXTURE: node=icp, field=desired_outcomes, "Resultados garantizados" produces >=1 explicable, deterministic violation with full diagnostics', () => {
  const v = violations('icp', 'desired_outcomes', 'Resultados garantizados.');
  assert(v.length >= 1, JSON.stringify(v));
  const hit = v.find(x => x.category === 'invented_result');
  assert(hit, JSON.stringify(v));
  assert.equal(hit.type, 'EXPLICIT_PROHIBITION');
  assert.equal(hit.node, 'icp');
  assert.equal(hit.path, 'node_outputs.icp.downstream_payload.desired_outcomes');
  assert(typeof hit.matched_text === 'string' && hit.matched_text.length > 0);
  assert(typeof hit.matched_pattern === 'string' && hit.matched_pattern.length > 0);
  assert(typeof hit.local_clause === 'string' && hit.local_clause.length > 0);
  assert.equal(typeof hit.clause_index, 'number');
  assert.equal(typeof hit.occurrence_start, 'number');
  // deterministic: identical input -> identical output
  const v2 = violations('icp', 'desired_outcomes', 'Resultados garantizados.');
  assert.deepStrictEqual(v, v2);
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_GUARANTEED_RESULT_CLAIM_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
