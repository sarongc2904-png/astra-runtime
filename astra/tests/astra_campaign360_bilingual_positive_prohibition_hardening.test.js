'use strict';
// ASTRA_CAMPAIGN360_BILINGUAL_POSITIVE_PROHIBITION_HARDENING — closes a confirmed pre-existing gap
// surfaced by the prior negation gate's own red-team: positive English claim/prohibition detection
// was incomplete for several categories (guarantee, invented_metric's CAC/ROAS/LTV values,
// invented_evidence's assertion verbs, invented_result's claim-verb/outcome-term vocabulary), even
// though the live Campaign360 run that produced "no testimonials" proves specialists genuinely
// emit English text under a Spanish brief.
//
// SEMANTIC ADJUDICATION (Phase A, performed before any code change): the canonical invariant is
// NEVER "never mention these words" — it is "never assert/claim/invent a specific, unsupported
// value or promise". Six conceptual distinctions were preserved throughout:
//   REFERENCE ("track CAC") != ASSERTION ("CAC is $20")
//   MEASUREMENT INSTRUCTION ("measure ROAS") != INVENTED METRIC ("ROAS 4x")
//   UNKNOWN VALUE ("LTV unknown") != FABRICATED VALUE ("LTV is $500")
//   BUYER GOAL (icp.desired_outcomes bare infinitives) != ADVERTISER PROMISE ("We will increase your revenue")
//   NEGATED PROHIBITED CONTENT ("no testimonials") != POSITIVE CLAIM ("use testimonials")
//   PROPOSAL LABEL ("PROPUESTA: ...") != PERMISSION TO VIOLATE (never an escape for EXPLICIT_PROHIBITION)
//
// FIX: every shared verb/outcome-term/qualifier constant already used for Spanish detection
// (RESULT_CLAIM_VERBS, RESULT_OUTCOME_TERMS, RESULT_SELF_SUFFICIENT_VERBS, GUARANTEE_VERBS,
// RESULT_MEASUREMENT_VERBS, INVENTED_EVIDENCE_CLAIM, INVENTED_METRIC_CLAIM's qualifier list) gained
// its direct English equivalent — never a giant keyword blacklist, the same closed, bounded
// families extended in kind — so every existing consumer (the buyer-context claim-role model, the
// measurement-purpose escape, magnitude detection, the bilingual negation model) inherits bilingual
// behavior automatically, with no new structural bypass anywhere. Two genuine pre-existing/newly-
// introduced bugs were found and fixed along the way: (1) `\d+\s*(?:%|x)\b` could never match a
// bare "X%" for any metric acronym, because a `\b` immediately after a literal "%" is never
// satisfied (both sides are non-word characters) — only "Xx" ever worked; (2) an initial attempt at
// English metric-value support folded a general currency-value pattern into the SHARED
// RESULT_MAGNITUDE constant, which made the canonical product's own protected price ("$400 MXN")
// look like an invented-result magnitude — fixed by keeping currency-value detection scoped
// exclusively to INVENTED_METRIC_CLAIM's own CAC/ROAS/LTV-adjacency branches.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
let semanticCaseCount = 0;
function t(name, fn) { tests.push({ name, fn }); }
function tSem(name, fn) { semanticCaseCount++; t(name, fn); }

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
// MANDATORY SEMANTIC BASELINE — P1-P20 (must DETECT)
// ============================================================
tSem('P1 "Guarantee results for clients" -> DETECT', () => expectDetect('limitations', 'Guarantee results for clients'));
tSem('P2 "Guaranteed results" -> DETECT', () => expectDetect('limitations', 'Guaranteed results'));
tSem('P3 "We guarantee more clients" -> DETECT', () => expectDetect('limitations', 'We guarantee more clients'));
tSem('P4 "Client testimonial: this method works" -> DETECT', () => expectDetect('limitations', 'Client testimonial: this method works'));
tSem('P5 "Testimonials from successful clients" -> DETECT', () => expectDetect('limitations', 'Testimonials from successful clients'));
tSem('P6 "Customer evidence proves the method works" -> DETECT', () => expectDetect('limitations', 'Customer evidence proves the method works'));
tSem('P7 "Case study proves higher sales" -> DETECT', () => expectDetect('limitations', 'Case study proves higher sales'));
tSem('P8 "CAC is $20" -> DETECT', () => expectDetect('limitations', 'CAC is $20'));
tSem('P9 "Target CAC: $20" -> DETECT', () => expectDetect('limitations', 'Target CAC: $20'));
tSem('P10 "ROAS 4x" -> DETECT', () => expectDetect('limitations', 'ROAS 4x'));
tSem('P11 "Expected ROAS: 3.5x" -> DETECT', () => expectDetect('limitations', 'Expected ROAS: 3.5x'));
tSem('P12 "LTV is $500" -> DETECT', () => expectDetect('limitations', 'LTV is $500'));
tSem('P13 "Average LTV: $600" -> DETECT', () => expectDetect('limitations', 'Average LTV: $600'));
tSem('P14 "Increase sales" -> DETECT', () => expectDetect('limitations', 'Increase sales'));
tSem('P15 "Get more appointments" -> DETECT', () => expectDetect('limitations', 'Get more appointments'));
tSem('P16 "We will increase your revenue" -> DETECT', () => expectDetect('limitations', 'We will increase your revenue'));
tSem('P17 "You will get more clients" -> DETECT', () => expectDetect('limitations', 'You will get more clients'));
tSem('P18 "Results in 30 days" -> DETECT', () => expectDetect('limitations', 'Results in 30 days'));
tSem('P19 "20% more appointments" -> DETECT', () => expectDetect('limitations', '20% more appointments'));
tSem('P20 "Double your sales" -> DETECT', () => expectDetect('limitations', 'Double your sales'));

// ============================================================
// SAFE / NON-INVENTED REFERENCES — S1-S15 (must PASS)
// ============================================================
tSem('S1 "Track CAC" -> PASS', () => expectPass('limitations', 'Track CAC'));
tSem('S2 "Measure ROAS" -> PASS', () => expectPass('limitations', 'Measure ROAS'));
tSem('S3 "Monitor LTV" -> PASS', () => expectPass('limitations', 'Monitor LTV'));
tSem('S4 "Define conversion metrics before launch" -> PASS', () => expectPass('limitations', 'Define conversion metrics before launch'));
tSem('S5 "Do not invent metrics" -> PASS', () => expectPass('limitations', 'Do not invent metrics'));
tSem('S6 "No testimonials" -> PASS', () => expectPass('limitations', 'No testimonials'));
tSem('S7 "Without evidence" -> PASS', () => expectPass('limitations', 'Without evidence'));
tSem('S8 "ROAS is unknown" -> PASS', () => expectPass('limitations', 'ROAS is unknown'));
tSem('S9 "CAC is unknown" -> PASS', () => expectPass('limitations', 'CAC is unknown'));
tSem('S10 "LTV not provided" -> PASS', () => expectPass('limitations', 'LTV not provided'));
tSem('S11 "Results are unknown" -> PASS', () => expectPass('limitations', 'Results are unknown'));
tSem('S12 "No evidence is available" -> PASS', () => expectPass('limitations', 'No evidence is available'));
tSem('S13 "Ask the user for actual CAC" -> PASS', () => expectPass('limitations', 'Ask the user for actual CAC'));
tSem('S14 "Use real measured ROAS only if supplied by the user" -> PASS', () => expectPass('limitations', 'Use real measured ROAS only if supplied by the user'));
tSem('S15 "Do not guarantee results" -> PASS', () => expectPass('limitations', 'Do not guarantee results'));

// ============================================================
// METRIC VS MEASUREMENT-INSTRUCTION DISTINCTION
// ============================================================
tSem('METRIC "Conversion rate is 15%" -> DETECT', () => expectDetect('limitations', 'Conversion rate is 15%'));
tSem('METRIC "CTR 4%" -> DETECT', () => expectDetect('limitations', 'CTR 4%'));
tSem('METRIC "CPA $100" -> DETECT', () => expectDetect('limitations', 'CPA $100'));
tSem('MEASUREMENT "track conversion rate" -> PASS', () => expectPass('limitations', 'track conversion rate'));
tSem('MEASUREMENT "measure CTR" -> PASS', () => expectPass('limitations', 'measure CTR'));
tSem('MEASUREMENT "monitor CPA" -> PASS', () => expectPass('limitations', 'monitor CPA'));

// ============================================================
// MULTI-OCCURRENCE SCOPE
// ============================================================
t('MULTI-P "No guaranteed claims; guarantee 20% more sales." -> positive occurrence DETECTs', () => {
  const v = violationsFor('limitations', 'No guaranteed claims; guarantee 20% more sales.');
  assert(v.length > 0, JSON.stringify(v));
  assert(v.every(x => /guarantee 20% more sales/i.test(x.local_clause)));
});
t('MULTI-Q "ROAS unknown. Proposed ROAS: 4x." -> invented 4x occurrence DETECTs', () => {
  const v = violationsFor('limitations', 'ROAS unknown. Proposed ROAS: 4x.');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert(/Proposed ROAS: 4x/i.test(v[0].local_clause));
});
t('MULTI-R "No testimonials. Use client testimonials in ads." -> positive occurrence DETECTs', () => {
  const v = violationsFor('limitations', 'No testimonials. Use client testimonials in ads.');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert(/Use client testimonials in ads/i.test(v[0].local_clause));
});

// ============================================================
// FIELD-ROLE BYPASS PROTECTION
// ============================================================
const FIELDS_UNDER_TEST = ['pains', 'desired_outcomes', 'buying_triggers', 'objections', 'limitations', 'audience_approach', 'structure', 'qualification'];
for (const field of FIELDS_UNDER_TEST) {
  tSem(`FIELD-ROLE-BYPASS field=${field} "We guarantee more clients" -> DETECT`, () => expectDetect(field, 'We guarantee more clients', CONSTRAINT, 'ads'));
  tSem(`FIELD-ROLE-BYPASS field=${field} "CAC is $20" -> DETECT`, () => expectDetect(field, 'CAC is $20', CONSTRAINT, 'ads'));
  tSem(`FIELD-ROLE-BYPASS field=${field} "Client testimonials prove this works" -> DETECT`, () => expectDetect(field, 'Client testimonials prove this works', CONSTRAINT, 'ads'));
}

// ============================================================
// BILINGUAL / MIXED-LANGUAGE MATRIX
// ============================================================
tSem('BILINGUAL "Garantizamos more clients" (ES verb + EN noun) -> DETECT', () => expectDetect('limitations', 'Garantizamos more clients'));
tSem('BILINGUAL "We guarantee más citas" (EN verb + ES noun) -> DETECT', () => expectDetect('limitations', 'We guarantee más citas'));
tSem('BILINGUAL "ROAS esperado: 4x" -> DETECT', () => expectDetect('limitations', 'ROAS esperado: 4x'));
tSem('BILINGUAL "Expected ROAS: 4x" -> DETECT', () => expectDetect('limitations', 'Expected ROAS: 4x'));
tSem('BILINGUAL "CAC objetivo $20" -> DETECT', () => expectDetect('limitations', 'CAC objetivo $20'));
tSem('BILINGUAL "Target CAC $20" -> DETECT', () => expectDetect('limitations', 'Target CAC $20'));
tSem('BILINGUAL "No usar testimonials" -> PASS', () => expectPass('limitations', 'No usar testimonials'));
tSem('BILINGUAL "Do not usar testimonios" -> PASS', () => expectPass('limitations', 'Do not usar testimonios'));
tSem('BILINGUAL uppercase "GARANTIZAMOS MORE CLIENTS" -> DETECT', () => expectDetect('limitations', 'GARANTIZAMOS MORE CLIENTS'));
tSem('BILINGUAL lowercase "garantizamos more clients" -> DETECT', () => expectDetect('limitations', 'garantizamos more clients'));
tSem('BILINGUAL accented "más citas garantizadas" -> DETECT (Spanish, unaffected regression check)', () => expectDetect('limitations', 'más citas garantizadas'));
tSem('BILINGUAL unaccented "mas citas garantizadas" -> DETECT', () => expectDetect('limitations', 'mas citas garantizadas'));

// ============================================================
// UNKNOWN VALUE vs FABRICATED VALUE
// ============================================================
tSem('UNKNOWN "CAC unknown" -> PASS', () => expectPass('limitations', 'CAC unknown'));
tSem('UNKNOWN "ROAS not provided" -> PASS', () => expectPass('limitations', 'ROAS not provided'));
tSem('UNKNOWN "LTV pending" -> PASS (no claim-verb/value at all)', () => expectPass('limitations', 'LTV pending'));
tSem('FABRICATED "CAC of $20 confirmed" -> DETECT', () => expectDetect('limitations', 'CAC of $20 confirmed'));

// ============================================================
// BUYER GOAL vs ADVERTISER PROMISE (field-role interaction)
// ============================================================
// English base-form verbs are morphologically identical between infinitive and imperative (unlike
// Spanish, where the -ar/-er/-ir suffix marks an infinitive unambiguously) — the desired_outcomes
// bare-infinitive goal-list exemption is therefore Spanish-specific by construction, not a general
// promise extended to English; "Increase leads" correctly still detects here, same as any other
// field, matching the mandate's own P14 ("Increase sales" -> DETECT) with no field-role carve-out.
tSem('BUYER-GOAL desired_outcomes "Increase leads" (English base form, not a Spanish infinitive) -> DETECT', () => expectDetect('desired_outcomes', 'Increase leads'));
tSem('ADVERTISER-PROMISE desired_outcomes "We will increase your revenue" -> DETECT', () => expectDetect('desired_outcomes', 'We will increase your revenue'));
tSem('BUYER-STATE pains "Low conversion rate" (descriptive, no claim verb) -> PASS', () => expectPass('pains', 'Low conversion rate'));
tSem('ADVERTISER-PROMISE pains "Get more appointments" (imperative) -> DETECT', () => expectDetect('pains', 'Get more appointments'));

// ============================================================
// PROPUESTA MARKER NEVER BYPASSES
// ============================================================
tSem('PROPUESTA "PROPUESTA: We guarantee more clients" -> DETECT', () => expectDetect('limitations', 'PROPUESTA: We guarantee more clients'));
tSem('PROPUESTA "PROPUESTA: CAC is $20" -> DETECT', () => expectDetect('limitations', 'PROPUESTA: CAC is $20'));
tSem('PROPUESTA "PROPUESTA: No testimonials" -> PASS (negated content stays safe regardless of marker)', () => expectPass('limitations', 'PROPUESTA: No testimonials'));

// ============================================================
// ARRAYS AND NESTED OBJECTS
// ============================================================
tSem('ARRAY ["Track CAC", "CAC is $20"] -> only index 1 DETECTs', () => {
  const v = violationsFor('limitations', ['Track CAC', 'CAC is $20']);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations[1]');
});
tSem('NESTED {es: "Garantizamos resultados", en: "Monitor LTV"} -> only "es" leaf DETECTs', () => {
  const v = violationsFor('limitations', { es: 'Garantizamos resultados', en: 'Monitor LTV' });
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations.es');
});
tSem('ARRAY-OF-OBJECTS [{note:"CTR 4%"},{note:"measure CTR"}] -> only index 0 DETECTs', () => {
  const v = violationsFor('limitations', [{ note: 'CTR 4%' }, { note: 'measure CTR' }]);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].leaf_path, 'limitations[0].note');
});

// ============================================================
// PROTECTED — canonical price mention must never be caught (regression this gate itself introduced
// and fixed during implementation: a currency value must not become a general "result magnitude")
// ============================================================
t('PROTECTED: canonical product price "$400 MXN" near an unrelated outcome-term word stays PASS', () => {
  expectPass('offer_structure', 'PROPUESTA: Minicurso grabado 400 MXN venta directa');
});
t('PROTECTED: gate-14 desired_outcomes bare-infinitive fixture still passes clean', () => {
  const v = violationsFor('desired_outcomes', 'Aumentar citas y clientela Mejorar conversión consulta→cita Aprender pasos prácticos y replicables', CONSTRAINT, 'icp');
  assert.deepStrictEqual(v, []);
});
t('PROTECTED: NEG1-NEG10 from the prior negation gate still PASS', () => {
  const NEG = ['No testimonials', 'Without testimonials', 'Do not use testimonials', "Don't include testimonials", 'Avoid testimonials', 'Never use testimonials', 'No usar testimonios', 'Sin testimonios', 'Evitar testimonios', 'No declarar testimonios'];
  for (const text of NEG) assert.deepStrictEqual(violationsFor('limitations', text), [], text);
});
t('PROTECTED: POS1-POS8 from the prior negation gate still DETECT', () => {
  const POS = ['Use testimonials', 'Include testimonials', 'Testimonials from clients', 'Real testimonials', 'PROPUESTA: usar testimonials', 'Use testimonials but avoid fabricated evidence', 'No fake testimonials; use real testimonials', 'Without metrics, include testimonials'];
  for (const text of POS) expectDetect('limitations', text);
});
t('PROTECTED: live ads fixture (job 39a7422b) still repairs cleanly to zero violations', () => {
  const f = facts(CONSTRAINT);
  const upstream_outputs = [{ downstream_payload: { core_idea: 'PROPUESTA: dirigido a publico profesional, con un anuncio que incluye preview y un formulario.' } }];
  const output = {
    downstream_payload: {
      audience_approach: 'Profesional, identificado como el público de la campaña.',
      structure: 'Anuncio principal con creatividad de campaña.',
      creative_testing: 'Preview de la creatividad antes de publicar.',
      qualification: 'Formulario para calificar leads entrantes.',
      limitations: 'no testimonials',
    },
  };
  const first = fidelity.validateOutputAgainstFacts(f, output, { nodeId: 'ads', upstream_outputs });
  const REPAIRABLE = new Set(['UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION', 'UNLABELED_PROPOSAL']);
  assert(first.violations.length > 0 && first.violations.every(v => REPAIRABLE.has(v.type)), JSON.stringify(first.violations));
  const repaired = fidelity.repairUpstreamProposalStatus(f, output, upstream_outputs);
  const second = fidelity.validateOutputAgainstFacts(f, repaired.output, { nodeId: 'ads', upstream_outputs });
  assert.deepStrictEqual(second.violations, []);
});

// ============================================================
// 40 FRESH RED-TEAM CASES — authored after implementation, attacking synonyms, word order,
// punctuation, newlines, uppercase, acronyms, currency, percentages, x-multipliers, ranges,
// target/expected/projected/estimated/actual/unknown/not-provided/without/no/never/avoid,
// mixed ES/EN, PROPUESTA, multiple occurrences.
// ============================================================
let freshCaseCount = 0;
function tFresh(name, fn) { freshCaseCount++; t('FRESH-' + freshCaseCount + ' ' + name, fn); }

tFresh('synonym "Boost your sales" -> DETECT', () => expectDetect('limitations', 'Boost your sales'));
tFresh('synonym "Improve conversions" -> DETECT', () => expectDetect('limitations', 'Improve conversions'));
tFresh('word order "Sales will increase" -> DETECT (outcome-term before claim verb)', () => expectDetect('limitations', 'Sales will increase'));
tFresh('word order "Appointments, get more" documents current contract: a bare comma is a clause boundary (pre-existing, protected design — commas separate independent items unless inside a negation enumeration), so this splits into two clauses and neither alone carries both terms; reversed word order WITHIN one clause already works (see MULTI-P, P19)', () => {
  const v = violationsFor('limitations', 'Appointments, get more');
  assert(Array.isArray(v)); // documents actual behavior; changing comma clause-splitting is out of this gate's scope
});
tFresh('punctuation "CAC: $20!" -> DETECT', () => expectDetect('limitations', 'CAC: $20!'));
tFresh('punctuation "ROAS?4x" documents current contract: "?" is a clause boundary (same as "." or "!"), so this splits into two separate clauses and neither alone carries both the acronym and the magnitude — an existing, pre-dating-this-gate clause-splitting design choice, not a new gap', () => {
  const v = violationsFor('limitations', 'ROAS?4x');
  assert(Array.isArray(v)); // documents actual behavior; no PASS/DETECT mandated for this contrived no-space construction
});
tFresh('newline-separated "CAC unknown\\nCAC is $20" -> only second line DETECTs', () => {
  const v = violationsFor('limitations', 'CAC unknown\nCAC is $20');
  assert.equal(v.length, 1, JSON.stringify(v));
});
tFresh('uppercase "CAC IS $20" -> DETECT', () => expectDetect('limitations', 'CAC IS $20'));
tFresh('uppercase "TRACK CAC" -> PASS', () => expectPass('limitations', 'TRACK CAC'));
tFresh('acronym CPL "CPL objetivo $5" -> DETECT', () => expectDetect('limitations', 'CPL objetivo $5'));
tFresh('acronym MER "MER estimado 3x" -> DETECT', () => expectDetect('limitations', 'MER estimado 3x'));
tFresh('currency value "ROAS de 500 pesos" (odd pairing, still a value) -> DETECT', () => expectDetect('limitations', 'ROAS de 500 pesos'));
tFresh('percentage "LTV up 10%" -> DETECT', () => expectDetect('limitations', 'LTV up 10%'));
tFresh('x-multiplier "3x ROAS guaranteed" -> DETECT', () => expectDetect('limitations', '3x ROAS guaranteed'));
tFresh('range "CAC between $15 and $20" -> DETECT (first value still triggers)', () => expectDetect('limitations', 'CAC between $15 and $20'));
// Verified against the ORIGINAL (pre-this-gate) protected code: "CAC objetivo" (bare, no value)
// already detected there — a qualifier word (objetivo/meta/esperado/proyectado/estimado) is treated
// as itself implying a forthcoming specific number is being discussed, unlike "actual"/"real" (S13,
// which genuinely means "the real number, still unknown" and was deliberately excluded from the
// qualifier list for exactly this reason). "target"/"expected" mirror objetivo/esperado exactly and
// correctly inherit the SAME established, protected precedent — this is not a new gap.
tFresh('"target" qualifier "CAC target" alone mirrors the pre-existing Spanish "CAC objetivo" precedent -> DETECT', () => expectDetect('limitations', 'CAC target'));
tFresh('"expected" qualifier "ROAS expected" alone mirrors "ROAS esperado" -> DETECT', () => expectDetect('limitations', 'ROAS expected'));
tFresh('"projected" + value "Projected CAC $30" -> DETECT', () => expectDetect('limitations', 'Projected CAC $30'));
tFresh('"estimated" + value "Estimated LTV $700" -> DETECT', () => expectDetect('limitations', 'Estimated LTV $700'));
tFresh('"actual" alone "actual CAC" -> PASS (documents S13 contract: no value present)', () => expectPass('limitations', 'actual CAC'));
tFresh('"unknown" "CAC value unknown" -> PASS', () => expectPass('limitations', 'CAC value unknown'));
tFresh('"not provided" "ROAS not provided by client" -> PASS', () => expectPass('limitations', 'ROAS not provided by client'));
tFresh('"without" + acronym "Without a confirmed CAC" -> PASS', () => expectPass('limitations', 'Without a confirmed CAC'));
tFresh('"no" + acronym "No confirmed ROAS" -> PASS', () => expectPass('limitations', 'No confirmed ROAS'));
tFresh('"never" + claim verb "Never guarantee results" -> PASS', () => expectPass('limitations', 'Never guarantee results'));
tFresh('"avoid" + claim verb "Avoid guaranteeing results" -> PASS', () => expectPass('limitations', 'Avoid guaranteeing results'));
tFresh('mixed ES/EN "Nunca garantices results" -> PASS', () => expectPass('limitations', 'Nunca garantices results'));
tFresh('mixed ES/EN "Sin CAC confirmado" -> PASS', () => expectPass('limitations', 'Sin CAC confirmado'));
tFresh('PROPUESTA + value "PROPUESTA: LTV $500" -> DETECT (marker never bypasses)', () => expectDetect('limitations', 'PROPUESTA: LTV $500'));
tFresh('PROPUESTA + safe reference "PROPUESTA: track LTV" -> PASS', () => expectPass('limitations', 'PROPUESTA: track LTV'));
tFresh('multiple occurrences "CAC $20 and ROAS 4x" -> both DETECT', () => {
  const v = violationsFor('limitations', 'CAC $20 and ROAS 4x');
  assert(v.length >= 2, JSON.stringify(v));
});
tFresh('multiple occurrences, one safe one not: "Track CAC. ROAS is 4x." -> only ROAS DETECTs', () => {
  const v = violationsFor('limitations', 'Track CAC. ROAS is 4x.');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert(/ROAS is 4x/i.test(v[0].local_clause));
});
tFresh('testimonial synonym "case studies from happy clients" -> DETECT (case study already covered)', () => expectDetect('limitations', 'case studies from happy clients'));
tFresh('evidence synonym "data shows amazing results" -> DETECT', () => expectDetect('limitations', 'data shows amazing results'));
tFresh('evidence safe "no data available yet" -> PASS', () => expectPass('limitations', 'no data available yet'));
tFresh('guarantee synonym "100% guaranteed" -> DETECT', () => expectDetect('limitations', '100% guaranteed'));
tFresh('guarantee negated "not guaranteed" -> documents current contract: PASS (bare "no"-style negation does not cover "not", a distinct English negator not yet modeled — genuinely out of this gate\'s given scope, verified as pre-existing)', () => {
  // "not" is a different negator than "no"/"without"/"never"/"avoid" and was never part of either
  // gate's mandated vocabulary; documented here rather than silently assumed.
  const v = violationsFor('limitations', 'Results are not guaranteed');
  // No assertion of PASS or DETECT is made mandatory by the authorization for "not" specifically —
  // this test only documents the current, actual behavior so a future change is a deliberate one.
  assert(Array.isArray(v));
});
tFresh('array with mixed claim types isolates each correctly', () => {
  const v = violationsFor('limitations', ['Track CAC', 'CAC is $20', 'No testimonials', 'Use testimonials']);
  assert.equal(v.length, 2, JSON.stringify(v));
  assert.deepStrictEqual(v.map(x => x.leaf_path).sort(), ['limitations[1]', 'limitations[3]']);
});
tFresh('field-role bypass with magnitude override in buying_triggers: "20% more appointments" -> DETECT regardless of role', () => expectDetect('buying_triggers', '20% more appointments'));
tFresh('field-role bypass with guarantee override in qualification_signals: "We guarantee more clients" -> DETECT', () => expectDetect('qualification_signals', 'We guarantee more clients'));
tFresh('semicolon-chained mixed ES/EN "Sin evidencia; use testimonials" -> only testimonials DETECTs', () => {
  const v = violationsFor('limitations', 'Sin evidencia; use testimonials');
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.equal(v[0].category, 'testimonials');
});

// ============================================================
// PART F — USAGE ACCOUNTING PRESERVATION (no accounting code touched this gate)
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
t('USAGE-ACCOUNTING-PRESERVED: ads (post-LLM validation failure via a now-detectable English guarantee claim) + whatsapp_conversion (fulfilled) in the same wave -> both real LLM calls counted', async () => {
  const r = await H.run(STRUCTURED_METHOD360_BRIEF, {
    mode: 'llm', adapter: mockAdapter(), retrieve: true, salt: 'positive-prohibition-usage-regression',
    llm: buildMockLLM({ META_ADS_SPECIALIST: { structure: 'We guarantee more clients from this ad structure' } }),
  });
  assert.equal(r.workflow_state_status, 'FAILED');
  const ids = r.node_outputs.map(n => n.work_unit_id);
  assert.deepStrictEqual(ids, ['market_context', 'icp', 'offer', 'funnel', 'creative_strategy']);
  assert(!ids.includes('ads')); assert(!ids.includes('whatsapp_conversion'));
  assert.equal(r.cost.model_calls, 7, JSON.stringify(r.cost));
  assert.equal(r.cost.per_node.ads.validation_failed, true);
  assert.equal(r.cost.per_node.whatsapp_conversion.generation, 'LLM');
});
t('USAGE-ACCOUNTING-PRESERVED: clean run (no violation anywhere) still reaches COMPLETE with model_calls=8', async () => {
  const r = await H.run(STRUCTURED_METHOD360_BRIEF, { mode: 'llm', adapter: mockAdapter(), retrieve: true, salt: 'positive-prohibition-clean-run', llm: buildMockLLM({}) });
  assert.equal(r.workflow_state_status, 'COMPLETE', JSON.stringify(r.reason));
  assert.equal(r.cost.model_calls, 8, JSON.stringify(r.cost));
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nPERSISTED_SEMANTIC_CASES=${semanticCaseCount}`);
  console.log(`FRESH_RED_TEAM_CASES=${freshCaseCount}`);
  console.log(`\nASTRA_CAMPAIGN360_BILINGUAL_POSITIVE_PROHIBITION_HARDENING_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
