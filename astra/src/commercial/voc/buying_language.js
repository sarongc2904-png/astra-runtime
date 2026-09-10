'use strict';
// [ASTRA-11F §V] BuyingLanguageLibrary — exact customer language organized by aspect.
// NO generated marketing copy. Every phrase is a real customer verbatim span with evidence.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const LIBRARY_ASPECTS = Object.freeze(['PAIN', 'DESIRE', 'OBJECTION', 'FEAR', 'TRIGGER', 'DECISION_CRITERION', 'QUESTION', 'OUTCOME', 'REASON_TO_BUY', 'REASON_NOT_TO_BUY']);

const ASPECT_MAP = { COMPLAINT: 'PAIN', FRUSTRATION: 'PAIN', BARRIER: 'OBJECTION', BENEFIT: 'REASON_TO_BUY', UNCERTAINTY: 'FEAR', RISK: 'FEAR', EXPECTATION: 'DESIRE' };

// buildBuyingLanguageLibrary({ observations, questions, triggers, criteria, utterancesByHash, referenceTime })
function buildBuyingLanguageLibrary({ observations = [], questions = [], triggers = [], criteria = [], utterancesByHash = {}, referenceTime = null }) {
  const buckets = {};
  const add = (aspect, phrase, ev, sourceRef, speaker, ts) => {
    const a = LIBRARY_ASPECTS.includes(aspect) ? aspect : (ASPECT_MAP[aspect] || null);
    if (!a) return;
    buckets[a] = buckets[a] || new Map();
    const key = phrase.trim().toLowerCase();
    if (!buckets[a].has(key)) buckets[a].set(key, { phrase: phrase.trim(), variants: new Set(), sources: new Set(), speakers: new Set(), evidence: new Set(), newest_ts: null });
    const e = buckets[a].get(key);
    e.variants.add(phrase.trim());
    if (sourceRef) e.sources.add(sourceRef);
    if (speaker) e.speakers.add(speaker);
    for (const r of ev || []) e.evidence.add(r);
    if (ts && (!e.newest_ts || Date.parse(ts) > Date.parse(e.newest_ts))) e.newest_ts = ts;
  };

  for (const o of observations) if (o.status === 'OBSERVED' && !o.negated) add(o.aspect, o.exact_span.text, o.evidence_refs, o.source_ref, o.speaker_pseudonym, (utterancesByHash[o.utterance_ref] || {}).timestamp);
  for (const q of questions) add('QUESTION', q.verbatim_question, q.evidence_refs, q.source_ref, q.speaker_pseudonym, null);
  for (const t of triggers) add('TRIGGER', t.verbatim_span, t.evidence_refs, t.source_ref, t.speaker_pseudonym, null);
  for (const c of criteria) add('DECISION_CRITERION', c.verbatim_span, c.evidence_refs, c.source_ref, c.speaker_pseudonym, null);

  const library = {};
  for (const a of LIBRARY_ASPECTS) {
    const m = buckets[a];
    if (!m || m.size === 0) { library[a] = { status: 'UNKNOWN' }; continue; }
    const phrases = [...m.values()].map(e => ({
      phrase: e.phrase,
      variants: [...e.variants].sort(),
      unique_speaker_count: e.speakers.size || null,
      source_count: e.sources.size,
      evidence_refs: [...e.evidence].sort(),
      freshness: e.newest_ts ? (referenceTime ? Number(((Date.parse(referenceTime) - Date.parse(e.newest_ts)) / 86400000).toFixed(1)) : null) : null,
    })).sort((x, y) => y.source_count - x.source_count || (x.phrase < y.phrase ? -1 : 1));
    library[a] = { top_phrases: phrases.slice(0, 10), phrase_count: phrases.length, contains_generated_copy: false };
  }

  const body = {
    schema_version: 'ucdm-voc-1.0.0',
    library,
    aspects: LIBRARY_ASPECTS,
    note: 'exact customer language only — NO generated marketing copy; will later feed copy/creative systems',
    generated_by: 'deterministic:ucdm/voc',
  };
  body.library_id = 'vocbl_' + sha256Hex(canonicalize({ ...body, library_id: undefined }));
  return deepFreeze(body);
}

function validateLibrary(lib, evidenceRefSet) {
  const errors = [];
  for (const [a, section] of Object.entries(lib.library)) {
    if (section.status === 'UNKNOWN') continue;
    if (section.contains_generated_copy !== false) errors.push(`buying language section ${a} flags generated copy`);
    for (const p of section.top_phrases) {
      if (evidenceRefSet) for (const er of p.evidence_refs) if (!evidenceRefSet.has(er)) errors.push(`buying language phrase "${p.phrase}" has unresolved evidence ${er}`);
      if (p.evidence_refs.length === 0) errors.push(`buying language phrase "${p.phrase}" has no evidence`);
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { LIBRARY_ASPECTS, buildBuyingLanguageLibrary, validateLibrary };
