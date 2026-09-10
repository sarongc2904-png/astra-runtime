'use strict';
// [ASTRA-11G §A §B] CustomerAttributeEvidence.
// Evidence-backed customer attributes only. Prohibited attributes (age/gender/income/...)
// are NEVER derived — they are representable only when the business supplies them
// explicitly as USER_PROVIDED. Missing => UNKNOWN. ANALYTICAL is never silently upgraded
// to OBSERVED. No LLM, no web, no I/O, no clock.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { SOURCE_CLASSES } = require('../provenance/provenance');
const { assess } = require('../validation/confidence');

const CUSTOMER_MODEL_SCHEMA_VERSION = 'ucdm-customer-model-1.0.0';

// §A — controlled attribute vocabulary. Commercial / behavioral only.
const ATTRIBUTE_TYPES = Object.freeze([
  'problem', 'desired_outcome', 'pain', 'fear', 'objection', 'trigger', 'alternative',
  'decision_criterion', 'reason_to_buy', 'reason_not_to_buy', 'awareness', 'urgency',
  'budget_signal', 'purchase_context', 'channel', 'journey_context', 'business_type',
  'industry', 'company_size', 'location', 'maturity', 'role', 'decision_authority',
]);

const ATTR_STATUS = Object.freeze(['OBSERVED', 'COMPUTED', 'ANALYTICAL', 'UNKNOWN']);
const ATTR_SCOPE = Object.freeze(['CUSTOMER', 'SAMPLE', 'SEGMENT', 'ACCOUNT', 'UNKNOWN']);

// §B — attributes ASTRA must NOT infer. Representable only if supplied explicitly.
const PROHIBITED_INFERENCE_ATTRIBUTES = Object.freeze([
  'age', 'age_group', 'gender', 'marital_status', 'family_composition', 'income', 'salary',
  'wealth', 'net_worth', 'education', 'religion', 'race', 'ethnicity', 'political_ideology',
  'personality_type', 'medical_status', 'health_condition', 'sexuality', 'lifestyle', 'hobbies',
]);
const PROHIBITED_RE = /\b(age|aged|años de edad|edad|gender|género|genero|male|female|hombre|mujer|marital|casad|solter|divorciad|children|hijos|income|salary|salario|ingresos?|earns?|gana \$|net worth|wealth|education|degree|licenciatura|religion|religi[oó]n|cat[oó]lic|cristian|race|ethnic|etnia|raza|political|ideolog|personality type|MBTI|introvert|extrovert|depress|anxiety disorder|diabet|sexual orientation|gay|straight|lifestyle|hobbies|hobby|pasatiempo)\b/i;

function isProhibitedInference(attribute, value) {
  if (PROHIBITED_INFERENCE_ATTRIBUTES.includes(String(attribute))) return true;
  if (value != null && PROHIBITED_RE.test(JSON.stringify(value))) return true;
  return false;
}

// makeAttributeEvidence — one evidence-backed (or explicitly UNKNOWN) attribute.
function makeAttributeEvidence(x) {
  const attribute = String(x.attribute);
  const status = x.status || 'UNKNOWN';
  const source_class = x.source_class || (status === 'UNKNOWN' ? 'COMPUTED' : 'OBSERVED');
  if (!ATTR_STATUS.includes(status)) throw new Error(`[ASTRA-11G] bad attribute status "${status}"`);
  if (!SOURCE_CLASSES.includes(source_class)) throw new Error(`[ASTRA-11G] bad source_class "${source_class}"`);
  const evidence_refs = [...new Set((x.evidence_refs || []).map(String))].sort();
  // A derived (non USER_PROVIDED) prohibited attribute is forced to UNKNOWN with no value.
  const prohibited = isProhibitedInference(attribute, x.value);
  const forcedUnknown = prohibited && source_class !== 'USER_PROVIDED';
  const body = {
    schema_version: CUSTOMER_MODEL_SCHEMA_VERSION,
    kind: 'CustomerAttributeEvidence',
    attribute,
    value: forcedUnknown ? null : (x.value === undefined ? null : x.value),
    source_class: forcedUnknown ? 'COMPUTED' : source_class,
    scope: ATTR_SCOPE.includes(x.scope) ? x.scope : 'UNKNOWN',
    status: forcedUnknown ? 'UNKNOWN' : status,
    evidence_refs: forcedUnknown ? [] : evidence_refs,
    derived_from: x.derived_from == null ? null : String(x.derived_from),
    speaker_pseudonym: x.speaker_pseudonym == null ? null : String(x.speaker_pseudonym),
    negated: !!x.negated,
    prior_experience: !!x.prior_experience,
    prohibited_inference_blocked: forcedUnknown,
    confidence: x.confidence || assess({ evidence_count: evidence_refs.length, distinct_sources: x.distinct_sources || evidence_refs.length, coverage: 0.5, newest_evidence_age_days: 90 }),
    generated_by: 'deterministic:ucdm/customer_model',
  };
  body.attribute_evidence_id = 'cae_' + sha256Hex(canonicalize({ ...body, attribute_evidence_id: undefined, confidence: body.confidence.content_hash }));
  return deepFreeze(body);
}

function validateAttributeEvidence(a, evidenceRefSet = null) {
  const errors = [];
  if (!ATTRIBUTE_TYPES.includes(a.attribute) && !PROHIBITED_INFERENCE_ATTRIBUTES.includes(a.attribute)) errors.push(`uncontrolled attribute "${a.attribute}"`);
  if (!ATTR_STATUS.includes(a.status)) errors.push(`bad status "${a.status}"`);
  if (['OBSERVED', 'COMPUTED', 'ANALYTICAL'].includes(a.status) && a.evidence_refs.length === 0 && a.value != null) errors.push('a non-UNKNOWN attribute with a value needs evidence_refs');
  if (a.status === 'OBSERVED' && a.source_class === 'INFERRED') errors.push('an INFERRED value can never be OBSERVED');
  if (isProhibitedInference(a.attribute, a.value) && a.value != null && a.status !== 'UNKNOWN' && a.source_class !== 'USER_PROVIDED') errors.push(`prohibited-inference attribute "${a.attribute}" must be USER_PROVIDED or UNKNOWN`);
  if (evidenceRefSet) for (const er of a.evidence_refs) if (!evidenceRefSet.has(er)) errors.push(`dangling evidence_ref ${er}`);
  return { valid: errors.length === 0, errors };
}

// ---- deterministic derivation from an ASTRA-11F VoC result + explicit business input ----
// concept -> [{attribute, scope}] mapping (controlled — no LLM).
const CONCEPT_ATTR = {
  PRICE_CONCERN: ['objection', 'decision_criterion'],
  PRICE_ACCEPTANCE: ['reason_to_buy'],
  PAIN_FEAR: ['fear'],
  PAIN_EXPERIENCED: ['pain'],
  SPEED_NEED: ['desired_outcome', 'decision_criterion'],
  SLOW_SERVICE: ['pain'],
  RESPONSIVENESS_COMPLAINT: ['pain'],
  TRUST_CONCERN: ['objection', 'decision_criterion'],
  RESULTS_DESIRED: ['desired_outcome'],
  RESULTS_UNCERTAINTY: ['fear'],
  PROCESS_UNCLEAR: ['objection'],
  FINANCING_DEMAND: ['budget_signal'],
  GUARANTEE_DEMAND: ['reason_not_to_buy'],
  QUALITY_PRAISE: ['reason_to_buy'],
  CONVENIENCE_VALUE: ['decision_criterion', 'reason_to_buy'],
  UNKNOWN_CONCEPT: [],
};
const ASPECT_ATTR = {
  PAIN: 'pain', DESIRE: 'desired_outcome', FEAR: 'fear', OBJECTION: 'objection',
  TRIGGER: 'trigger', ALTERNATIVE: 'alternative', DECISION_CRITERION: 'decision_criterion',
  REASON_TO_BUY: 'reason_to_buy', REASON_NOT_TO_BUY: 'reason_not_to_buy',
  EXPECTATION: 'desired_outcome', COMPLAINT: 'pain', FRUSTRATION: 'pain', BARRIER: 'objection',
  OUTCOME: 'desired_outcome', BENEFIT: 'reason_to_buy', RISK: 'fear', QUESTION: 'purchase_context',
  UNCERTAINTY: 'fear',
};

function deriveAttributeEvidence({ vocResult, businessInput = {} }) {
  const out = [];
  const seen = new Set();
  const push = (spec) => {
    const ae = makeAttributeEvidence(spec);
    const k = `${ae.attribute}::${JSON.stringify(ae.value)}::${ae.speaker_pseudonym}::${ae.status}`;
    if (seen.has(k)) return; seen.add(k); out.push(ae);
  };

  // (1) per OBSERVED Voc observation -> OBSERVED attribute evidence (customer scope)
  for (const o of (vocResult.observations || [])) {
    const analytical = o.status !== 'OBSERVED';
    const attrs = new Set();
    if (ASPECT_ATTR[o.aspect]) attrs.add(ASPECT_ATTR[o.aspect]);
    for (const a of (CONCEPT_ATTR[o.normalized_concept] || [])) attrs.add(a);
    for (const attribute of attrs) {
      push({
        attribute,
        value: { concept: o.normalized_concept, polarity: o.polarity, span: o.exact_span.text },
        source_class: 'OBSERVED',
        status: analytical ? 'ANALYTICAL' : 'OBSERVED',
        scope: 'CUSTOMER',
        evidence_refs: o.evidence_refs,
        derived_from: o.observation_id,
        speaker_pseudonym: o.speaker_pseudonym || null,
        negated: o.negated, prior_experience: o.prior_experience,
      });
    }
  }

  // (2) COMPUTED roll-ups from VoC patterns (aggregation is deterministic => COMPUTED)
  for (const p of (vocResult.patterns || [])) {
    if (p.status === 'INSUFFICIENT') continue;
    const attribute = ASPECT_ATTR[p.aspect] || (CONCEPT_ATTR[p.canonical_concept] || [])[0];
    if (!attribute) continue;
    push({
      attribute,
      value: { pattern: p.pattern, concept: p.canonical_concept, status: p.status, observations: p.coverage.deduped_observation_count, sources: p.coverage.unique_source_count },
      source_class: 'COMPUTED',
      status: p.status === 'MIXED' ? 'ANALYTICAL' : 'COMPUTED',
      scope: 'SAMPLE',
      evidence_refs: (vocResult.observations || []).filter(o => p.supporting_observations.includes(o.observation_id)).flatMap(o => o.evidence_refs),
      derived_from: p.pattern_id,
    });
  }

  // (3) alternatives / triggers / decision criteria (already evidence-backed by ASTRA-11F).
  //     A signal from a non-eligible (e.g. UNKNOWN_CUSTOMER_ROLE) speaker stays ANALYTICAL.
  const ELIGIBLE = ['CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER'];
  const st = (role) => (ELIGIBLE.includes(role) ? 'OBSERVED' : 'ANALYTICAL');
  for (const a of (vocResult.alternatives || [])) push({ attribute: 'alternative', value: { alternative_type: a.alternative_type, text: a.verbatim_span || null }, source_class: 'OBSERVED', status: st(a.speaker_role), scope: 'CUSTOMER', evidence_refs: a.evidence_refs, derived_from: a.id || null, speaker_pseudonym: a.speaker_pseudonym || null });
  for (const t of (vocResult.triggers || [])) push({ attribute: 'trigger', value: { trigger_type: t.trigger_type }, source_class: 'OBSERVED', status: st(t.speaker_role), scope: 'CUSTOMER', evidence_refs: t.evidence_refs, derived_from: t.id || null, speaker_pseudonym: t.speaker_pseudonym || null });
  for (const c of (vocResult.criteria || [])) push({ attribute: 'decision_criterion', value: { criterion: c.criterion }, source_class: 'OBSERVED', status: st(c.speaker_role), scope: 'CUSTOMER', evidence_refs: c.evidence_refs, derived_from: c.id || null, speaker_pseudonym: c.speaker_pseudonym || null });

  // (4) explicit business input — USER_PROVIDED. May legitimately include otherwise-prohibited
  //     attributes, and org attributes (industry/company_size/...). Evidence optional but recorded.
  for (const ex of (businessInput.explicit_attributes || [])) {
    push({
      attribute: String(ex.attribute),
      value: ex.value === undefined ? null : ex.value,
      source_class: 'USER_PROVIDED',
      status: ex.value == null ? 'UNKNOWN' : 'OBSERVED',
      scope: ex.scope || 'ACCOUNT',
      evidence_refs: ex.evidence_refs || [],
      derived_from: 'business_input',
    });
  }

  // (5) explicit UNKNOWN markers for every prohibited-inference attribute not supplied,
  //     so "we do not know" is representable and auditable.
  const supplied = new Set(out.filter(a => a.source_class === 'USER_PROVIDED').map(a => a.attribute));
  for (const attribute of PROHIBITED_INFERENCE_ATTRIBUTES) {
    if (supplied.has(attribute)) continue;
    out.push(makeAttributeEvidence({ attribute, value: null, status: 'UNKNOWN', source_class: 'COMPUTED', scope: 'UNKNOWN', derived_from: 'not-inferred-by-policy' }));
  }

  return out;
}

module.exports = {
  CUSTOMER_MODEL_SCHEMA_VERSION, ATTRIBUTE_TYPES, ATTR_STATUS, ATTR_SCOPE,
  PROHIBITED_INFERENCE_ATTRIBUTES, PROHIBITED_RE, isProhibitedInference,
  makeAttributeEvidence, validateAttributeEvidence, deriveAttributeEvidence,
};
