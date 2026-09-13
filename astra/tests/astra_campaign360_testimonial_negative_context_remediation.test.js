'use strict';
// ASTRA_CAMPAIGN360_TESTIMONIAL_NEGATIVE_CONTEXT_REMEDIATION — closes a confirmed live false
// positive from job f376ee3d-7a74-43fe-b5b8-c8c0caabfa89 (deployed commit a71120e; request
// fidelity and canonical brief extraction both PASSED; the job failed only at funnel node
// validation, before final synthesis, with 8/8 nodes never reached).
//
// Exact live violation: funnel.drop_off_risks[2] = "PROPUESTA:Desconfianza por falta de
// testimonios" was flagged EXPLICIT_PROHIBITION/testimonials via bare regex match on "testimonios",
// with zero negation-context awareness of "falta de" (lack of) — a funnel risk describing that
// customers distrust the offer BECAUSE testimonials are absent, not a claim that testimonials
// exist or are being fabricated.
//
// ROOT CAUSE: the user's canonical prohibition ("No inventes ... testimonios ni evidencia")
// forbids FABRICATING the prohibited content; it says nothing about describing its ABSENCE. The
// existing negation-context machinery in checkExplicitProhibitionOnLeaf (brief_fidelity_
// validator.js) already recognized several negation shapes ("no usar/incluir/...", bare "sin X",
// "no hay X", English "no/without X", advisory "evitar/avoid") but had NO cue at all for three
// distinct, general absence/plan-to-obtain shapes:
//   1. EXISTENCE_ABSENCE_CUE: Spanish noun-phrase absence idioms "falta de X" / "ausencia de X" /
//      "carencia de X", and the existence-negation verb form "no existe(n) X" — the semantic
//      mirror of the already-recognized "sin X"/"no hay X", just phrased as a noun or an
//      existence verb instead of a bare preposition/"hay".
//   2. PASSIVE_NEGATION_CUE: the Spanish reflexive-passive negation shape "no se VERB" ("no se
//      proporcionaron testimonios") — the passive-voice mirror of the already-recognized active
//      "no + VERB" shape, stemmed across the same verb family (proporcionar/incluir/mencionar/
//      presentar/afirmar/declarar/inventar/obtener/conseguir/lograr).
//   3. NEED_TO_OBTAIN_CUE: an expressed PLAN to acquire the content later ("Necesitamos conseguir
//      testimonios reales") — the same honest non-assertion the existing FUTURE_HEDGE_CUE already
//      recognizes ("testimonios futuros", "eventualmente"), just phrased as a stated need/
//      requirement rather than an explicit future/conditional marker.
// All three are GENERAL, closed, stemmed vocabularies applied at the shared isNegated()/
// FUTURE_HEDGE_CUE decision point used by EVERY PROHIBITED_CONTENT_PATTERNS category (testimonials,
// proof, social_proof, guarantee, invented_metric, invented_result, invented_evidence) and every
// field — never a testimonials-specific, node-specific, or drop_off_risks-specific whitelist, and
// never an exact-string match on the live phrase itself.
//
// ITERATION 2 (HUMAN_AUTHORIZATION_ASTRA_CAMPAIGN360_IMPLICIT_TESTIMONIAL_ATTRIBUTION_REMEDIATION_
// 2026_09_13) closes the two DETECT gaps iteration 1's own report flagged: "Una clienta dice que
// duplicó sus resultados" and "Clientes satisfechos recomiendan el método" never contain the
// literal word "testimonio(s)"/"evidencia", so the base regex never even considered them. Added:
//   - HUMAN_SOURCE_NOUN: a closed bilingual vocabulary (client/customer/patient/student/user/
//     buyer/person stems) shared by the new checks below.
//   - COLLECTION_REQUEST_CUE: a human-SOURCE co-occurring with a planning/collection/verification
//     verb (preguntar/recopilar/entrevistar/verificar/ask/collect/interview/verify/...) in either
//     order — closes 5 newly-adjudicated false positives ("Recopilar testimonios reales de
//     clientas", "Ask customers whether they would provide a testimonial", etc.) that literally
//     contain "testimonio(s)"/"testimonial(s)" but describe a PLAN to obtain/verify from a source,
//     never an assertion. Wired at the same isNegated()/FUTURE_HEDGE_CUE decision point as
//     iteration 1's cues.
//   - checkImplicitTestimonialAttribution: a NEW, separate matcher (never broadening any existing
//     category) that flags a human SOURCE co-occurring with a genuine ATTRIBUTION/ENDORSEMENT verb
//     (dice/afirma/asegura/cuenta/recomienda/reporta/comenta/señala or says/states/claims/reports/
//     recommends/endorses/tells) — a completely separate, non-overlapping verb vocabulary from
//     COLLECTION_REQUEST_CUE's planning verbs — or the "Según SOURCE, .../According to SOURCE, ..."
//     attribution construction, requiring at least one word of payload beyond the source+verb
//     themselves so a bare "Clienta dice." is never flagged. Feeds the SAME EXPLICIT_PROHIBITION/
//     testimonials category as the literal-word matcher.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = []; let pass = 0, fail = 0;
let persistedCaseCount = 0;
function t(name, fn) { tests.push({ name, fn }); }
function tPersist(name, fn) { persistedCaseCount++; t(name, fn); }

const METRIC_CONSTRAINT = 'No inventes metricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
const FACTS = { constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } };
function prohibitionViolations(field, text, nodeId = 'funnel') {
  return fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { [field]: text } }, { nodeId })
    .violations.filter(v => v.type === 'EXPLICIT_PROHIBITION');
}
function synthesisProhibitionViolations(deliverable) {
  return fidelity.validateFinalSynthesis(FACTS, { deliverable }, {})
    .violations.filter(v => v.type === 'EXPLICIT_PROHIBITION');
}

// ============================================================
// EXACT LIVE VIOLATION — job f376ee3d-7a74-43fe-b5b8-c8c0caabfa89
// ============================================================
tPersist('LIVE VIOLATION: funnel.drop_off_risks "PROPUESTA:Desconfianza por falta de testimonios" -> PASS', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'PROPUESTA:Desconfianza por falta de testimonios'), []);
});
tPersist('LIVE VIOLATION reproduced exactly at its own array leaf_path (drop_off_risks[2])', () => {
  const v = prohibitionViolations('drop_off_risks', ['Riesgo de precio', 'Riesgo de tiempo', 'PROPUESTA:Desconfianza por falta de testimonios']);
  assert.deepStrictEqual(v, []);
});

// ============================================================
// ABSENCE / NEGATION / RESEARCH / NEED VARIANTS -> PASS (required: at least 4)
// ============================================================
tPersist('ABSENCE-PASS "Ausencia de testimonios"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Ausencia de testimonios'), []));
tPersist('ABSENCE-PASS "Carencia de testimonios genera desconfianza"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Carencia de testimonios genera desconfianza'), []));
tPersist('ABSENCE-PASS "No existen testimonios todavía"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No existen testimonios todavía'), []));
tPersist('ABSENCE-PASS "No existe evidencia disponible"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No existe evidencia disponible'), []));
tPersist('ABSENCE-PASS "No hay testimonios disponibles"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No hay testimonios disponibles'), []));
tPersist('ABSENCE-PASS "Falta prueba social"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Falta prueba social'), []));
tPersist('PASSIVE-NEGATION-PASS "No se proporcionaron testimonios"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No se proporcionaron testimonios'), []));
tPersist('PASSIVE-NEGATION-PASS "No se incluyeron testimonios en el brief"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No se incluyeron testimonios en el brief'), []));
tPersist('PASSIVE-NEGATION-PASS "No se presentó evidencia"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No se presentó evidencia'), []));
tPersist('NEED-TO-OBTAIN-PASS "Necesitamos conseguir testimonios reales"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Necesitamos conseguir testimonios reales'), []));
tPersist('NEED-TO-OBTAIN-PASS "Hay que recopilar testimonios antes del lanzamiento"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Hay que recopilar testimonios antes del lanzamiento'), []));
tPersist('NEED-TO-OBTAIN-PASS "Debemos obtener evidencia de resultados"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Debemos obtener evidencia de resultados'), []));
tPersist('RESEARCH-PASS "Confirmar si existen testimonios"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Confirmar si existen testimonios'), []));
tPersist('RESEARCH-PASS "Verificar disponibilidad de testimonios con el cliente"', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Verificar disponibilidad de testimonios con el cliente'), []));

// ============================================================
// GENUINE POSITIVE TESTIMONIAL/EVIDENCE ASSERTIONS -> DETECT (required: at least 4)
// ============================================================
tPersist('POSITIVE-DETECT "Tenemos testimonios de clientas satisfechas"', () => assert(prohibitionViolations('drop_off_risks', 'Tenemos testimonios de clientas satisfechas').length > 0));
tPersist('POSITIVE-DETECT "Testimonios reales demuestran que funciona"', () => assert(prohibitionViolations('drop_off_risks', 'Testimonios reales demuestran que funciona').length > 0));
tPersist('POSITIVE-DETECT "Usar testimonios de clientes en el anuncio"', () => assert(prohibitionViolations('drop_off_risks', 'Usar testimonios de clientes en el anuncio').length > 0));
tPersist('POSITIVE-DETECT "Incluir testimonios en la landing"', () => assert(prohibitionViolations('drop_off_risks', 'Incluir testimonios en la landing').length > 0));
tPersist('POSITIVE-DETECT "We have real testimonials from happy clients"', () => assert(prohibitionViolations('drop_off_risks', 'We have real testimonials from happy clients').length > 0));

// ============================================================
// NESTED ARRAY / OBJECT LEAF-PATH COVERAGE
// ============================================================
tPersist('NESTED-ARRAY: absence variant buried among genuine risks -> only isolates nothing (all PASS)', () => {
  const v = prohibitionViolations('drop_off_risks', ['Precio alto', 'Falta de testimonios genera dudas', 'Proceso de pago confuso']);
  assert.deepStrictEqual(v, []);
});
tPersist('NESTED-ARRAY: absence variant AND a genuine positive claim in the same array -> isolates only the positive one', () => {
  const v = prohibitionViolations('drop_off_risks', ['Ausencia de testimonios', 'Usar testimonios de clientes', 'Riesgo de tiempo']);
  assert.equal(v.length, 1);
  assert.equal(v[0].matched_text.toLowerCase().includes('testimon'), true);
});
tPersist('NESTED-OBJECT (final synthesis section): funnel.drop_off_risks absence variant -> PASS', () => {
  assert.deepStrictEqual(synthesisProhibitionViolations({ '6_funnel': { drop_off_risks: 'PROPUESTA:Desconfianza por falta de testimonios' } }), []);
});
tPersist('NESTED-OBJECT (final synthesis section): funnel.drop_off_risks genuine positive claim -> DETECT', () => {
  assert(synthesisProhibitionViolations({ '6_funnel': { drop_off_risks: 'Tenemos testimonios reales de clientas' } }).length > 0);
});

// ============================================================
// PROTECTED REGRESSIONS — general cue must not weaken existing detection anywhere else
// ============================================================
tPersist('PROTECTED: existing negation forms still PASS unchanged (No usar testimonios.)', () => assert.deepStrictEqual(prohibitionViolations('constraints', 'No usar testimonios.', 'market_context'), []));
tPersist('PROTECTED: existing negation forms still PASS unchanged (sin proof disponible.)', () => assert.deepStrictEqual(prohibitionViolations('constraints', 'sin proof disponible.', 'market_context'), []));
tPersist('PROTECTED: affirmative testimonials still DETECT (Usar testimonios de clientes.)', () => assert(prohibitionViolations('constraints', 'Usar testimonios de clientes.', 'market_context').length > 0));
tPersist('PROTECTED: mixed clause with adversative still DETECT once (No inventes testimonios, pero usa testimonios reales.)', () => {
  const v = prohibitionViolations('constraints', 'No inventes testimonios, pero usa testimonios reales.', 'market_context');
  assert.equal(v.length, 1);
});
tPersist('PROTECTED: guarantee category unaffected by the new absence cues ("Garantizamos resultados")', () => {
  const guaranteeFacts = { constraints: { value: METRIC_CONSTRAINT + ' No garantizamos resultados.', status: 'USER_PROVIDED_FACT' } };
  const v = fidelity.validateOutputAgainstFacts(guaranteeFacts, { downstream_payload: { drop_off_risks: 'Garantizamos resultados' } }, { nodeId: 'funnel' }).violations;
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'guarantee'));
});
tPersist('PROTECTED: invented_result category unaffected by the new absence cues ("Duplicamos tus ventas en 30 dias")', () => {
  const v = prohibitionViolations('drop_off_risks', 'Duplicamos tus ventas en 30 dias');
  assert(v.some(x => x.category === 'invented_result'));
});
tPersist('PROTECTED: absence cue does not swallow an unrelated affirmative clause after it ("Falta de presupuesto. Usar testimonios reales.")', () => {
  const v = prohibitionViolations('drop_off_risks', 'Falta de presupuesto. Usar testimonios reales.');
  assert.equal(v.filter(x => x.category === 'testimonials').length, 1);
});
tPersist('PROTECTED: need-to-obtain cue does not swallow an unrelated affirmative clause in the SAME sentence ("Necesitamos conseguir mas clientes. Usar testimonios reales.")', () => {
  const v = prohibitionViolations('drop_off_risks', 'Necesitamos conseguir mas clientes. Usar testimonios reales.');
  assert.equal(v.filter(x => x.category === 'testimonials').length, 1);
});

// ============================================================
// FRESH RED-TEAM CASES
// ============================================================
let freshCaseCount = 0;
function tFresh(name, fn) { freshCaseCount++; t('FRESH-' + freshCaseCount + ' ' + name, fn); }

tFresh('capitalization: "FALTA DE TESTIMONIOS" uppercase -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'FALTA DE TESTIMONIOS'), []));
tFresh('capitalization: "AUSENCIA DE EVIDENCIA" uppercase -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'AUSENCIA DE EVIDENCIA'), []));
tFresh('punctuation: "Desconfianza por falta de testimonios." with trailing period -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Desconfianza por falta de testimonios.'), []));
tFresh('punctuation: "Riesgo: falta de testimonios" with colon -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Riesgo: falta de testimonios'), []));
tFresh('accented vs unaccented "carencia de testimonios" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'carencia de testimonios'), []));
tFresh('English: "Lack of testimonials creates distrust" (English lack-of idiom, out of scope for the Spanish EXISTENCE_ABSENCE_CUE) still handled via bare-noun negation only if literally negated', () => {
  // Not one of the mandate's PASS examples; documents current behavior rather than asserting a
  // specific outcome the mandate did not require, so this only checks the call does not throw.
  assert.doesNotThrow(() => prohibitionViolations('drop_off_risks', 'Lack of testimonials creates distrust'));
});
tFresh('multiple occurrences: "Falta de testimonios y falta de evidencia" both absent -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Falta de testimonios y falta de evidencia'), []));
tFresh('"no se han recopilado testimonios" (compound passive tense) -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'no se han recopilado testimonios'), []));
tFresh('"no se consiguieron testimonios a tiempo" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'no se consiguieron testimonios a tiempo'), []));
tFresh('"Se requiere conseguir testimonios antes del lanzamiento" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Se requiere conseguir testimonios antes del lanzamiento'), []));
tFresh('"Requerimos recopilar evidencia de resultados" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Requerimos recopilar evidencia de resultados'), []));
tFresh('a genuine claim immediately AFTER an absence clause in the same field still DETECTs only the claim ("Falta de testimonios. Incluir testimonios falsos.")', () => {
  const v = prohibitionViolations('drop_off_risks', 'Falta de testimonios. Incluir testimonios falsos.');
  assert.equal(v.filter(x => x.category === 'testimonials').length, 1);
});
tFresh('array with only absence/need variants across multiple items -> PASS entirely', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', ['Falta de testimonios', 'No se proporcionó evidencia', 'Necesitamos conseguir casos de éxito']), []);
});
tFresh('nested object under a non-drop_off_risks field also gets the general cue (not field-specific)', () => {
  assert.deepStrictEqual(prohibitionViolations('objections', 'Objeción: falta de testimonios visibles', 'ads'), []);
});
tFresh('nested object under a non-drop_off_risks field still detects a genuine claim (not field-specific)', () => {
  assert(prohibitionViolations('objections', 'Responder mostrando testimonios reales de clientas', 'ads').length > 0);
});
tFresh('"existencia de testimonios" (affirmative existence noun, NOT negated) still DETECTs', () => {
  assert(prohibitionViolations('drop_off_risks', 'La existencia de testimonios genera confianza').length > 0);
});
tFresh('"no existe garantía de resultados" (different category, same absence cue) -> PASS for guarantee category too', () => {
  const v = prohibitionViolations('drop_off_risks', 'no existe garantia de resultados');
  assert.deepStrictEqual(v.filter(x => x.category === 'guarantee'), []);
});

// ============================================================
// ITERATION 2 — IMPLICIT TESTIMONIAL ATTRIBUTION
// ============================================================
tPersist('IMPLICIT-DETECT "Una clienta dice que duplicó sus resultados"', () => {
  assert(prohibitionViolations('drop_off_risks', 'Una clienta dice que duplicó sus resultados').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "Clientes satisfechos recomiendan el método"', () => {
  assert(prohibitionViolations('drop_off_risks', 'Clientes satisfechos recomiendan el método').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "Una paciente afirma que consiguió más citas"', () => {
  assert(prohibitionViolations('drop_off_risks', 'Una paciente afirma que consiguió más citas').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "Una alumna cuenta que logró llenar su agenda"', () => {
  assert(prohibitionViolations('drop_off_risks', 'Una alumna cuenta que logró llenar su agenda').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "Una usuaria asegura que funciona"', () => {
  assert(prohibitionViolations('drop_off_risks', 'Una usuaria asegura que funciona').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "Según una clienta, el método le generó más consultas"', () => {
  assert(prohibitionViolations('drop_off_risks', 'Según una clienta, el método le generó más consultas').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "A client says she doubled her results"', () => {
  assert(prohibitionViolations('drop_off_risks', 'A client says she doubled her results').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "Happy customers recommend the method"', () => {
  assert(prohibitionViolations('drop_off_risks', 'Happy customers recommend the method').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "A patient says she got more appointments"', () => {
  assert(prohibitionViolations('drop_off_risks', 'A patient says she got more appointments').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "A student reports that she filled her calendar"', () => {
  assert(prohibitionViolations('drop_off_risks', 'A student reports that she filled her calendar').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "A user says it works"', () => {
  assert(prohibitionViolations('drop_off_risks', 'A user says it works').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT "According to a customer, the method generated more leads"', () => {
  assert(prohibitionViolations('drop_off_risks', 'According to a customer, the method generated more leads').some(v => v.category === 'testimonials'));
});
tPersist('IMPLICIT-DETECT nested array/object leaf-path case', () => {
  const v = prohibitionViolations('drop_off_risks', ['Riesgo de precio', 'Una clienta dice que duplicó sus resultados', 'Riesgo de tiempo']);
  const hit = v.find(x => x.category === 'testimonials');
  assert(hit, JSON.stringify(v));
  assert.equal(hit.leaf_path, 'drop_off_risks[1]');
});
tPersist('IMPLICIT-DETECT nested final-synthesis section object', () => {
  assert(synthesisProhibitionViolations({ '6_funnel': { drop_off_risks: 'Clientes satisfechos recomiendan el método' } }).some(v => v.category === 'testimonials'));
});

tPersist('IMPLICIT-PASS "El público objetivo son clientas de estética"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'El público objetivo son clientas de estética'), []);
});
tPersist('IMPLICIT-PASS "Las clientas pueden escribir por WhatsApp"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Las clientas pueden escribir por WhatsApp'), []);
});
tPersist('IMPLICIT-PASS "Preguntar a clientas si darían un testimonio"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Preguntar a clientas si darían un testimonio'), []);
});
tPersist('IMPLICIT-PASS "Recopilar testimonios reales de clientas"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Recopilar testimonios reales de clientas'), []);
});
tPersist('IMPLICIT-PASS "No hay testimonios de clientas disponibles"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No hay testimonios de clientas disponibles'), []);
});
tPersist('IMPLICIT-PASS "Verificar si alguna clienta ha dado permiso para usar su testimonio"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Verificar si alguna clienta ha dado permiso para usar su testimonio'), []);
});
tPersist('IMPLICIT-PASS "Entrevistar clientas para obtener feedback"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Entrevistar clientas para obtener feedback'), []);
});
tPersist('IMPLICIT-PASS "Ask customers whether they would provide a testimonial" (English research/planning)', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Ask customers whether they would provide a testimonial'), []);
});
tPersist('IMPLICIT-PASS "Customers can contact us through WhatsApp"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Customers can contact us through WhatsApp'), []);
});
tPersist('IMPLICIT-PASS "Collect real testimonials from customers"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Collect real testimonials from customers'), []);
});
tPersist('IMPLICIT-PASS "No customer testimonials are available"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No customer testimonials are available'), []);
});

// ============================================================
// ITERATION 2 — RE-VERIFY ALL ITERATION-1 EXACT LIVE NEGATIVE-CONTEXT CASES
// ============================================================
tPersist('RE-VERIFY iter1 "PROPUESTA:Desconfianza por falta de testimonios" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'PROPUESTA:Desconfianza por falta de testimonios'), []));
tPersist('RE-VERIFY iter1 "Ausencia de testimonios" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Ausencia de testimonios'), []));
tPersist('RE-VERIFY iter1 "No existen testimonios todavía" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No existen testimonios todavía'), []));
tPersist('RE-VERIFY iter1 "No se proporcionaron testimonios" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'No se proporcionaron testimonios'), []));
tPersist('RE-VERIFY iter1 "Necesitamos conseguir testimonios reales" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Necesitamos conseguir testimonios reales'), []));
tPersist('RE-VERIFY iter1 "Confirmar si existen testimonios" -> PASS', () => assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Confirmar si existen testimonios'), []));
tPersist('RE-VERIFY iter1 affirmative positive claim still DETECTs ("Tenemos testimonios de clientas satisfechas")', () => {
  assert(prohibitionViolations('drop_off_risks', 'Tenemos testimonios de clientas satisfechas').length > 0);
});

// ============================================================
// FRESH RED-TEAM — ITERATION 2
// ============================================================
tFresh('capitalization: "UNA CLIENTA DICE QUE DUPLICÓ SUS RESULTADOS" uppercase -> DETECT', () => {
  assert(prohibitionViolations('drop_off_risks', 'UNA CLIENTA DICE QUE DUPLICÓ SUS RESULTADOS').some(v => v.category === 'testimonials'));
});
tFresh('a bare, payload-less attribution "Una clienta dice." never flags (guards against empty attribution)', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Una clienta dice.'), []);
});
tFresh('a bare source mention with no verb never flags ("Varias clientas y pacientes.")', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Varias clientas y pacientes.'), []);
});
tFresh('a bare attribution verb with no human source never flags ("El equipo recomienda mejoras internas.")', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'El equipo recomienda mejoras internas.'), []);
});
tFresh('mixed field: a genuine implicit-attribution claim followed by an unrelated risk in the same array isolates only the claim', () => {
  const v = prohibitionViolations('drop_off_risks', ['Riesgo de precio alto', 'Un comprador asegura que le funcionó de inmediato']);
  const hits = v.filter(x => x.category === 'testimonials');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].leaf_path, 'drop_off_risks[1]');
});
tFresh('buyer/user stem: "Un usuario reporta resultados excelentes" -> DETECT', () => {
  assert(prohibitionViolations('drop_off_risks', 'Un usuario reporta resultados excelentes').some(v => v.category === 'testimonials'));
});
tFresh('buyer/person stem: "Esta persona comenta que le encantó el curso" -> DETECT', () => {
  assert(prohibitionViolations('drop_off_risks', 'Esta persona comenta que le encantó el curso').some(v => v.category === 'testimonials'));
});
tFresh('planning verb + attribution verb both absent in a pure audience-definition sentence stays PASS ("Las pacientes son mujeres de 30 a 50 años")', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Las pacientes son mujeres de 30 a 50 años'), []);
});
tFresh('English "tells": "A customer tells us the process was easy" -> DETECT', () => {
  assert(prohibitionViolations('drop_off_risks', 'A customer tells us the process was easy').some(v => v.category === 'testimonials'));
});
tFresh('English collection framing still PASS: "Interview customers about their experience"', () => {
  assert.deepStrictEqual(prohibitionViolations('drop_off_risks', 'Interview customers about their experience'), []);
});
tFresh('PROTECTED: existing literal "Usar testimonios de clientes" still DETECTs alongside the implicit matcher active', () => {
  assert(prohibitionViolations('drop_off_risks', 'Usar testimonios de clientes en el anuncio').length > 0);
});
tFresh('PROTECTED: existing literal "Incluir testimonios en la landing" still DETECTs', () => {
  assert(prohibitionViolations('drop_off_risks', 'Incluir testimonios en la landing').length > 0);
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e.message); }
  }
  console.log('\nPERSISTED_CASES=' + persistedCaseCount);
  console.log('FRESH_RED_TEAM_CASES=' + freshCaseCount);
  console.log('\nASTRA_CAMPAIGN360_TESTIMONIAL_NEGATIVE_CONTEXT_REMEDIATION_TEST_RESULT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
