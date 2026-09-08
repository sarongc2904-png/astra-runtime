'use strict';
// Base specialist — enforces the SPECIALIST_INPUT / SPECIALIST_OUTPUT contract.
// Thin + deterministic (no LLM generation) so the first vertical slice cannot fabricate.
// Recommendations are method-derived and marked INFERENCE; findings cite Agent V1 evidence.

const REQUIRED_INPUT = ['task_id', 'work_unit_id', 'specialist_type', 'task_brief', 'upstream_outputs',
  'selected_methods', 'knowledge_evidence', 'constraints', 'output_requirements'];
const OUTPUT_KEYS = ['task_id', 'specialist_type', 'status', 'findings', 'recommendations', 'decisions',
  'assumptions', 'evidence_used', 'method_used', 'conflicts', 'confidence', 'downstream_payload'];

function validateInput(input) {
  const errors = [];
  for (const k of REQUIRED_INPUT) if (!(k in input)) errors.push('missing input field: ' + k);
  return { valid: errors.length === 0, errors };
}

// Turn a node's evidence bundle (Agent V1 hits) into cited INTERNAL_KNOWLEDGE findings.
function findingsFromEvidence(evidence, maxItems = 4) {
  return (evidence || []).slice(0, maxItems).map(e => ({
    claim: 'Evidence retrieved from the knowledge base relevant to this node.',
    source_class: 'INTERNAL_KNOWLEDGE',
    evidence_refs: [{ chunk_id: e.chunk_id, source_id: e.source_id || null, source_pdf_name: e.source_pdf_name || null }],
    snippet: String(e.text || '').replace(/\s+/g, ' ').trim().slice(0, 220),
  }));
}

// method-derived recommendations (INFERENCE), one per primary_job of the selected method.
function recommendationsFromMethod(method) {
  if (!method || !Array.isArray(method.primary_jobs)) return [];
  return method.primary_jobs.map(j => ({ recommendation: j, source_class: 'INFERENCE', basis: 'method primary_job (' + method.method_id + ')' }));
}

// current-platform gaps -> CURRENT_RESEARCH_REQUIRED items (never fabricated).
function currentResearchFromMethod(method) {
  if (!method || !Array.isArray(method.not_recommended_for)) return [];
  return method.not_recommended_for.map(x => ({ item: x, reason: 'not covered by validated evidence (coverage MODERATE); requires current external research', flag: 'CURRENT_RESEARCH_REQUIRED' }));
}

function makeOutput(input, partial) {
  const method = (input.selected_methods && input.selected_methods.primary_method_object) || null;
  const base = {
    task_id: input.task_id,
    specialist_type: input.specialist_type,
    status: 'COMPLETE',
    findings: findingsFromEvidence(input.knowledge_evidence),
    recommendations: recommendationsFromMethod(method),
    decisions: [],
    assumptions: [],
    evidence_used: (input.knowledge_evidence || []).map(e => e.chunk_id),
    method_used: (input.selected_methods && input.selected_methods.primary_method) || null,
    conflicts: [],
    confidence: method ? Math.min(0.5, method.confidence || 0.4) : 0.3,
    current_research_required: [],
    downstream_payload: {},
  };
  const out = Object.assign(base, partial || {});
  // guarantee contract keys present
  for (const k of OUTPUT_KEYS) if (!(k in out)) out[k] = base[k];
  return out;
}

module.exports = { REQUIRED_INPUT, OUTPUT_KEYS, validateInput, findingsFromEvidence, recommendationsFromMethod, currentResearchFromMethod, makeOutput };
