'use strict';
// CREATIVE_KNOWLEDGE — single source of truth for design coverage + evidence-backed methods.
// Loads the ASTRA-08A audit artifacts (read-only). The Creative Director may ONLY assert design
// principles that map to a coverage class here, and may ONLY route to methods listed here.
// This is what makes CREATIVE_DIRECTION_MUST_BE_EVIDENCE_BOUNDED enforceable: no free-floating doctrine.
const fs = require('fs');
const path = require('path');

const AUDIT_DIR = path.join(__dirname, '..', '..', 'design_knowledge_audit');
const GAP = path.join(AUDIT_DIR, 'gap_analysis.json');
const METHODS = path.join(AUDIT_DIR, 'design_method_inventory.json');
const READINESS = path.join(AUDIT_DIR, 'creative_director_readiness.json');

// Evidence-discipline tags (authoritative for ASTRA-08B).
const EVIDENCE_TAGS = ['DIRECTLY_SUPPORTED', 'INFERENCE', 'ASSUMPTION', 'CURRENT_RESEARCH_REQUIRED'];
const COVERAGE_CLASSES = ['STRONG', 'MODERATE', 'WEAK', 'NONE'];

function readJson(p) {
  if (!fs.existsSync(p)) throw new Error(`CreativeKnowledge: required audit artifact missing (FAIL CLOSED): ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

let _cache = null;
function load() {
  if (_cache) return _cache;
  const gap = readJson(GAP);
  const methods = readJson(METHODS);
  const readiness = readJson(READINESS);
  const domains = {};
  for (const d of gap.domains || []) {
    domains[d.domain_name.toLowerCase()] = {
      domain_id: d.domain_id, domain_name: d.domain_name,
      availability: d.availability, coverage_class: d.coverage_class, reason: d.reason,
    };
  }
  const byClass = { STRONG: [], MODERATE: [], WEAK: [], NONE: [] };
  for (const d of Object.values(domains)) if (byClass[d.coverage_class]) byClass[d.coverage_class].push(d.domain_name);
  _cache = {
    domains, byClass,
    methods: (methods.methods || []).map(m => ({
      canonical_name: m.canonical_name, aliases: m.aliases || [], best_for: m.best_for,
      readiness: m.readiness, confidence: m.confidence, limitations: m.limitations || [],
      evidence_count: m.evidence_count,
      sources: (m.sources || []).map(s => ({ source_id: s.source_id, source_title: s.source_title })),
      evidence_refs: (m.evidence_refs || []).map(e => ({
        chunk_id: e.chunk_id, source_pdf_name: e.source_pdf_name, pdf_page_refs: e.pdf_page_refs, query_id: e.query_id,
      })),
    })),
    readiness: {
      decision: readiness.decision, limitations: readiness.limitations || [],
      required_scope_guard: readiness.required_scope_guard,
      single_source_concentration: (readiness.limitations || []).some(l => /one advertising book|single/i.test(l)),
    },
  };
  return _cache;
}

// Coverage class for a design domain name (case-insensitive, tolerant of near-synonyms).
const SYNONYMS = {
  'smp': 'single-minded proposition / smp',
  'single minded proposition': 'single-minded proposition / smp',
  'proposition': 'single-minded proposition / smp',
  'concept': 'advertising concept',
  'big idea': 'advertising concept',
  'idea': 'advertising concept',
  'metaphor': 'visual metaphor',
  'headline': 'headline-image relationship',
  'headline-image': 'headline-image relationship',
  'copy': 'copywriting for visual ads',
  'copywriting': 'copywriting for visual ads',
  'photography': 'photography / image direction',
  'image direction': 'photography / image direction',
  'illustration': 'photography / image direction',
  'palette': 'color',
  'colour': 'color',
  'cta': 'cta visual hierarchy',
  'hierarchy': 'visual hierarchy',
  'whitespace': 'negative space',
  'white space': 'negative space',
  'legibility': 'readability / legibility',
  'readability': 'readability / legibility',
  'density': 'information density',
  'identity': 'visual identity',
  'brand': 'branding',
  'composition': 'visual composition',
  'critique': 'creative evaluation / critique',
  'critic': 'creative evaluation / critique',
  'mobile': 'mobile-first creative',
  'mobile-first': 'mobile-first creative',
  'scroll-stop': 'scroll-stopping principles',
  'scroll stopping': 'scroll-stopping principles',
  'scroll': 'scroll-stopping principles',
  'meta': 'social / meta ad creative',
  'social': 'social / meta ad creative',
  'performance': 'performance creative',
  'grid': 'grids',
  'balance': 'balance',
  'rhythm': 'rhythm',
  'editorial': 'editorial design',
  'print': 'print advertising',
  'digital': 'digital advertising',
};

function coverageFor(domainName) {
  const k = String(domainName || '').toLowerCase().trim();
  const data = load();
  let key = k;
  if (!data.domains[key] && SYNONYMS[key]) key = SYNONYMS[key];
  if (!data.domains[key]) {
    // partial contains match against known domain names
    const hit = Object.keys(data.domains).find(dn => dn.includes(key) || key.includes(dn));
    if (hit) key = hit;
  }
  const d = data.domains[key];
  if (!d) return { domain_name: domainName, coverage_class: 'UNKNOWN', availability: 'UNKNOWN', reason: 'not an audited design domain', known: false };
  return { ...d, known: true };
}

// Map a coverage class to the evidence tag ceiling a decision in that domain may claim.
function tagCeilingForClass(coverageClass) {
  switch (coverageClass) {
    case 'STRONG': return 'DIRECTLY_SUPPORTED';
    case 'MODERATE': return 'INFERENCE';
    case 'WEAK': return 'ASSUMPTION';
    case 'NONE': return 'CURRENT_RESEARCH_REQUIRED';
    default: return 'ASSUMPTION';
  }
}

function methods() { return load().methods; }
function methodByName(name) {
  const q = String(name || '').toLowerCase();
  return load().methods.find(m => m.canonical_name.toLowerCase() === q || (m.aliases || []).some(a => a.toLowerCase() === q)) || null;
}
function readiness() { return load().readiness; }
function domainsByClass(cls) { return (load().byClass[cls] || []).slice(); }

module.exports = {
  EVIDENCE_TAGS, COVERAGE_CLASSES, SYNONYMS,
  load, coverageFor, tagCeilingForClass, methods, methodByName, readiness, domainsByClass,
};
