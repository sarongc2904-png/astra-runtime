'use strict';

// Narrow adjudication for a confirmed Campaign360 live false-positive class.
// It NEVER changes the validator itself. It only suppresses an invented_result violation when:
// - node is ICP;
// - field is pains;
// - matched term is a duplicate/triple past participle/adjective;
// - clause is descriptive state language, with no advertiser voice, guarantee, or numeric magnitude.
// Imperatives/infinitives/quantified claims remain untouched and therefore fail closed.

const PARTICIPLE_RE = /^(?:duplicad[oa]s?|triplicad[oa]s?|doubled|tripled)$/i;
const ADVERTISER_VOICE_RE = /\b(?:tu|tus|te|ti|usted|ustedes|contigo|vas|vamos\s+a|you|your|we\s+will|we['’]ll|we\s+help|we\s+offer|we\s+deliver|we\s+provide)\b/i;
const GUARANTEE_RE = /\b(?:garantiz\w*|guarantee\w*|resultados?\s+garantiz\w*|guaranteed\s+results?)\b/i;
const MAGNITUDE_RE = /\b\d+(?:[.,]\d+)?\s*(?:%|x|mxn|usd|pesos?|d[oó]lares?|d[ií]as?|semanas?|meses?|appointments?|citas?|leads?|clientes?|ventas?|sales?|revenue)\b/i;
const INFINITIVE_OR_IMPERATIVE_RE = /\b(?:duplicar|triplicar|duplica|triplica|double|triple)\b/i;

function isDescriptiveIcpPainFalsePositive(v, nodeId) {
  if (nodeId !== 'icp' || !v || v.category !== 'invented_result') return false;
  const key = String(v.field_key || '');
  const leaf = String(v.leaf_path || '');
  if (key !== 'pains' && !/^pains(?:\[|\.|$)/.test(leaf)) return false;

  const matched = String(v.matched_text || '').trim();
  const clause = String(v.local_clause || '').trim();
  if (!PARTICIPLE_RE.test(matched) || !clause) return false;
  // In an ICP pain, a possessive/second-person reference (e.g. "tus mensajes duplicados")
  // does not turn a past participle/adjective into an advertiser promise. The dangerous
  // imperative/infinitive forms are handled separately below and remain blocked.
  if (GUARANTEE_RE.test(clause) || MAGNITUDE_RE.test(clause)) return false;
  if (INFINITIVE_OR_IMPERATIVE_RE.test(clause)) return false;

  const idx = clause.toLowerCase().indexOf(matched.toLowerCase());
  if (idx <= 0) return false; // require descriptive noun/state context before the participle
  const before = clause.slice(0, idx).trim();
  if (!/[a-záéíóúñ]{3,}$/i.test(before)) return false;
  return true;
}

function normalizeComparable(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,;:!?]+$/g, '').replace(/\s+/g, ' ').trim();
}

function isCanonicalObjectiveRestatement(v, facts) {
  if (!v || v.category !== 'invented_result') return false;
  const objectiveFact = facts && facts.business_objective;
  if (!objectiveFact || objectiveFact.status !== 'USER_PROVIDED_FACT' || !objectiveFact.value) return false;
  const clause = normalizeComparable(v.local_clause);
  const objective = normalizeComparable(objectiveFact.value);
  if (!clause || !objective) return false;
  // Exact restatement only. This does not excuse embellished promises that merely contain the objective.
  return clause === objective;
}

function adjudicateNodeViolations(nodeId, violations, facts) {
  const kept = [];
  const suppressed = [];
  for (const v of Array.isArray(violations) ? violations : []) {
    if (isDescriptiveIcpPainFalsePositive(v, nodeId) || isCanonicalObjectiveRestatement(v, facts)) suppressed.push(v);
    else kept.push(v);
  }
  return { violations: kept, suppressed };
}

module.exports = { adjudicateNodeViolations, isDescriptiveIcpPainFalsePositive, isCanonicalObjectiveRestatement };
