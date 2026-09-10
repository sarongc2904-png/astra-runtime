'use strict';
// [ASTRA-11J §S] Sales pipeline: LEAD -> CONTACTED -> QUALIFIED -> OPPORTUNITY -> PROPOSAL ->
// WON / LOST, plus configurable custom states. Preserves stage counts, transition rates,
// cycle duration, and win/loss reason + rep/team where supplied. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { computeTransition } = require('./transition_metrics');

const CORE_STATES = ['LEAD', 'CONTACTED', 'QUALIFIED', 'OPPORTUNITY', 'PROPOSAL', 'WON', 'LOST'];

function buildSalesPipeline({ obsByKey = {}, customStates = [], cycle = null, winLoss = [], opts = {} }) {
  const states = [...CORE_STATES.slice(0, 5), ...customStates.map(String), 'WON', 'LOST'];
  const rates = {};
  for (let i = 0; i < states.length - 1; i++) {
    const a = states[i], b = states[i + 1];
    if (b === 'LOST') continue;
    const m = computeTransition(obsByKey[a] || null, obsByKey[b] || null, opts);
    rates[`${a}__${b}`] = { status: m.status, rate: m.conversion_rate, reason: m.reason || null, metric_ref: m.metric_id };
  }
  // win rate over qualified opportunities
  const winM = computeTransition(obsByKey.OPPORTUNITY || null, obsByKey.WON || null, opts);
  rates.win_rate = { status: winM.status, rate: winM.conversion_rate, reason: winM.reason || null, metric_ref: winM.metric_id };

  const winLossSummary = {};
  for (const w of winLoss) {
    const k = `${String(w.outcome || 'UNKNOWN').toUpperCase()}::${String(w.reason || 'UNSPECIFIED')}`;
    winLossSummary[k] = (winLossSummary[k] || 0) + (w.count != null ? Number(w.count) : 1);
  }
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'SalesPipeline',
    states, counts: Object.fromEntries(states.map(s => [s, obsByKey[s] && obsByKey[s].count != null ? obsByKey[s].count : null])),
    rates,
    cycle_duration: cycle && cycle.days != null ? { days: Number(cycle.days), basis: cycle.basis || 'USER_PROVIDED', from_stage: cycle.from || null, to_stage: cycle.to || null } : { status: 'UNKNOWN' },
    win_loss_reasons: Object.keys(winLossSummary).length ? winLossSummary : { status: 'UNKNOWN' },
    reps_present: [...new Set(winLoss.map(w => w.rep).filter(Boolean))].sort(),
    teams_present: [...new Set(winLoss.map(w => w.team).filter(Boolean))].sort(),
    applicable: CORE_STATES.some(s => obsByKey[s] && obsByKey[s].count != null),
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.pipeline_id = 'sp_' + sha256Hex(canonicalize({ ...body, pipeline_id: undefined }));
  return deepFreeze(body);
}

module.exports = { CORE_STATES, buildSalesPipeline };
