'use strict';
// ASTRA_CAMPAIGN360_BEFORE_AFTER_SEMANTIC_REMEDIATION_2026_09_13 — closes a confirmed live false
// positive from job e61b7afb-07da-49a5-89be-bc3cce9ce066 (creative_strategy node, all upstream
// nodes clean, sole violation: EXPLICIT_PROHIBITION/invented_evidence on the bare token
// "antes/después" inside creative_territories = "PROPUESTA: Antes/después en pasos" — a creative
// FORMAT proposal, "show a before/after AS A STEP SEQUENCE", not a claim real customer evidence
// exists).
//
// ROOT CAUSE: "antes/después" was an ungated bare-token alternative inside the monolithic
// INVENTED_EVIDENCE_CLAIM regex — unlike the participle family (validados/probados/...), which
// already got nearest-noun disambiguation in the prior remediation (isOperationalAssetValidationMatch),
// before/after had no equivalent. English "before/after" had NO coverage at all (a stale comment
// incorrectly assumed it was "language-neutral").
//
// FIX: isStructuralProcessBeforeAfterMatch — same nearest-term idiom as isOperationalAssetValidationMatch,
// opposite term lists (STRUCTURAL_PROCESS_TERMS_RE vs the pre-existing EVIDENCE_RESULT_TERMS_RE).
// Exempts (PASS) only when a structural/process term (pasos/proceso/secuencia/etapas/flujo/layout/
// estructura/recorrido, + EN mirrors) is nearest AND no evidence/result term appears anywhere in the
// clause. Fails closed in BOTH directions: an evidence term anywhere -> never exempt; a BARE
// before/after with NEITHER signal present ALSO never exempts (conservative-by-default, matching
// this file's whole convention). English "before/after"/"before and after" added, gated identically
// from day one. No field-role table, no creative_territories reference, no live-phrase whitelist
// anywhere in source — verified by grep in CI-equivalent review; this file's own assertions below
// exercise the distinction purely by clause content.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const briefFacts = require('../src/workflows/campaign_brief_facts');

const BRIEF = ['Crea una campaña 360 para Método 360.', '',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.', '',
  'Objetivo: vender el minicurso.', '',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.', '',
  'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.'].join('\n');
const facts = briefFacts.extract(BRIEF);
const EVID = 'EXPLICIT_PROHIBITION';

const tests = []; function t(name, fn) { tests.push({ name, fn }); }

// field/node default to the EXACT live location (creative_strategy.creative_territories) so the
// live-fixture tests (Part E) and every adversarial case run through the identical real code path.
function invEvidence(text, field = 'creative_territories', nodeId = 'creative_strategy') {
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [field]: text } }, { nodeId, upstream_outputs: [] })
    .violations.filter(v => v.type === EVID && v.category === 'invented_evidence');
}
function detects(text) { return invEvidence(text).length >= 1; }
function passes(text) { return invEvidence(text).length === 0; }

// ===================== PART E — live fixture (exact clauses from job e61b7afb) =====================

t('E1 LIVE negative control: "PROPUESTA: Antes/después en pasos" => 0 invented_evidence', () => {
  assert.deepStrictEqual(invEvidence('PROPUESTA: Antes/después en pasos'), []);
});

t('E2 LIVE positive control (same field): "PROPUESTA: Fotos antes/después de clientes como prueba" => DETECT', () => {
  assert(detects('PROPUESTA: Fotos antes/después de clientes como prueba'));
});

// ===================== PART D — Spanish positive controls (must DETECT) =====================

t('D1 Spanish evidentiary before/after controls all DETECT', () => {
  assert(detects('antes/después de clientes'));
  assert(detects('resultados antes/después'));
  assert(detects('fotos antes/después como prueba'));
  assert(detects('transformación antes/después'));
  assert(detects('caso antes/después'));
  assert(detects('antes/después documentado'));
  assert(detects('antes/después comprobado'));
});

// ===================== PART D — English positive controls (must DETECT) =====================

t('D2 English evidentiary before/after controls all DETECT', () => {
  assert(detects('before/after results'));
  assert(detects('before and after client results'));
  assert(detects('before/after proof'));
  assert(detects('documented before/after'));
  assert(detects('before/after case study'));
});

// ===================== PART A — Spanish negative controls (must PASS) =====================

t('A1 Spanish structural/process before/after controls all PASS', () => {
  assert(passes('Antes/después en pasos'));
  assert(passes('Antes/después del proceso'));
  assert(passes('Secuencia antes/después'));
  assert(passes('Etapas antes/después'));
  assert(passes('Flujo antes/después'));
  assert(passes('Layout antes/después'));
});

// ===================== PART A — English negative controls (must PASS) =====================

t('A2 English structural/process before/after controls all PASS', () => {
  assert(passes('Before/after workflow'));
  assert(passes('Before/after process'));
  assert(passes('Before/after sequence'));
  assert(passes('Before/after layout'));
  assert(passes('Before/after steps'));
});

// ===================== PART D — unrelated invented_evidence controls unaffected =====================

t('D3 unrelated invented_evidence controls (non-before/after) still detect exactly as before', () => {
  assert(detects('resultados validados'));
  assert(detects('casos de éxito'));
  assert(detects('evidencia real'));
  assert(detects('clientes lograron aumentar sus ventas'));
  assert(detects('documented results'));
  assert(detects('validated results'));
});

t('D4 the prior remediation\'s operational-asset escape is untouched', () => {
  assert(passes('Creativos del anuncio listos y validados.'));
  assert(passes('The creative asset is validated.'));
});

// ===================== PART F — adversarial matrix =====================

t('F1 before/after + process term only => PASS', () => {
  assert(passes('Mostrar el antes/después en pasos numerados'));
  assert(passes('Before/after across three workflow steps'));
});

t('F2 before/after + evidence term => DETECT', () => {
  assert(detects('Antes/después con resultados reales del cliente'));
  assert(detects('Before/after with documented client results'));
});

t('F3 before/after + both process and evidence terms => DETECT when evidence meaning explicit', () => {
  // Evidence term present anywhere in the clause -> never exempt, regardless of a co-occurring
  // process/structure word (isStructuralProcessBeforeAfterMatch checks evidence presence FIRST and
  // fails closed toward detection, exactly like isOperationalAssetValidationMatch already does).
  assert(detects('Secuencia de pasos mostrando el antes/después de resultados comprobados'));
  assert(detects('Before/after process showing documented case results'));
});

t('F4 before/after alone (neither process nor evidence term nearby) => DETECT (conservative default)', () => {
  // Deliberate design choice, documented here: absence of BOTH signals must not grant an exemption
  // on its own — only a specifically-identified non-evidentiary (structural/process) context does.
  // This mirrors isOperationalAssetValidationMatch's own "no locatable context -> never exempt"
  // default and keeps this category fail-closed by construction.
  assert(detects('Antes/después.'));
  assert(detects('Before/after.'));
  assert(detects('Antes/después impactante.'));
});

t('F5 negated evidentiary form => must NOT count as fabricated evidence', () => {
  assert.deepStrictEqual(invEvidence('No usar fotos antes/después como prueba'), []);
  assert.deepStrictEqual(invEvidence('Do not use before/after photos as proof'), []);
});

t('F6 PROPUESTA-labeled structural usage => PASS (marker never affects this category)', () => {
  assert(passes('PROPUESTA: antes/después en pasos'));
  assert(passes('antes/después en pasos')); // unlabeled, same structural meaning -> still PASS
});

t('F7 PROPUESTA-labeled evidentiary usage => DETECT (marker never exempts fabrication)', () => {
  assert(detects('PROPUESTA: fotos antes/después de clientes como prueba'));
  assert(detects('fotos antes/después de clientes como prueba')); // unlabeled -> still DETECT
});

t('F8 nested arrays/objects still respect the structural-process escape', () => {
  const r1 = fidelity.validateOutputAgainstFacts(facts,
    { downstream_payload: { creative_territories: ['Concepto A', 'Antes/después en pasos', 'Concepto C'] } },
    { nodeId: 'creative_strategy', upstream_outputs: [] });
  assert.deepStrictEqual(r1.violations.filter(v => v.type === EVID && v.category === 'invented_evidence'), []);

  const r2 = fidelity.validateOutputAgainstFacts(facts,
    { downstream_payload: { creative_territories: { primary: 'Antes/después con resultados documentados' } } },
    { nodeId: 'creative_strategy', upstream_outputs: [] });
  assert(r2.violations.some(v => v.type === EVID && v.category === 'invented_evidence'));
});

t('F9 punctuation variants all resolve consistently', () => {
  assert(passes('antes / después en pasos'));
  assert(passes('antes/después en pasos'));
  assert(passes('before / after workflow'));
  assert(passes('before/after workflow'));
  assert(detects('antes / después de resultados comprobados'));
  assert(detects('before / after proof'));
});

t('F10 bilingual mixed phrasing', () => {
  assert(passes('Mostramos el before/after en pasos del proceso'));
  assert(detects('Mostramos el before/after con resultados validados del cliente'));
});

// ===================== Part C confirmation: English coverage genuinely added =====================

t('C1 English before/after previously had NO coverage at all; now gated identically to Spanish', () => {
  assert(passes('Before/after layout'));
  assert(detects('Before/after proof'));
});

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); }
    catch (e) { fail++; console.log('FAIL', name, e.stack); }
  }
  console.log(`BEFORE_AFTER_EVIDENCE_SEMANTIC_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
