'use strict';
// [ASTRA-11M §11] Dependency graph between decision candidates. "Scale ads" makes no sense
// while tracking is invalid, the offer is unvalidated or sales capacity is short. Edges:
// requires / blocks. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

// well-known preconditions keyed by opportunity signature
function derivePrereqs(opp, ctx) {
  const pre = [];
  const m = String(opp.affected_metric || '').toLowerCase();
  const t = String(opp.affected_funnel_transition || '').toLowerCase();
  const fs = ctx.current_funnel_state || {};
  const scaling = /scal|spend|budget|acqui|traffic|ads|leads|volume/.test(m + t) || opp.action_hint === 'SCALE';
  if (scaling) {
    if (fs.tracking_status && String(fs.tracking_status).toUpperCase() !== 'VALID') pre.push('VALID_TRACKING');
    if (fs.offer_validation_state && String(fs.offer_validation_state).toUpperCase() !== 'VALIDATED') pre.push('VALIDATED_OFFER');
    if (fs.downstream_bottleneck) pre.push(`RESOLVE_BOTTLENECK:${fs.downstream_bottleneck}`);
    const cap = ctx.operational_capacity || {};
    if (cap.sales_state === 'SATURATED' || cap.state === 'SATURATED') pre.push('SALES_CAPACITY');
  }
  return pre;
}

function buildDependencyGraph(candidates, ctx, oppById) {
  oppById = oppById || {};
  const satisfied = new Set((ctx.current_constraints || []).filter(c => c && c.type === 'DEPENDENCY_READY').map(c => c.dependency));
  const missing = new Set((ctx.current_constraints || []).filter(c => c && c.type === 'DEPENDENCY_MISSING').map(c => c.dependency));

  const nodes = candidates.map(cand => {
    const declared = (cand.dependencies || []).slice();
    const derived = derivePrereqs(oppById[(cand.opportunity_refs || [])[0]] || cand._opportunity || {}, ctx);
    const requires = [...new Set([...declared, ...derived])].sort();
    const edgeStatus = {};
    for (const r of requires) {
      // is another candidate satisfying r?
      const satisfiedByCandidate = candidates.some(o => o !== cand && (o.provides || []).includes(r));
      if (missing.has(r)) edgeStatus[r] = 'DEPENDENCY_BLOCKED';
      else if (satisfied.has(r) || satisfiedByCandidate) edgeStatus[r] = 'DEPENDENCY_SATISFIED';
      else if (/^RESOLVE_BOTTLENECK|VALID_TRACKING|VALIDATED_OFFER|SALES_CAPACITY$/.test(r)) edgeStatus[r] = 'DEPENDENCY_MISSING';
      else edgeStatus[r] = 'DEPENDENCY_UNKNOWN';
    }
    const worst = Object.values(edgeStatus).sort((a, b) => C.ordinalIndex(C.DEPENDENCY_STATUS, b) - C.ordinalIndex(C.DEPENDENCY_STATUS, a))[0]
      || (requires.length ? 'DEPENDENCY_UNKNOWN' : 'DEPENDENCY_SATISFIED');
    return {
      dependency_id: 'ddep_' + sha256Hex(canonicalize({ d: cand.decision_id, requires })).slice(0, 36),
      decision_id: cand.decision_id,
      requires, edge_status: edgeStatus,
      blocks: (cand.blocks || []).slice().sort(),
      status: worst === 'DEPENDENCY_BLOCKED' ? 'DEPENDENCY_BLOCKED'
        : Object.values(edgeStatus).includes('DEPENDENCY_MISSING') ? 'DEPENDENCY_MISSING'
        : Object.values(edgeStatus).includes('DEPENDENCY_UNKNOWN') ? 'DEPENDENCY_UNKNOWN'
        : 'DEPENDENCY_SATISFIED',
    };
  });

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'DependencyGraph',
    nodes: nodes.sort((a, b) => a.decision_id.localeCompare(b.decision_id)),
    generated_by: 'deterministic:ucdm/decision_orchestrator/dependencies',
  };
  body.graph_id = 'ddg_' + sha256Hex(canonicalize({ ...body, graph_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateDependencyGraph(g) {
  const errors = [];
  for (const n of g.nodes) if (!C.DEPENDENCY_STATUS.includes(n.status)) errors.push(`bad dependency status for ${n.decision_id}`);
  return { valid: errors.length === 0, errors };
}

module.exports = { derivePrereqs, buildDependencyGraph, validateDependencyGraph };
