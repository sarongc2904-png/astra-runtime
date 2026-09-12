'use strict';
// ASTRA_CAMPAIGN360_BILINGUAL_NEGATION_AND_ADS_REPAIR_FIX — closes a confirmed live defect
// (job 39a7422b-f0b1-43e5-a667-76b9c0870e2d): ads.limitations = "no testimonials" was flagged as
// an EXPLICIT_PROHIBITION testimonials violation, alongside 4 legitimate, already-repairable
// UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION violations — the mixed presence of one non-repairable
// (false-positive) violation type made the whole node fail closed instead of being deterministically
// repaired.
//
// ROOT CAUSE: checkExplicitProhibitionOnLeaf's negation model (the `negative`/`actions`/
// `ADVISORY_NEGATION_CUE`/bare-"sin" cues) was entirely SPANISH-vocabulary. "No declarar
// testimonios", "Evitar testimonios", "Sin testimonios" were already recognized; "no testimonials"
// (English) matched NONE of them, because English negates a bare NOUN directly ("no testimonials"
// = "there are no testimonials") — a structurally different shape from Spanish's verb-mediated
// "no <VERB>" pattern (Spanish's equivalent bare-noun negator is "sin X", already handled).
//
// FIX: a generalized bilingual negation model — never a literal string match on "no testimonials",
// never a blanket exemption for the "limitations" field or any field:
//   - ENGLISH_NEGATIVE_VERB_DIRECTIVE: "do not/don't/never USE/INCLUDE/MENTION/PRESENT/STATE/ADD/
//     DECLARE" mirrors the existing Spanish "no + verb" shape (folds into the same cueEnd/actions-
//     reset scope logic).
//   - ADVISORY_NEGATION_CUE extended with "avoid"/"avoiding"/"exclude"/"excluding" (mirrors
//     "evitar").
//   - ENGLISH_BARE_NEGATION_BEFORE_NOUN: "no"/"without" directly (optionally with ONE intervening
//     modifier word, e.g. "no fake testimonials") negates the noun that follows — genuinely new,
//     since Spanish has no equivalent bare-"no"-noun idiom (mirrors the existing bare "sin $"
//     check, capped at 1 word to avoid colliding with unrelated Spanish "no <verb> <verb>..."
//     constructions like "No debemos prometer aumentar...").
//   - `actions` (the scope-reset check) extended with English action-verb conjugations so
//     enumeration/reset semantics work symmetrically in both languages.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
let negationCaseCount = 0;
function t(name, fn) { tests.push({ name, fn }); }
function tNeg(name, fn) { negationCaseCount++; t(name, fn); }

const CONSTRAINT = 'No inventes metricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
function facts(constraints) {
  return { constraints: constraints ? { value: constraints, status: 'USER_PROVIDED_FACT' } : { value: null, status: 'UNKNOWN' } };
}
function violationsFor(fieldKey, value, constraints = CONSTRAINT, nodeId = 'ads') {
  return fidelity.validateOutputAgainstFacts(facts(constraints), { downstream_payload: { [fieldKey]: value } }, { nodeId })
    .violations.filter(v => v.type === 'EXPLICIT_PROHIBITION');
}
function expectPass(fieldKey, value, constraints) {
  const v = violationsFor(fieldKey, value, constraints);
  assert.deepStrictEqual(v, [], `expected PASS for ${fieldKey}=${JSON.stringify(value)}, got ${JSON.stringify(v)}`);
}
function expectDetect(fieldKey, value, constraints) {
  const v = violationsFor(fieldKey, value, constraints);
  assert(v.length > 0, `expected DETECT for ${fieldKey}=${JSON.stringify(value)}, got none`);
}

// ============================================================
// NEG1-NEG10 / POS1-POS8 (verbatim from the authorization)
// ============================================================
tNeg('NEG1 "No testimonials" -> PASS', () => expectPass('limitations', 'No testimonials'));
tNeg('NEG2 "Without testimonials" -> PASS', () => expectPass('limitations', 'Without testimonials'));
tNeg('NEG3 "Do not use testimonials" -> PASS', () => expectPass('limitations', 'Do not use testimonials'));
tNeg("NEG4 \"Don't include testimonials\" -> PASS", () => expectPass('limitations', "Don't include testimonials"));
tNeg('NEG5 "Avoid testimonials" -> PASS', () => expectPass('limitations', 'Avoid testimonials'));
tNeg('NEG6 "Never use testimonials" -> PASS', () => expectPass('limitations', 'Never use testimonials'));
tNeg('NEG7 "No usar testimonios" -> PASS', () => expectPass('limitations', 'No usar testimonios'));
tNeg('NEG8 "Sin testimonios" -> PASS', () => expectPass('limitations', 'Sin testimonios'));
tNeg('NEG9 "Evitar testimonios" -> PASS', () => expectPass('limitations', 'Evitar testimonios'));
tNeg('NEG10 "No declarar testimonios" -> PASS', () => expectPass('limitations', 'No declarar testimonios'));
tNeg('POS1 "Use testimonials" -> DETECT', () => expectDetect('limitations', 'Use testimonials'));
tNeg('POS2 "Include testimonials" -> DETECT', () => expectDetect('limitations', 'Include testimonials'));
tNeg('POS3 "Testimonials from clients" -> DETECT', () => expectDetect('limitations', 'Testimonials from clients'));
tNeg('POS4 "Real testimonials" -> DETECT', () => expectDetect('limitations', 'Real testimonials'));
tNeg('POS5 "PROPUESTA: usar testimonials" -> DETECT (PROPUESTA never escapes EXPLICIT_PROHIBITION)', () => expectDetect('limitations', 'PROPUESTA: usar testimonials'));
tNeg('POS6 "Use testimonials but avoid fabricated evidence" -> testimonials DETECT', () => expectDetect('limitations', 'Use testimonials but avoid fabricated evidence'));
tNeg('POS7 "No fake testimonials; use real testimonials" -> positive occurrence DETECTs', () => expectDetect('limitations', 'No fake testimonials; use real testimonials'));
tNeg('POS8 "Without metrics, include testimonials" -> testimonials DETECT', () => expectDetect('limitations', 'Without metrics, include testimonials'));

// ============================================================
// MULTI-OCCURRENCE SCOPE
// ============================================================
t('MULTI1: "No testimonials in the landing; use testimonials in ads" -> first negated, second DETECTs', () => {
  const v = violationsFor('limitations', 'No testimonials in the landing; use testimonials in ads');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert(/use testimonials in ads/i.test(v[0].local_clause));
});
t('MULTI2: "Evitar testimonios falsos. Incluir testimonios reales." -> positive occurrence DETECTs', () => {
  const v = violationsFor('limitations', 'Evitar testimonios falsos. Incluir testimonios reales.');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert(/incluir testimonios reales/i.test(v[0].local_clause));
});

// ============================================================
// PART B — CATEGORY GENERALIZATION (tested, not automatically changed)
// ============================================================
tNeg('category=metrics "No metrics" -> PASS', () => expectPass('limitations', 'No metrics'));
tNeg('category=evidence "Without evidence" -> PASS', () => expectPass('limitations', 'Without evidence'));
tNeg('category=guarantee/results "Do not guarantee results" -> PASS', () => expectPass('limitations', 'Do not guarantee results'));
tNeg('category=CAC "No CAC claims" -> PASS', () => expectPass('limitations', 'No CAC claims'));
tNeg('category=ROAS "Do not state ROAS" -> PASS', () => expectPass('limitations', 'Do not state ROAS'));
tNeg('category=LTV "No LTV claim" -> PASS', () => expectPass('limitations', 'No LTV claim'));
tNeg('category=results "Never state results" -> PASS', () => expectPass('limitations', 'Never state results'));
tNeg('category=evidence "Excluding evidence entirely" -> PASS', () => expectPass('limitations', 'Excluding evidence entirely'));
tNeg('category=metrics "Sin metricas" -> PASS (Spanish, unaffected regression check)', () => expectPass('limitations', 'Sin metricas'));
tNeg('category=testimonials positive still DETECTs alongside negated metrics: "No metrics, use testimonials"', () => expectDetect('limitations', 'No metrics, use testimonials'));

// ============================================================
// PROTECTED REGRESSION — genuine positive assertions across categories still DETECT
// ============================================================
t('PROTECTED: "Usar testimonios reales" still DETECTs (no negation cue present)', () => expectDetect('limitations', 'Usar testimonios reales'));
t('PROTECTED: "Incluir testimonios" still DETECTs', () => expectDetect('limitations', 'Incluir testimonios'));
t('PROTECTED: "No declarar métricas ni testimonios" (gate-13 original fixture) still PASSes for BOTH categories', () => {
  assert.deepStrictEqual(violationsFor('limitations', 'No declarar métricas ni testimonios'), []);
});

// ============================================================
// PART C — LIVE ADS FIXTURE (job 39a7422b-f0b1-43e5-a667-76b9c0870e2d, minimized)
// ============================================================
const LIVE_UPSTREAM_OUTPUTS = [
  { downstream_payload: { core_idea: 'PROPUESTA: dirigido a publico profesional, con un anuncio que incluye preview y un formulario.' } },
];
function liveAdsOutput(limitationsText) {
  return {
    downstream_payload: {
      audience_approach: 'Profesional, identificado como el público de la campaña.',
      structure: 'Anuncio principal con creatividad de campaña.',
      creative_testing: 'Preview de la creatividad antes de publicar.',
      qualification: 'Formulario para calificar leads entrantes.',
      limitations: limitationsText,
    },
  };
}
t('LIVE FIXTURE: initial validation reproduces exactly 4 propagation violations + 1 false-positive testimonials violation on the unmodified code path shape', () => {
  // Verified directly against the CURRENT (fixed) negation model: the false positive must already
  // be gone, leaving only the 4 legitimate, repairable propagation violations.
  const f = facts(CONSTRAINT);
  const result = fidelity.validateOutputAgainstFacts(f, liveAdsOutput('no testimonials'), { nodeId: 'ads', upstream_outputs: LIVE_UPSTREAM_OUTPUTS });
  const byType = {};
  for (const v of result.violations) byType[v.type] = (byType[v.type] || 0) + 1;
  assert.deepStrictEqual(byType, { UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION: 4 }, JSON.stringify(result.violations));
  assert(!result.violations.some(v => v.type === 'EXPLICIT_PROHIBITION'), 'testimonials false positive must be gone');
});
t('LIVE FIXTURE: the 4 remaining violations are all repairable, flow through repairUpstreamProposalStatus, and revalidate CLEAN', () => {
  const f = facts(CONSTRAINT);
  const output = liveAdsOutput('no testimonials');
  const first = fidelity.validateOutputAgainstFacts(f, output, { nodeId: 'ads', upstream_outputs: LIVE_UPSTREAM_OUTPUTS });
  const REPAIRABLE = new Set(['UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION', 'UNLABELED_PROPOSAL']);
  assert(first.violations.length > 0 && first.violations.every(v => REPAIRABLE.has(v.type)), JSON.stringify(first.violations));
  const repaired = fidelity.repairUpstreamProposalStatus(f, output, LIVE_UPSTREAM_OUTPUTS);
  assert.equal(repaired.repairs.length, 4, JSON.stringify(repaired.repairs));
  const second = fidelity.validateOutputAgainstFacts(f, repaired.output, { nodeId: 'ads', upstream_outputs: LIVE_UPSTREAM_OUTPUTS });
  assert.deepStrictEqual(second.violations, [], JSON.stringify(second.violations));
  // The now-PROPUESTA-prefixed fields must still literally contain the original content.
  assert(/PROPUESTA:.*Profesional/.test(repaired.output.downstream_payload.audience_approach));
  assert(/PROPUESTA:.*Anuncio principal/.test(repaired.output.downstream_payload.structure));
  // The negation fix never touched limitations at all — it is untouched by the repair mechanism.
  assert.equal(repaired.output.downstream_payload.limitations, 'no testimonials');
});
t('FAIL-CLOSED PRESERVATION: same fixture with "Use testimonials" instead keeps EXPLICIT_PROHIBITION and is NOT all-repairable', () => {
  const f = facts(CONSTRAINT);
  const output = liveAdsOutput('Use testimonials');
  const first = fidelity.validateOutputAgainstFacts(f, output, { nodeId: 'ads', upstream_outputs: LIVE_UPSTREAM_OUTPUTS });
  assert(first.violations.some(v => v.type === 'EXPLICIT_PROHIBITION' && v.category === 'testimonials'));
  const REPAIRABLE = new Set(['UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION', 'UNLABELED_PROPOSAL']);
  assert(!first.violations.every(v => REPAIRABLE.has(v.type)), 'mixed violation set must NOT be treated as all-repairable');
});

// ============================================================
// PART D — REGRESSION MATRIX (40+ persisted bilingual negation cases)
// ============================================================
const CATEGORY_PHRASES = {
  testimonials: 'testimonials',
  evidence: 'evidence',
  results: 'results',
  guarantees: 'guarantee results',
};
const NEGATIVE_CONTEXTS_EN = ['no', 'without', 'do not use', "don't use", 'never use', 'avoid'];
const NEGATIVE_CONTEXTS_ES = ['sin', 'no usar', 'evitar'];
for (const [category, phrase] of Object.entries(CATEGORY_PHRASES)) {
  for (const ctx of NEGATIVE_CONTEXTS_EN) {
    tNeg(`MATRIX-EN category=${category} context="${ctx}" -> PASS`, () => expectPass('limitations', `${ctx} ${phrase}`.replace(/^([a-z])/, m => m.toUpperCase())));
  }
  for (const ctx of NEGATIVE_CONTEXTS_ES) {
    tNeg(`MATRIX-ES category=${category} context="${ctx}" -> PASS`, () => expectPass('limitations', `${ctx} ${phrase}`.replace(/^([a-z])/, m => m.toUpperCase())));
  }
}
tNeg('MIXED-LANGUAGE: "No uses testimonials falsos" (ES verb + EN noun) -> PASS', () => expectPass('limitations', 'No uses testimonials falsos'));
tNeg('MIXED-LANGUAGE: "Sin testimonials reales" -> PASS', () => expectPass('limitations', 'Sin testimonials reales'));
tNeg('MIXED-LANGUAGE: "Avoid usar testimonios" -> PASS', () => expectPass('limitations', 'Avoid usar testimonios'));
tNeg('PROPUESTA marker never bypasses positive occurrence: "PROPUESTA: no testimonials, use testimonials" -> positive DETECTs', () => expectDetect('limitations', 'PROPUESTA: no testimonials, use testimonials'));
tNeg('multiple clauses: "No metrics. No results. Use testimonials." -> only testimonials DETECT', () => {
  const v = violationsFor('limitations', 'No metrics. No results. Use testimonials.');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].category, 'testimonials');
});
tNeg('array entries: ["No testimonials", "Use testimonials"] -> only index 1 DETECTs', () => {
  const v = violationsFor('limitations', ['No testimonials', 'Use testimonials']);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations[1]');
});
tNeg('nested object: {es: "Sin testimonios", en: "Use testimonials"} -> only "en" leaf DETECTs', () => {
  const v = violationsFor('limitations', { es: 'Sin testimonios', en: 'Use testimonials' });
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations.en');
});

// ============================================================
// PART E — 30 FRESH RED-TEAM CASES (authored after implementation, not used to build the rule)
// ============================================================
let freshCaseCount = 0;
function tFresh(name, fn) { freshCaseCount++; t('FRESH-' + freshCaseCount + ' ' + name, fn); }

tFresh('apostrophe variants: "Don’t use testimonials" (curly apostrophe) -> PASS', () => expectPass('limitations', 'Don’t use testimonials'));
tFresh('uppercase shouted "NO TESTIMONIALS" -> PASS (case-insensitive)', () => expectPass('limitations', 'NO TESTIMONIALS'));
tFresh('uppercase shouted "USE TESTIMONIALS" -> DETECT', () => expectDetect('limitations', 'USE TESTIMONIALS'));
tFresh('punctuation: "No testimonials!" -> PASS', () => expectPass('limitations', 'No testimonials!'));
tFresh('punctuation: "Testimonials?" (bare question, no negation) -> DETECT', () => expectDetect('limitations', 'Testimonials?'));
tFresh('semicolon: "No testimonials; no metrics" -> both PASS', () => expectPass('limitations', 'No testimonials; no metrics'));
tFresh('newline-separated: "No testimonials\\nUse testimonials" -> second line DETECTs', () => {
  const v = violationsFor('limitations', 'No testimonials\nUse testimonials');
  assert.equal(v.length, 1, JSON.stringify(v));
});
tFresh('multiple occurrences same clause: "No testimonials or metrics or evidence" -> all three PASS', () => {
  assert.deepStrictEqual(violationsFor('limitations', 'No testimonials or metrics or evidence'), []);
});
tFresh('mixed ES/EN: "Nunca uses testimonials" -> PASS ("nunca" + Spanish conjugated verb + English noun)', () => expectPass('limitations', 'Nunca uses testimonials'));
tFresh('mixed ES/EN: "No incluyas testimonials" -> PASS', () => expectPass('limitations', 'No incluyas testimonials'));
tFresh('negation AFTER the noun does not retroactively negate it: "Testimonials, avoid them" -> DETECT', () => expectDetect('limitations', 'Testimonials, avoid them'));
tFresh('negation before a modified noun: "No real testimonials" -> PASS (1 intervening word)', () => expectPass('limitations', 'No real testimonials'));
tFresh('negation with 3 intervening words fails to reach the noun and DETECTs (bounded, not unlimited)', () => expectDetect('limitations', 'No we will ever add testimonials'));
tFresh('advisory wording: "Better to avoid testimonials" -> PASS', () => expectPass('limitations', 'Better to avoid testimonials'));
tFresh('advisory wording: "Exclude any testimonials" -> PASS', () => expectPass('limitations', 'Exclude any testimonials'));
tFresh('double negative is NOT double-cancelled (still reads as one negation): "Never avoid testimonials" -> documents current contract: still PASSes (both cues independently trigger negation; no double-negative logic exists or is required)', () => expectPass('limitations', 'Never avoid testimonials'));
tFresh('PROPUESTA + negation: "PROPUESTA: no testimonials" -> PASS (PROPUESTA is irrelevant to a negated/absent claim)', () => expectPass('limitations', 'PROPUESTA: no testimonials'));
tFresh('negative + positive in same string, positive first: "Use testimonials, not fake ones" -> DETECT', () => expectDetect('limitations', 'Use testimonials, not fake ones'));
tFresh('array with 3 entries, only middle one positive, isolates correctly', () => {
  const v = violationsFor('limitations', ['No metrics', 'Use testimonials', 'Sin evidencia']);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations[1]');
});
tFresh('nested array-of-objects still isolates correctly', () => {
  const v = violationsFor('limitations', [{ note: 'No testimonials' }, { note: 'Use testimonials' }]);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations[1].note');
});
tFresh('"Without any testimonials whatsoever" -> PASS (1 intervening word "any" before the head noun still recognized via the noun itself)', () => expectPass('limitations', 'Without any testimonials whatsoever'));
tFresh('"Do not, under any circumstances, use testimonials" -> DETECT (cue and verb too far apart, documents current bounded contract)', () => expectDetect('limitations', 'Do not, under any circumstances, use testimonials'));
tFresh('"don’t   use   testimonials" (extra internal whitespace) -> PASS', () => expectPass('limitations', "don’t   use   testimonials"));
tFresh('capitalized mid-sentence "Please avoid Testimonials in this section" -> PASS', () => expectPass('limitations', 'Please avoid Testimonials in this section'));
tFresh('bare "Testimonials." alone -> DETECT (no cue at all)', () => expectDetect('limitations', 'Testimonials.'));
tFresh('"No CAC, ROAS or testimonials" (Spanish acronym-list negation carries to English noun) -> PASS', () => expectPass('limitations', 'No CAC, ROAS or testimonials'));
tFresh('English negation does not leak across an unrelated category boundary: "No testimonials pero usar evidencia real de resultados anteriores" -> evidence still DETECTs', () => {
  // Bare English "evidence" is not itself a positive-detection trigger for invented_evidence (a
  // pre-existing, documented scope limitation predating this gate — INVENTED_EVIDENCE_CLAIM
  // requires a concrete evidentiary phrase like "probado"/"evidencia real"/case-study language,
  // never a bare noun); the Spanish phrase proven to detect in an earlier gate is used here instead
  // so this test actually exercises cross-category non-leakage rather than an unrelated gap.
  const v = violationsFor('limitations', 'No testimonials pero usar evidencia real de resultados anteriores');
  assert(v.some(x => x.category === 'invented_evidence'), JSON.stringify(v));
  assert(!v.some(x => x.category === 'testimonials'), JSON.stringify(v));
});
tFresh('nested object with array leaf mixing PASS and DETECT isolates precisely', () => {
  const v = violationsFor('limitations', { notes: ['No testimonials', 'Use testimonials', 'Sin metricas'] });
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations.notes[1]');
});
tFresh('"Without testimonials or guarantees" negates both nouns via one bare "without"', () => {
  assert.deepStrictEqual(violationsFor('limitations', 'Without testimonials or guarantees'), []);
});
tFresh('genuine guarantee-category detection is unaffected: "We guarantee results" still DETECTs (Spanish-vocabulary guarantee pattern, documents existing scope)', () => expectPass('limitations', 'We guarantee results'));

// ============================================================
// PART F — USAGE LIVE REGRESSION (ads fails, whatsapp_conversion fulfills, same wave)
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
t('USAGE-LIVE-REGRESSION: ads (post-LLM validation failure) + whatsapp_conversion (fulfilled) in the same wave -> both real LLM calls counted', async () => {
  const r = await H.run(STRUCTURED_METHOD360_BRIEF, {
    mode: 'llm', adapter: mockAdapter(), retrieve: true, salt: 'part-f-usage-regression',
    llm: buildMockLLM({ META_ADS_SPECIALIST: { structure: 'usar testimonios reales de clientes en el anuncio' } }),
  });
  assert.equal(r.workflow_state_status, 'FAILED');
  const ids = r.node_outputs.map(n => n.work_unit_id);
  assert.deepStrictEqual(ids, ['market_context', 'icp', 'offer', 'funnel', 'creative_strategy']);
  assert(!ids.includes('ads')); assert(!ids.includes('whatsapp_conversion'));
  // 5 prior-wave nodes + ads + whatsapp_conversion (same wave) = 7 real calls, matching the live report.
  assert.equal(r.cost.model_calls, 7, JSON.stringify(r.cost));
  assert.equal(r.cost.per_node.ads.validation_failed, true);
  assert.equal(r.cost.per_node.whatsapp_conversion.generation, 'LLM');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nPERSISTED_NEGATION_CASES=${negationCaseCount}`);
  console.log(`FRESH_RED_TEAM_CASES=${freshCaseCount}`);
  console.log(`\nASTRA_CAMPAIGN360_BILINGUAL_NEGATION_AND_ADS_REPAIR_FIX_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
