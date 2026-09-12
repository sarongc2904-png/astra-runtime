'use strict';
// ASTRA_CAMPAIGN360_LANGUAGE_AND_EPISTEMIC_HARDENING — closes two confirmed coverage gaps
// surfaced by the prior systemic-integrity verification gate (fresh cases F3 and F14):
//
// F3 — LANGUAGE ROBUSTNESS: mechanism-term extraction was Spanish-lexical-adjacent enough that a
// same-language-consistent English (or mixed ES/EN) mechanism/output pairing could, in one real
// case ("content -> demo -> sales call"), escape detection because the purchase-grounding word
// "sales" textually collided with the mechanism's own compound endpoint noun ("sales call"), and
// a plural mechanism-chain word ("appointments") never matched its singular use elsewhere
// ("appointment"). FIX (structure-first, never a translation dictionary): mechanism endpoints are
// still recognized purely by ARROW POSITION (language-agnostic by construction — this was already
// true); this gate (a) normalizes every arrow variant (→/⇒/➜/-->/->/>) through one shared regex,
// (b) extends the bilingual, bounded connector/verb stopword list so English tool-agnostic
// connectors and "book/schedule/request/register/get/obtain/contact/click" verbs are excluded from
// term extraction exactly like their Spanish counterparts already were, (c) stems a naive trailing
// "-s" off extracted terms so plural/singular surface forms resolve to the same anchor, and
// (d) excludes a purchase-grounding word match that is itself a COMPOUND with one of the
// mechanism's own terms ("sales call") from counting as grounding.
//
// F14 — SHORT-TOPIC EPISTEMIC COVERAGE: the >=4-character floor for a shared assumption "topic"
// discarded real short business acronyms (CAC, KPI, CRM, LTV, API, IVA, SEO...). FIX (generic
// rule, not a closed whitelist): a 2-5 ALL-CAPS letter token, word-bounded, checked on the
// ORIGINAL case-preserved text, is also a valid topic — an ordinary lowercase short word ("de",
// "la", "abc") never qualifies this way, so it cannot become an accidental anchor purely by
// coincidence of length. A pre-existing, unrelated regex bug was also found and fixed while
// testing this: the "usuario confirmó/indicó/..." cue's trailing \b never matched (JS regex \b is
// defined over ASCII \w, and the accented "ó" is not \w, so the position right after it is never a
// boundary) — replaced with a lookahead that only rejects a genuinely continuing letter.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = []; let pass = 0, fail = 0;
let roleCaseCount = 0, epistemicCaseCount = 0;
function t(name, fn) { tests.push({ name, fn }); }
function tRole(name, fn) { roleCaseCount++; t(name, fn); }
function tEpistemic(name, fn) { epistemicCaseCount++; t(name, fn); }

function facts(objective, mechanism) {
  return {
    business_objective: objective ? { value: objective, status: 'USER_PROVIDED_FACT' } : { value: null, status: 'UNKNOWN' },
    mechanism: mechanism ? { value: mechanism, status: 'USER_PROVIDED_FACT' } : { value: null, status: 'UNKNOWN' },
  };
}
function mechViol(fa, deliverable) {
  return fidelity.validateFinalSynthesis(fa, { deliverable }).violations.filter(v => v.type === 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION');
}
function epiViol(assumptions, rawRequest) {
  return fidelity.validateFinalSynthesis({}, { deliverable: { '14_assumptions': assumptions } }, { rawRequest }).violations;
}

// ============================================================
// PART A — LANGUAGE-ROBUST MECHANISM ROLE EXTRACTION MATRIX (F3-A..J, named)
// ============================================================
tEpistemic; // no-op reference to keep counters distinct in lint tools; real counting below.
tRole('F3-A ES/EN mixed: sell-objective + EN mechanism appointment endpoint -> DETECT', () => {
  const fa = facts('vender curso', 'ad -> WhatsApp -> appointment');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Comprar curso o book appointment' } }).length > 0);
});
tRole('F3-B EN objective + ES mechanism cita endpoint -> DETECT', () => {
  const fa = facts('sell course', 'anuncio -> conversación -> cita');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Buy course or agendar cita' } }).length > 0);
});
tRole('F3-C ES objective + EN mechanism demo endpoint -> DETECT', () => {
  const fa = facts('vender software', 'content -> form -> demo');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Comprar software o request demo' } }).length > 0);
});
tRole('F3-D EN objective grounds EN demo endpoint -> PASS', () => {
  const fa = facts('generate demos', 'content -> form -> demo');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Request demo' } }), []);
});
tRole('F3-E ES objective + EN mechanism consultation endpoint -> DETECT', () => {
  const fa = facts('vender producto', 'ad -> chat -> consultation');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Comprar producto o book consultation' } }).length > 0);
});
tRole('F3-F EN appointment objective grounds EN appointment endpoint -> PASS', () => {
  const fa = facts('book appointments', 'ad -> WhatsApp -> appointment');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Book appointment' } }), []);
});
tRole('F3-G ES visit objective grounds EN visit endpoint -> PASS', () => {
  const fa = facts('generar visitas', 'ad -> map -> visit');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirm visit' } }), []);
});
tRole('F3-H compound-noun collision: "sales call" endpoint not grounded by coincidental "sales" -> DETECT', () => {
  const fa = facts('sell software', 'content -> demo -> sales call');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Book a sales call' } }).length > 0);
});
tRole('F3-I mixed-language natural-sentence (no-arrow) mechanism, plural endpoint stems to singular use -> DETECT', () => {
  const fa = facts('vender el minicurso', 'Meta Ads para generar leads and WhatsApp to book appointments');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Book appointment' } }).length > 0);
});
tRole('F3-J same mixed-language mechanism under an explicit appointment objective -> PASS', () => {
  const fa = facts('book appointments', 'Meta Ads para generar leads and WhatsApp to book appointments');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Book appointment' } }), []);
});

// ============================================================
// PART A — GENERATED ROLE-COHERENCE ADVERSARIAL MATRIX
// ============================================================
// Objectives x mechanism-forms x fields, generated mechanically. Expected outcome is computed
// from the SAME grounding rule the production code implements (endpoint grounded by objective
// stem-match OR purchase vocabulary) — never hand-picked per case — so this matrix tests the RULE,
// not a memorized answer key.
function normWord(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
const PURCHASE_WORDS = new Set(['compra', 'venta', 'pago', 'purchase', 'sale', 'pay']);
// Mirrors production's bounded, symmetric ENDPOINT_SYNONYM_PAIRS (brief_fidelity_validator.js) so
// this test file's own generated-matrix oracle stays consistent with the cross-language endpoint
// equivalence the hardening intentionally adds — an objective stated in either language must exempt
// both language forms of the same conversion-endpoint concept, verified independently via the
// hand-authored X1-X8 cross-language cases below.
const TEST_ENDPOINT_SYNONYM_PAIRS = [
  ['cita', 'appointment'], ['reserva', 'reservation'], ['visita', 'visit'],
  ['llamada', 'call'], ['consulta', 'consultation'], ['conversacion', 'conversation'],
];
function endpointSynonymEquivalents(term) {
  const nt = normWord(term);
  const set = new Set([nt]);
  for (const [es, en] of TEST_ENDPOINT_SYNONYM_PAIRS) {
    if (nt === es || es.startsWith(nt) || nt.startsWith(es)) set.add(en);
    if (nt === en || en.startsWith(nt) || nt.startsWith(en)) set.add(es);
  }
  return [...set];
}
function objectiveGroundsWord(objective, term) {
  if (!objective) return false;
  const words = normWord(objective).split(/[^a-z0-9]+/);
  return endpointSynonymEquivalents(term).some(nt => words.some(w => w.length >= 3 && (w.startsWith(nt) || nt.startsWith(w))));
}
const OBJECTIVES = {
  sale_es: 'vender el producto', sale_en: 'sell the product',
  appointment_es: 'generar citas', appointment_en: 'book appointments',
  lead_es: 'generar leads calificados', lead_en: 'generate qualified leads',
  reservation_es: 'generar reservas', reservation_en: 'generate reservations',
  visit_es: 'generar visitas a tienda', visit_en: 'drive store visits',
  conversation_es: 'generar conversaciones de venta', conversation_en: 'start sales conversations',
  demo_es: 'generar demos', demo_en: 'generate demos',
  unknown: null,
};
// mechanism forms: arrow (ES), alternate arrow (EN, using ⇒/> variants), no-arrow phrase, enumeration list
const MECHANISM_FORMS = {
  arrow_es: { text: 'Anuncio -> WhatsApp -> cita', endpoint: 'cita' },
  arrow_en_alt: { text: 'Ad ⇒ WhatsApp ⇒ appointment', endpoint: 'appointment' },
  arrow_mixed_gt: { text: 'Anuncio > chat > consulta', endpoint: 'consulta' },
  noarrow_es: { text: 'Anuncio para conseguir clientes', endpoint: 'clientes' },
  noarrow_en: { text: 'Ad to generate leads and calls', endpoint: 'calls' },
  enumeration_es: { text: 'anuncio, formulario, demo', endpoint: 'demo' }, // arrow-free enumeration phrase
};
const FIELD_CASES = [
  ['6_funnel', 'conversion_intent', 'STRICT'],
  ['12_whatsapp_followup_closing', 'closing', 'STRICT'],
  ['13_measurement_kpis', 'primary_outcome', 'STRICT'],
  ['6_funnel', 'stages', 'SEQUENCE'],
  ['13_measurement_kpis', 'conversion_metrics', 'ENUMERATION'],
];

let advId = 0;
for (const [objKey, objective] of Object.entries(OBJECTIVES)) {
  for (const [mechKey, mech] of Object.entries(MECHANISM_FORMS)) {
    for (const [sectionKey, subKey, role] of FIELD_CASES) {
      advId++;
      const grounded = objectiveGroundsWord(objective, mech.endpoint) || PURCHASE_WORDS.has(normWord(mech.endpoint));
      const expectDetect = !grounded;
      // Build field text appropriate to the role's structure so the check actually inspects it.
      let text;
      if (role === 'STRICT') text = `Lograr resultado o confirmar ${mech.endpoint}`;
      else if (role === 'SEQUENCE') text = `Anuncio -> WhatsApp -> ${mech.endpoint}`;
      else text = `Registro; confirmar ${mech.endpoint}`;
      tRole(`ADV-ROLE#${advId} obj=${objKey} mech=${mechKey} field=${subKey}(${role}) expect=${expectDetect ? 'DETECT' : 'PASS'}`, () => {
        const fa = facts(objective, mech.text);
        const v = mechViol(fa, { [sectionKey]: { [subKey]: text } });
        assert.equal(v.length > 0, expectDetect, JSON.stringify({ objective, mech: mech.text, text, v }));
      });
    }
  }
}

// SAFE-field must-pass cases (mechanism-safe field, leading-indicator-safe field) — explicit,
// regardless of objective/mechanism pairing, since SAFE fields are never inspected at all.
for (const [objKey, objective] of Object.entries(OBJECTIVES)) {
  tRole(`ADV-ROLE-SAFE obj=${objKey}: leading_indicators mentioning the endpoint stays PASS`, () => {
    const fa = facts(objective, 'Anuncio -> WhatsApp -> cita');
    assert.deepStrictEqual(mechViol(fa, { '13_measurement_kpis': { leading_indicators: 'Chats iniciados; citas agendadas como indicador' } }), []);
  });
}

// ============================================================
// PART B — GENERATED SHORT-TOPIC EPISTEMIC ADVERSARIAL MATRIX (+ B1-B14 named)
// ============================================================
const RAW_NO_TOPIC = 'Vende tu curso. Objetivo: vender el curso.';
function rawWith(topicMention) { return RAW_NO_TOPIC + ' ' + topicMention; }

tEpistemic('B1 acronym attributed to user, brief silent on it -> UNSUPPORTED_USER_ATTRIBUTION', () => {
  assert(epiViol(['El usuario confirmó CAC.'], RAW_NO_TOPIC).some(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION'));
});
tEpistemic('B2 acronym attributed to user, brief DOES mention it -> PASS', () => {
  assert.deepStrictEqual(epiViol(['El usuario confirmó CAC.'], rawWith('CAC objetivo 300 MXN.')), []);
});
tEpistemic('B3 contradictory acronym epistemic states, neither grounded -> CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS', () => {
  assert(epiViol(['CAC desconocido.', 'CAC definido.'], RAW_NO_TOPIC).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tEpistemic('B4 acronym denial contradicts a brief-grounded value -> KNOWN_FACT_DENIAL', () => {
  assert(epiViol(['CAC desconocido.'], rawWith('CAC objetivo 300 MXN.')).some(v => v.type === 'KNOWN_FACT_DENIAL'));
});
tEpistemic('B5 "KPI definidos por usuario", brief silent -> DETECT', () => {
  assert(epiViol(['KPI definidos por usuario.'], RAW_NO_TOPIC).some(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION'));
});
tEpistemic('B6 "CRM disponible" + "CRM desconocido" -> DETECT contradiction', () => {
  assert(epiViol(['CRM disponible.', 'CRM desconocido.'], RAW_NO_TOPIC).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tEpistemic('B7 "LTV confirmado por el usuario", brief silent -> DETECT unsupported attribution', () => {
  assert(epiViol(['LTV confirmado por el usuario.'], RAW_NO_TOPIC).some(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION'));
});
tEpistemic('B8 "API disponible" + "API desconocida" -> DETECT contradiction', () => {
  assert(epiViol(['API disponible.', 'API desconocida.'], RAW_NO_TOPIC).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tEpistemic('B9 "IVA incluido" + "IVA desconocido" -> DETECT contradiction', () => {
  assert(epiViol(['IVA incluido.', 'IVA desconocido.'], RAW_NO_TOPIC).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tEpistemic('B10 ordinary short Spanish words (de/la/el/en) never become epistemic anchors', () => {
  const v = epiViol(['El presupuesto de la campaña en el plan definido por usuario, de la el en.'], RAW_NO_TOPIC);
  assert(v.every(x => !['de', 'la', 'el', 'en'].includes(x.matched_anchor)), JSON.stringify(v));
});
tEpistemic('B11 lowercase random 3-letter token does not qualify as a topic merely by length', () => {
  const v = epiViol(['abc definido por usuario.'], RAW_NO_TOPIC);
  assert(v.every(x => x.matched_anchor !== 'abc'), JSON.stringify(v));
});
tEpistemic('B12 acronym with surrounding punctuation "(KPI)" normalizes and detects correctly', () => {
  assert(epiViol(['(KPI) definido por usuario.'], RAW_NO_TOPIC).some(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION' && v.matched_anchor === 'kpi'));
});
tEpistemic('B12b acronym with trailing colon/comma "CAC:" / "CRM," normalizes correctly', () => {
  // "CAC:" still extracts the "cac" anchor despite the colon, so a denial of a brief-grounded
  // CAC value is correctly caught as a KNOWN_FACT_DENIAL (colon punctuation must not swallow the
  // acronym into "cac:" and silently fail to match).
  assert(epiViol(['CAC: desconocido.'], rawWith('CAC objetivo 300 MXN.')).some(v => v.type === 'KNOWN_FACT_DENIAL' && v.matched_anchor === 'cac'));
  assert(epiViol(['CRM, disponible.', 'CRM desconocido.'], RAW_NO_TOPIC).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tEpistemic('B13 plural acronym "KPIs" resolves to the same topic as singular "KPI"', () => {
  assert(epiViol(['KPIs definidos por usuario.'], RAW_NO_TOPIC).some(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION' && v.matched_anchor === 'kpi'));
  assert.deepStrictEqual(epiViol(['KPIs definidos por usuario.'], rawWith('KPI mensual definido.')), []);
});
tEpistemic('B14 PROPUESTA prefix does not bypass a false acronym attribution', () => {
  assert(epiViol(['PROPUESTA: CAC definido por usuario.'], RAW_NO_TOPIC).some(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION'));
});

// Generated short-topic matrix: cross a set of acronyms x epistemic status x grounding.
const ACRONYMS = ['CAC', 'KPI', 'CRM', 'LTV', 'API', 'SEO', 'SEM', 'ROI', 'ROAS', 'CPA'];
for (const acr of ACRONYMS) {
  tEpistemic(`ADV-EPI attribution "${acr} definido por usuario." ungrounded -> DETECT`, () => {
    assert(epiViol([`${acr} definido por usuario.`], RAW_NO_TOPIC).some(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION'));
  });
  tEpistemic(`ADV-EPI attribution "${acr} definido por usuario." grounded -> PASS`, () => {
    assert.deepStrictEqual(epiViol([`${acr} definido por usuario.`], rawWith(`${acr} valor conocido.`)), []);
  });
  tEpistemic(`ADV-EPI contradiction "${acr} disponible." + "${acr} desconocido." ungrounded -> DETECT`, () => {
    assert(epiViol([`${acr} disponible.`, `${acr} desconocido.`], RAW_NO_TOPIC).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
  });
  tEpistemic(`ADV-EPI denial "${acr} desconocido." contradicts brief-grounded value -> DETECT`, () => {
    assert(epiViol([`${acr} desconocido.`], rawWith(`${acr} valor conocido.`)).some(v => v.type === 'KNOWN_FACT_DENIAL'));
  });
}

// ============================================================
// PROPERTY — LANGUAGE INVARIANCE (ES <-> EN equivalent pairs)
// ============================================================
const EQUIV_PAIRS = [
  ['cita', 'appointment'], ['reserva', 'reservation'], ['visita', 'visit'], ['llamada', 'call'],
  ['demo', 'demo'], ['consulta', 'consultation'], ['conversación', 'conversation'],
  ['compra', 'purchase'], ['pago', 'payment'], ['venta', 'sale'], ['lead', 'lead'],
];
for (const [es, en] of EQUIV_PAIRS) {
  tRole(`PROPERTY-LANG-INVARIANCE ${es}<->${en}: same role structure -> same decision (sale objective, ungrounded endpoint)`, () => {
    const faEs = facts('vender el curso', `Anuncio -> WhatsApp -> ${es}`);
    const faEn = facts('sell the course', `Ad -> WhatsApp -> ${en}`);
    const vEs = mechViol(faEs, { '6_funnel': { conversion_intent: `Comprar curso o confirmar ${es}` } });
    const vEn = mechViol(faEn, { '6_funnel': { conversion_intent: `Buy course or confirm ${en}` } });
    // "lead"/"venta"/"sale"/"compra"/"pago"/"payment"/"purchase" are themselves commercial/grounded
    // terms (an objective-neutral endpoint that already IS the conversion) — both sides PASS;
    // every other pair is an ungrounded mechanism-only endpoint — both sides DETECT.
    assert.equal(vEs.length > 0, vEn.length > 0, JSON.stringify({ es, en, vEs, vEn }));
  });
}

// ============================================================
// SUPPORTING PROPERTIES (idempotence, clean no-op, non-repairable fail-closed) — re-verified here
// against the hardened code, not just the previous gate's version.
// ============================================================
t('PROPERTY repair(repair(x)) === repair(x): idempotent after the F3/F14 hardening', () => {
  const fa = facts('vender el curso', 'Anuncio -> WhatsApp -> cita');
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Comprar curso o confirmar cita' } } };
  const v1 = fidelity.validateFinalSynthesis(fa, synth, {}).violations;
  const r1 = fidelity.repairFinalSynthesis(fa, synth, v1, {});
  const v2 = fidelity.validateFinalSynthesis(fa, r1.synthesis, {}).violations;
  const r2 = fidelity.repairFinalSynthesis(fa, r1.synthesis, v2, {});
  assert.equal(v2.length, 0);
  assert.equal(r2, null);
});
t('PROPERTY clean synthesis is a no-op for repair (still true after hardening)', () => {
  const fa = facts('vender el curso', 'Anuncio -> WhatsApp -> cita');
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Comprar el curso' } } };
  const v = fidelity.validateFinalSynthesis(fa, synth, {}).violations;
  assert.equal(v.length, 0);
  assert.equal(fidelity.repairFinalSynthesis(fa, synth, v, {}), null);
});
t('PROPERTY mixed repairable + EXPLICIT_PROHIBITION still fails closed after hardening', () => {
  const fa = { ...facts('vender el curso', 'Anuncio -> WhatsApp -> cita'), constraints: { value: 'No inventes resultados.', status: 'USER_PROVIDED_FACT' } };
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Comprar curso o confirmar cita', qualification_points: 'PROPUESTA: Aumenta tus ventas' } } };
  const v = fidelity.validateFinalSynthesis(fa, synth, {}).violations;
  assert(v.some(x => !fidelity.isRepairableFinalSynthesisViolation(x)));
  assert.equal(fidelity.repairFinalSynthesis(fa, synth, v, {}), null);
});
t('PROPERTY post-repair revalidation is unconditional (a still-bad synthesis is independently re-flagged)', () => {
  const fa = facts('vender el curso', 'Anuncio -> WhatsApp -> cita');
  const stillBad = { deliverable: { '6_funnel': { conversion_intent: 'Agendar cita' } } };
  const v = fidelity.validateFinalSynthesis(fa, stillBad, {}).violations;
  assert(v.length > 0);
});

// ============================================================
// GENERIC CROSS-DOMAIN FIXTURES (re-verified with the hardened code)
// ============================================================
const DOMAIN_FIXTURES = [
  { name: 'DENTAL', objective: 'generar citas', mechanism: 'Meta Ads -> WhatsApp -> cita', field: 'Confirmar cita', expectDetect: false },
  { name: 'INFOPRODUCT', objective: 'vender curso', mechanism: 'Meta Ads -> WhatsApp -> cita', field: 'Confirmar cita', expectDetect: true },
  { name: 'RESTAURANT', objective: 'generar reservas', mechanism: 'Anuncio -> WhatsApp -> reserva', field: 'Confirmar reserva', expectDetect: false },
  { name: 'ECOMMERCE', objective: 'vender producto', mechanism: 'Anuncio -> chat -> consulta', field: 'Agendar consulta', expectDetect: true },
  { name: 'AUTOMOTIVE_explicit', objective: 'agendar cita para cotizar vehiculo', mechanism: 'Anuncio -> WhatsApp -> cita', field: 'Confirmar cita', expectDetect: false },
  { name: 'AUTOMOTIVE_absent', objective: 'vender vehiculo', mechanism: 'Anuncio -> WhatsApp -> cita', field: 'Confirmar cita', expectDetect: true },
  { name: 'SOFTWARE', objective: 'vender software', mechanism: 'Contenido -> demo -> llamada', field: 'Agendar llamada de demo', expectDetect: true },
  { name: 'RETAIL', objective: 'generar visitas a tienda', mechanism: 'Anuncio -> mapa -> visita', field: 'Confirmar visita', expectDetect: false },
];
for (const d of DOMAIN_FIXTURES) {
  t(`DOMAIN ${d.name}`, () => {
    const fa = facts(d.objective, d.mechanism);
    const v = mechViol(fa, { '6_funnel': { conversion_intent: d.field } });
    assert.equal(v.length > 0, d.expectDetect, JSON.stringify({ d, v }));
  });
}

// ============================================================
// 20 FRESH POST-IMPLEMENTATION CASES — designed after inspecting the final hardened code,
// targeting the hardening itself (compound-noun exclusion, acronym extraction, arrow
// normalization, stemming) plus repeats of the mutation-review dimensions from the prior gate.
// ============================================================
tRole('FRESH-1 alternate arrow "➜" recognized identically to "->"', () => {
  const fa = facts('vender el curso', 'Anuncio ➜ WhatsApp ➜ cita');
  assert(mechViol(fa, { '6_funnel': { stages: 'Anuncio ➜ WhatsApp ➜ Cita.' } }).length > 0);
});
tRole('FRESH-2 bare ">" arrow recognized', () => {
  const fa = facts('vender el curso', 'Anuncio > WhatsApp > cita');
  assert(mechViol(fa, { '6_funnel': { stages: 'Anuncio > WhatsApp > Cita.' } }).length > 0);
});
tRole('FRESH-3 "-->" not half-consumed as "->" (longest-token-first)', () => {
  const fa = facts('vender el curso', 'Anuncio --> WhatsApp --> cita');
  const terms = mechViol(fa, { '6_funnel': { stages: 'Anuncio --> WhatsApp --> Cita.' } });
  assert(terms.length === 1 && terms[0].matched_anchor === 'cita');
});
tRole('FRESH-4 compound-noun exclusion does not over-exclude a genuine purchase grounding elsewhere in the same candidate', () => {
  const fa = facts('sell software', 'content -> demo -> sales call');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Comprar el software' } }), []);
});
tRole('FRESH-5 "sales page" (different compound, same collision family) also correctly detected', () => {
  const fa = facts('sell software', 'content -> demo -> sales page');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Book a sales page' } }).length > 0);
});
tRole('FRESH-6 capitalized English endpoint mid-sentence still detected', () => {
  const fa = facts('vender el curso', 'Ad -> WhatsApp -> Appointment');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Buy course or BOOK APPOINTMENT' } }).length > 0);
});
tRole('FRESH-7 parenthetical PROPUESTA around the endpoint does not escape detection', () => {
  const fa = facts('vender el curso', 'Anuncio -> WhatsApp -> cita');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Comprar curso o (PROPUESTA) confirmar cita' } }).length > 0);
});
tRole('FRESH-8 repeated endpoint mention across two candidates only flags the ungrounded one once per candidate', () => {
  const fa = facts('vender el curso', 'Anuncio -> WhatsApp -> cita');
  const v = mechViol(fa, { '13_measurement_kpis': { conversion_metrics: 'citas agendadas; citas confirmadas; compras del curso' } });
  assert.equal(v.length, 2);
});
tRole('FRESH-9 safe mechanism-field mention of the English endpoint stays PASS', () => {
  const fa = facts('vender el curso', 'Ad -> WhatsApp -> appointment');
  assert.deepStrictEqual(mechViol(fa, { '5_offer': { mechanism: 'The course teaches how to book an appointment.' } }), []);
});
tRole('FRESH-10 explicit English appointment objective + English mechanism -> PASS (no false regression)', () => {
  const fa = facts('book appointments for the clinic', 'Ad -> WhatsApp -> appointment');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Book appointment' } }), []);
});
tRole('FRESH-11 English sale objective + Spanish mechanism endpoint -> DETECT', () => {
  const fa = facts('sell the course', 'Anuncio -> WhatsApp -> cita');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Buy course or agendar cita' } }).length > 0);
});
tRole('FRESH-12 unknown objective (UNKNOWN) + English mechanism endpoint, ungrounded -> DETECT', () => {
  const fa = facts(null, 'Ad -> WhatsApp -> appointment');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Book appointment' } }).length > 0);
});
tEpistemic('FRESH-13 acronym topic with negation stays safe (mirrors existing negation family, unaffected by acronym support)', () => {
  assert.deepStrictEqual(epiViol(['No confirmamos CAC por el usuario.'], RAW_NO_TOPIC).filter(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION'), []);
});
tEpistemic('FRESH-14 acronym embedded in a longer sentence with other short words still extracts correctly', () => {
  const v = epiViol(['El CAC del mes fue definido por el usuario en la reunión de ayer.'], RAW_NO_TOPIC);
  assert(v.some(x => x.type === 'UNSUPPORTED_USER_ATTRIBUTION' && x.matched_anchor === 'cac'));
});
tEpistemic('FRESH-15 two DIFFERENT acronyms in contradiction-shaped sentences do NOT falsely cross-contradict', () => {
  const v = epiViol(['CAC disponible.', 'KPI desconocido.'], RAW_NO_TOPIC);
  assert.deepStrictEqual(v.filter(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
});
tRole('FRESH-16 mixed ES/EN enumeration field: only the ungrounded English endpoint item flagged', () => {
  const fa = facts('vender el curso', 'Ad -> WhatsApp -> appointment');
  const v = mechViol(fa, { '13_measurement_kpis': { conversion_metrics: 'Compra del curso, book appointment, mensajes recibidos' } });
  assert.equal(v.length, 1);
  assert(/appointment/i.test(v[0].matched_text));
});
tRole('FRESH-17 no-arrow English mechanism phrase ("Ad to generate leads") extracts "leads" deterministically, not hardcoded to any industry', () => {
  const fa = facts('sell the course', 'Ad to generate leads');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Buy the course or generate more leads' } }).length > 0);
});
tRole('FRESH-18 explicit lead-generation objective grounds the no-arrow English "leads" endpoint -> PASS', () => {
  const fa = facts('generate qualified leads', 'Ad to generate leads');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Generate more leads' } }), []);
});
tEpistemic('FRESH-19 acronym PROPUESTA-marked contradiction still resolved by repair (removal, never rewritten into a fact)', () => {
  const synth = { deliverable: { '14_assumptions': ['PROPUESTA: CAC definido por usuario.', 'CAC desconocido.'] } };
  const first = fidelity.validateFinalSynthesis({}, synth, { rawRequest: RAW_NO_TOPIC });
  const repaired = fidelity.repairFinalSynthesis({}, synth, first.violations, { rawRequest: RAW_NO_TOPIC });
  assert(repaired);
  const second = fidelity.validateFinalSynthesis({}, repaired.synthesis, { rawRequest: RAW_NO_TOPIC });
  assert.deepStrictEqual(second.violations, []);
  assert(!repaired.synthesis.deliverable['14_assumptions'].some(x => /cac definido por usuario/i.test(x)));
});
tRole('FRESH-20 repair of a compound-noun-collision candidate preserves the surviving grounded alternative', () => {
  const fa = facts('sell software', 'content -> demo -> sales call');
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Comprar software o agendar sales call' } } };
  const first = fidelity.validateFinalSynthesis(fa, synth, {});
  const repaired = fidelity.repairFinalSynthesis(fa, synth, first.violations, {});
  assert(repaired);
  const second = fidelity.validateFinalSynthesis(fa, repaired.synthesis, {});
  assert.deepStrictEqual(second.violations, []);
  assert(/comprar software/i.test(repaired.synthesis.deliverable['6_funnel'].conversion_intent));
});

// ============================================================
// VERIFICATION-GATE CASES (X1-X8, E1-E8) — added by the follow-up final-verification authorization
// that caught two real family-level gaps this file's first pass missed: (1) TRUE cross-language
// endpoint SYNONYMS (no lexical overlap at all, e.g. "cita"/"appointment") were invisible in either
// direction, and a cognate pair ("consultation"/"consulta", "demostración"/"demo") only matched in
// whichever direction happened to have the longer word on the mechanism side; (2) the acronym rule
// treated ANY all-caps 2-5 letter token as a candidate topic, so an incidentally-capitalized common
// word ("ESTA", "EL", "DEL") could outrank a real acronym ("CAC") by tie-break length. Both are
// fixed generically in brief_fidelity_validator.js (ENDPOINT_SYNONYM_PAIRS + endpointSynonymCluster
// + termMatchesCandidateWord's bidirectional-prefix cognate check; ACRONYM_TOPIC_STOPWORDS reusing
// the same short-function-word exclusion already applied to normal-word topics) — never a
// Método-360-specific patch.
t('X1 sell-course objective (ES) + EN mechanism endpoint "appointment" + ES candidate "cita" -> DETECT', () => {
  const fa = facts('vender curso', 'ad -> WhatsApp -> appointment');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar cita' } }).length > 0);
});
t('X2 sell-course objective (EN) + ES mechanism endpoint "cita" + EN candidate "appointment" -> DETECT', () => {
  const fa = facts('sell course', 'anuncio -> WhatsApp -> cita');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar appointment' } }).length > 0);
});
t('X3 sell-software objective (ES) + EN mechanism endpoint "demo" + ES candidate "demostración" -> DETECT', () => {
  const fa = facts('vender software', 'content -> form -> demo');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar demostración' } }).length > 0);
});
t('X4 sell-software objective (EN) + ES mechanism endpoint "demostración" + EN candidate "demo" -> DETECT', () => {
  const fa = facts('sell software', 'contenido -> formulario -> demostración');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar demo' } }).length > 0);
});
t('X5 sell-product objective (ES) + EN mechanism endpoint "consultation" + ES candidate "consulta" -> DETECT', () => {
  const fa = facts('vender producto', 'ad -> chat -> consultation');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar consulta' } }).length > 0);
});
t('X6 sell-product objective (EN) + ES mechanism endpoint "consulta" + EN candidate "consultation" -> DETECT', () => {
  const fa = facts('sell product', 'anuncio -> chat -> consulta');
  assert(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar consultation' } }).length > 0);
});
t('X7 explicit appointment objective (ES) + EN mechanism endpoint + ES candidate -> PASS (grounded via synonym cluster, not omission)', () => {
  const fa = facts('generar citas', 'ad -> WhatsApp -> appointment');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar cita' } }), []);
  // The RIGHT reason, not a blind spot: the English form must ALSO be exempt, not just the Spanish
  // one, proving the whole synonym cluster was excluded together rather than one form by accident.
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar appointment' } }), []);
});
t('X8 explicit appointment objective (EN) + ES mechanism endpoint + EN candidate -> PASS (grounded via synonym cluster, not omission)', () => {
  const fa = facts('book appointments', 'anuncio -> WhatsApp -> cita');
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar appointment' } }), []);
  assert.deepStrictEqual(mechViol(fa, { '6_funnel': { conversion_intent: 'Confirmar cita' } }), []);
});
t('E1 "NO HAY DATOS" with an empty raw brief creates no accidental HAY/DATOS topic or false attribution', () => {
  assert.deepStrictEqual(epiViol(['NO HAY DATOS.'], ''), []);
});
t('E2 "EL CRM ESTA DISPONIBLE definido por el usuario" anchors on CRM, not the incidentally-capitalized ESTA/EL', () => {
  const v = epiViol(['EL CRM ESTA DISPONIBLE definido por el usuario.'], 'Vende tu curso.');
  assert(v.some(x => x.type === 'UNSUPPORTED_USER_ATTRIBUTION' && x.matched_anchor === 'crm'));
});
t('E3 documented contract: "AI" is a genuine 2-letter acronym and is correctly extracted as the topic', () => {
  const v = epiViol(['AI disponible definido por el usuario.'], 'Vende tu curso.');
  assert(v.some(x => x.type === 'UNSUPPORTED_USER_ATTRIBUTION' && x.matched_anchor === 'ai'));
});
t('E4 documented contract: "IA" (Spanish acronym) is likewise correctly extracted as the topic', () => {
  const v = epiViol(['IA disponible definido por el usuario.'], 'Vende tu curso.');
  assert(v.some(x => x.type === 'UNSUPPORTED_USER_ATTRIBUTION' && x.matched_anchor === 'ia'));
});
t('E5 "KPI desconocido" with a brief-grounded KPI value -> KNOWN_FACT_DENIAL', () => {
  const v = epiViol(['KPI desconocido.'], 'Vende tu curso. KPI objetivo definido.');
  assert(v.some(x => x.type === 'KNOWN_FACT_DENIAL' && x.matched_anchor === 'kpi'));
});
t('E6 "EL CAC DEL MES ESTA DEFINIDO POR EL USUARIO" (fully shouted) still anchors on CAC, not MES/EL/DEL/ESTA', () => {
  const v = epiViol(['EL CAC DEL MES ESTA DEFINIDO POR EL USUARIO.'], 'Vende tu curso.');
  assert(v.some(x => x.type === 'UNSUPPORTED_USER_ATTRIBUTION' && x.matched_anchor === 'cac'));
});
t('E7 documented contract: "USA" as a geography/acronym still correctly flags a GENUINE cross-item contradiction (not spurious)', () => {
  const v = epiViol(['USA mercado desconocido.', 'USA mercado disponible.'], 'Vende tu curso en USA.');
  assert(v.some(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
  assert(v.some(x => x.type === 'KNOWN_FACT_DENIAL' && x.matched_anchor === 'usa'));
});
t('E8 documented contract: a lone negated-certainty sentence ("NO API DISPONIBLE") triggers no violation standalone (Rule 2 needs a contradicting partner; negation is not itself a false certainty match)', () => {
  assert.deepStrictEqual(epiViol(['NO API DISPONIBLE.'], 'Vende tu curso.'), []);
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nADVERSARIAL_ROLE_CASE_COUNT=${roleCaseCount}`);
  console.log(`ADVERSARIAL_EPISTEMIC_CASE_COUNT=${epistemicCaseCount}`);
  console.log(`ADVERSARIAL_TOTAL_CASE_COUNT=${roleCaseCount + epistemicCaseCount}`);
  console.log(`\nASTRA_CAMPAIGN360_LANGUAGE_AND_EPISTEMIC_HARDENING_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
