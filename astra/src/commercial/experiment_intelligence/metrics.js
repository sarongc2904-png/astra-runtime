'use strict';
// [ASTRA-11K §5] Metric contract. Exactly ONE primary metric. Vague goals ("sell more",
// "improve performance") are rejected. Secondary metrics + guardrails are optional lists.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const METRIC_CONTRACT_STATUS = Object.freeze(['METRIC_CONTRACT_VALID', 'PRIMARY_METRIC_REQUIRED', 'PRIMARY_METRIC_NOT_OPERATIONAL', 'DUPLICATE_METRIC_ROLE']);

// a vague, non-operational goal
const VAGUE_RE = /^(mejorar (resultados|performance|el rendimiento|las ventas)|vender m[aá]s|más ventas|crecer|hacerlo mejor|optimizar|improve (results|performance|sales)|sell more|grow|do better)$/i;
// an operational metric name looks like a snake/kebab identifier or a known ratio
const OPERATIONAL_RE = /^[a-z][a-z0-9_]*(rate|ratio|count|revenue|margin|cost|value|cac|cpl|cpa|aov|arpu|arpa|roas|mer|ltv|payback|months|days|per_[a-z_]+)$|^[a-z][a-z0-9_]{2,}$/i;

function makeMetric(name, role) {
  return { name: String(name || '').trim(), role, operational: !VAGUE_RE.test(String(name || '').trim()) && OPERATIONAL_RE.test(String(name || '').trim().toLowerCase()) };
}

// buildMetricContract({ primary_metric, primary_metric_definition, secondary_metrics[], guardrails[] })
function buildMetricContract(x) {
  const primary = x.primary_metric ? makeMetric(x.primary_metric, 'PRIMARY') : null;
  const secondary = (x.secondary_metrics || []).map(m => makeMetric(typeof m === 'string' ? m : m.name, 'SECONDARY'));
  const guardrails = (x.guardrails || []).map(m => makeMetric(typeof m === 'string' ? m : m.name, 'GUARDRAIL'));

  let status;
  if (!primary || !primary.name) status = 'PRIMARY_METRIC_REQUIRED';
  else if (!primary.operational) status = 'PRIMARY_METRIC_NOT_OPERATIONAL';
  else {
    const names = [primary.name, ...secondary.map(m => m.name), ...guardrails.map(m => m.name)];
    const dup = names.length !== new Set(names).size;
    status = dup ? 'DUPLICATE_METRIC_ROLE' : 'METRIC_CONTRACT_VALID';
  }

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'MetricContract',
    primary_metric: primary ? primary.name : null,
    primary_metric_definition: x.primary_metric_definition ? String(x.primary_metric_definition) : null,
    primary_operational: !!(primary && primary.operational),
    secondary_metrics: secondary.map(m => m.name).sort(),
    guardrail_metrics: guardrails.map(m => m.name).sort(),
    denominator_refs: x.denominator_refs || null,
    status,
    exactly_one_primary: !!(primary && primary.name),
    note: status === 'METRIC_CONTRACT_VALID' ? 'one operational primary metric; secondary + guardrails distinct'
      : status === 'PRIMARY_METRIC_REQUIRED' ? 'no primary metric — a vague goal is not acceptable'
        : status === 'PRIMARY_METRIC_NOT_OPERATIONAL' ? 'primary metric is not an operational, measurable quantity'
          : 'a metric appears in more than one role',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.metric_contract_id = 'exmc_' + sha256Hex(canonicalize({ ...body, metric_contract_id: undefined }));
  return deepFreeze(body);
}

function validateMetricContract(m) {
  const errors = [];
  if (!METRIC_CONTRACT_STATUS.includes(m.status)) errors.push(`bad metric contract status "${m.status}"`);
  if (m.status === 'METRIC_CONTRACT_VALID' && (!m.primary_metric || !m.primary_operational)) errors.push('a VALID metric contract needs one operational primary metric');
  if (m.status === 'METRIC_CONTRACT_VALID' && new Set([m.primary_metric, ...m.secondary_metrics, ...m.guardrail_metrics]).size !== (1 + m.secondary_metrics.length + m.guardrail_metrics.length)) errors.push('metric roles must be distinct');
  return { valid: errors.length === 0, errors };
}

module.exports = { METRIC_CONTRACT_STATUS, buildMetricContract, validateMetricContract };
