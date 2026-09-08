'use strict';
// CREATIVE_COMMAND_PARSER — normalizes user creative commands into EXPLICIT constraints.
// Commands are never opaque magic tokens: each expands to concrete, machine-usable constraint deltas.
// Commands that touch WEAK/NONE design domains attach a limitation + evidence tag so the Creative
// Director cannot silently upgrade unsupported craft into authoritative doctrine.
const CK = require('./creative_knowledge');

// Each command → { constraints (merged into the creative constraint object), touches (design domains),
//   note (human-readable expansion), preset (true if a user art-direction preset, not evidence theory) }.
const COMMANDS = {
  '/creativo': {
    note: 'Full creative-direction mode: develop concept, art direction, copy direction, and QA.',
    constraints: { mode_hint: 'SINGLE_CREATIVE', develop_concept: true },
    touches: ['advertising concept', 'art direction'],
  },
  '/editorialad': {
    note: 'Editorial/premium ad look: refined type, generous negative space, restrained palette.',
    constraints: { style: 'editorial_premium', typography_emphasis: 'refined', negative_space: 'generous', information_density: 'low' },
    touches: ['editorial design', 'typography', 'negative space'],
  },
  '/minimalcopy': {
    note: 'Reduce information density; one dominant headline; preserve exactly one primary CTA.',
    constraints: { information_density: 'minimal', dominant_headline: true, max_copy_blocks: 1, primary_cta_count: 1 },
    touches: ['information density', 'copywriting for visual ads'],
  },
  '/oneidea': {
    note: 'Enforce one dominant idea; reject competing secondary concepts.',
    constraints: { single_idea: true, reject_secondary_concepts: true },
    touches: ['advertising concept', 'single-minded proposition / smp'],
  },
  '/highcontrast': {
    note: 'Strong foreground/background separation; clear focal hierarchy; readable typography.',
    constraints: { contrast: 'high', focal_hierarchy: 'clear', typography_legibility: 'high' },
    touches: ['contrast', 'visual hierarchy', 'readability / legibility'],
  },
  '/mobilefirst': {
    note: 'Optimize small-screen readability; reduce complexity; preserve safe zones.',
    constraints: { primary_surface: 'mobile', information_density: 'low', safe_zones: true, min_text_scale: 'large' },
    touches: ['mobile-first creative'],
  },
  '/3secondread': {
    note: 'Dominant message understandable at first glance; eliminate copy that competes with the headline.',
    constraints: { first_glance_clarity: true, dominant_headline: true, suppress_competing_copy: true },
    touches: ['scroll-stopping principles', 'visual hierarchy'],
  },
  '/safezone': {
    note: 'Reserve edge margins and UI-safe regions; keep critical content away from crop/interface areas.',
    constraints: { safe_zones: true, edge_margin_reserve: true },
    touches: ['information density'],
  },
  '/ugcstyle': {
    note: 'User-generated / native look: authentic, unpolished, creator-shot framing.',
    constraints: { style: 'ugc_native', production_polish: 'low', framing: 'handheld_authentic' },
    touches: ['social / meta ad creative', 'photography / image direction'],
  },
  '/creator-ad': {
    note: 'Creator-led ad: person-to-camera, personal endorsement framing.',
    constraints: { style: 'creator_led', framing: 'direct_to_camera', subject: 'creator_persona' },
    touches: ['social / meta ad creative'],
  },
  '/native-content': {
    note: 'Native/editorial-content feel that matches the surrounding feed rather than a hard ad.',
    constraints: { style: 'native_content', ad_signals: 'reduced' },
    touches: ['social / meta ad creative', 'editorial design'],
  },
  '/direct-to-camera': {
    note: 'Subject addresses camera directly; eye contact; single dominant subject.',
    constraints: { framing: 'direct_to_camera', subject_count: 1 },
    touches: ['photography / image direction'],
  },
  '/napkin-sketch': {
    note: 'Rough hand-sketch aesthetic used to foreground the idea over polish.',
    constraints: { style: 'sketch', production_polish: 'rough', idea_over_polish: true },
    touches: ['visual metaphor', 'advertising concept'],
  },
  '/strategy-sketch': {
    note: 'Concept-first schematic: show the mechanism/idea structure, minimal finish.',
    constraints: { style: 'schematic', idea_over_polish: true, show_mechanism: true },
    touches: ['advertising concept', 'visual metaphor'],
  },
  '/retro': {
    note: 'Retro visual treatment mapped ONLY to supported style constraints (palette, type tone); no claimed historical doctrine.',
    constraints: { style: 'retro', palette_bias: 'vintage', typography_tone: 'vintage' },
    touches: ['color', 'typography'], preset: true,
  },
  '/fantasma': {
    note: 'User-provided art-direction preset "fantasma"; treated as a user preference, not evidence-backed design theory.',
    constraints: { style_preset: 'fantasma' },
    touches: [], preset: true,
  },
};

const ALIASES = { '/creative': '/creativo', '/1idea': '/oneidea', '/mobile': '/mobilefirst', '/3s': '/3secondread', '/ugc': '/ugcstyle' };

function normalizeToken(tok) {
  let t = String(tok || '').trim().toLowerCase();
  if (!t.startsWith('/')) t = '/' + t;
  return ALIASES[t] || t;
}

// Parse a list of command tokens (or a free-text string containing /commands) into merged constraints.
// Returns { recognized, unrecognized, constraints, expansions, limitations, evidence_notes }.
function parse(commands) {
  let tokens = [];
  if (Array.isArray(commands)) tokens = commands;
  else if (typeof commands === 'string') tokens = commands.match(/\/[a-z0-9-]+/gi) || [];
  const recognized = [], unrecognized = [], expansions = [], limitations = [], evidence_notes = [];
  const constraints = { applied_commands: [] };
  for (const raw of tokens) {
    const tok = normalizeToken(raw);
    const def = COMMANDS[tok];
    if (!def) { unrecognized.push(tok); continue; }
    recognized.push(tok);
    constraints.applied_commands.push(tok);
    Object.assign(constraints, def.constraints);
    expansions.push({ command: tok, note: def.note, constraints: def.constraints, preset: !!def.preset });
    // Attach coverage-derived limitation for any touched WEAK/NONE domain.
    for (const dom of def.touches || []) {
      const cov = CK.coverageFor(dom);
      if (cov.coverage_class === 'NONE' || cov.coverage_class === 'WEAK') {
        limitations.push({
          command: tok, domain: cov.domain_name, coverage_class: cov.coverage_class,
          evidence_tag: CK.tagCeilingForClass(cov.coverage_class),
          note: `${tok} relies on '${cov.domain_name}' which is ${cov.coverage_class} in the current corpus — ${cov.reason}`,
        });
      }
    }
    if (def.preset) evidence_notes.push({ command: tok, evidence_tag: 'ASSUMPTION', note: `${tok} is a user art-direction preset, not evidence-backed design theory.` });
  }
  return { recognized, unrecognized, constraints, expansions, limitations, evidence_notes };
}

module.exports = { parse, normalizeToken, COMMANDS, ALIASES };
