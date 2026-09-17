'use strict';

const FORMAL_DESIGN = new Set([
  'GRAPHIC_DESIGN_SOLUTIONS_4E_ROBIN_LANDA.md',
  'THE_ELEMENTS_OF_GRAPHIC_DESIGN_ALEX_WHITE.md',
]);
const ADVERTISING = new Set([
  'HEY_WHIPPLE_SQUEEZE_THIS_LUKE_SULLIVAN.md',
  'THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md',
]);
const META_CURRENT = new Set([
  '20_META_ADS_2026.md',
  'Velocity — Facebook Marketing / Facebook Ads [six-video transcript bundle]',
  'Estudio de Mercado Meta Ads Mexico.md',
]);
const ANDROMEDA = new Set(['META_ANDROMEDA_VERIFIED_2026.md']);

function classifyRequest(input = '') {
  const text = String(input).toLowerCase();
  const wantsCopy = /(copy|headline|titular|texto|gancho|hook|slogan|tagline)/i.test(text);
  const explicitVisual = /(diseñ|design|creativ|banner|poster|imagen|visual|layout|tipograf|color|composici|jerarqu|espacio negativo|direcci[oó]n de arte|art direction)/i.test(text);
  const genericAd = /(anuncio|\bad\b)/i.test(text);
  const copyOnly = wantsCopy && !explicitVisual;
  const wantsVisual = explicitVisual || (genericAd && !copyOnly);
  const wantsMeta = /(meta ads|facebook ads|instagram ads|campaña|andromeda)/i.test(text);
  const wantsAndromeda = /andromeda/i.test(text);
  return { wantsVisual, wantsCopy, wantsMeta, wantsAndromeda, copyOnly };
}

function buildPlan(input = '') {
  const intent = classifyRequest(input);
  const queries = [];
  if (intent.wantsVisual) {
    queries.push({family:'formal_design', query:`visual hierarchy composition typography color negative space for: ${input}`});
    queries.push({family:'advertising', query:`advertising concept art direction headline image relationship for: ${input}`});
  }
  if (intent.wantsCopy && !intent.wantsVisual) {
    queries.push({family:'advertising', query:`advertising copy headline single-minded proposition for: ${input}`});
  }
  if (intent.wantsMeta) {
    queries.push({family:'meta_current', query:`current Meta Ads creative delivery optimization evidence for: ${input}`});
  }
  if (intent.wantsAndromeda) {
    queries.push({family:'andromeda_local', query:`Meta Andromeda retrieval personalization creative diversity evidence for: ${input}`});
  }
  return {
    policy:'NO_CREATIVE_WITHOUT_EVIDENCE',
    intent,
    queries,
    max_total_evidence_chunks:12,
  };
}

function normalizeSource(e = {}) {
  return e.source_file || e.source_pdf_name || e.sourceDocument || null;
}

function validateEvidence(input, evidence = []) {
  const intent = classifyRequest(input);
  const sources = new Set(evidence.map(normalizeSource).filter(Boolean));
  const formal = [...sources].filter(s => FORMAL_DESIGN.has(s));
  const advertising = [...sources].filter(s => ADVERTISING.has(s));
  const meta = [...sources].filter(s => META_CURRENT.has(s));
  const andromeda = [...sources].filter(s => ANDROMEDA.has(s));
  const violations = [];

  if (intent.wantsVisual && formal.length < 1) violations.push('MISSING_FORMAL_DESIGN_EVIDENCE');
  if ((intent.wantsVisual || intent.wantsCopy) && advertising.length < 1) violations.push('MISSING_ADVERTISING_CONCEPT_OR_COPY_EVIDENCE');
  if (intent.wantsVisual && new Set([...formal, ...advertising]).size < 2) violations.push('INSUFFICIENT_DISTINCT_DESIGN_SOURCES');
  if (intent.wantsMeta && meta.length < 1) violations.push('MISSING_CURRENT_META_EVIDENCE');
  if (intent.wantsAndromeda && andromeda.length < 1) violations.push('MISSING_VERIFIED_ANDROMEDA_EVIDENCE');

  const ready = violations.length === 0;
  return {
    status: ready ? 'READY_WITH_EVIDENCE' : 'BLOCKED_OR_GAP',
    ready,
    source_counts:{formal_design:formal.length, advertising:advertising.length, meta_current:meta.length, andromeda:andromeda.length, distinct_total:sources.size},
    violations,
    rule:'A creative deliverable may not be marked READY unless required evidence families are present.',
  };
}

module.exports = { classifyRequest, buildPlan, validateEvidence, FORMAL_DESIGN, ADVERTISING, META_CURRENT, ANDROMEDA };
