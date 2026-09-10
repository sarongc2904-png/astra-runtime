'use strict';
// [ASTRA-11I §E] DifferentiationCandidate. Every candidate distinguishes: an OBSERVED
// capability (business-supplied / evidenced), a MARKET COMPARISON (what competitor evidence
// shows), and an ANALYTICAL differentiation hypothesis. No unsupported "unique" / "best".
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const DIFFERENTIATION_TYPES = Object.freeze([
  'PRODUCT', 'SERVICE', 'PROCESS', 'SPEED', 'CONVENIENCE', 'EXPERTISE', 'PROOF', 'RISK_REVERSAL',
  'PRICING_MODEL', 'PACKAGING', 'ACCESS', 'EXPERIENCE', 'SPECIALIZATION', 'OUTCOME_FOCUS', 'UNKNOWN',
]);
const UNIQUENESS_STATUS = Object.freeze(['NOT_ASSERTED', 'DISTINCT_IN_SAMPLE', 'PARITY_IN_SAMPLE', 'UNKNOWN']);

// keyword -> differentiation type, for classifying a supplied capability or competitor message
const TYPE_KEYWORDS = Object.freeze([
  { type: 'SPEED', re: /r[aá]pid|mismo d[ií]a|inmediat|express|24 ?h|entrega r[aá]pida/i },
  { type: 'EXPERTISE', re: /expert|especialist|certificad|a[ñn]os de experiencia|master/i },
  { type: 'SPECIALIZATION', re: /solo (hacemos|nos dedicamos)|nicho|exclusivamente|especializad/i },
  { type: 'PROOF', re: /casos? de [eé]xito|resultados comprobad|testimon|antes y despu[eé]s/i },
  { type: 'RISK_REVERSAL', re: /garant[ií]a|devoluci[oó]n|sin riesgo|prueba gratis/i },
  { type: 'PRICING_MODEL', re: /precio fijo|sin sorpresas|transparente|meses sin intereses|suscripci[oó]n/i },
  { type: 'CONVENIENCE', re: /a domicilio|en l[ií]nea|sin salir|f[aá]cil|c[oó]modo/i },
  { type: 'ACCESS', re: /24\/7|siempre disponible|acceso|cuando quieras/i },
  { type: 'EXPERIENCE', re: /experiencia [uú]nica|atenci[oó]n personaliz|trato/i },
  { type: 'OUTCOME_FOCUS', re: /resultados garantiz|orientad a resultados|pagas por resultados/i },
]);
function classifyType(text) {
  for (const r of TYPE_KEYWORDS) if (r.re.test(String(text || ''))) return r.type;
  return 'UNKNOWN';
}

// buildDifferentiationCandidates({ businessInput, researchResult, vocResult, journeyResult })
function buildDifferentiationCandidates({ businessInput = {}, researchResult = null, vocResult = {}, journeyResult = null }) {
  const competitorTexts = [
    ...((researchResult && researchResult.message_observations) || []).map(m => m.verbatim_text || m.text || m.message || ''),
    ...((researchResult && researchResult.offer_items) || []).map(o => o.component || o.text || ''),
  ];
  const competitorTypes = new Set(competitorTexts.map(classifyType).filter(t => t !== 'UNKNOWN'));

  const out = [];
  for (const cap of (businessInput.capabilities || [])) {
    const type = businessInput.capability_type && businessInput.capability_type[cap.capability]
      ? String(businessInput.capability_type[cap.capability]).toUpperCase()
      : classifyType(cap.capability + ' ' + (cap.description || ''));
    const observedInCompetitors = competitorTypes.has(type);
    const marketComparison = competitorTexts.length === 0 ? 'NO_COMPETITOR_SAMPLE'
      : observedInCompetitors ? 'ALSO_OBSERVED_IN_COMPETITOR_SAMPLE' : 'NOT_OBSERVED_IN_COMPETITOR_SAMPLE';
    let uniqueness;
    if (competitorTexts.length === 0) uniqueness = 'UNKNOWN';
    else if (observedInCompetitors) uniqueness = 'PARITY_IN_SAMPLE';
    else uniqueness = 'DISTINCT_IN_SAMPLE';
    // does customer evidence value this differentiation? (a VoC decision criterion / desire)
    const relevantVoc = (vocResult.observations || []).filter(o => o.status === 'OBSERVED' && conceptSupportsType(o.normalized_concept, type));
    const body = {
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'DifferentiationCandidate',
      differentiation_type: DIFFERENTIATION_TYPES.includes(type) ? type : 'UNKNOWN',
      observed_capability: { statement: String(cap.capability), source_class: 'USER_PROVIDED', evidence_refs: [...new Set(cap.evidence_refs || [])].sort() },
      market_comparison: { status: marketComparison, competitor_sample_size: competitorTexts.length },
      analytical_hypothesis: relevantVoc.length
        ? { statement: `customers value ${type.toLowerCase()} (evidenced) and it is ${uniqueness.toLowerCase()}`, evidence_refs: [...new Set(relevantVoc.flatMap(o => o.evidence_refs))].sort() }
        : { statement: 'no customer evidence that this differentiation matters', evidence_refs: [] },
      uniqueness_status: uniqueness,
      customer_relevance: relevantVoc.length ? 'EVIDENCED' : 'UNKNOWN',
      confidence: assess({ evidence_count: (cap.evidence_refs || []).length + relevantVoc.length, distinct_sources: competitorTexts.length ? 2 : 1, coverage: 0.4 }),
      generated_by: 'deterministic:ucdm/positioning_offer',
    };
    body.differentiation_id = 'dc_' + sha256Hex(canonicalize({ ...body, differentiation_id: undefined, confidence: body.confidence.content_hash }));
    out.push(deepFreeze(body));
  }
  return out;
}

function conceptSupportsType(concept, type) {
  const map = {
    SPEED: ['SPEED_NEED', 'SLOW_SERVICE'], PROOF: ['GUARANTEE_DEMAND', 'RESULTS_UNCERTAINTY', 'TRUST_CONCERN'],
    RISK_REVERSAL: ['GUARANTEE_DEMAND', 'PAIN_FEAR'], PRICING_MODEL: ['PRICE_CONCERN', 'FINANCING_DEMAND'],
    CONVENIENCE: ['CONVENIENCE_VALUE'], EXPERTISE: ['TRUST_CONCERN'], OUTCOME_FOCUS: ['RESULTS_DESIRED'],
  };
  return (map[type] || []).includes(concept);
}

function validateDifferentiation(d) {
  const errors = [];
  if (!DIFFERENTIATION_TYPES.includes(d.differentiation_type)) errors.push(`bad differentiation_type "${d.differentiation_type}"`);
  if (!UNIQUENESS_STATUS.includes(d.uniqueness_status)) errors.push(`bad uniqueness_status "${d.uniqueness_status}"`);
  if (d.uniqueness_status === 'DISTINCT_IN_SAMPLE' && d.market_comparison.competitor_sample_size === 0) errors.push('cannot claim DISTINCT_IN_SAMPLE with no competitor sample');
  if (/\b(unique|the best|#1|nadie m[aá]s|[uú]nico en el mercado|market[- ]leading)\b/i.test(JSON.stringify({ a: d.observed_capability, b: d.analytical_hypothesis }))) errors.push('no unsupported "unique"/"best" language');
  if (d.observed_capability.source_class !== 'USER_PROVIDED' && d.observed_capability.evidence_refs.length === 0) errors.push('an observed capability needs a source');
  return { valid: errors.length === 0, errors };
}

module.exports = { DIFFERENTIATION_TYPES, UNIQUENESS_STATUS, classifyType, buildDifferentiationCandidates, validateDifferentiation };
