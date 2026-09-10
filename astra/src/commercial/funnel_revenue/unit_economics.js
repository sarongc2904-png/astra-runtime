'use strict';
// [ASTRA-11J §K] CPL / CPA / CAC — deterministically computed and NEVER equated. CAC does not
// silently default to "ad spend / customers" when other acquisition costs are known to exist
// but were not supplied. Every metric returns its cost coverage. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { costCoverage } = require('./cost');

// computeCPL({ acquisitionSpend, validLeads, coverage })
function computeCPL({ costs = [], validLeads = null }) {
  const spend = sum(costs.filter(c => c.cost_type === 'MEDIA_SPEND'));
  if (spend == null || validLeads == null || validLeads <= 0) {
    return mk('CPL', { status: 'UNKNOWN', reason: spend == null ? 'MISSING_MEDIA_SPEND' : validLeads == null ? 'MISSING_LEAD_COUNT' : 'ZERO_LEADS' });
  }
  return mk('CPL', { status: 'COMPUTED', value: round(spend / validLeads), numerator: 'MEDIA_SPEND', numerator_value: spend, denominator: 'valid_leads', denominator_value: validLeads, cost_coverage: costCoverage(costs, { requiredTypes: ['MEDIA_SPEND'] }) });
}

// computeCPA({ costs, actions, actionLabel })
function computeCPA({ costs = [], actions = null, actionLabel = 'action', includeTypes = ['MEDIA_SPEND'] }) {
  const spend = sum(costs.filter(c => includeTypes.includes(c.cost_type)));
  if (spend == null || actions == null || actions <= 0) {
    return mk('CPA', { status: 'UNKNOWN', reason: spend == null ? 'MISSING_SPEND' : actions == null ? 'MISSING_ACTION_COUNT' : 'ZERO_ACTIONS' });
  }
  return mk('CPA', { status: 'COMPUTED', value: round(spend / actions), numerator: includeTypes.join('+'), numerator_value: spend, denominator: actionLabel, denominator_value: actions, cost_coverage: costCoverage(costs, { requiredTypes: includeTypes }) });
}

// computeCAC({ costs, newCustomers, businessInput }) — CAC uses ALL acquisition cost types.
//   If the business declares an acquisition cost type as applicable but does not supply it,
//   CAC is COMPUTED_PARTIAL (a lower bound) — never a clean CAC.
function computeCAC({ costs = [], newCustomers = null, declaredAcquisitionTypes = null }) {
  const required = declaredAcquisitionTypes && declaredAcquisitionTypes.length
    ? declaredAcquisitionTypes.map(t => String(t).toUpperCase())
    : ['MEDIA_SPEND', 'SALES_COST', 'AGENCY_FEE', 'COMMISSION'];
  const cov = costCoverage(costs, { requiredTypes: required });
  const acqCosts = costs.filter(c => required.includes(c.cost_type) && c.amount != null);
  const total = sum(acqCosts);
  if (total == null || newCustomers == null || newCustomers <= 0) {
    return mk('CAC', { status: 'UNKNOWN', reason: total == null ? 'MISSING_ACQUISITION_COST' : newCustomers == null ? 'MISSING_CUSTOMER_COUNT' : 'ZERO_CUSTOMERS', cost_coverage: cov });
  }
  const partial = cov.missing_required.length > 0;
  return mk('CAC', {
    status: partial ? 'COMPUTED_PARTIAL' : 'COMPUTED',
    value: round(total / newCustomers),
    is_lower_bound: partial,
    numerator: 'acquisition costs (' + cov.covered_required.join('+') + ')',
    numerator_value: total,
    denominator: 'new_customers', denominator_value: newCustomers,
    cost_coverage: cov,
    note: partial ? `CAC is a LOWER BOUND — declared acquisition cost types not supplied: ${cov.missing_required.join(', ')}` : 'all declared acquisition cost types supplied',
  });
}

function mk(metric, body) {
  const b = { schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'UnitEconomicMetric', metric, ...body, distinct_from_other_acquisition_metrics: true, generated_by: 'deterministic:ucdm/funnel_revenue' };
  b.metric_id = 'ue_' + sha256Hex(canonicalize({ ...b, metric_id: undefined }));
  return deepFreeze(b);
}
function sum(costs) { if (!costs.length) return null; let s = 0; for (const c of costs) { if (c.amount == null) return null; s += c.amount; } return Number(s.toFixed(4)); }
function round(x) { return Number(x.toFixed(4)); }

function validateUnitEconomic(m) {
  const errors = [];
  if (!['CPL', 'CPA', 'CAC'].includes(m.metric)) errors.push(`bad unit-economic metric "${m.metric}"`);
  if (!['COMPUTED', 'COMPUTED_PARTIAL', 'UNKNOWN'].includes(m.status)) errors.push(`bad status "${m.status}"`);
  if (m.metric === 'CAC' && m.status === 'COMPUTED' && m.cost_coverage && m.cost_coverage.missing_required.length > 0) errors.push('a clean CAC cannot have missing declared acquisition cost types');
  if (m.status !== 'UNKNOWN' && m.value == null) errors.push('a computed metric needs a value');
  return { valid: errors.length === 0, errors };
}

module.exports = { computeCPL, computeCPA, computeCAC, validateUnitEconomic };
