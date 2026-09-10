'use strict';
// [ASTRA-11D] Evidence aggregation (spec: EVIDENCE AGGREGATION step).
// Deterministic grouping + COMPUTED roll-ups. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');
const { makeComputedFact } = require('./market_fact');

function newestAgeDays(facts, referenceTime) {
  if (!referenceTime) return null;
  let min = null;
  for (const f of facts) {
    if (!f.observed_at) continue;
    const d = (Date.parse(referenceTime) - Date.parse(f.observed_at)) / 86400000;
    if (Number.isFinite(d) && (min == null || d < min)) min = d;
  }
  return min;
}

// aggregate(facts, { referenceTime, conflictedFactIds }) -> { aggregates[], computed_facts[] }
function aggregate(facts, { referenceTime = null, conflictedFactIds = [] } = {}) {
  const conflictedSet = new Set(conflictedFactIds);
  const groups = new Map(); // `${fact_type}::${subject_ref}` -> facts[]
  for (const f of facts) {
    const key = `${f.fact_type}::${f.subject_ref}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  const aggregates = [];
  const computed_facts = [];

  for (const [key, group] of [...groups.entries()].sort()) {
    const [fact_type, subject_ref] = key.split('::');
    const distinctSources = new Set(group.map(f => f.source_ref).filter(Boolean));
    const evidenceRefs = [...new Set(group.flatMap(f => f.evidence_refs))].sort();
    const conflictCount = group.filter(f => conflictedSet.has(f.fact_id)).length;

    // value distribution (deterministic): numeric -> {min,max,mean,values}; categorical -> counts
    const nums = group.map(f => (f.value && (f.value.amount ?? f.value.score ?? f.value.count))).filter(v => typeof v === 'number');
    const cats = group.map(f => {
      const v = f.value || {};
      return v.text || v.cta || v.guarantee || v.component || v.location || v.category || null;
    }).filter(Boolean).map(s => String(s).trim().toLowerCase());
    const catCounts = {};
    for (const c of cats) catCounts[c] = (catCounts[c] || 0) + 1;

    const distribution = nums.length
      ? { kind: 'NUMERIC', n: nums.length, min: Math.min(...nums), max: Math.max(...nums), mean: Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(6)) }
      : { kind: 'CATEGORICAL', n: cats.length, counts: catCounts };

    const conf = assess({
      evidence_count: evidenceRefs.length,
      distinct_sources: distinctSources.size,
      newest_evidence_age_days: newestAgeDays(group, referenceTime) ?? 400,
      coverage: 1,
      agree_count: group.length - conflictCount,
      conflict_count: conflictCount,
      data_quality: Number((group.reduce((s, f) => s + (f.confidence ? f.confidence.score : 0.5), 0) / group.length).toFixed(6)),
    });

    const agg = {
      schema_version: 'ucdm-research-1.0.0',
      fact_type, subject_ref,
      fact_count: group.length,
      distinct_source_count: distinctSources.size,
      distinct_source_refs: [...distinctSources].sort(),
      evidence_refs: evidenceRefs,
      conflict_count: conflictCount,
      distribution,
      confidence: conf,
      fact_ids: group.map(f => f.fact_id).sort(),
    };
    agg.aggregate_id = 'mag_' + sha256Hex(canonicalize({ ...agg, aggregate_id: undefined, confidence: conf.content_hash }));
    aggregates.push(deepFreeze(agg));

    // COMPUTED roll-up fact for a categorical majority pattern (e.g. "3 of 5 offer financing").
    if (distribution.kind === 'CATEGORICAL' && distribution.n >= 2) {
      const [topCat, topN] = Object.entries(catCounts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || [null, 0];
      if (topCat && topN >= 1) {
        computed_facts.push(makeComputedFact({
          fact_type,
          value: { pattern: topCat, present_count: topN, sample_size: distribution.n, fraction: Number((topN / distribution.n).toFixed(6)) },
          evidence_refs: evidenceRefs,
          subject_ref,
          confidence: conf,
          contributing_fact_ids: group.map(f => f.fact_id),
        }));
      }
    }
    if (distribution.kind === 'NUMERIC' && distribution.n >= 2) {
      computed_facts.push(makeComputedFact({
        fact_type,
        value: { aggregate: 'RANGE', min: distribution.min, max: distribution.max, mean: distribution.mean, sample_size: distribution.n },
        evidence_refs: evidenceRefs, subject_ref, confidence: conf,
        contributing_fact_ids: group.map(f => f.fact_id),
      }));
    }
  }
  return { aggregates, computed_facts };
}

module.exports = { aggregate };
