'use strict';
// [ASTRA-11F §I §J §K] Observed alternatives, purchase triggers, and decision criteria —
// each grounded in customer evidence. Competitor identity is NOT auto-resolved here.
// Triggers/criteria are NEVER invented from persona stereotypes. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const T = require('./taxonomy');

function grounded(kind, utterance, rule, m, typeField, type) {
  const text = utterance.verbatim_text;
  const start = m.index >= 0 ? m.index : text.indexOf(m[0]);
  const b = {
    schema_version: 'ucdm-voc-1.0.0',
    kind,
    utterance_ref: utterance.content_hash,
    [typeField]: type,
    verbatim_span: m[0],
    span: { text: m[0], start, end: start + m[0].length },
    speaker_role: utterance.speaker_role,
    speaker_pseudonym: utterance.speaker_pseudonym,
    source_ref: utterance.source_ref,
    evidence_refs: [...((utterance.provenance && utterance.provenance.evidence_refs) || [])],
    grounded_in_evidence: true,
  };
  b.id = kind.toLowerCase().slice(0, 4) + '_' + sha256Hex(canonicalize({ ...b, id: undefined }));
  return deepFreeze(b);
}

function extractAlternatives(utterance) {
  const out = [];
  for (const rule of T.ALTERNATIVE_RULES) { const m = rule.re.exec(utterance.verbatim_text); if (m) out.push(grounded('VocAlternative', utterance, rule, m, 'alternative_type', rule.type)); }
  return out;
}
function extractTriggers(utterance) {
  const out = [];
  const seen = new Set();
  for (const rule of T.TRIGGER_RULES) { const m = rule.re.exec(utterance.verbatim_text); if (m && !seen.has(rule.type)) { seen.add(rule.type); out.push(grounded('VocTrigger', utterance, rule, m, 'trigger_type', rule.type)); } }
  return out;
}
// decision criteria come from the KEYWORD_RULES that carry a `criterion`
function extractDecisionCriteria(utterance) {
  const out = [];
  for (const rule of T.KEYWORD_RULES) {
    if (!rule.criterion) continue;
    const m = rule.re.exec(utterance.verbatim_text);
    if (m) out.push(grounded('VocDecisionCriterion', utterance, rule, m, 'criterion', rule.criterion));
  }
  return out;
}

function validateAlternative(a) {
  const errors = [];
  if (!T.ALTERNATIVE_TYPES.includes(a.alternative_type)) errors.push(`bad alternative_type "${a.alternative_type}"`);
  if (a.alternative_type === 'competitor' && a.resolved_competitor_id) errors.push('competitor identity must not be auto-resolved in ASTRA-11F');
  if (!a.grounded_in_evidence) errors.push('alternative must be grounded in evidence');
  return { valid: errors.length === 0, errors };
}
function validateTrigger(t) {
  const errors = [];
  if (!T.TRIGGER_TYPES.includes(t.trigger_type)) errors.push(`bad trigger_type "${t.trigger_type}"`);
  if (!t.grounded_in_evidence || t.evidence_refs.length === 0) errors.push('trigger must be grounded in customer evidence (no persona stereotypes)');
  return { valid: errors.length === 0, errors };
}
function validateCriterion(c) {
  const errors = [];
  if (!T.DECISION_CRITERIA.includes(c.criterion)) errors.push(`bad criterion "${c.criterion}"`);
  if (c.evidence_refs.length === 0) errors.push('decision criterion must be grounded in evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { extractAlternatives, extractTriggers, extractDecisionCriteria, validateAlternative, validateTrigger, validateCriterion };
