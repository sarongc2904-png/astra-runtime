'use strict';
// [Campaign360 Brief Fidelity] CANONICAL_BRIEF_FACTS — deterministic extraction of the explicit
// business facts stated in the raw request. This is the fact-fidelity ground truth for the rest
// of the MARKETING_CAMPAIGN_360 pipeline: it is computed once, frozen, passed unchanged into
// every node's input, and NEVER mutated or re-derived from a node's (or intent_analyzer's own
// heuristic) output. No LLM. Deterministic string/regex parsing only — labeled fields first
// ("Producto: X"), then natural-language fallbacks for the same fact stated in prose ("Es un
// minicurso grabado...", "dirigido a X en México", "$400 MXN", "para Método 360", "Enseña Meta
// Ads ... WhatsApp ..."). A field never present in either form stays UNKNOWN — never invented.
const crypto = require('crypto');

const FACT_STATUS = Object.freeze(['USER_PROVIDED_FACT', 'INFERENCE', 'PROPOSAL', 'UNKNOWN']);

// ---------- labeled fields: one canonical field per line, "Label: value" ----------
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

// ---------- natural-language fallbacks: matched against the whole text with newlines collapsed
// to spaces, so a fact stated across a line wrap (e.g. "...WhatsApp para convertir\nconsulta ->
// conversación -> cita.") is still captured as one sentence. Tried only when the labeled form is
// absent for that field. Each entry is applied in order; first match wins. ----------
const NATURAL_PATTERNS = {
  product_name: [
    /campa[ñn]a(?:\s+360)?\s+para\s+([^.,\n]+?)\s*\./i,          // "campaña 360 para Método 360."
    /^\s*crea(?:r)?\s+([^,]+?),/i,                                 // "Crea Método 360, minicurso..."
  ],
  product_type: [
    /es\s+un[oa]?\s+([a-záéíóúñ][a-záéíóúñ\s]*?)(?:\s+de\s+\$|\s+dirigido|\s+para\b|\.|,)/i, // "Es un minicurso grabado de $400 MXN..."
    /,\s*((?:mini)?curso[a-záéíóúñ\s]*?|servicio[a-záéíóúñ\s]*?|programa[a-záéíóúñ\s]*?)\s+de\s+\$/i, // "..., minicurso de $400 MXN..."
  ],
  business_objective: [
    /objetivo(?:\s+(?:es|principal(?:\s+es)?))?\s*[:\-]?\s*([^.,\n]+)/i,
  ],
  // buyer + geography are frequently stated together ("dirigido a X en Y" / "para X en Y") — a
  // single pattern captures both from the same clause.
  buyer_geo: [
    /dirigido\s+a\s+([^.,\n]+?)\s+en\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/i,
    /\bpara\s+(due[ñn][oa]s?\s+de\s+[^.,\n]+?|[^.,\n]+?)\s+en\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/i,
  ],
  geography: [
    /\ben\s+(M[eé]xico|Espa[ñn]a|Colombia|Argentina|Chile|Per[uú]|Estados Unidos)\b/i,
  ],
  // "Enseña Meta Ads para generar consultas y WhatsApp para convertir consulta -> conversación ->
  // cita." — captured as the whole taught-mechanism sentence, arrows included.
  mechanism: [
    /ense[ñn]a\s+(.+?)\.(?:\s|$)/i,
    /mecanismo(?:\s+(?:es|enseñado))?\s*[:\-]?\s*([^.\n]+)/i,
  ],
};

function collapseWhitespace(text) { return String(text || '').replace(/[ \t]*\r?\n[ \t]*/g, ' ').replace(/\s+/g, ' ').trim(); }

function cleanValue(v) {
  if (!v) return null;
  return String(v).replace(/\s+/g, ' ').trim().replace(/[.,;:\s]+$/, '').trim() || null;
}

function firstLabeledMatch(text, patterns) {
  for (const line of text.split(/\r?\n/)) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m && m[1] && m[1].trim()) return cleanValue(m[1]);
    }
  }
  return null;
}

function firstNaturalMatch(naturalText, patterns) {
  for (const re of patterns || []) {
    const m = naturalText.match(re);
    if (m && m[1] && m[1].trim()) return cleanValue(m[1]);
  }
  return null;
}

function parsePrice(raw) {
  if (!raw) return { amount: null, currency: null };
  const m = raw.match(/\$?\s*([\d][\d,.]*)\s*(mxn|usd|pesos?|d[oó]lares?|dollars?)?/i);
  if (!m) return { amount: cleanValue(raw), currency: null };
  const amount = m[1].replace(/,/g, '');
  let currency = (m[2] || '').toUpperCase();
  if (/PESOS?/.test(currency)) currency = 'MXN';
  else if (/D[OÓ]LARES?|DOLLARS?/.test(currency)) currency = 'USD';
  else currency = currency || null;
  return { amount, currency };
}

// price has no dedicated natural label most of the time — a bare "$400 MXN" anywhere in the text
// is itself the natural form; search for it directly when no "Precio:"/"Price:" line exists.
function naturalPrice(naturalText) {
  const m = naturalText.match(/\$\s*([\d][\d,.]*)\s*(mxn|usd|pesos?|d[oó]lares?|dollars?)?/i);
  return m ? m[0] : null;
}

function fact(value) { return value ? Object.freeze({ value, status: 'USER_PROVIDED_FACT' }) : Object.freeze({ value: null, status: 'UNKNOWN' }); }

// extract(rawRequest) -> frozen CanonicalBriefFacts. Never throws; a field absent from BOTH the
// labeled and natural-language forms stays UNKNOWN — never invented. Deterministic: identical
// rawRequest text -> identical facts + raw_request_hash.
function extract(rawRequest) {
  const text = String(rawRequest || '');
  const naturalText = collapseWhitespace(text);

  const product_name = firstLabeledMatch(text, FIELD_LABELS.product_name) || firstNaturalMatch(naturalText, NATURAL_PATTERNS.product_name);
  const product_type = firstLabeledMatch(text, FIELD_LABELS.product_type) || firstNaturalMatch(naturalText, NATURAL_PATTERNS.product_type);
  const priceRaw = firstLabeledMatch(text, FIELD_LABELS.price) || naturalPrice(naturalText);
  const { amount, currency } = parsePrice(priceRaw);
  const geographyLabeled = firstLabeledMatch(text, FIELD_LABELS.geography);
  const buyerLabeled = firstLabeledMatch(text, FIELD_LABELS.buyer);

  let buyer = buyerLabeled, geography = geographyLabeled;
  if (!buyer || !geography) {
    const bg = firstNaturalMatchPair(naturalText, NATURAL_PATTERNS.buyer_geo);
    if (bg) { buyer = buyer || bg.buyer; geography = geography || bg.geography; }
  }
  if (!geography) geography = firstNaturalMatch(naturalText, NATURAL_PATTERNS.geography);

  const business_objective = firstLabeledMatch(text, FIELD_LABELS.business_objective) || firstNaturalMatch(naturalText, NATURAL_PATTERNS.business_objective);
  const mechanism = firstLabeledMatch(text, FIELD_LABELS.mechanism) || firstNaturalMatch(naturalText, NATURAL_PATTERNS.mechanism);
  const constraintsRaw = firstLabeledMatch(text, FIELD_LABELS.constraints);

  const facts = {
    product_name: fact(product_name),
    product_type: fact(product_type),
    price: amount ? Object.freeze({ value: amount, status: 'USER_PROVIDED_FACT' }) : Object.freeze({ value: null, status: 'UNKNOWN' }),
    currency: currency ? Object.freeze({ value: currency, status: 'USER_PROVIDED_FACT' }) : Object.freeze({ value: null, status: 'UNKNOWN' }),
    buyer: fact(buyer),
    geography: fact(geography),
    business_objective: fact(business_objective),
    mechanism: fact(mechanism),
    constraints: fact(constraintsRaw),
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

function firstNaturalMatchPair(naturalText, patterns) {
  for (const re of patterns || []) {
    const m = naturalText.match(re);
    if (m && m[1] && m[2]) return { buyer: cleanValue(m[1]), geography: cleanValue(m[2]) };
  }
  return null;
}

module.exports = { FACT_STATUS, extract };
