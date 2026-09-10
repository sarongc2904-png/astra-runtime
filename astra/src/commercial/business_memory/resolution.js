'use strict';
// [ASTRA-11L §14] Memory resolution. When several memories apply to a query, resolve
// explicitly. A conflicting memory is NEVER picked arbitrarily. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const RESOLUTION_STATUS = Object.freeze([
  'RESOLVED_SINGLE', 'RESOLVED_MULTIPLE_COMPATIBLE', 'RESOLVED_CONDITIONAL',
  'UNRESOLVED_CONFLICT', 'NO_APPLICABLE_MEMORY',
]);

// resolve({ retrievalResult, memoriesById, conflicts }) -> frozen ResolutionResult
function resolve({ retrievalResult, memoriesById = {}, conflicts = [] }) {
  const results = (retrievalResult && retrievalResult.results) || [];
  const ids = results.map(r => r.memory_id);
  const mems = ids.map(id => memoriesById[id]).filter(Boolean);

  if (mems.length === 0) return freeze({ status: 'NO_APPLICABLE_MEMORY', selected: [], note: 'no accepted memory matches the query scope/filters' });

  // any UNRESOLVED_CONFLICT / DIRECT_CONFLICT among the retrieved set?
  const relevantConflicts = conflicts.filter(c => ids.includes(c.memory_a) && ids.includes(c.memory_b) && ['DIRECT_CONFLICT', 'UNRESOLVED_CONFLICT'].includes(c.conflict_type));
  if (relevantConflicts.length) {
    return freeze({ status: 'UNRESOLVED_CONFLICT', selected: [], conflict_refs: relevantConflicts.map(c => c.conflict_id).sort(), candidate_ids: ids.sort(), note: 'retrieved memories are in an unresolved conflict — no memory is selected arbitrarily' });
  }

  // scope-conditional differences among the retrieved set?
  const conditional = conflicts.filter(c => ids.includes(c.memory_a) && ids.includes(c.memory_b) && c.conflict_type === 'SCOPE_CONDITIONAL_DIFFERENCE');
  if (conditional.length) {
    return freeze({ status: 'RESOLVED_CONDITIONAL', selected: ids.sort(), conditional_refs: conditional.map(c => c.conflict_id).sort(), note: 'multiple memories apply under different scope conditions — all returned, each conditioned on its scope' });
  }

  // single best (top of the deterministic retrieval ordering) when it dominates on scope
  const top = results[0];
  const topScopeExact = top.scope_status === 'SCOPE_MATCH';
  const otherExact = results.slice(1).filter(r => r.scope_status === 'SCOPE_MATCH');
  if (topScopeExact && otherExact.length === 0) {
    return freeze({ status: 'RESOLVED_SINGLE', selected: [top.memory_id], note: 'one memory is the exact-scope match; the rest are less specific' });
  }
  // several compatible (same claim direction) memories
  const claims = new Set(mems.map(m => m.normalized_claim));
  if (claims.size === 1 || mems.every(m => m.conflict_state === 'NO_CONFLICT')) {
    return freeze({ status: 'RESOLVED_MULTIPLE_COMPATIBLE', selected: ids.sort(), note: 'several compatible memories apply — all returned' });
  }
  return freeze({ status: 'UNRESOLVED_CONFLICT', selected: [], candidate_ids: ids.sort(), note: 'multiple memories with differing claims and no scope disambiguation — unresolved' });
}

function freeze(x) {
  const b = { schema_version: 'ucdm-business-memory-1.0.0', kind: 'ResolutionResult', arbitrary_selection: false, ...x, generated_by: 'deterministic:ucdm/business_memory' };
  b.resolution_result_id = 'bmrr_' + sha256Hex(canonicalize({ ...b, resolution_result_id: undefined }));
  return deepFreeze(b);
}

function validateResolution(r) {
  const errors = [];
  if (!RESOLUTION_STATUS.includes(r.status)) errors.push(`bad resolution status "${r.status}"`);
  if (r.arbitrary_selection !== false) errors.push('a memory is never selected arbitrarily');
  if (r.status === 'UNRESOLVED_CONFLICT' && r.selected.length > 0) errors.push('an unresolved conflict selects nothing');
  return { valid: errors.length === 0, errors };
}

module.exports = { RESOLUTION_STATUS, resolve, validateResolution };
