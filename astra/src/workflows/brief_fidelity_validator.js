'use strict';
// [Campaign360 Brief Fidelity] Validates a node's output (or the final synthesis) against
// CANONICAL_BRIEF_FACTS. A USER_PROVIDED_FACT can never be silently replaced by a node — this
// module is the fail-closed circuit breaker: it flags entity-role inversion, product/objective/
// price/geography/mechanism substitution.
//
// FIELD-LEVEL validation (not whole-output): each relevant field (downstream_payload.* for a
// node, deliverable.* for the final synthesis) is checked on its OWN text. A substitution in one
// field is never excused by a correct mention in a different, unrelated field — "offer_structure
// says cita exprés" fails even if some other field still says "Método 360" elsewhere. Within a
// SINGLE field, a node may PROPOSE an alternative (marked PROPUESTA/HIPÓTESIS) without that being
// a violation, and a field that states the fact correctly alongside a caveat is not penalized —
// but a field is never forgiven by a *different* field. Deterministic. No LLM.

function stripAccents(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function norm(s) { return stripAccents(String(s || '')).toLowerCase(); }
function stringify(v) { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return String(v); } }

// The fields a node/synthesis output is actually judged on. Never the whole serialized object —
// that is exactly the global-mention bypass this module closes.
function relevantFields(output) {
  if (output && output.downstream_payload && typeof output.downstream_payload === 'object' && !Array.isArray(output.downstream_payload)) {
    return Object.entries(output.downstream_payload);
  }
  if (output && output.deliverable && typeof output.deliverable === 'object' && !Array.isArray(output.deliverable)) {
    return Object.entries(output.deliverable);
  }
  // Unknown/generic shape (e.g. a raw object passed directly in a unit test): treat as one field
  // so the module still degrades safely rather than silently checking nothing.
  return [['_output', output]];
}

// Fuzzy "is this canonical fact still present in THIS field's own text" check: exact substring,
// or (for multi-word facts) a majority of its significant (len>3) words appear in the field.
function containsFact(haystack, factValue) {
  if (!factValue) return false;
  const v = norm(factValue);
  if (!v) return false;
  if (haystack.includes(v)) return true;
  const words = v.split(/[^a-z0-9]+/).filter(w => w.length > 3);
  if (!words.length) return false;
  const hits = words.filter(w => haystack.includes(w));
  return hits.length >= Math.ceil(words.length * 0.6);
}

const PROPOSAL_MARKER = /propuesta|hip[oó]tesis|proposal|hypothesis|a validar|por validar|sujeto a (validaci[oó]n|datos)/;

// Known substitution phrases per field — patterns that indicate the fact was swapped for a
// different one, drawn from the confirmed defect class (entity-role inversion, product/
// objective substitution) plus its adversarial variants.
const SUBSTITUTION_PATTERNS = {
  buyer: [/consumidoras? de servicios? est[ée]tic/, /client(a|e)s? finales?/, /consumidoras? finales?/, /usuarias? del servicio est[ée]tico/, /mujeres que (buscan|consumen|quieren) (un )?servicio est[ée]tico/],
  product_name: [/cita\s*expr[ée]s/, /paquete introductorio/, /^servicio est[ée]tico$/, /sesi[oó]n de belleza/],
  product_type: [/servicio est[ée]tico/, /cita\s*expr[ée]s/],
  business_objective: [/client_?acquisition/, /adquisici[oó]n de client/, /generar leads? (para|de) (la )?citas?/, /agendar (una )?cita/, /lead ?generation/],
  mechanism: [/vender citas? expr[ée]s/, /el producto es la cita/, /ofrecer (la )?cita como (el )?producto/, /citas? expr[ée]s pagad/],
};
// Explicit buyer/consumer role-inversion phrasing — flagged even if the buyer term also appears
// in the SAME field, because the sentence itself asserts the wrong party is the buyer.
const BUYER_ROLE_INVERSION_PHRASES = [
  /tu (cliente|comprador)(a)? (objetivo|ideal) es (la|una) (mujer|persona|consumidora) que/,
  /el (comprador|cliente) final es (la|una) (consumidora|usuaria)/,
  /icp\s*[:=]?\s*consumidoras? de servicios? est[ée]tic/,
];
const CHECKED_FIELDS = ['buyer', 'product_name', 'product_type', 'business_objective', 'mechanism'];

// [STRICT SAME-FIELD FIDELITY] The mere presence of the canonical fact elsewhere in a field's
// OWN text never neutralizes a substitution pattern anymore — that was the confirmed bypass
// ("$400 MXN, pero el precio será $900 MXN" used to pass because "400" was also present). The
// ONLY escape is an explicit PROPOSAL/HIPÓTESIS marker, and only for a substitution phrase that
// occurs AT OR AFTER that marker's position in the text — i.e. the contradictory alternative must
// itself be inside the proposal-marked span, not stated as a flat, unmarked assertion earlier in
// the same field. A marker appended after an already-made unmarked contradiction escapes nothing.
function firstMarkerIndex(val) { return val.search(PROPOSAL_MARKER); }
// Index of the earliest match among a set of patterns, or -1 if none match.
function earliestMatchIndex(val, patterns) {
  let best = -1;
  for (const re of patterns) {
    const idx = val.search(re);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}
// A match at `idx` is escaped only when a proposal marker exists at or before it.
function isEscapedByPosition(idx, markerIndex) { return markerIndex !== -1 && idx >= markerIndex; }

function checkFieldSubstitutions(facts, key, rawVal) {
  const val = norm(stringify(rawVal));
  const markerIndex = firstMarkerIndex(val);
  const violations = [];
  for (const field of CHECKED_FIELDS) {
    const f = facts[field];
    if (!f || f.status !== 'USER_PROVIDED_FACT' || !f.value) continue;
    const idx = earliestMatchIndex(val, SUBSTITUTION_PATTERNS[field] || []);
    if (idx === -1) continue;
    if (isEscapedByPosition(idx, markerIndex)) continue;
    violations.push({ type: field.toUpperCase() + '_SUBSTITUTION', fact_field: field, canonical_value: f.value, field_key: key });
  }
  // buyer role inversion — explicit wrong-party phrasing
  const bf = facts.buyer;
  if (bf && bf.status === 'USER_PROVIDED_FACT' && bf.value) {
    const idx = earliestMatchIndex(val, BUYER_ROLE_INVERSION_PHRASES);
    if (idx !== -1 && !isEscapedByPosition(idx, markerIndex)) {
      violations.push({ type: 'BUYER_ROLE_INVERSION', fact_field: 'buyer', canonical_value: bf.value, field_key: key, detail: 'field frames the end consumer as the buyer role' });
    }
  }
  // price substitution: a different price asserted in this field.
  const pf = facts.price;
  if (pf && pf.status === 'USER_PROVIDED_FACT' && pf.value) {
    const re = /\$?\s*([\d][\d,.]*)\s*(mxn|usd|pesos?|d[oó]lares?)/gi;
    let m;
    while ((m = re.exec(val))) {
      const amt = m[1].replace(/,/g, '');
      if (amt === String(pf.value)) continue;
      if (isEscapedByPosition(m.index, markerIndex)) continue;
      violations.push({ type: 'PRICE_SUBSTITUTION', fact_field: 'price', canonical_value: pf.value, found_value: amt, field_key: key });
      break;
    }
  }
  // geography substitution: a different, word-boundary-matched country named in this field.
  const gf = facts.geography;
  if (gf && gf.status === 'USER_PROVIDED_FACT' && gf.value) {
    const canon = norm(gf.value);
    let bestIdx = -1, bestHit = null;
    for (const c of OTHER_COUNTRIES) {
      if (c === canon || canon.includes(c)) continue;
      const idx = val.search(new RegExp('\\b' + c.replace(/ /g, '\\s+') + '\\b'));
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestHit = c; }
    }
    if (bestIdx !== -1 && !isEscapedByPosition(bestIdx, markerIndex)) {
      violations.push({ type: 'GEOGRAPHY_SUBSTITUTION', fact_field: 'geography', canonical_value: gf.value, found_value: bestHit, field_key: key });
    }
  }
  return violations;
}
// Word-boundary matched (never a bare substring test): "usa" as a country code must not match
// inside unrelated JSON/text like "usage" or "causa".
const OTHER_COUNTRIES = ['espana', 'colombia', 'argentina', 'chile', 'peru', 'estados unidos', 'united states', 'usa'];

function validateOutputAgainstFacts(facts, output, { nodeId } = {}) {
  const violations = [];
  for (const [key, rawVal] of relevantFields(output)) {
    for (const v of checkFieldSubstitutions(facts, key, rawVal)) violations.push(v);
  }
  return { violations: violations.map(v => ({ ...v, node: nodeId || null, path: nodeId ? `node_outputs.${nodeId}.downstream_payload.${v.field_key}` : `field.${v.field_key}` })) };
}

function validateFinalSynthesis(facts, synthesis) {
  const violations = [];
  for (const [key, rawVal] of relevantFields(synthesis)) {
    for (const v of checkFieldSubstitutions(facts, key, rawVal)) violations.push(v);
  }
  return { violations: violations.map(v => ({ ...v, node: null, path: `synthesis.deliverable.${v.field_key}` })) };
}

module.exports = { validateOutputAgainstFacts, validateFinalSynthesis, containsFact, relevantFields, CHECKED_FIELDS };
