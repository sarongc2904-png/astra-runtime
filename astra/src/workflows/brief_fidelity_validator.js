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
// [NON-REPLACEMENT] A marker alone never proves the alternative isn't replacing the fact — the
// wording must clearly delimit it as a secondary exploration/test/lead-magnet/variant that does
// NOT stand in for the principal value. "a validar" alone (already part of PROPOSAL_MARKER) does
// not count on its own — it is exactly the kind of bare marker the confirmed defect used to
// wrongly excuse a flat replacement ("PROPUESTA: el precio principal será $900 MXN a validar.").
const NON_REPLACING_CUE = /sin sustituir|sin reemplazar|sin cambiar (el|la) (producto|precio|objetivo|p[uú]blico|mercado|comprador|geograf[ií]a) principal|como lead magnet|a modo de (prueba|test)|a testear|secundari[oa]|variante a (probar|testear)|no reemplaza|no sustituye|complementari[oa]/;

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
// [FIELD-AWARE PRINCIPAL ASSERTION] A sibling field can corroborate criterion A only when it is
// semantically authorized to state that fact's principal value — never an arbitrary field like
// notes/assumptions/limitations/rationale/evidence/exploratory_idea/secondary_idea/comments. Some
// keys are unconditionally authorized (they exist specifically to hold that value); others are
// authorized only when they also carry an explicit "principal/current" designator, since they can
// just as easily hold something else (e.g. offer_structure could be describing anything).
// A category with no entry here (e.g. "mechanism") accepts no sibling at all — only its own
// pre-marker text counts.
const PRINCIPAL_FIELD_KEYS = {
  product: { always: ['product_name', 'product'], conditional: ['offer_structure'] },
  business_objective: { always: ['business_objective'], conditional: ['campaign_objective'] },
  price: { always: ['price'], conditional: ['offer_price', 'pricing'] },
  buyer: { always: ['buyer'], conditional: ['target_audience', 'icp'] },
  geography: { always: ['geography'], conditional: ['market', 'target_geo'] },
};
const PRINCIPAL_DESIGNATOR = /\bprincipal\b|\bcurrent\b|\bactual\b|\bvigente\b/;

// [NON-REPLACEMENT RULE] A marked contradiction escapes ONLY when BOTH hold:
//   A) the canonical fact is explicitly preserved as the field's principal value — either right
//      there before the marker in this same field's text, or plainly stated in a field-aware
//      authorized sibling field of the same output (never an arbitrary one) — never merely
//      inferred from the marker's presence; and
//   B) the marked span itself is worded as a non-replacing exploration (a NON_REPLACING_CUE) —
//      "PROPUESTA: la oferta principal será X" fails B even though it has a marker, because the
//      wording itself claims to BE the new principal, not a secondary idea alongside it.
// Position alone (match at/after the marker) is necessary but no longer sufficient.
function factPreservedAsPrincipal(val, markerIndex, factValue, category, siblingEntries) {
  const primary = markerIndex === -1 ? val : val.slice(0, markerIndex);
  if (containsFact(primary, factValue)) return true;
  const allow = PRINCIPAL_FIELD_KEYS[category];
  if (!allow) return false; // this fact category has no authorized sibling key at all
  for (const [siblingKey, siblingText] of siblingEntries) {
    const k = norm(siblingKey);
    if (allow.always.includes(k)) { if (containsFact(siblingText, factValue)) return true; continue; }
    if (allow.conditional.includes(k) && containsFact(siblingText, factValue) && PRINCIPAL_DESIGNATOR.test(siblingText)) return true;
  }
  return false;
}
function isNonReplacingProposal(val, idx, markerIndex, factValues, category, siblingEntries) {
  if (markerIndex === -1 || idx < markerIndex) return false; // position gate (unchanged prerequisite)
  if (!NON_REPLACING_CUE.test(val.slice(markerIndex))) return false; // B: must read as secondary/non-replacing
  const values = Array.isArray(factValues) ? factValues : [factValues];
  if (!values.some(v => factPreservedAsPrincipal(val, markerIndex, v, category, siblingEntries))) return false; // A: fact still principal
  return true;
}
// product_name and product_type are one product-identity concept for criterion A: stating "Método
// 360" as principal is understood to name the product itself, type included — a field is not
// required to separately restate the type in the same breath for the identity to read as intact.
function productIdentityValues(facts) {
  return [facts.product_name, facts.product_type].filter(f => f && f.status === 'USER_PROVIDED_FACT' && f.value).map(f => f.value);
}
const FACT_CATEGORY = { product_name: 'product', product_type: 'product', business_objective: 'business_objective', mechanism: 'mechanism' };

function checkFieldSubstitutions(facts, key, rawVal, siblingEntries) {
  const val = norm(stringify(rawVal));
  const markerIndex = firstMarkerIndex(val);
  const violations = [];
  const productValues = productIdentityValues(facts);
  for (const field of CHECKED_FIELDS) {
    const f = facts[field];
    if (!f || f.status !== 'USER_PROVIDED_FACT' || !f.value) continue;
    const idx = earliestMatchIndex(val, SUBSTITUTION_PATTERNS[field] || []);
    if (idx === -1) continue;
    const category = FACT_CATEGORY[field] || field;
    const escapeValues = category === 'product' ? productValues : f.value;
    if (isNonReplacingProposal(val, idx, markerIndex, escapeValues, category, siblingEntries)) continue;
    violations.push({ type: field.toUpperCase() + '_SUBSTITUTION', fact_field: field, canonical_value: f.value, field_key: key });
  }
  // buyer role inversion — explicit wrong-party phrasing
  const bf = facts.buyer;
  if (bf && bf.status === 'USER_PROVIDED_FACT' && bf.value) {
    const idx = earliestMatchIndex(val, BUYER_ROLE_INVERSION_PHRASES);
    if (idx !== -1 && !isNonReplacingProposal(val, idx, markerIndex, bf.value, 'buyer', siblingEntries)) {
      violations.push({ type: 'BUYER_ROLE_INVERSION', fact_field: 'buyer', canonical_value: bf.value, field_key: key, detail: 'field frames the end consumer as the buyer role' });
    }
  }
  // price substitution: a different price asserted in this field. Context-aware: a matching
  // digit sequence anywhere else (e.g. "400 minutos de contenido" in an unrelated field) never
  // preserves price=400 — only an authorized price-bearing sibling field can (§ PRINCIPAL_FIELD_KEYS.price).
  const pf = facts.price;
  if (pf && pf.status === 'USER_PROVIDED_FACT' && pf.value) {
    const re = /\$?\s*([\d][\d,.]*)\s*(mxn|usd|pesos?|d[oó]lares?)/gi;
    let m;
    while ((m = re.exec(val))) {
      const amt = m[1].replace(/,/g, '');
      if (amt === String(pf.value)) continue;
      if (isNonReplacingProposal(val, m.index, markerIndex, pf.value, 'price', siblingEntries)) continue;
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
    if (bestIdx !== -1 && !isNonReplacingProposal(val, bestIdx, markerIndex, gf.value, 'geography', siblingEntries)) {
      violations.push({ type: 'GEOGRAPHY_SUBSTITUTION', fact_field: 'geography', canonical_value: gf.value, found_value: bestHit, field_key: key });
    }
  }
  return violations;
}
// Word-boundary matched (never a bare substring test): "usa" as a country code must not match
// inside unrelated JSON/text like "usage" or "causa".
const OTHER_COUNTRIES = ['espana', 'colombia', 'argentina', 'chile', 'peru', 'estados unidos', 'united states', 'usa'];

function validateOutputAgainstFacts(facts, output, { nodeId } = {}) {
  const entries = relevantFields(output);
  const normEntries = entries.map(([k, v]) => [k, norm(stringify(v))]);
  const violations = [];
  for (const [key, rawVal] of entries) {
    const siblingEntries = normEntries.filter(([k]) => k !== key);
    for (const v of checkFieldSubstitutions(facts, key, rawVal, siblingEntries)) violations.push(v);
  }
  return { violations: violations.map(v => ({ ...v, node: nodeId || null, path: nodeId ? `node_outputs.${nodeId}.downstream_payload.${v.field_key}` : `field.${v.field_key}` })) };
}

function validateFinalSynthesis(facts, synthesis) {
  const entries = relevantFields(synthesis);
  const normEntries = entries.map(([k, v]) => [k, norm(stringify(v))]);
  const violations = [];
  for (const [key, rawVal] of entries) {
    const siblingEntries = normEntries.filter(([k]) => k !== key);
    for (const v of checkFieldSubstitutions(facts, key, rawVal, siblingEntries)) violations.push(v);
  }
  return { violations: violations.map(v => ({ ...v, node: null, path: `synthesis.deliverable.${v.field_key}` })) };
}

module.exports = { validateOutputAgainstFacts, validateFinalSynthesis, containsFact, relevantFields, CHECKED_FIELDS };
