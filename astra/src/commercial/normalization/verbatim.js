'use strict';
// [ASTRA-11C] Exact quote preservation (spec section E).
// verbatim_text is the source's exact words. normalized_text is DERIVED and additive.
// Normalization NEVER overwrites verbatim_text.
// No LLM, no web, no I/O.
const { sha256Hex, nfcLF, canonicalize, deepFreeze } = require('../validation/canonical');
const { normalizeText, normalizeLanguage } = require('./normalize');

// makeVerbatim({ verbatim_text, language, actor, timestamp, time_range, source_ref })
// -> frozen block with both texts + a hash over the exact bytes of the verbatim text.
function makeVerbatim(input) {
  if (input == null || typeof input !== 'object') throw new Error('makeVerbatim: object required');
  if (typeof input.verbatim_text !== 'string' || input.verbatim_text.length === 0) {
    throw new Error('makeVerbatim: verbatim_text (non-empty string) required');
  }
  const verbatim_text = input.verbatim_text; // stored EXACTLY as given (only NFC for the hash key)
  const block = {
    verbatim_text,
    normalized_text: normalizeText(verbatim_text),
    language: input.language != null ? normalizeLanguage(input.language) : null,
    actor: input.actor != null ? String(input.actor) : null, // "customer" | "agent" | speaker label
    timestamp: input.timestamp != null ? String(input.timestamp) : null,
    time_range: input.time_range != null ? input.time_range : null, // {start,end}
    source_ref: input.source_ref != null ? String(input.source_ref) : null,
    verbatim_hash: 'vb_' + sha256Hex(nfcLF(verbatim_text)),
  };
  block.content_hash = 'vbc_' + sha256Hex(canonicalize({ ...block, content_hash: undefined }));
  return deepFreeze(block);
}

// Re-derive normalized_text WITHOUT touching verbatim. Returns a NEW block.
function renormalize(block) {
  return makeVerbatim({
    verbatim_text: block.verbatim_text, language: block.language, actor: block.actor,
    timestamp: block.timestamp, time_range: block.time_range, source_ref: block.source_ref,
  });
}

// Assert the invariant: a block's verbatim_text still matches its hash (tamper detection).
function verifyVerbatim(block) {
  const errors = [];
  if (!block || typeof block.verbatim_text !== 'string') return { valid: false, errors: ['not a verbatim block'] };
  if (('vb_' + sha256Hex(nfcLF(block.verbatim_text))) !== block.verbatim_hash) errors.push('verbatim_hash mismatch — verbatim text was altered');
  return { valid: errors.length === 0, errors };
}

module.exports = { makeVerbatim, renormalize, verifyVerbatim };
