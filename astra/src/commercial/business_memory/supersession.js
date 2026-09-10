'use strict';
// [ASTRA-11L §10] Supersession. New evidence may supersede an earlier memory — it NEVER
// deletes it. Links: supersedes_memory_id / superseded_by_memory_id. NOT_SUPERSEDED /
// SUPERSEDED / PARTIALLY_SUPERSEDED. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { compareScope } = require('./scope');

const SUPERSESSION_STATUS = Object.freeze(['NOT_SUPERSEDED', 'SUPERSEDED', 'PARTIALLY_SUPERSEDED']);

// resolveSupersession(newMem, existingMemories, { referenceTime }) -> { link, status_updates }
//   A new memory supersedes an existing one when: same business_id, same semantic target,
//   compatible scope, and it is newer OR explicitly a replacement.
function resolveSupersession(newMem, existing = [], { referenceTime = null } = {}) {
  const links = [];
  const tNew = newMem.observed_at ? Date.parse(newMem.observed_at) : NaN;
  for (const m of existing) {
    if (m.business_id !== newMem.business_id) continue;
    if (m.memory_type !== newMem.memory_type) continue;
    if ((m.semantic_target || m.normalized_claim) !== (newMem.semantic_target || newMem.normalized_claim)) continue;
    if (m.memory_id === newMem.memory_id) continue;
    const scope = compareScope(newMem.scope, m.scope);
    const tOld = m.observed_at ? Date.parse(m.observed_at) : NaN;
    const newer = Number.isFinite(tNew) && Number.isFinite(tOld) && tNew > tOld;
    const explicitReplace = Array.isArray(newMem.replaces) && newMem.replaces.includes(m.memory_id);
    if (!newer && !explicitReplace) continue;
    if (scope.status === 'SCOPE_MATCH') links.push({ superseded_memory_id: m.memory_id, coverage: 'FULL', basis: explicitReplace ? 'EXPLICIT_REPLACEMENT' : 'NEWER_EVIDENCE_SAME_SCOPE' });
    else if (scope.status === 'SCOPE_PARTIAL' || scope.status === 'SCOPE_MISMATCH') links.push({ superseded_memory_id: m.memory_id, coverage: 'PARTIAL', basis: 'NEWER_EVIDENCE_OVERLAPPING_SCOPE', scope_note: scope.status });
  }

  const status = links.length === 0 ? 'NOT_SUPERSEDED'
    : links.every(l => l.coverage === 'FULL') ? 'SUPERSEDED' : 'PARTIALLY_SUPERSEDED';

  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'SupersessionResolution',
    new_memory_id: newMem.memory_id,
    status,
    supersedes: links.map(l => l.superseded_memory_id).sort(),
    links: links.sort((a, b) => (a.superseded_memory_id < b.superseded_memory_id ? -1 : 1)),
    prior_memories_deleted: false,
    note: status === 'NOT_SUPERSEDED' ? 'this memory replaces nothing'
      : status === 'SUPERSEDED' ? 'fully supersedes one or more prior memories on the same scope — prior memories are retained, marked SUPERSEDED'
        : 'partially supersedes prior memories on overlapping scope — both coexist',
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.resolution_id = 'bmss_' + sha256Hex(canonicalize({ ...body, resolution_id: undefined }));
  return deepFreeze(body);
}

function validateSupersession(s) {
  const errors = [];
  if (!SUPERSESSION_STATUS.includes(s.status)) errors.push(`bad supersession status "${s.status}"`);
  if (s.prior_memories_deleted !== false) errors.push('prior memories must never be deleted');
  if (s.status === 'SUPERSEDED' && s.links.some(l => l.coverage !== 'FULL')) errors.push('SUPERSEDED requires full coverage of every link');
  return { valid: errors.length === 0, errors };
}

module.exports = { SUPERSESSION_STATUS, resolveSupersession, validateSupersession };
