'use strict';
// [ASTRA-11F §E §F §G] Exact-span grounding. Splits an utterance into clauses, matches each
// clause to aspects/concepts via the CONTROLLED taxonomy, and keeps the EXACT source span
// (text + char offsets) that supports each aspect. Multi-aspect utterances yield many
// grounded observations, each with its own narrower span. Negation and prior-experience
// cues are preserved deterministically. No LLM, no web, no I/O.
const T = require('./taxonomy');

// clause boundaries: sentence punctuation + coordinating/contrast connectives.
const CLAUSE_SPLIT = /(?<=[.!?;])\s+|\s*,\s*|\s+\b(?:pero|aunque|sin embargo|y|porque|ya que|además|adem[aá]s)\b\s+/i;

// Split preserving offsets: returns [{ text, start, end }] over the ORIGINAL string.
function splitClauses(text) {
  const out = [];
  let idx = 0;
  const parts = String(text).split(CLAUSE_SPLIT);
  for (const raw of parts) {
    if (raw == null) continue;
    const at = String(text).indexOf(raw, idx);
    const start = at >= 0 ? at : idx;
    const trimmed = raw.trim();
    if (trimmed.length) {
      const s = String(text).indexOf(trimmed, start);
      out.push({ text: trimmed, start: s, end: s + trimmed.length });
    }
    idx = start + raw.length;
  }
  return out.length ? out : [{ text: String(text).trim(), start: 0, end: String(text).trim().length }];
}

// Is the keyword occurrence negated? A negation cue appears within the clause BEFORE the
// keyword and within ~4 words of it (or anywhere earlier in a short clause).
function isNegated(clause, matchIndex) {
  const before = clause.slice(0, matchIndex);
  if (!T.NEGATION_RE.test(before)) return false;
  const wordsBetween = (before.match(new RegExp(T.NEGATION_RE.source, 'gi')) || []).length
    ? before.split(/\s+/).slice(-6).join(' ')
    : before;
  return T.NEGATION_RE.test(wordsBetween) || before.split(/\s+/).length <= 5;
}
function isPrior(clause) { return T.PRIOR_RE.test(clause); }
function intensityOf(clause) {
  const m = clause.match(T.INTENSITY_RE);
  if (!m) return null;
  return T.INTENSITY_MAP[m[1].toLowerCase()] || null;
}

// groundUtterance(utterance) -> { spans: [GroundedSpan], clause_count }
// GroundedSpan: { clause_index, span_text, span_start, span_end, aspect, canonical_concept,
//   polarity, intensity, negated, prior_experience, criterion, matched_rule }
function groundUtterance(utterance) {
  const text = utterance.verbatim_text;
  const clauses = splitClauses(text);
  const spans = [];

  clauses.forEach((cl, ci) => {
    const prior = isPrior(cl.text);
    let matchedAny = false;
    for (const rule of T.KEYWORD_RULES) {
      const m = rule.re.exec(cl.text);
      if (!m) continue;
      const localIdx = m.index;
      const negated = isNegated(cl.text, localIdx);
      // exact span = the matched phrase within the clause, mapped to original offsets
      const phrase = m[0];
      const phraseStartInClause = localIdx;
      const absStart = cl.start + phraseStartInClause;
      const absEnd = absStart + phrase.length;
      // choose the narrowest defensible span: the clause if the phrase is most of it, else the phrase
      const useClause = phrase.length / cl.text.length > 0.6;
      const span_text = useClause ? cl.text : phrase;
      const span_start = useClause ? cl.start : absStart;
      const span_end = useClause ? cl.end : absEnd;

      // §(sarcasm) deterministic guard: a keyword wrapped in quotation marks, or a
      // POSITIVE match sitting next to a contradictory complaint in the same clause, is
      // flagged sarcasm_suspected and demoted to an UNKNOWN/ANALYTICAL span (never a
      // confident positive).
      const quoted = new RegExp('["\u201c\u2018\'\u00ab]\\s*' + escapeRe(phrase) + '\\s*["\u201d\u2019\'\u00bb]', 'i').test(cl.text);
      const contradictedInClause = rule.polarity === 'POSITIVE' && /(lento|tardaron|tard[oó]|nunca respondieron|no respondieron|semanas|d[ií]as en)/i.test(cl.text);
      const sarcasm_suspected = quoted || contradictedInClause;

      let aspect = rule.aspect;
      let concept = rule.canonical_concept || rule.concept;
      let polarity = rule.polarity;
      if (sarcasm_suspected) { aspect = 'UNKNOWN'; concept = 'UNKNOWN_CONCEPT'; polarity = 'UNKNOWN'; }
      if (negated) {
        // §G — negation preserved: flip a negatable rule to its documented opposite; else
        // suppress the negative aspect and record a NEUTRAL OUTCOME (never the raw concern).
        if (rule.negatable && rule.flip) { aspect = rule.flip.aspect; concept = rule.flip.concept; polarity = rule.flip.polarity; }
        else if (polarity === 'NEGATIVE') { polarity = 'NEUTRAL'; aspect = 'OUTCOME'; }
      }
      // §G — "Pensé que dolería" is a PRIOR belief, not the current experience.

      spans.push({
        clause_index: ci,
        span_text, span_start, span_end,
        aspect, canonical_concept: concept, polarity,
        intensity: intensityOf(cl.text),
        negated, prior_experience: prior, sarcasm_suspected,
        criterion: sarcasm_suspected ? null : (rule.criterion || null),
        matched_rule: sarcasm_suspected ? null : rule.re.source.slice(0, 60),
      });
      matchedAny = true;
    }
    if (!matchedAny) {
      // still record an UNKNOWN-aspect span so coverage reflects unclassified customer language
      spans.push({ clause_index: ci, span_text: cl.text, span_start: cl.start, span_end: cl.end, aspect: 'UNKNOWN', canonical_concept: 'UNKNOWN_CONCEPT', polarity: 'UNKNOWN', intensity: null, negated: false, prior_experience: prior, criterion: null, matched_rule: null });
    }
  });

  return { spans, clause_count: clauses.length };
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { splitClauses, groundUtterance, isNegated, isPrior, intensityOf };
