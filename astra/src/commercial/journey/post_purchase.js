'use strict';
// [ASTRA-11H §V] Explicit PRE-PURCHASE and POST-PURCHASE journeys. The engine does NOT stop
// at purchase. Post-purchase stages are only asserted where evidence exists. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const ST = require('./stage_taxonomy');

function buildPrePostJourneys({ journeyObservations = [], events = [], transitions = [] }) {
  const byPhase = (phase) => journeyObservations.filter(o => ST.phaseOf(o.stage) === phase && o.stage !== 'UNKNOWN');
  const pre = byPhase('PRE_PURCHASE');
  const purch = byPhase('PURCHASE');
  const post = byPhase('POST_PURCHASE');

  const summary = (obs, evs) => ({
    stages: [...new Set(obs.map(o => o.stage))].sort(),
    stage_count: new Set(obs.map(o => o.stage)).size,
    observation_count: obs.length,
    event_types: [...new Set(evs.map(e => e.event_type))].sort(),
    subjects: [...new Set(obs.map(o => o.subject_ref).filter(Boolean))].length,
    evidence_refs: [...new Set(obs.flatMap(o => o.evidence_refs))].sort(),
  });

  const prePurchase = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'PrePurchaseJourney',
    ...summary(pre, events.filter(e => ST.phaseOf(e.evidenced_stage) === 'PRE_PURCHASE')),
    status: pre.length ? 'EVIDENCED' : 'UNKNOWN',
  };
  const purchaseMoment = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'PurchaseMoment',
    ...summary(purch, events.filter(e => e.evidenced_stage === 'PURCHASE')),
    status: (purch.length || events.some(e => e.evidenced_stage === 'PURCHASE')) ? 'EVIDENCED' : 'UNKNOWN',
  };
  const postPurchase = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'PostPurchaseJourney',
    ...summary(post, events.filter(e => ST.phaseOf(e.evidenced_stage) === 'POST_PURCHASE')),
    status: post.length ? 'EVIDENCED' : 'UNKNOWN',
    note: post.length ? 'post-purchase journey reconstructed from evidence' : 'no post-purchase evidence in the sample — represented as UNKNOWN, not fabricated',
  };

  const body = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'PrePostJourneys',
    pre_purchase: prePurchase, purchase_moment: purchaseMoment, post_purchase: postPurchase,
    covers_post_purchase: post.length > 0,
    generated_by: 'deterministic:ucdm/journey/post_purchase',
  };
  body.pre_post_id = 'jpp_' + sha256Hex(canonicalize({ ...body, pre_post_id: undefined }));
  return deepFreeze(body);
}

module.exports = { buildPrePostJourneys };
