'use strict';
// [ASTRA-11F §B §Y] VocUtterance. verbatim_text is IMMUTABLE. normalized_text is additive
// only — the original customer language is never rewritten. redacted_display_text is a
// SEPARATE derived field (privacy); raw evidence is never destroyed.
// Reuses ASTRA-11B provenance + ASTRA-11C redaction. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');
const { pv } = require('../provenance/provenance');
const { normalizeText } = require('../normalization/normalize');
const { buildRedactionPlan, applyRedaction } = require('../ingestion/redaction');

const VOC_SCHEMA_VERSION = 'ucdm-voc-1.0.0';

// makeUtterance({ observation, envelope, speaker, segment_ref, journey_stage_ref, conversation_ref, redact })
function makeUtterance(input) {
  const o = input.observation;
  const vb = o && o.verbatim;
  if (!vb || typeof vb.verbatim_text !== 'string' || !vb.verbatim_text.length) throw new Error('[ASTRA-11F] makeUtterance: a QUOTE observation with verbatim_text is required');
  const speaker = input.speaker || {};

  const verbatim_text = vb.verbatim_text; // stored EXACTLY as-is
  const normalized_text = normalizeText(verbatim_text); // additive, never replaces verbatim
  let redacted_display_text = verbatim_text;
  let redaction_manifest = [];
  if (input.redact !== false) {
    const plan = buildRedactionPlan({ verbatim_text }, {});
    if (plan.plan.length) {
      const r = applyRedaction({ verbatim_text }, plan.plan);
      redacted_display_text = r.redacted.verbatim_text;
      redaction_manifest = r.manifest;
    }
  }

  const body = {
    schema_version: VOC_SCHEMA_VERSION,
    verbatim_text,                       // IMMUTABLE
    verbatim_hash: vb.verbatim_hash || ('vb_' + sha256Hex(nfcLF(verbatim_text))),
    normalized_text,                     // additive
    redacted_display_text,               // separate derived display field (privacy §Y)
    redaction_manifest,                  // [{path, class}]
    speaker_role: speaker.speaker_role || 'UNKNOWN_CUSTOMER_ROLE',
    voc_eligible: !!speaker.voc_eligible,
    speaker_ref: speaker.speaker_ref || null,
    speaker_pseudonym: speaker.speaker_pseudonym || null,
    source_type: speaker.source_type || null,
    source_ref: o.source_ref || (vb.source_ref || null),
    conversation_ref: input.conversation_ref || null,
    timestamp: (vb.timestamp) || (o.temporal && (o.temporal.event_time || o.temporal.publication_time)) || null,
    time_range: vb.time_range || null,
    language: vb.language || o.language || null,
    locale: o.locale || null,
    segment_ref: input.segment_ref || null,
    journey_stage_ref: input.journey_stage_ref || null,
    context: input.context || null,
    provenance: pv(`voc utterance from ${o.source_ref}`, 'OBSERVED', { evidence_refs: (o.provenance && o.provenance.evidence_refs) || [], as_of: (vb.timestamp) || null }),
    observation_hash: o.content_hash,
  };
  body.content_hash = 'vocu_' + sha256Hex(canonicalize({ ...body, content_hash: undefined, provenance: body.provenance.content_hash }));
  return deepFreeze(body);
}

// tamper check: verbatim still matches its hash
function verifyUtterance(u) {
  const errors = [];
  if (('vb_' + sha256Hex(nfcLF(u.verbatim_text))) !== u.verbatim_hash) errors.push('verbatim_hash mismatch — customer language was altered');
  if (u.normalized_text === u.verbatim_text && /\s{2,}|^\s|\s$/.test(u.verbatim_text)) errors.push('normalized_text was not derived');
  return { valid: errors.length === 0, errors };
}

module.exports = { VOC_SCHEMA_VERSION, makeUtterance, verifyUtterance };
