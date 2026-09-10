'use strict';
// [ASTRA-11J §AC] FunnelDiagnosis. Distinguishes a VOLUME problem, a CONVERSION problem, an
// ECONOMICS problem, a RETENTION problem, a DATA_QUALITY problem, MIXED, or INSUFFICIENT
// evidence. Analytical and non-causal unless evidence supports causality. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const DIAGNOSIS_TYPES = Object.freeze(['VOLUME_PROBLEM', 'CONVERSION_PROBLEM', 'ECONOMICS_PROBLEM', 'RETENTION_PROBLEM', 'DATA_QUALITY_PROBLEM', 'MIXED', 'INSUFFICIENT_EVIDENCE']);

// buildDiagnosis({ summary, transitions, unitEconomics, margins, retention, breakEven, roas, dataQuality })
function buildDiagnosis(x) {
  const { summary = null, transitions = [], bottlenecks = [], retention = null, margins = null, breakEven = null, roas = null, cac = null, dataQuality = null } = x;
  const findings = [];

  const validT = transitions.filter(t => t.status === 'VALID');
  const invalidT = transitions.filter(t => t.status !== 'VALID');
  const dataQualityBad = (dataQuality && dataQuality.issues && dataQuality.issues.length > 0) || (transitions.length > 0 && invalidT.length / transitions.length >= 0.5);

  if (dataQualityBad) findings.push({ type: 'DATA_QUALITY_PROBLEM', basis: `${invalidT.length}/${transitions.length} transitions unusable` + (dataQuality ? `; ${dataQuality.issues.join(', ')}` : ''), evidence_refs: [] });

  // volume: top-of-funnel volume is low relative to a supplied target, OR simply small
  if (summary && summary.top_of_funnel_volume != null) {
    if (x.volume_target != null && summary.top_of_funnel_volume < Number(x.volume_target) * 0.6) findings.push({ type: 'VOLUME_PROBLEM', basis: `top-of-funnel volume ${summary.top_of_funnel_volume} well below supplied target ${x.volume_target}`, evidence_refs: [] });
  }
  // conversion: a valid transition materially below the internal median, or a large loss
  if (validT.length >= 2 && bottlenecks.some(b => b.transition && b.reason_codes.some(r => ['LOW_TRANSITION_RATE_VS_INTERNAL_BASELINE', 'LARGE_ABSOLUTE_LOSS', 'HIGH_ECONOMIC_LOSS'].includes(r)) && !b.reason_codes.includes('POOR_RETENTION'))) {
    findings.push({ type: 'CONVERSION_PROBLEM', basis: 'a transition shows a materially low rate and/or a large absolute or economic loss vs the internal baseline', evidence_refs: bottlenecks.flatMap(b => b.evidence_refs) });
  }
  // economics
  const cacOverBreakEven = cac && cac.status && cac.status.startsWith('COMPUTED') && breakEven && breakEven.status === 'COMPUTED' && breakEven.allowable_acquisition_cost != null && cac.value > breakEven.allowable_acquisition_cost;
  const negContribution = margins && margins.contribution_margin.status === 'COMPUTED' && margins.contribution_margin.margin_amount != null && margins.contribution_margin.margin_amount < 0;
  const lowRoas = roas && roas.status === 'COMPUTED' && roas.value != null && roas.value < 1;
  if (cacOverBreakEven || negContribution || lowRoas) {
    findings.push({ type: 'ECONOMICS_PROBLEM', basis: [cacOverBreakEven && 'CAC above allowable acquisition cost', negContribution && 'negative contribution margin', lowRoas && 'ROAS < 1'].filter(Boolean).join('; '), evidence_refs: [] });
  }
  // retention
  const poorRetention = retention && retention.rates.retention_rate && retention.rates.retention_rate.status === 'VALID' && retention.rates.retention_rate.rate != null && retention.rates.retention_rate.rate < 0.5;
  if (poorRetention || bottlenecks.some(b => b.reason_codes.includes('POOR_RETENTION'))) findings.push({ type: 'RETENTION_PROBLEM', basis: 'retention rate below 0.5 on a matched cohort', evidence_refs: [] });

  let primary;
  const types = [...new Set(findings.map(f => f.type))];
  if (findings.length === 0) primary = validT.length >= 2 ? 'INSUFFICIENT_EVIDENCE' : 'INSUFFICIENT_EVIDENCE';
  else if (types.length === 1) primary = types[0];
  else primary = 'MIXED';

  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelDiagnosis',
    primary_diagnosis: primary,
    findings,
    finding_types: types.sort(),
    causal: false,
    is_recommendation: false,
    note: 'analytical diagnosis — distinguishes volume vs conversion vs economics vs retention vs data quality; not causal unless evidence supports causality',
    generated_by: 'deterministic:ucdm/funnel_revenue/diagnosis',
  };
  body.diagnosis_id = 'fdx_' + sha256Hex(canonicalize({ ...body, diagnosis_id: undefined }));
  return deepFreeze(body);
}

function validateDiagnosis(d) {
  const errors = [];
  if (!DIAGNOSIS_TYPES.includes(d.primary_diagnosis)) errors.push(`bad diagnosis type "${d.primary_diagnosis}"`);
  if (d.causal !== false) errors.push('a diagnosis is not causal by default');
  if (d.is_recommendation !== false) errors.push('a diagnosis is not a recommendation');
  return { valid: errors.length === 0, errors };
}

module.exports = { DIAGNOSIS_TYPES, buildDiagnosis, validateDiagnosis };
