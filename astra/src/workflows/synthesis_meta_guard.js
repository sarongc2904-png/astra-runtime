'use strict';

// Final-synthesis meta guard.
// Only removes unsafe items from non-core meta arrays that aggregate model assumptions/actions.
// It never edits core strategy sections. Any core-section violation still fails closed.
const PRUNABLE_FIELDS = new Set(['14_assumptions', '18_recommended_next_actions']);

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function indexFromLeafPath(fieldKey, leafPath) {
  const s = String(leafPath || '');
  const escaped = fieldKey.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|\\.)' + escaped + '\\[(\\d+)\\]');
  const m = s.match(re);
  return m ? Number(m[1]) : null;
}

function locateByText(arr, violation) {
  const needles = [violation && violation.local_clause, violation && violation.matched_text]
    .filter(x => typeof x === 'string' && x.trim())
    .map(x => x.trim().toLowerCase());
  if (!needles.length) return null;
  for (let i = 0; i < arr.length; i++) {
    const text = String(arr[i] || '').toLowerCase();
    if (needles.some(n => text.includes(n) || n.includes(text))) return i;
  }
  return null;
}

function pruneMetaViolations(synthesis, violations) {
  const repaired = clone(synthesis);
  const repairs = [];
  const byField = new Map();
  for (const v of Array.isArray(violations) ? violations : []) {
    const field = String(v && v.field_key || '');
    if (!PRUNABLE_FIELDS.has(field)) continue;
    if (!byField.has(field)) byField.set(field, []);
    byField.get(field).push(v);
  }
  for (const [field, vs] of byField) {
    const arr = repaired && repaired.deliverable && repaired.deliverable[field];
    if (!Array.isArray(arr) || !arr.length) continue;
    const indexes = new Set();
    for (const v of vs) {
      let idx = indexFromLeafPath(field, v.leaf_path);
      if (idx == null || idx < 0 || idx >= arr.length) idx = locateByText(arr, v);
      if (idx != null && idx >= 0 && idx < arr.length) indexes.add(idx);
    }
    for (const idx of [...indexes].sort((a,b)=>b-a)) {
      const removed = arr[idx];
      arr.splice(idx, 1);
      repairs.push({ repair_type: 'DROP_UNSAFE_META_ITEM', field_key: field, index: idx, removed, deterministic: true });
    }
  }
  return { synthesis: repaired, repairs };
}

module.exports = { pruneMetaViolations, PRUNABLE_FIELDS };
