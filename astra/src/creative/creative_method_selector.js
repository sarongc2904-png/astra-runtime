'use strict';
// CREATIVE_METHOD_SELECTOR — routes a creative task to evidence-backed methods from ASTRA-08A ONLY.
// No universal "best" method: selection is scored from objective/medium/funnel/audience against each
// method's best_for. Every selected method keeps its provenance (chunk_ids + source) and single-source
// limitation. Selecting a method whose supporting domain is WEAK/NONE is surfaced, never hidden.
const CK = require('./creative_knowledge');

// Map each evidence-backed method to the design domains it primarily draws on (for coverage surfacing)
// and the creative signals that make it a good fit. Domains reference gap_analysis names.
const METHOD_FIT = {
  'Strategy → Concept/Idea → Campaign': {
    domains: ['advertising concept', 'single-minded proposition / smp'],
    fit: { objectives: ['awareness', 'brand', 'launch', 'campaign', 'consideration'], always: true },
    role: 'concept_engine',
  },
  'Single-Minded Proposition (SMP)': {
    domains: ['single-minded proposition / smp'],
    fit: { objectives: ['awareness', 'conversion', 'consideration', 'brand'], always: true },
    role: 'proposition',
  },
  'Visual Idea Development': {
    domains: ['visual metaphor', 'advertising concept'],
    fit: { objectives: ['awareness', 'brand', 'consideration'], mediums: ['image', 'print', 'social', 'display'] },
    role: 'visual_concept',
  },
  'Final Ad Execution and Craft': {
    domains: ['art direction', 'print advertising'],
    fit: { objectives: ['conversion', 'awareness', 'brand'], always: true },
    role: 'art_direction',
  },
  'Advertising Copywriting and Tone of Voice': {
    domains: ['copywriting for visual ads', 'headline-image relationship'],
    fit: { objectives: ['conversion', 'consideration', 'awareness'], always: true },
    role: 'copy',
  },
  'Tagline Craft': {
    domains: ['copywriting for visual ads'],
    fit: { objectives: ['brand', 'awareness', 'campaign'] },
    role: 'tagline',
  },
  'Target Audience Definition': {
    domains: ['single-minded proposition / smp'],
    fit: { always: true },
    role: 'audience',
  },
  'Ambient Advertising': {
    domains: ['advertising concept'],
    fit: { mediums: ['ambient', 'ooh', 'guerrilla', 'experiential'] },
    role: 'ambient',
  },
};

function tokens(str) { return String(str || '').toLowerCase(); }

// Score one method against the task signals.
function scoreMethod(method, signals) {
  const fitDef = METHOD_FIT[method.canonical_name];
  if (!fitDef) return null;
  const reasons = [];
  let score = 0;
  if (fitDef.fit.always) { score += 0.4; reasons.push('core method for evidence-backed creative direction'); }
  const objText = tokens(signals.objective) + ' ' + tokens(signals.funnel_stage);
  for (const o of fitDef.fit.objectives || []) if (objText.includes(o)) { score += 0.25; reasons.push(`objective/funnel matches '${o}'`); }
  const medText = tokens(signals.medium) + ' ' + tokens((signals.channels || []).join(' '));
  for (const m of fitDef.fit.mediums || []) if (medText.includes(m)) { score += 0.25; reasons.push(`medium matches '${m}'`); }
  // coverage of the method's primary domains
  const coverages = fitDef.domains.map(d => CK.coverageFor(d));
  const weakOrNone = coverages.filter(c => c.coverage_class === 'WEAK' || c.coverage_class === 'NONE');
  return {
    method, role: fitDef.role, score: Math.min(1, score), reasons,
    domains: coverages.map(c => ({ domain: c.domain_name, coverage_class: c.coverage_class })),
    coverage_limitations: weakOrNone.map(c => ({ domain: c.domain_name, coverage_class: c.coverage_class, reason: c.reason })),
    provenance: { sources: method.sources, evidence_refs: method.evidence_refs },
    single_source: (method.sources || []).length <= 1,
    confidence: method.confidence,
  };
}

// Select methods for a creative task. signals: { objective, medium, funnel_stage, audience, channels, forced_method }.
// Returns { primary, supporting[], all_scored[], forced_conflict } — fail-closed on a forced unsupported method.
function select(signals = {}) {
  const scored = CK.methods().map(m => scoreMethod(m, signals)).filter(Boolean).sort((a, b) => b.score - a.score);
  // Forced-method handling: only evidence-backed methods may be forced.
  if (signals.forced_method) {
    const forced = CK.methodByName(signals.forced_method);
    if (!forced) {
      return { ok: false, fail_closed: true, reason: 'forced_method_not_evidence_backed', forced_method: signals.forced_method, all_scored: scored };
    }
  }
  const primary = scored[0] || null;
  // Supporting = distinct roles among the next best, capped for context discipline.
  const seenRoles = new Set(primary ? [primary.role] : []);
  const supporting = [];
  for (const s of scored.slice(1)) {
    if (seenRoles.has(s.role)) continue;
    seenRoles.add(s.role); supporting.push(s);
    if (supporting.length >= 4) break;
  }
  return { ok: true, primary, supporting, all_scored: scored };
}

module.exports = { select, scoreMethod, METHOD_FIT };
