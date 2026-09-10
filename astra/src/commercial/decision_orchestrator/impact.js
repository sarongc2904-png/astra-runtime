'use strict';
// [ASTRA-11M §7] Impact model. Derives impact from real evidence only. Uses a monetary basis
// when one is explicitly present; otherwise ordinal. Never invents "+$43,210 expected revenue".
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

function assessImpact(opp, ctx) {
  const basis = opp.impact_basis;
  const reasons = [];
  let level = 'IMPACT_UNKNOWN';
  let monetary_basis = null;

  if (basis && typeof basis === 'object') {
    // explicit measured figures only — these come from 11J diagnostics, not from us
    const affectedRevenue = basis.affected_revenue != null ? Number(basis.affected_revenue) : null;
    const affectedVolume = basis.affected_volume != null ? Number(basis.affected_volume) : null;
    const affectedMarginPct = basis.affected_margin_pct != null ? Number(basis.affected_margin_pct) : null;
    if (affectedRevenue != null || affectedVolume != null || affectedMarginPct != null) {
      monetary_basis = {
        affected_revenue: affectedRevenue, affected_volume: affectedVolume,
        affected_margin_pct: affectedMarginPct, currency: basis.currency || null,
        source_report_id: basis.source_report_id || opp.source_report_id || null,
        note: 'measured by upstream engine — ASTRA-11M did not compute or project this',
      };
    }
    const rank = basis.rank || basis.impact_rank;
    if (C.IMPACT.includes(rank)) { level = rank; reasons.push(`upstream impact rank ${rank}`); }
    else if (affectedRevenue != null) {
      const totalRev = (ctx.current_revenue_state && Number(ctx.current_revenue_state.revenue)) || null;
      if (totalRev && totalRev > 0) {
        const share = affectedRevenue / totalRev;
        level = share >= 0.2 ? 'IMPACT_HIGH' : share >= 0.05 ? 'IMPACT_MEDIUM' : 'IMPACT_LOW';
        reasons.push(`affected revenue ${(share * 100).toFixed(1)}% of stated total`);
      } else { reasons.push('affected revenue given but no total to compare — ordinal unknown'); }
    } else if (affectedVolume != null) {
      const totalVol = basis.funnel_total_volume != null ? Number(basis.funnel_total_volume) : null;
      if (totalVol && totalVol > 0) {
        const share = affectedVolume / totalVol;
        level = share >= 0.25 ? 'IMPACT_HIGH' : share >= 0.08 ? 'IMPACT_MEDIUM' : 'IMPACT_LOW';
        reasons.push(`affected funnel volume ${(share * 100).toFixed(1)}% of stated total`);
      }
    }
  } else if (C.IMPACT.includes(basis)) {
    level = basis; reasons.push(`declared impact ${basis}`);
  }

  // evidence strength caps the impact claim
  if (opp.evidence_strength === 'EVIDENCE_WEAK' && level === 'IMPACT_HIGH') { level = 'IMPACT_MEDIUM'; reasons.push('capped to MEDIUM — evidence only WEAK'); }
  if (opp.evidence_strength === 'EVIDENCE_NONE') { level = 'IMPACT_UNKNOWN'; reasons.push('no evidence — impact cannot be claimed'); }

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'ImpactAssessment',
    opportunity_id: opp.opportunity_id,
    level, monetary_basis, reasons: reasons.sort(),
    fabricated_projection: false,
    generated_by: 'deterministic:ucdm/decision_orchestrator/impact',
  };
  body.assessment_id = 'dim_' + sha256Hex(canonicalize({ ...body, assessment_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateImpact(i) {
  const errors = [];
  if (!C.IMPACT.includes(i.level)) errors.push(`bad impact level "${i.level}"`);
  if (i.fabricated_projection !== false) errors.push('impact projection must never be fabricated');
  if (i.level !== 'IMPACT_UNKNOWN' && i.reasons.length === 0) errors.push('impact asserted without a reason');
  return { valid: errors.length === 0, errors };
}

module.exports = { assessImpact, validateImpact };
