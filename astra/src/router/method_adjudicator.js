'use strict';
// METHOD_ADJUDICATOR skeleton — deterministic, metadata-based scoring over 9 dimensions.
// RETRIEVAL != METHOD SELECTION: evidence_strength is ONE dimension of nine and never decides alone.
// Never hardcodes a universally-best method. Emits explicit conflict + insufficient-evidence states.

const DIMENSIONS = ['problem_fit', 'business_stage_fit', 'funnel_stage_fit', 'evidence_strength',
  'expected_impact', 'implementation_complexity', 'user_constraints', 'compatibility', 'contradiction_risk'];

// default weights (evidence_strength deliberately NOT dominant). Sum ~1.0.
const DEFAULT_WEIGHTS = {
  problem_fit: 0.18, business_stage_fit: 0.10, funnel_stage_fit: 0.12, evidence_strength: 0.14,
  expected_impact: 0.14, implementation_complexity: 0.08, user_constraints: 0.10, compatibility: 0.08, contradiction_risk: 0.06,
};

function sufficiencyToStrength(decision) {
  return decision === 'SUFFICIENT' || decision === 'FULL' ? 1.0
    : decision === 'PARTIAL' ? 0.5
    : decision === 'AMBIGUOUS' ? 0.3
    : 0.0; // INSUFFICIENT / unknown
}

// score one candidate method for a work unit. Deterministic given inputs.
function scoreCandidate(method, ctx) {
  const { brief, step, evidence } = ctx;
  const domainMatch = method.domain && step && method.domain === step.domain ? 1 : 0.4;
  const funnelMatch = (method.funnel_stage || []).length === 0 ? 0.5
    : (brief.funnel_stage || []).some(f => method.funnel_stage.includes(f)) ? 1 : 0.2;
  const stageMatch = (method.business_stage || []).length === 0 ? 0.5 : 0.6; // unknown business stage -> neutral
  const evStrength = evidence ? sufficiencyToStrength(evidence.decision) : 0.0;
  const per = {
    problem_fit: domainMatch,
    business_stage_fit: stageMatch,
    funnel_stage_fit: funnelMatch,
    evidence_strength: evStrength,
    expected_impact: domainMatch >= 1 ? 0.7 : 0.5,           // skeleton heuristic
    implementation_complexity: 0.6,                          // inverse-complexity placeholder (neutral)
    user_constraints: (brief.constraints && brief.constraints.budget) ? 0.6 : 0.7,
    compatibility: 0.7,                                      // refined once other methods chosen
    contradiction_risk: 0.8,                                // 1 = low risk; refined by conflict pass
  };
  const weights = ctx.weights || DEFAULT_WEIGHTS;
  const total = DIMENSIONS.reduce((s, d) => s + (per[d] || 0) * (weights[d] || 0), 0);
  return { method_id: method.method_id, per_dimension: per, total: Number(total.toFixed(4)) };
}

// detect conflicts declared in registry metadata among candidates
function detectConflicts(candidates) {
  const ids = new Set(candidates.map(c => c.method_id));
  const conflicts = [];
  for (const m of candidates) {
    for (const c of (m.conflicting_methods || [])) {
      if (ids.has(c)) {
        const pair = [m.method_id, c].sort();
        if (!conflicts.some(x => x.between[0] === pair[0] && x.between[1] === pair[1])) {
          conflicts.push({ between: pair, nature: 'declared_conflict', resolution: 'INSUFFICIENT_EVIDENCE' });
        }
      }
    }
  }
  return conflicts;
}

// evidenceByStep: optional map method_domain/step -> { decision } from Agent V1 classify
function adjudicate({ brief, step, candidates, evidence = null, weights = null }) {
  if (!candidates || candidates.length === 0) {
    return {
      work_unit_id: step && step.step_id, primary_method: null, secondary_methods: [], rejected_methods: [],
      hybrid_allowed: false, hybrid_strategy: null, selection_confidence: 0,
      selection_reasons: ['no candidate methods available'], method_conflicts: [],
      missing_evidence: ['no methods matched this domain — registry needs population (ASTRA-03)'],
      fallback_strategy: 'INSUFFICIENT_METHODS', state: 'INSUFFICIENT_EVIDENCE', scores: {},
    };
  }
  const scored = candidates.map(m => scoreCandidate(m, { brief, step, evidence, weights }))
    .sort((a, b) => b.total - a.total || a.method_id.localeCompare(b.method_id)); // deterministic tie-break
  const conflicts = detectConflicts(candidates);

  // evidence gate: if all evidence INSUFFICIENT, do not name a confident primary
  const evStrength = evidence ? sufficiencyToStrength(evidence.decision) : 0.0;
  const top = scored[0];
  const runnerUp = scored[1];
  const margin = runnerUp ? top.total - runnerUp.total : top.total;

  let state = 'RESOLVED';
  const missing = [];
  if (evStrength === 0.0) { state = 'INSUFFICIENT_EVIDENCE'; missing.push('Agent V1 evidence INSUFFICIENT for this unit — retrieve stronger evidence or supply user facts before committing a primary method'); }

  const selection_confidence = Number((Math.min(1, top.total) * (0.5 + 0.5 * Math.min(1, margin * 4)) * (evStrength === 0 ? 0.4 : 1)).toFixed(3));
  const hybrid_allowed = runnerUp ? margin < 0.05 && conflicts.length === 0 : false;

  const scoresObj = {}; scored.forEach(s => { scoresObj[s.method_id] = { per_dimension: s.per_dimension, total: s.total }; });

  return {
    work_unit_id: step && step.step_id,
    primary_method: state === 'INSUFFICIENT_EVIDENCE' ? null : top.method_id,
    secondary_methods: scored.slice(1, 3).map(s => s.method_id),
    rejected_methods: scored.slice(3).map(s => ({ method_id: s.method_id, reason: `lower composite score (${s.total})` })),
    hybrid_allowed,
    hybrid_strategy: hybrid_allowed ? `combine ${top.method_id} (primary framing) with ${runnerUp.method_id} where funnel-stage differs; decision boundary must be stated per sub-task` : null,
    selection_confidence,
    selection_reasons: [
      `composite score from ${DIMENSIONS.length} dimensions (evidence_strength is only one, weight ${DEFAULT_WEIGHTS.evidence_strength})`,
      `top=${top.method_id} total=${top.total}` + (runnerUp ? `, runner_up=${runnerUp.method_id} total=${runnerUp.total}, margin=${margin.toFixed(4)}` : ''),
      state === 'INSUFFICIENT_EVIDENCE' ? 'evidence gate: INSUFFICIENT — primary withheld' : 'evidence gate passed',
    ],
    method_conflicts: conflicts,
    missing_evidence: missing,
    fallback_strategy: state === 'INSUFFICIENT_EVIDENCE' ? 'escalate to RESEARCH_ENGINE or request user facts; do not guess' : `if ${top.method_id} infeasible, use ${runnerUp ? runnerUp.method_id : 'domain default'}`,
    state,
    scores: scoresObj,
  };
}

module.exports = { adjudicate, scoreCandidate, detectConflicts, DIMENSIONS, DEFAULT_WEIGHTS, sufficiencyToStrength };
