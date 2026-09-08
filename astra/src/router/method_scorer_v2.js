'use strict';
// METHOD_SCORER_V2 — orchestration-level hardened method scoring. Does NOT touch Agent V1/Strategy-F,
// and does NOT modify the ASTRA-02 method_adjudicator (kept for backward compat). Uses more metadata
// (primary_jobs, best_for, subdomain, funnel_stage, business_stage, limitations, required_inputs) plus
// node sub-intent so that SPECIFIC fit beats generic same-domain fit. Evidence-poor stays penalized.
// No universal winner. Forced bindings are handled by the workflow, not here.

const DIMS = ['problem_fit', 'sub_intent_fit', 'funnel_stage_fit', 'business_stage_fit', 'evidence_quality',
  'best_for_match', 'limitation_penalty', 'required_inputs_fit'];
const WEIGHTS = { problem_fit: 0.14, sub_intent_fit: 0.22, funnel_stage_fit: 0.12, business_stage_fit: 0.08,
  evidence_quality: 0.16, best_for_match: 0.16, limitation_penalty: 0.06, required_inputs_fit: 0.06 };

function tokens(s) { return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4); }
function overlap(aTokens, text) { const set = new Set(tokens(text)); let n = 0; for (const t of aTokens) if (set.has(t)) n++; return aTokens.length ? n / aTokens.length : 0; }

function scoreCandidate(method, ctx) {
  const subIntentTokens = tokens((ctx.sub_intent || '') + ' ' + (ctx.node_query || ''));
  const jobsText = (method.primary_jobs || []).join(' ') + ' ' + (method.best_for || []).join(' ') + ' ' + (method.subdomain || '') + ' ' + (method.method_name || '');
  const evCount = Array.isArray(method.evidence_refs) ? method.evidence_refs.length : 0;
  const per = {
    problem_fit: method.domain === ctx.domain ? 1 : 0.3,
    sub_intent_fit: overlap(subIntentTokens, jobsText),                      // specificity: sub-intent vs method jobs/best_for
    funnel_stage_fit: (method.funnel_stage || []).length === 0 ? 0.5 : ((ctx.funnel_stage || []).some(f => method.funnel_stage.includes(f)) ? 1 : 0.2),
    business_stage_fit: (method.business_stage || []).length === 0 ? 0.5 : 0.6,
    evidence_quality: evCount === 0 ? 0.0 : Math.min(1, 0.4 + 0.1 * evCount) * (method.confidence || 0.5) * 2,
    best_for_match: (method.best_for || []).length ? overlap(subIntentTokens, (method.best_for || []).join(' ')) : 0.3,
    limitation_penalty: 1 - Math.min(0.5, ((method.limitations || []).length) * 0.08),
    required_inputs_fit: 0.6,
  };
  per.evidence_quality = Math.max(0, Math.min(1, per.evidence_quality));
  const total = DIMS.reduce((s, d) => s + (per[d] || 0) * WEIGHTS[d], 0);
  return { method_id: method.method_id, per_dimension: per, total: Number(total.toFixed(4)) };
}

// candidates should already be evidence-gated by the caller (evidence_refs>0).
function select({ candidates, domain, sub_intent, node_query, funnel_stage }) {
  if (!candidates || !candidates.length) return { primary_method: null, state: 'INSUFFICIENT_EVIDENCE', scores: {}, reasons: ['no evidence-backed candidate'] };
  const scored = candidates.map(m => scoreCandidate(m, { domain, sub_intent, node_query, funnel_stage }))
    .sort((a, b) => b.total - a.total || a.method_id.localeCompare(b.method_id));
  const scoresObj = {}; scored.forEach(s => { scoresObj[s.method_id] = { total: s.total, per_dimension: s.per_dimension }; });
  const top = scored[0], runnerUp = scored[1];
  return {
    primary_method: top.method_id,
    secondary_methods: scored.slice(1, 3).map(s => s.method_id),
    rejected_methods: scored.slice(3).map(s => ({ method_id: s.method_id, reason: 'lower v2 composite (' + s.total + ')' })),
    selection_confidence: Number(Math.min(1, top.total).toFixed(3)),
    margin: runnerUp ? Number((top.total - runnerUp.total).toFixed(4)) : top.total,
    state: 'RESOLVED', scores: scoresObj,
    reasons: [`v2 scorer: sub_intent_fit weight ${WEIGHTS.sub_intent_fit} (specificity) + best_for_match; evidence-poor excluded upstream`],
  };
}

module.exports = { select, scoreCandidate, DIMS, WEIGHTS };
