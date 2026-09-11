'use strict';
// [Campaign360 Brief Fidelity] CANONICAL_BRIEF_FACTS — deterministic extraction of the explicit
// business facts stated in the raw request. This is the fact-fidelity ground truth for the rest
// of the MARKETING_CAMPAIGN_360 pipeline: it is computed once, frozen, passed unchanged into
// every node's input, and NEVER mutated or re-derived from a node's (or intent_analyzer's own
// heuristic) output. No LLM. Deterministic string parsing only.
const crypto = require('crypto');

const FACT_STATUS = Object.freeze(['USER_PROVIDED_FACT', 'INFERENCE', 'PROPOSAL', 'UNKNOWN']);

// Labeled-field patterns (Spanish + English), one canonical field per line: "Label: value".
const FIELD_LABELS = {
  product_name: [/^\s*producto\s*:\s*(.+)$/i, /^\s*product\s*:\s*(.+)$/i, /^\s*product\s*name\s*:\s*(.+)$/i],
  product_type: [/^\s*tipo(?:\s+de\s+producto)?\s*:\s*(.+)$/i, /^\s*product\s*type\s*:\s*(.+)$/i, /^\s*type\s*:\s*(.+)$/i],
  price: [/^\s*precio\s*:\s*(.+)$/i, /^\s*price\s*:\s*(.+)$/i],
  buyer: [/^\s*comprador(?:a)?\s*:\s*(.+)$/i, /^\s*buyer\s*:\s*(.+)$/i, /^\s*dirigido\s*a\s*:\s*(.+)$/i],
  geography: [/^\s*geograf[ií]a\s*:\s*(.+)$/i, /^\s*pa[ií]s\s*:\s*(.+)$/i, /^\s*geography\s*:\s*(.+)$/i],
  business_objective: [/^\s*objetivo\s*:\s*(.+)$/i, /^\s*objective\s*:\s*(.+)$/i],
  mechanism: [/^\s*mecanismo\s*:\s*(.+)$/i, /^\s*mechanism\s*:\s*(.+)$/i, /^\s*funnel\s*:\s*(.+)$/i],
  constraints: [/^\s*restricciones?\s*:\s*(.+)$/i, /^\s*constraints?\s*:\s*(.+)$/i],
};

function firstMatch(text, patterns) {
  for (const line of text.split(/\r?\n/)) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m && m[1] && m[1].trim()) return m[1].trim();
    }
  }
  return null;
}

function parsePrice(raw) {
  if (!raw) return { amount: null, currency: null };
  const m = raw.match(/\$?\s*([\d][\d,.]*)\s*(mxn|usd|pesos?|d[oó]lares?|dollars?)?/i);
  if (!m) return { amount: raw.trim(), currency: null };
  const amount = m[1].replace(/,/g, '');
  let currency = (m[2] || '').toUpperCase();
  if (/PESOS?/.test(currency)) currency = 'MXN';
  else if (/D[OÓ]LARES?|DOLLARS?/.test(currency)) currency = 'USD';
  else currency = currency || null;
  return { amount, currency };
}

function fact(value) { return value ? Object.freeze({ value, status: 'USER_PROVIDED_FACT' }) : Object.freeze({ value: null, status: 'UNKNOWN' }); }

// extract(rawRequest) -> frozen CanonicalBriefFacts. Never throws; absent fields are UNKNOWN,
// never invented. Deterministic: same rawRequest text -> identical facts + raw_request_hash.
function extract(rawRequest) {
  const text = String(rawRequest || '');
  const priceRaw = firstMatch(text, FIELD_LABELS.price);
  const { amount, currency } = parsePrice(priceRaw);

  const facts = {
    product_name: fact(firstMatch(text, FIELD_LABELS.product_name)),
    product_type: fact(firstMatch(text, FIELD_LABELS.product_type)),
    price: amount ? Object.freeze({ value: amount, status: 'USER_PROVIDED_FACT' }) : Object.freeze({ value: null, status: 'UNKNOWN' }),
    currency: currency ? Object.freeze({ value: currency, status: 'USER_PROVIDED_FACT' }) : Object.freeze({ value: null, status: 'UNKNOWN' }),
    buyer: fact(firstMatch(text, FIELD_LABELS.buyer)),
    geography: fact(firstMatch(text, FIELD_LABELS.geography)),
    business_objective: fact(firstMatch(text, FIELD_LABELS.business_objective)),
    mechanism: fact(firstMatch(text, FIELD_LABELS.mechanism)),
    constraints: fact(firstMatch(text, FIELD_LABELS.constraints)),
  };
  const explicit_unknowns = Object.entries(facts).filter(([, f]) => f.status === 'UNKNOWN').map(([k]) => k).sort();

  const body = {
    schema_version: 'campaign360-brief-facts-1.0.0',
    kind: 'CanonicalBriefFacts',
    ...facts,
    explicit_unknowns,
    raw_request_hash: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
    generated_by: 'deterministic:campaign360/brief_facts',
  };
  return Object.freeze(body);
}

module.exports = { FACT_STATUS, extract };
