'use strict';
// [ASTRA-11I §J] Benefit discipline. feature -> capability -> functional_benefit -> outcome
// is an analytical chain from supplied capabilities + evidenced customer desires.
// EMOTIONAL / SOCIAL benefits require explicit customer evidence — no fictional
// transformation language. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const BENEFIT_LEVELS = Object.freeze(['FEATURE', 'CAPABILITY', 'FUNCTIONAL_BENEFIT', 'EMOTIONAL_BENEFIT', 'SOCIAL_BENEFIT', 'OUTCOME']);

const FUNCTIONAL_CONCEPTS = ['RESULTS_DESIRED', 'SPEED_NEED', 'CONVENIENCE_VALUE', 'PAIN_EXPERIENCED', 'SLOW_SERVICE'];
const EMOTIONAL_CONCEPTS = ['PAIN_FEAR', 'RESULTS_UNCERTAINTY', 'TRUST_CONCERN'];
const SOCIAL_RE = /reputaci[oó]n|qu[eé] van a pensar|frente a (mis|los)|imagen|me da pena|presum/i;

// buildBenefitMap({ businessInput, vocResult, jtbd }) -> [BenefitChain]
function buildBenefitMap({ businessInput = {}, vocResult = {}, jtbd = null }) {
  const obs = (vocResult.observations || []).filter(o => o.status === 'OBSERVED');
  const funcRows = obs.filter(o => FUNCTIONAL_CONCEPTS.includes(o.normalized_concept));
  const emoRows = obs.filter(o => EMOTIONAL_CONCEPTS.includes(o.normalized_concept));
  const socialRows = obs.filter(o => SOCIAL_RE.test(o.exact_span.text));

  const out = [];
  for (const cap of (businessInput.capabilities || [])) {
    const chain = {
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'BenefitChain',
      feature: { statement: String(cap.feature || cap.capability), source_class: 'USER_PROVIDED' },
      capability: { statement: String(cap.capability), source_class: 'USER_PROVIDED', evidence_refs: [...new Set(cap.evidence_refs || [])].sort() },
      functional_benefit: funcRows.length
        ? { concepts: [...new Set(funcRows.map(o => o.normalized_concept))].sort(), basis: 'ANALYTICAL', evidence_refs: [...new Set(funcRows.flatMap(o => o.evidence_refs))].sort() }
        : { status: 'UNKNOWN' },
      emotional_benefit: emoRows.length
        ? { concepts: [...new Set(emoRows.map(o => o.normalized_concept))].sort(), basis: 'OBSERVED', evidence_refs: [...new Set(emoRows.flatMap(o => o.evidence_refs))].sort(), note: 'explicit customer emotion language' }
        : { status: 'UNKNOWN' },
      social_benefit: socialRows.length
        ? { basis: 'OBSERVED', evidence_refs: [...new Set(socialRows.flatMap(o => o.evidence_refs))].sort() }
        : { status: 'UNKNOWN' },
      outcome: jtbd && jtbd.desired_progress && jtbd.desired_progress.status !== 'UNKNOWN'
        ? { concept: jtbd.desired_progress.concept || (jtbd.desired_progress.concepts || [])[0] || null, evidence_refs: jtbd.desired_progress.evidence_refs || [], basis: 'ANALYTICAL' }
        : { status: 'UNKNOWN' },
      generated_by: 'deterministic:ucdm/positioning_offer',
    };
    chain.benefit_chain_id = 'bc_' + sha256Hex(canonicalize({ ...chain, benefit_chain_id: undefined }));
    out.push(deepFreeze(chain));
  }
  return out;
}

const TRANSFORMATION_RE = /\b(transform your life|feel unstoppable|vida que siempre so[ñn]aste|convi[eé]rtete en|new you|best version of yourself|nunca m[aá]s te preocupes)\b/i;

function validateBenefitChain(c) {
  const errors = [];
  for (const lvl of ['emotional_benefit', 'social_benefit']) {
    const f = c[lvl];
    if (f && f.status !== 'UNKNOWN') {
      if (f.basis !== 'OBSERVED') errors.push(`${lvl} must be OBSERVED (explicit customer evidence), not reconstructed`);
      if (!f.evidence_refs || f.evidence_refs.length === 0) errors.push(`${lvl} present without customer evidence`);
    }
  }
  if (TRANSFORMATION_RE.test(JSON.stringify(c))) errors.push('no fictional transformation language');
  if (c.functional_benefit && c.functional_benefit.status !== 'UNKNOWN' && (!c.functional_benefit.evidence_refs || c.functional_benefit.evidence_refs.length === 0)) errors.push('functional_benefit present without evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { BENEFIT_LEVELS, buildBenefitMap, validateBenefitChain };
