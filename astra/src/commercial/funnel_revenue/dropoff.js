'use strict';
// [ASTRA-11J §D §E] Drop-off + volume-vs-efficiency separation. Drop-off is a count
// difference, never causality. A low downstream outcome may be a VOLUME problem even with
// strong conversion. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// summarizeFunnel(transitions, observationsByKey) -> { volume, efficiency }
function summarizeFunnel(transitions, orderedStageKeys, obsByKey) {
  const volume = {};
  for (const k of orderedStageKeys) volume[k] = obsByKey[k] && obsByKey[k].count != null ? obsByKey[k].count : null;

  const validT = transitions.filter(t => t.status === 'VALID');
  const efficiency = validT.map(t => ({ from: t.from_stage, to: t.to_stage, conversion_rate: t.conversion_rate, drop_off_count: t.drop_off_count }));
  const invalidT = transitions.filter(t => t.status !== 'VALID').map(t => ({ from: t.from_stage, to: t.to_stage, status: t.status, reason: t.reason }));

  // largest absolute loss + weakest conversion (efficiency vs volume framing)
  const largestLoss = validT.slice().sort((a, b) => b.drop_off_count - a.drop_off_count)[0] || null;
  const weakestConversion = validT.slice().sort((a, b) => a.conversion_rate - b.conversion_rate)[0] || null;

  const topStage = orderedStageKeys[0];
  const topVolume = volume[topStage];
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelSummary',
    volume,
    top_of_funnel_volume: topVolume,
    efficiency,
    invalid_transitions: invalidT,
    largest_absolute_loss: largestLoss ? { from: largestLoss.from_stage, to: largestLoss.to_stage, drop_off_count: largestLoss.drop_off_count } : null,
    weakest_conversion: weakestConversion ? { from: weakestConversion.from_stage, to: weakestConversion.to_stage, conversion_rate: weakestConversion.conversion_rate } : null,
    volume_vs_efficiency_note: 'volume (counts) and efficiency (conversion) are reported separately — a weak downstream result can be a volume problem even when conversion is strong',
    causal_claim: false,
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.summary_id = 'fsu_' + sha256Hex(canonicalize({ ...body, summary_id: undefined }));
  return deepFreeze(body);
}

module.exports = { summarizeFunnel };
