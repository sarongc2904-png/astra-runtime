'use strict';
// [ASTRA-11I §S] Offer-Journey fit. Does the offer address the stage-specific frictions /
// questions / proof needs? ASTRA does NOT assume one offer/message fits every stage.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// assessOfferJourneyFit({ journeyResult, proofStrategy, offerArchitecture, objectionMap })
function assessOfferJourneyFit({ journeyResult = null, proofStrategy = null, offerArchitecture = null, objectionMap = [] }) {
  const stages = {};
  const stageOf = (arr, key) => { for (const x of arr) { const s = x[key] || x.stage; if (!s) continue; (stages[s] = stages[s] || { stage: s, frictions: new Set(), questions: new Set(), proof_needs: new Set(), evidence_refs: new Set() }); } };
  for (const f of ((journeyResult && journeyResult.frictions) || [])) { const s = stages[f.stage] || (stages[f.stage] = mkStage(f.stage)); s.frictions.add(f.category); for (const er of f.evidence_refs) s.evidence_refs.add(er); }
  for (const q of ((journeyResult && journeyResult.questions) || [])) { const s = stages[q.stage] || (stages[q.stage] = mkStage(q.stage)); s.questions.add(q.question_type || q.status); for (const er of q.evidence_refs) s.evidence_refs.add(er); }
  for (const p of ((journeyResult && journeyResult.proofRequirements) || [])) { const s = stages[p.stage] || (stages[p.stage] = mkStage(p.stage)); s.proof_needs.add(p.proof_type); for (const er of p.evidence_refs) s.evidence_refs.add(er); }

  const availProof = new Set((proofStrategy ? proofStrategy.available : []).map(p => p.proof_type));
  const compTypes = new Set(((offerArchitecture && offerArchitecture.components) || []).map(c => c.component_type));
  const objectionAddressed = new Set(objectionMap.filter(m => m.handling_status === 'ADDRESSED').map(m => m.objection_concept));

  const stageFit = Object.values(stages).map(s => {
    const proofNeeds = [...s.proof_needs];
    const proofCovered = proofNeeds.filter(pn => availProof.has(mapProof(pn))).length;
    const frictionCovered = [...s.frictions].filter(fc => frictionRemedy(fc, compTypes)).length;
    const total = proofNeeds.length + s.frictions.size;
    const covered = proofCovered + frictionCovered;
    let status;
    if (total === 0) status = 'NO_EVIDENCED_NEED_AT_STAGE';
    else if (covered === 0) status = 'NOT_ADDRESSED';
    else if (covered >= total) status = 'ADDRESSED';
    else status = 'PARTIALLY_ADDRESSED';
    return deepFreeze({
      stage: s.stage, status,
      evidenced_frictions: [...s.frictions].sort(), evidenced_questions: [...s.questions].sort(), evidenced_proof_needs: proofNeeds.sort(),
      covered, total, evidence_refs: [...s.evidence_refs].sort(),
    });
  }).sort((a, b) => (a.stage < b.stage ? -1 : 1));

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferJourneyFit',
    stage_fit: stageFit,
    assumes_one_offer_fits_all_stages: false,
    fully_addressed_stages: stageFit.filter(s => s.status === 'ADDRESSED').map(s => s.stage),
    unaddressed_stages: stageFit.filter(s => s.status === 'NOT_ADDRESSED').map(s => s.stage),
    note: 'per-stage assessment — one offer/message is NOT assumed to fit every journey stage',
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.journey_fit_id = 'ojf_' + sha256Hex(canonicalize({ ...body, journey_fit_id: undefined }));
  return deepFreeze(body);
}
function mkStage(s) { return { stage: s, frictions: new Set(), questions: new Set(), proof_needs: new Set(), evidence_refs: new Set() }; }
function mapProof(t) { const m = { TESTIMONIALS: 'TESTIMONIAL', CASE_RESULTS: 'CASE_STUDY', GUARANTEE: 'GUARANTEE', PRICE_TRANSPARENCY: 'PROCESS_TRANSPARENCY', TECHNICAL_EXPLANATION: 'PROCESS_TRANSPARENCY', COMPARISON: 'COMPARISON', CREDENTIAL: 'CREDENTIAL', DEMONSTRATION: 'DEMONSTRATION', SAMPLE: 'SAMPLE_TRIAL', TRIAL: 'SAMPLE_TRIAL' }; return m[t] || t; }
function frictionRemedy(cat, compTypes) {
  const m = { PRICE: ['FINANCING', 'PAYMENT_TERM', 'PRICING'], INFORMATION_GAP: ['ONBOARDING', 'MECHANISM'], TIME: ['SUPPORT'], CHANNEL_FRICTION: ['SUPPORT'], PROOF: ['PROOF', 'GUARANTEE'], TRUST: ['PROOF', 'GUARANTEE'], RISK: ['GUARANTEE', 'PROOF'] };
  return (m[cat] || []).some(t => compTypes.has(t));
}

function validateOfferJourneyFit(f) {
  const errors = [];
  if (f.assumes_one_offer_fits_all_stages !== false) errors.push('offer-journey fit must not assume one offer fits all stages');
  return { valid: errors.length === 0, errors };
}

module.exports = { assessOfferJourneyFit, validateOfferJourneyFit };
