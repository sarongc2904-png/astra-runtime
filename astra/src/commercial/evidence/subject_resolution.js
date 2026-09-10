'use strict';
// [ASTRA-11C] Subject / entity resolution BOUNDARY (spec section K).
// NO fuzzy identity resolution in this gate. Explicit refs only. Unknown / ambiguous
// identity stays unresolved. No LLM decides identity here.
// No LLM, no web, no I/O.
const { deepFreeze } = require('../validation/canonical');

const SUBJECT_STATES = Object.freeze(['RESOLVED', 'UNRESOLVED', 'AMBIGUOUS']);

// makeSubjectRef({ subject_type, subject_id, candidates, label })
//   subject_id present            -> RESOLVED
//   candidates.length > 1         -> AMBIGUOUS (candidates listed, never auto-picked)
//   otherwise                     -> UNRESOLVED
function makeSubjectRef(input = {}) {
  const subject_type = input.subject_type != null ? String(input.subject_type) : null; // e.g. "Persona","Competitor","Lead", or null
  const candidates = Array.isArray(input.candidates) ? input.candidates.map(String) : [];
  let state, subject_id = null;
  if (input.subject_id != null && input.subject_id !== '') {
    state = 'RESOLVED';
    subject_id = String(input.subject_id);
  } else if (candidates.length > 1) {
    state = 'AMBIGUOUS';
  } else {
    state = 'UNRESOLVED';
  }
  return deepFreeze({
    subject_type,
    subject_id,
    candidates,
    label: input.label != null ? String(input.label) : null, // human hint only, not an identity
    state,
    resolution_method: 'EXPLICIT_ONLY', // never FUZZY, never LLM in ASTRA-11C
  });
}

function validateSubjectRef(ref) {
  const errors = [];
  if (!ref || !SUBJECT_STATES.includes(ref.state)) return { valid: false, errors: ['bad subject state'] };
  if (ref.state === 'RESOLVED' && !ref.subject_id) errors.push('RESOLVED requires subject_id');
  if (ref.state === 'AMBIGUOUS' && ref.candidates.length < 2) errors.push('AMBIGUOUS requires >= 2 candidates');
  if (ref.state !== 'RESOLVED' && ref.subject_id) errors.push('non-RESOLVED must not carry a subject_id');
  if (ref.resolution_method !== 'EXPLICIT_ONLY') errors.push('resolution_method must be EXPLICIT_ONLY in ASTRA-11C');
  return { valid: errors.length === 0, errors };
}

module.exports = { SUBJECT_STATES, makeSubjectRef, validateSubjectRef };
