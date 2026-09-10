'use strict';
// [ASTRA-11I §X] OfferClaim. Every FACTUAL / COMPARATIVE / OUTCOME claim requires evidence.
// An unsupported such claim is REJECTED or downgraded to ANALYTICAL. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const CLAIM_TYPES = Object.freeze(['FACTUAL', 'COMPARATIVE', 'OUTCOME', 'PROCESS', 'PROOF', 'ANALYTICAL']);
const REQUIRE_EVIDENCE = Object.freeze(['FACTUAL', 'COMPARATIVE', 'OUTCOME']);
const CLAIM_VERDICT = Object.freeze(['ACCEPTED', 'DOWNGRADED_TO_ANALYTICAL', 'REJECTED']);

const HYPE_RE = /\b(guaranteed|the best|#1|n[uú]mero uno|[uú]nico|revolutionary|revolucionari|world[- ]class|instant results|resultados inmediatos|change your life|cambia tu vida)\b/i;

// makeOfferClaim({ claim_type, statement, evidence_refs, dimension? })
function makeOfferClaim(x) {
  const claim_type = CLAIM_TYPES.includes(x.claim_type) ? x.claim_type : 'ANALYTICAL';
  const evidence_refs = [...new Set((x.evidence_refs || []).map(String))].sort();
  const statement = String(x.statement || '');
  let verdict = 'ACCEPTED';
  let final_type = claim_type;
  const reasons = [];
  if (REQUIRE_EVIDENCE.includes(claim_type) && evidence_refs.length === 0) {
    verdict = 'DOWNGRADED_TO_ANALYTICAL'; final_type = 'ANALYTICAL'; reasons.push('no evidence for a factual/comparative/outcome claim');
  }
  if (claim_type === 'COMPARATIVE' && !x.dimension) { verdict = 'REJECTED'; reasons.push('a comparative claim needs a defined dimension'); }
  if (HYPE_RE.test(statement)) { verdict = 'REJECTED'; reasons.push('unsupported hype / superlative language'); }

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferClaim',
    claim_type, final_claim_type: verdict === 'REJECTED' ? claim_type : final_type,
    statement, dimension: x.dimension ? String(x.dimension) : null,
    evidence_refs, verdict, reasons: reasons.sort(),
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.claim_id = 'ocl_' + sha256Hex(canonicalize({ ...body, claim_id: undefined }));
  return deepFreeze(body);
}

// deterministically derive claims from the assembled positioning/offer, then validate each
function deriveClaims({ territories = [], differentiation = [], proofStrategy = null, competitorComparison = null }) {
  const claims = [];
  for (const t of territories) {
    if (t.status === 'INSUFFICIENT') continue;
    claims.push(makeOfferClaim({ claim_type: 'ANALYTICAL', statement: `positioning territory for ${t.target_segment_refs[0]}: problem ${t.problem_context}, progress ${t.desired_progress}`, evidence_refs: t.evidence_refs }));
  }
  for (const d of differentiation) {
    const type = d.uniqueness_status === 'DISTINCT_IN_SAMPLE' ? 'COMPARATIVE' : 'ANALYTICAL';
    claims.push(makeOfferClaim({ claim_type: type, dimension: type === 'COMPARATIVE' ? d.differentiation_type : null, statement: `${d.differentiation_type} — ${d.uniqueness_status}`, evidence_refs: d.observed_capability.evidence_refs.concat(d.analytical_hypothesis.evidence_refs) }));
  }
  for (const p of ((proofStrategy && proofStrategy.available) || [])) {
    claims.push(makeOfferClaim({ claim_type: 'PROOF', statement: `proof available: ${p.proof_type}`, evidence_refs: p.evidence_refs }));
  }
  for (const dim of ((competitorComparison && competitorComparison.dimensions) || [])) {
    if (dim.status === 'DIFFERENTIATED') claims.push(makeOfferClaim({ claim_type: 'COMPARATIVE', dimension: dim.dimension, statement: `differentiated on ${dim.dimension} vs observed competitor sample`, evidence_refs: dim.evidence_refs }));
  }
  return claims;
}

function validateClaim(c) {
  const errors = [];
  if (!CLAIM_TYPES.includes(c.claim_type)) errors.push(`bad claim_type "${c.claim_type}"`);
  if (!CLAIM_VERDICT.includes(c.verdict)) errors.push(`bad verdict "${c.verdict}"`);
  if (c.verdict === 'ACCEPTED' && REQUIRE_EVIDENCE.includes(c.final_claim_type) && c.evidence_refs.length === 0) errors.push('an accepted factual/comparative/outcome claim needs evidence');
  if (c.verdict === 'ACCEPTED' && HYPE_RE.test(c.statement)) errors.push('an accepted claim must not contain hype');
  return { valid: errors.length === 0, errors };
}

module.exports = { CLAIM_TYPES, REQUIRE_EVIDENCE, CLAIM_VERDICT, makeOfferClaim, deriveClaims, validateClaim };
