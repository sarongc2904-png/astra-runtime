'use strict';
// [ASTRA-11J §N] Gross margin vs contribution margin — from SUPPLIED cost definitions only.
// ASTRA NEVER assumes cost of goods or variable cost. The two margins are distinguished
// explicitly. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// computeMargins({ revenue, cogs, variable_cost, contribution_cost_types, currency }) -> frozen
//   cogs / variable_cost must be USER_PROVIDED amounts; if absent -> that margin is UNKNOWN.
function computeMargins(x) {
  const rev = x.revenue;
  const gross = (rev != null && x.cogs != null)
    ? { status: 'COMPUTED', margin_amount: Number((rev - x.cogs).toFixed(4)), margin_ratio: rev > 0 ? Number(((rev - x.cogs) / rev).toFixed(6)) : null, basis: 'revenue - COGS (USER_PROVIDED)', cogs: x.cogs }
    : { status: 'UNKNOWN', reason: rev == null ? 'MISSING_REVENUE' : 'MISSING_COGS', note: 'gross margin needs a USER_PROVIDED cost of goods sold — never assumed' };

  const vc = x.variable_cost;
  const contribution = (rev != null && vc != null)
    ? { status: 'COMPUTED', margin_amount: Number((rev - vc).toFixed(4)), margin_ratio: rev > 0 ? Number(((rev - vc) / rev).toFixed(6)) : null, basis: 'revenue - variable cost (USER_PROVIDED)', variable_cost: vc, variable_cost_components: x.variable_cost_components || null }
    : { status: 'UNKNOWN', reason: rev == null ? 'MISSING_REVENUE' : 'MISSING_VARIABLE_COST', note: 'contribution margin needs a USER_PROVIDED variable cost definition — never assumed' };

  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'MarginAssessment',
    currency: x.currency || null,
    gross_margin: gross,
    contribution_margin: contribution,
    distinct: true,
    note: 'gross margin (revenue - COGS) and contribution margin (revenue - variable cost) are DISTINCT and are never conflated; neither cost is assumed',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.margin_id = 'mg_' + sha256Hex(canonicalize({ ...body, margin_id: undefined }));
  return deepFreeze(body);
}

function validateMargins(m) {
  const errors = [];
  if (m.distinct !== true) errors.push('gross and contribution margin must be represented distinctly');
  for (const k of ['gross_margin', 'contribution_margin']) {
    const g = m[k];
    if (g.status === 'COMPUTED' && (g.margin_amount == null)) errors.push(`${k} COMPUTED without an amount`);
    if (g.status === 'COMPUTED' && k === 'gross_margin' && g.cogs == null) errors.push('gross margin COMPUTED without a supplied COGS');
    if (g.status === 'COMPUTED' && k === 'contribution_margin' && g.variable_cost == null) errors.push('contribution margin COMPUTED without a supplied variable cost');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { computeMargins, validateMargins };
