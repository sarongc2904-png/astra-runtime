'use strict';
// [ASTRA-11M §6] Urgency model. Ordinal only, from explicit inputs (cash runway, revenue
// decline, pipeline collapse, churn spike, booking collapse, fulfillment overload, stock
// limit). Runway is never invented. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

const SIGNALS = Object.freeze([
  'cash_runway', 'revenue_decline', 'pipeline_collapse', 'churn_spike',
  'booking_collapse', 'fulfillment_overload', 'stock_limitation',
]);

function assessUrgency(ctx) {
  const rev = ctx.current_revenue_state || {};
  const fs = ctx.current_funnel_state || {};
  const reasons = [];
  let level = 'URGENCY_UNKNOWN';
  const bump = (l, why) => { reasons.push(why); if (C.ordinalIndex(C.URGENCY, l) < C.ordinalIndex(C.URGENCY, level) || level === 'URGENCY_UNKNOWN') level = l; };

  // cash runway (explicit months only)
  const runway = ctx.cash_urgency && typeof ctx.cash_urgency === 'object' ? ctx.cash_urgency.runway_months : (rev.runway_months);
  if (runway != null) {
    if (Number(runway) <= 2) bump('URGENCY_CRITICAL', `cash runway ${runway}mo`);
    else if (Number(runway) <= 4) bump('URGENCY_HIGH', `cash runway ${runway}mo`);
    else if (Number(runway) <= 8) bump('URGENCY_MEDIUM', `cash runway ${runway}mo`);
    else bump('URGENCY_LOW', `cash runway ${runway}mo`);
  } else if (ctx.cash_urgency === 'CRITICAL' || ctx.cash_urgency === 'HIGH' || ctx.cash_urgency === 'MEDIUM' || ctx.cash_urgency === 'LOW') {
    bump('URGENCY_' + ctx.cash_urgency, `declared cash_urgency ${ctx.cash_urgency}`);
  }

  // revenue decline
  if (rev.trend === 'DECLINING_SHARP' || (rev.mom_change_pct != null && Number(rev.mom_change_pct) <= -25)) bump('URGENCY_CRITICAL', 'sharp revenue decline');
  else if (rev.trend === 'DECLINING' || (rev.mom_change_pct != null && Number(rev.mom_change_pct) <= -10)) bump('URGENCY_HIGH', 'revenue declining');

  // pipeline / bookings
  if (fs.pipeline_state === 'COLLAPSING' || fs.booking_state === 'COLLAPSING') bump('URGENCY_CRITICAL', 'pipeline/booking collapse');
  else if (fs.pipeline_state === 'WEAK' || fs.booking_state === 'WEAK') bump('URGENCY_HIGH', 'pipeline/booking weak');

  // churn
  if (rev.churn_state === 'SPIKE' || (rev.churn_change_pct != null && Number(rev.churn_change_pct) >= 50)) bump('URGENCY_HIGH', 'churn spike');

  // operational overload / stock
  const cap = ctx.operational_capacity || {};
  if (cap.state === 'OVERLOADED' || cap.fulfillment === 'OVERLOADED') bump('URGENCY_HIGH', 'fulfillment overload');
  if (cap.stock === 'LIMITED' || cap.stock === 'OUT') bump('URGENCY_MEDIUM', 'stock limitation');

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'UrgencyAssessment',
    level, reasons: reasons.sort(), fabricated_runway: false,
    generated_by: 'deterministic:ucdm/decision_orchestrator/urgency',
  };
  body.assessment_id = 'dur_' + sha256Hex(canonicalize({ ...body, assessment_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateUrgency(u) {
  const errors = [];
  if (!C.URGENCY.includes(u.level)) errors.push(`bad urgency level "${u.level}"`);
  if (u.level !== 'URGENCY_UNKNOWN' && u.reasons.length === 0) errors.push('urgency asserted without a reason');
  if (u.fabricated_runway !== false) errors.push('runway must never be fabricated');
  return { valid: errors.length === 0, errors };
}

module.exports = { SIGNALS, assessUrgency, validateUrgency };
