'use strict';
// [ASTRA-11M §19] CommercialDecisionReport. 36 structured sections. Deterministic report_id.
// A recommendation, never an executed action. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'report_metadata', 'business_context', 'context_status', 'evidence', 'memories', 'opportunities',
  'opportunity_applicability', 'memory_reconciliation', 'constraints', 'urgency', 'impact',
  'time_to_signal', 'reversibility', 'risk', 'dependencies', 'candidate_decisions', 'ranking',
  'priority_unresolved', 'decision_conflicts', 'blocking_conflicts', 'policy', 'primary_decision',
  'secondary_decisions', 'deferred_decisions', 'blocked_decisions', 'rejected_decisions',
  'alternatives_summary', 'rationale', 'invalidators', 'limitations', 'integrity', 'boundary',
  'fabrication_guards', 'downstream_schema_versions', 'evidence_appendix', 'section_index',
]);

function sec(v) {
  const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'NONE' } : v;
}

function buildReport(x) {
  const {
    referenceTime = null, context = null, opportunities = [], applicabilities = [], reconciliations = [],
    constraintEvals = [], urgency = null, impacts = [], timeToSignals = [], reversibilities = [],
    risks = [], dependencyGraph = null, candidates = [], priority = null, conflicts = [],
    policies = [], selection = null, rationale = null, integrity = null, boundary = null,
  } = x;

  const candView = candidates.map(c => ({
    decision_id: c.decision_id, action_type: c.action_type, status: c.status, reject_code: c.reject_code,
    target: c.target, evidence_strength: c.evidence_strength, expected_impact: c.expected_impact,
    urgency: c.urgency, risk: c.risk, time_to_signal: c.time_to_signal, reversibility: c.reversibility,
    applicability_status: c.applicability_status, memory_status: c.memory_status,
    constraints: c.constraints, triggers_action: c.triggers_action,
  }));

  const appendixRefs = [...new Set(candidates.flatMap(c => c.evidence_refs))].sort();
  const entries = appendixRefs.map(er => ({ evidence_ref: er, decision_ids: candidates.filter(c => c.evidence_refs.includes(er)).map(c => c.decision_id).sort() }));

  const graphErrors = [];
  for (const c of candidates) if (c.status === 'CANDIDATE_READY' && c.evidence_refs.length === 0) graphErrors.push(`READY candidate ${c.decision_id} without evidence`);
  if (selection && selection.primary_decision) {
    const pc = candidates.find(c => c.decision_id === selection.primary_decision.decision_id);
    if (pc && pc.evidence_refs.length === 0) graphErrors.push('primary decision has no evidence refs');
    if (pc && pc.memory_status === 'DECISION_MEMORY_CONFLICT') graphErrors.push('primary decision has an unresolved memory conflict');
  }

  const report = {
    schema_version: 'ucdm-decision-orchestrator-1.0.0',
    reference_time: referenceTime,
    generated_by: 'deterministic:ucdm/decision_orchestrator',
    sections: {
      report_metadata: { engine: 'ASTRA-11M Commercial Decision Orchestrator', reference_time: referenceTime, deterministic: true, triggers_action: false },
      business_context: sec(context ? { business_id: context.business_id, scope: context.scope, decision_horizon: context.decision_horizon, risk_tolerance: context.risk_tolerance } : null),
      context_status: sec(context ? { status: context.status, missing_core_fields: context.missing_core_fields, missing_support_fields: context.missing_support_fields } : null),
      evidence: sec({ refs: appendixRefs, count: appendixRefs.length }),
      memories: sec({
        applicable: (context && context.applicable_memories || []).map(m => (m && m.memory_id) || m).sort(),
        stale: (context && context.stale_memories || []).map(m => (m && m.memory_id) || m).sort(),
        invalidated: (context && context.invalidated_memories || []).map(m => (m && m.memory_id) || m).sort(),
        active_conflicts: (context && context.active_conflicts || []),
      }),
      opportunities: sec(opportunities.map(o => ({ opportunity_id: o.opportunity_id, source_engine: o.source_engine, affected_metric: o.affected_metric, affected_funnel_transition: o.affected_funnel_transition, evidence_strength: o.evidence_strength, status: o.status, scope: o.scope }))),
      opportunity_applicability: sec(applicabilities.map(a => ({ opportunity_id: a.opportunity_id, status: a.status, blockers: a.blockers, conditions: a.conditions }))),
      memory_reconciliation: sec(reconciliations.map(r => ({ opportunity_id: r.opportunity_id, status: r.status, notes: r.notes }))),
      constraints: sec(constraintEvals.map(e => ({ opportunity_id: e.opportunity_id, status: e.status, critical_types: e.critical_types }))),
      urgency: sec(urgency ? { level: urgency.level, reasons: urgency.reasons } : null),
      impact: sec(impacts.map(i => ({ opportunity_id: i.opportunity_id, level: i.level, monetary_basis: i.monetary_basis, reasons: i.reasons }))),
      time_to_signal: sec(timeToSignals.map(t => ({ signal_class: t.signal_class, source: t.source }))),
      reversibility: sec(reversibilities.map(r => ({ opportunity_id: r.opportunity_id, reversibility: r.reversibility, requires_explicit_risk_treatment: r.requires_explicit_risk_treatment }))),
      risk: sec(risks.map(r => ({ opportunity_id: r.opportunity_id, overall: r.overall, dimensions: r.dimensions }))),
      dependencies: sec(dependencyGraph ? dependencyGraph.nodes.map(n => ({ decision_id: n.decision_id, status: n.status, requires: n.requires, edge_status: n.edge_status })) : null),
      candidate_decisions: sec(candView),
      ranking: sec(priority ? { ordering: priority.ordering, rank: priority.rank, factors: priority.factors } : null),
      priority_unresolved: sec(priority ? priority.unresolved_pairs : null),
      decision_conflicts: sec(conflicts.map(c => ({ conflict_id: c.conflict_id, decision_a: c.decision_a, decision_b: c.decision_b, kinds: c.kinds, status: c.status }))),
      blocking_conflicts: sec(conflicts.filter(c => c.status === 'BLOCKING_CONFLICT' || c.status === 'UNRESOLVED_CONFLICT').map(c => c.conflict_id).sort()),
      policy: sec(policies.map(p => ({ decision_id: p.decision_id, verdict: p.verdict, rules: p.rules }))),
      primary_decision: sec(selection ? (selection.primary_decision || { status: selection.status }) : null),
      secondary_decisions: sec(selection ? selection.secondary_decisions : null),
      deferred_decisions: sec(selection ? selection.deferred_decisions : null),
      blocked_decisions: sec(selection ? selection.blocked_decisions : null),
      rejected_decisions: sec(selection ? selection.rejected_decisions : null),
      alternatives_summary: sec(selection ? {
        primary: selection.primary_decision ? 1 : 0,
        secondary: selection.secondary_decisions.length, deferred: selection.deferred_decisions.length,
        blocked: selection.blocked_decisions.length, rejected: selection.rejected_decisions.length,
        selection_status: selection.status,
      } : null),
      rationale: sec(rationale ? {
        primary_decision_id: rationale.primary_decision_id, why_now: rationale.why_now, why_this: rationale.why_this,
        why_not_alternatives: rationale.why_not_alternatives, supporting_evidence: rationale.supporting_evidence,
        applicable_constraints: rationale.applicable_constraints, relevant_memories: rationale.relevant_memories,
      } : null),
      invalidators: sec(rationale ? rationale.invalidators : null),
      limitations: sec([
        context && context.status !== 'CONTEXT_VALID' ? `decision context is ${context.status}` : null,
        selection && selection.status !== 'PRIMARY_SELECTED' ? `no primary decision: ${selection.status}` : null,
        priority && priority.unresolved_pairs.length ? `${priority.unresolved_pairs.length} priority pair(s) unresolved` : null,
        conflicts.some(c => c.status === 'UNRESOLVED_CONFLICT' || c.status === 'BLOCKING_CONFLICT') ? 'unresolved / blocking decision conflicts present' : null,
        candidates.some(c => c.expected_impact === 'IMPACT_UNKNOWN') ? 'some candidates have UNKNOWN impact (no monetary or ordinal basis)' : null,
        candidates.some(c => c.time_to_signal === 'UNKNOWN') ? 'some candidates have UNKNOWN time-to-signal' : null,
      ].filter(Boolean)),
      integrity: sec(integrity ? {
        network_calls: integrity.network_calls, llm_calls: integrity.llm_calls, production_db_writes: integrity.production_db_writes,
        external_storage_writes: integrity.external_storage_writes, campaign_changes: integrity.campaign_changes,
        budget_changes: integrity.budget_changes, deploys: integrity.deploys, cost_usd: integrity.cost_usd, clean: integrity.clean,
      } : null),
      boundary: sec(boundary || null),
      fabrication_guards: {
        no_fake_percentages: true, no_invented_confidence: true, no_invented_expected_revenue: true,
        no_invented_runway: true, no_forced_priority: true, ordinal_when_qualitative: true,
      },
      downstream_schema_versions: { ucdm: 'ucdm-1.0.0', funnel_revenue: 'ucdm-funnel-revenue-1.0.0', experiment: 'ucdm-experiment-1.0.0', business_memory: 'ucdm-business-memory-1.0.0' },
      evidence_appendix: { count: entries.length, entries },
      section_index: SECTION_NAMES,
    },
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
    triggers_action: false,
    caveats: [
      'No decision without evidence — a candidate with insufficient evidence is INVESTIGATE / MEASURE, never a primary action.',
      'An active memory is never silently overridden — a contradiction yields DECISION_MEMORY_CONFLICT.',
      'A hypothesis influences only as a hypothesis, never as confirmed evidence.',
      'If two options cannot be ordered with sufficient evidence, priority is PRIORITY_UNRESOLVED — never a forced pick.',
      'Qualitative inputs produce ordinal ranks only. No fabricated percentages, confidence scores or expected-revenue figures.',
      'Every output carries triggers_action = false. ASTRA-11M executes nothing.',
      'Same valid input => same decision_id, same ranking, same report_id.',
    ],
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'cdr_report_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

module.exports = { SECTION_NAMES, buildReport };
