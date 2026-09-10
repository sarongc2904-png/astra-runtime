'use strict';
// [ASTRA-11F §M §N §S] Deterministic taxonomy/rule-based VocCluster + frequency discipline
// + deterministic representative-quote selection. NO LLM clustering. Duplicate evidence
// cannot inflate counts. Denominator discipline is explicit. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

// buildClusters(observations, utterancesByHash) -> [VocCluster]
// A cluster = all OBSERVED observations sharing (aspect, canonical_concept).
function buildClusters(observations, utterancesByHash, { referenceTime = null } = {}) {
  const groups = new Map();
  for (const o of observations) {
    if (o.status !== 'OBSERVED') continue;
    const key = `${o.aspect}::${o.normalized_concept}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  const clusters = [];
  for (const [key, obs] of [...groups.entries()].sort()) {
    const [aspect, concept] = key.split('::');
    // --- deterministic frequency discipline (§N) ---
    const observation_count = obs.length;
    const utterance_refs = [...new Set(obs.map(o => o.utterance_ref))].sort();
    const utterance_count = utterance_refs.length;
    const source_refs = [...new Set(obs.map(o => o.source_ref).filter(Boolean))].sort();
    const unique_source_count = source_refs.length;
    const speakerIds = obs.map(o => o.speaker_pseudonym).filter(Boolean);
    const unique_speaker_count = new Set(speakerIds).size || null; // null when speakers not identifiable
    const knownSpeakerObs = obs.filter(o => o.speaker_pseudonym).length;
    const segment_refs = [...new Set(obs.map(o => o.segment_ref).filter(Boolean))].sort();

    // dedup: identical exact_span from the same source is one observation for prevalence
    const dedupKeys = new Set(obs.map(o => `${o.source_ref}::${o.exact_span.text.toLowerCase()}`));
    const deduped_observation_count = dedupKeys.size;

    const reps = selectRepresentativeQuotes(obs, utterancesByHash);
    const conf = assess({
      evidence_count: [...new Set(obs.flatMap(o => o.evidence_refs))].length,
      distinct_sources: unique_source_count, newest_evidence_age_days: 90, coverage: 0.6,
      agree_count: obs.length, conflict_count: obs.filter(o => o.polarity === 'NEGATIVE').length && obs.filter(o => o.polarity === 'POSITIVE').length ? 1 : 0,
      data_quality: 0.6,
    });

    const c = {
      schema_version: 'ucdm-voc-1.0.0',
      method: 'deterministic-taxonomy',
      aspect, canonical_concept: concept,
      observation_refs: obs.map(o => o.observation_id).sort(),
      utterance_refs,
      segment_refs,
      frequency: {
        observation_count, deduped_observation_count, utterance_count,
        unique_source_count, unique_speaker_count,
        known_speaker_observations: knownSpeakerObs, unknown_speaker_observations: observation_count - knownSpeakerObs,
        denominator_note: unique_speaker_count
          ? `${unique_speaker_count} unique observed speakers (of the speaker-identifiable subset)`
          : `${deduped_observation_count} independent observations across ${unique_source_count} sources — speaker count not determinable, do NOT express as "% of customers"`,
      },
      representative_quotes: reps,
      polarity_mix: polarityMix(obs),
      confidence: conf,
    };
    c.cluster_id = 'vocc_' + sha256Hex(canonicalize({ ...c, cluster_id: undefined, confidence: conf.content_hash }));
    clusters.push(deepFreeze(c));
  }
  return clusters;
}

function polarityMix(obs) {
  const m = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, UNKNOWN: 0, MIXED: 0 };
  for (const o of obs) m[o.polarity] = (m[o.polarity] || 0) + 1;
  return m;
}

// §S — deterministic representative quotes. Criteria: directness (matched rule + short span),
// non-duplication (distinct source + distinct span), then stable sort by observation_id.
function selectRepresentativeQuotes(obs, utterancesByHash, max = 3) {
  const scored = obs.map(o => {
    const u = utterancesByHash[o.utterance_ref];
    return {
      o, u,
      directness: (o.exact_span.text.length <= 80 ? 1 : 0) + (o.negated ? 0 : 1) + (o.prior_experience ? 0 : 1),
      key: `${o.source_ref}::${o.exact_span.text.toLowerCase()}`,
    };
  });
  scored.sort((a, b) => b.directness - a.directness || (a.o.observation_id < b.o.observation_id ? -1 : 1));
  const seen = new Set(); const out = [];
  for (const s of scored) {
    if (seen.has(s.key) || seen.has(s.o.source_ref)) continue;
    seen.add(s.key); seen.add(s.o.source_ref);
    out.push(deepFreeze({
      quote_kind: 'VERBATIM_QUOTE',              // never a paraphrase
      verbatim_text: s.o.exact_span.text,
      full_utterance_verbatim: s.u ? s.u.verbatim_text : null,
      verbatim_hash: s.u ? s.u.verbatim_hash : null,
      redacted_display_text: s.u ? s.u.redacted_display_text : s.o.exact_span.text,
      speaker_role: s.o.speaker_role,
      speaker_pseudonym: s.o.speaker_pseudonym,
      source_ref: s.o.source_ref,
      evidence_refs: s.o.evidence_refs,
      is_paraphrase: false,
    }));
    if (out.length >= max) break;
  }
  return out;
}

function validateCluster(c, evidenceRefSet) {
  const errors = [];
  if (c.method !== 'deterministic-taxonomy') errors.push('cluster must be deterministic in ASTRA-11F');
  if (evidenceRefSet) for (const rep of c.representative_quotes) for (const er of rep.evidence_refs) if (!evidenceRefSet.has(er)) errors.push(`cluster ${c.cluster_id}: representative quote evidence ${er} not resolvable`);
  for (const rep of c.representative_quotes) { if (rep.quote_kind !== 'VERBATIM_QUOTE' || rep.is_paraphrase) errors.push('a representative quote must be an actual verbatim span, never a paraphrase'); }
  return { valid: errors.length === 0, errors };
}

module.exports = { buildClusters, selectRepresentativeQuotes, validateCluster };
