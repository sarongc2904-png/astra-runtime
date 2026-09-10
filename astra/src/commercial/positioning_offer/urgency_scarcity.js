'use strict';
// [ASTRA-11I §Q] Urgency / scarcity discipline. ASTRA NEVER manufactures false urgency or
// scarcity. A real urgency/scarcity element exists only when the business supplies it with a
// concrete operational / capacity / deadline basis. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const BASIS = Object.freeze(['REAL_OPERATIONAL', 'REAL_CAPACITY', 'REAL_DEADLINE', 'USER_PROVIDED', 'UNSUPPORTED', 'UNKNOWN']);

// classifyUrgencyScarcity({ businessInput, journeyResult }) -> frozen
function classifyUrgencyScarcity({ businessInput = {}, journeyResult = null } = {}) {
  const so = businessInput.supplied_offer || {};
  const rows = [];
  const classify = (kind, supplied) => {
    if (!supplied) return { kind, basis: 'UNKNOWN', detail: null, evidence_refs: [] };
    const b = String(supplied.basis || '').toUpperCase();
    let basis;
    if (['REAL_OPERATIONAL', 'REAL_CAPACITY', 'REAL_DEADLINE'].includes(b)) basis = b;
    else if (b === 'USER_PROVIDED' && supplied.detail) basis = 'USER_PROVIDED';
    // a bare detail with no concrete operational/capacity/deadline basis is a marketing claim, not a real element
    else basis = 'UNSUPPORTED';
    return { kind, basis, detail: supplied.detail ? String(supplied.detail) : null, evidence_refs: [...new Set(supplied.evidence_refs || [])].sort() };
  };
  rows.push(classify('URGENCY', so.urgency));
  rows.push(classify('SCARCITY', so.scarcity));

  // customer-side deadline signal (from ASTRA-11H triggers) — informational, does NOT create an offer urgency element
  const customerDeadline = ((journeyResult && journeyResult.triggers) || []).some(t => t.category === 'DEADLINE');

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'UrgencyScarcity',
    elements: rows.map(r => deepFreeze({ ...r, manufactured: false, note: r.basis === 'UNSUPPORTED' ? 'supplied without a concrete basis — flagged UNSUPPORTED, not used as a real element' : r.basis === 'UNKNOWN' ? 'no urgency/scarcity element' : 'supplied with a concrete basis' })),
    customer_deadline_signal_present: customerDeadline,
    manufactured_any: false,
    note: 'ASTRA never manufactures urgency or scarcity; a customer deadline signal is informational only',
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.urgency_scarcity_id = 'us_' + sha256Hex(canonicalize({ ...body, urgency_scarcity_id: undefined }));
  return deepFreeze(body);
}

function validateUrgencyScarcity(u) {
  const errors = [];
  if (u.manufactured_any !== false) errors.push('no urgency/scarcity may be manufactured');
  for (const e of u.elements) {
    if (!BASIS.includes(e.basis)) errors.push(`bad urgency/scarcity basis "${e.basis}"`);
    if (e.manufactured !== false) errors.push('an urgency/scarcity element must not be manufactured');
    if (['REAL_OPERATIONAL', 'REAL_CAPACITY', 'REAL_DEADLINE', 'USER_PROVIDED'].includes(e.basis) && !e.detail) errors.push('a real urgency/scarcity element needs a supplied detail');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { BASIS, classifyUrgencyScarcity, validateUrgencyScarcity };
