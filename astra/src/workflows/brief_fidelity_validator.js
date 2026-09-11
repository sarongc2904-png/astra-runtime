'use strict';
// [Campaign360 Brief Fidelity] Validates a node's output (or the final synthesis) against
// CANONICAL_BRIEF_FACTS. A USER_PROVIDED_FACT can never be silently replaced by a node — this
// module is the fail-closed circuit breaker: it flags entity-role inversion, product/objective/
// price/geography/mechanism substitution. A node is free to PROPOSE new ideas (hooks, angles,
// funnels) alongside the canonical facts; a violation fires only when a known substitution
// pattern appears AND the canonical fact itself is absent from the output — i.e. the fact was
// actually replaced, not merely supplemented with a proposal. Deterministic. No LLM.

function stripAccents(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function norm(s) { return stripAccents(String(s || '')).toLowerCase(); }
function textOf(output) {
  try { return norm(JSON.stringify(output)); } catch { return norm(String(output)); }
}

// Fuzzy "is this canonical fact still present" check: exact substring, or (for multi-word
// facts) a majority of its significant (len>3) words appear somewhere in the text.
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

// Known substitution phrases per field — patterns that indicate the fact was swapped for a
// different one, drawn from the confirmed defect class (entity-role inversion, product/
// objective substitution) plus its adversarial variants.
const SUBSTITUTION_PATTERNS = {
  buyer: [/consumidoras? de servicios? est[ée]tic/, /client(a|e)s? finales?/, /usuarias? del servicio est[ée]tico/, /mujeres que (buscan|consumen|quieren) (un )?servicio est[ée]tico/],
  product_name: [/cita\s*expr[ée]s/, /paquete introductorio/, /^servicio est[ée]tico$/, /sesi[oó]n de belleza/],
  product_type: [/servicio est[ée]tico/, /cita\s*expr[ée]s/],
  business_objective: [/client_?acquisition/, /adquisici[oó]n de client/, /generar leads? (para|de) (la )?cita/, /agendar (una )?cita/, /lead ?generation/],
  mechanism: [/vender citas? expr[ée]s/, /el producto es la cita/, /ofrecer (la )?cita como (el )?producto/, /citas? expr[ée]s pagad/],
};
// Explicit buyer/consumer role-inversion phrasing — flagged even if the buyer term also appears
// elsewhere, because the sentence itself asserts the wrong party is the buyer.
const BUYER_ROLE_INVERSION_PHRASES = [
  /tu (cliente|comprador)(a)? (objetivo|ideal) es (la|una) (mujer|persona|consumidora) que/,
  /el (comprador|cliente) final es (la|una) (consumidora|usuaria)/,
];

function checkSubstitution(facts, field, text) {
  const f = facts[field];
  if (!f || f.status !== 'USER_PROVIDED_FACT' || !f.value) return null;
  const patterns = SUBSTITUTION_PATTERNS[field] || [];
  const substituted = patterns.some(re => re.test(text));
  if (!substituted) return null;
  if (containsFact(text, f.value)) return null; // proposal alongside the still-present fact: OK
  return { type: field.toUpperCase() + '_SUBSTITUTION', fact_field: field, canonical_value: f.value };
}

function checkBuyerRoleInversion(facts, text) {
  const f = facts.buyer;
  if (!f || f.status !== 'USER_PROVIDED_FACT' || !f.value) return null;
  if (!BUYER_ROLE_INVERSION_PHRASES.some(re => re.test(text))) return null;
  return { type: 'BUYER_ROLE_INVERSION', fact_field: 'buyer', canonical_value: f.value, detail: 'output frames the end consumer as the buyer role' };
}

function checkPriceSubstitution(facts, text) {
  const f = facts.price;
  if (!f || f.status !== 'USER_PROVIDED_FACT' || !f.value) return null;
  if (text.includes(String(f.value))) return null; // canonical price still present -> not a substitution
  const re = /\$?\s*([\d][\d,.]*)\s*(mxn|usd|pesos?|d[oó]lares?)/gi;
  let m; let found = null;
  while ((m = re.exec(text))) { const amt = m[1].replace(/,/g, ''); if (amt !== String(f.value)) { found = amt; break; } }
  if (!found) return null;
  return { type: 'PRICE_SUBSTITUTION', fact_field: 'price', canonical_value: f.value, found_value: found };
}

// Word-boundary matched (never a bare substring test): "usa" as a country code must not match
// inside unrelated JSON/text like "usage" or "causa".
const OTHER_COUNTRIES = ['espana', 'colombia', 'argentina', 'chile', 'peru', 'estados unidos', 'united states', 'usa'];
function checkGeographySubstitution(facts, text) {
  const f = facts.geography;
  if (!f || f.status !== 'USER_PROVIDED_FACT' || !f.value) return null;
  if (containsFact(text, f.value)) return null;
  const canon = norm(f.value);
  const hit = OTHER_COUNTRIES.find(c => c !== canon && !canon.includes(c) && new RegExp('\\b' + c.replace(/ /g, '\\s+') + '\\b').test(text));
  if (!hit) return null;
  return { type: 'GEOGRAPHY_SUBSTITUTION', fact_field: 'geography', canonical_value: f.value, found_value: hit };
}

const CHECKED_FIELDS = ['buyer', 'product_name', 'product_type', 'business_objective', 'mechanism'];

function validateOutputAgainstFacts(facts, output, { nodeId } = {}) {
  const text = textOf(output);
  const violations = [];
  for (const field of CHECKED_FIELDS) {
    const v = checkSubstitution(facts, field, text);
    if (v) violations.push(v);
  }
  const inv = checkBuyerRoleInversion(facts, text); if (inv) violations.push(inv);
  const price = checkPriceSubstitution(facts, text); if (price) violations.push(price);
  const geo = checkGeographySubstitution(facts, text); if (geo) violations.push(geo);
  return { violations: violations.map(v => ({ ...v, node: nodeId || null, path: nodeId ? `node_outputs.${nodeId}.${v.fact_field}` : v.fact_field })) };
}

function validateFinalSynthesis(facts, synthesis) {
  const { violations } = validateOutputAgainstFacts(facts, synthesis, { nodeId: null });
  return { violations: violations.map(v => ({ ...v, path: `synthesis.${v.fact_field}` })) };
}

module.exports = { validateOutputAgainstFacts, validateFinalSynthesis, containsFact, textOf, CHECKED_FIELDS };
