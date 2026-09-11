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
// Prose-only extraction: unlike stringify() (which JSON.stringifies whole objects, mixing key
// names into the searchable text), this walks only VALUES, never keys. Needed for the denial/
// unlabeled-proposal/prohibition/positive-preservation checks below, which match on bare words
// like "proof" or "icp" that are also legitimate downstream_payload field NAMES (e.g.
// CREATIVE_STRATEGY_SPECIALIST's own "proof" field) — matching stringify()'s JSON keys would
// false-positive on the schema itself, not on anything a specialist actually wrote.
function textOnly(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(textOnly).join(' ');
  if (typeof v === 'object') return Object.values(v).map(textOnly).join(' ');
  return String(v);
}

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

// [BUSINESS OBJECTIVE FIELD AWARENESS] Confirmed live false positive: "agendar una cita" in
// whatsapp_conversion.appointment_closing tripped BUSINESS_OBJECTIVE_SUBSTITUTION even though the
// canonical mechanism itself is "consulta → conversación → cita" — an operational field
// describing HOW the mechanism's own final step is executed is not asserting a different business
// objective. Unlike buyer/product/price/geography/mechanism (whose substitution phrases are
// inherently objective-neutral vocabulary), several business_objective substitution patterns
// (notably "agendar (una) cita") legitimately overlap with the words a mechanism-following
// operational field would use. So this ONE fact category additionally requires objective-bearing
// context — either the field itself is meant to hold an objective, or its own text explicitly
// asserts one — before the substitution patterns below are even evaluated. PRODUCT/BUYER/PRICE/
// GEOGRAPHY/MECHANISM checks are untouched by this gate.
const OBJECTIVE_BEARING_FIELD_KEYS = new Set(['business_objective', 'campaign_objective', 'objective', 'primary_objective', 'goal', 'primary_goal']);
const EXPLICIT_OBJECTIVE_ASSERTION = /\bel objetivo(\s+principal)?(\s+de la campana)?\s+es\b|\bobjetivo principal\b|\bcampaign objective\b|\bgoal is\b/;
// A field that explicitly asserts an objective ("el objetivo ... es X") but merely quotes the
// canonical value under an immediately preceding negation ("..., no vender el minicurso") is still
// a drift — the canonical objective is textually present yet explicitly disclaimed, which
// containsFact() alone cannot tell apart from a genuine restatement.
function objectiveExplicitlyNegated(val, canonicalValue) {
  const canon = norm(canonicalValue);
  if (!canon) return false;
  const idx = val.indexOf(canon);
  if (idx === -1) return false;
  const before = val.slice(Math.max(0, idx - 20), idx);
  return /\bno\b[\s,]*$/.test(before);
}

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
  const rawText = stringify(rawVal);
  const val = norm(stringify(rawVal));
  const markerIndex = firstMarkerIndex(val);
  const violations = [];
  const productValues = productIdentityValues(facts);
  for (const field of CHECKED_FIELDS) {
    const f = facts[field];
    if (!f || f.status !== 'USER_PROVIDED_FACT' || !f.value) continue;
    let idx = earliestMatchIndex(val, SUBSTITUTION_PATTERNS[field] || []);
    if (field === 'business_objective') {
      const isObjectiveBearingField = OBJECTIVE_BEARING_FIELD_KEYS.has(norm(key));
      const hasExplicitAssertion = EXPLICIT_OBJECTIVE_ASSERTION.test(val);
      if (!isObjectiveBearingField && !hasExplicitAssertion) continue; // not objective-bearing context — skip entirely
      if (idx === -1 && hasExplicitAssertion && objectiveExplicitlyNegated(val, f.value)) {
        idx = val.indexOf(norm(f.value)); // true drift: canonical objective present only as a disclaimed mention
      }
    }
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
    for (const c of UNAMBIGUOUS_OTHER_COUNTRIES) {
      if (c === canon || canon.includes(c)) continue;
      const idx = val.search(new RegExp('\\b' + c.replace(/ /g, '\\s+') + '\\b'));
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestHit = c; }
    }
    const ambiguousIdx = ambiguousGeographyAliasIndex(rawText, val, key);
    if (ambiguousIdx !== -1 && !canon.includes('usa') && (bestIdx === -1 || ambiguousIdx < bestIdx)) {
      bestIdx = ambiguousIdx; bestHit = AMBIGUOUS_GEOGRAPHY_ALIASES[0];
    }
    if (bestIdx !== -1 && !isNonReplacingProposal(val, bestIdx, markerIndex, gf.value, 'geography', siblingEntries)) {
      violations.push({ type: 'GEOGRAPHY_SUBSTITUTION', fact_field: 'geography', canonical_value: gf.value, found_value: bestHit, field_key: key });
    }
  }
  return violations;
}
// Word-boundary matched (never a bare substring test): "usa" as a country code must not match
// inside unrelated JSON/text like "usage" or "causa".
const UNAMBIGUOUS_OTHER_COUNTRIES = ['espana', 'colombia', 'argentina', 'chile', 'peru', 'estados unidos', 'united states'];
const AMBIGUOUS_GEOGRAPHY_ALIASES = ['usa'];
const GEOGRAPHY_VALUE_FIELDS = new Set(['geography', 'target_geo', 'country', 'target_country']);
const USA_GEOGRAPHY_CONTEXT = /\b(?:mercado(?:\s+objetivo)?|target\s+market|geograf[ií]a|pa[ií]s)\s*(?::|=)?\s*usa\b|\bmercado\s+objetivo\b[^.!?\n]{0,30}\b(?:es|sera)\s+usa\b|\b(?:audiencia|clientes?\s+objetivo|p[uú]blico\s+objetivo)\b[^.!?\n]{0,25}\ben\s+usa\b|\b(?:operar\w*|dirigid[oa]s?|orientad[oa]s?|segmentad[oa]s?)\b[^.!?\n]{0,35}\b(?:en|a)\s+usa\b|\ben\s+usa\b/i;
function ambiguousGeographyAliasIndex(rawText, normalizedText, fieldKey) {
  // All-caps USA is an explicit country spelling. Sentence-case "Usa WhatsApp" is not.
  const uppercase = rawText.search(/\bUSA\b/);
  if (uppercase !== -1) return norm(rawText.slice(0, uppercase)).length;
  const contextual = normalizedText.search(USA_GEOGRAPHY_CONTEXT);
  if (contextual !== -1) {
    const local = normalizedText.slice(contextual).search(/\busa\b/);
    return contextual + local;
  }
  if (GEOGRAPHY_VALUE_FIELDS.has(norm(fieldKey)) && /^\s*usa\s*$/.test(normalizedText)) return normalizedText.search(/\busa\b/);
  return -1;
}

// ---------- [KNOWN FACT DENIAL] a field may never deny/blank-out a fact it already knows,
// regardless of position or marker — "aunque no aparezca otro valor". Denying a known fact is
// never a legitimate PROPOSAL, so there is no escape here. ----------
const DENIAL_PATTERNS = {
  price: [/precio\s+desconocid/, /precio\s+no\s+definid/, /precio\s+por\s+confirmar/, /precio\s+a\s+confirmar/, /sin\s+precio/, /precio\s+final\s+pendiente/, /precio\s+pendiente/, /confirmar\s+precio/],
  buyer: [/audiencia\s+desconocid/, /audiencia\s+por\s+definir/, /icp\s+por\s+definir/, /comprador\s+desconocid/, /buyer\s+por\s+definir/],
  geography: [/geograf[ií]a\s+por\s+definir/, /geograf[ií]a\s+desconocid/, /mercado\s+por\s+confirmar/, /pa[ií]s\s+por\s+definir/],
  product_name: [/producto\s+por\s+definir/, /producto\s+desconocid/],
  product_type: [/producto\s+por\s+definir/, /tipo\s+de\s+producto\s+por\s+definir/],
  mechanism: [/mecanismo\s+por\s+definir/, /mecanismo\s+desconocid/],
};
function checkKnownFactDenial(facts, key, val) {
  const violations = [];
  for (const field of Object.keys(DENIAL_PATTERNS)) {
    const f = facts[field];
    if (!f || f.status !== 'USER_PROVIDED_FACT' || !f.value) continue;
    if (DENIAL_PATTERNS[field].some(re => re.test(val))) {
      violations.push({ type: 'KNOWN_FACT_DENIAL', fact_field: field, canonical_value: f.value, field_key: key });
    }
  }
  return violations;
}

// ---------- [UNLABELED PROPOSAL GATE] activated only when the brief's own canonical constraints
// state the "new ideas must be marked PROPUESTA" rule (deterministic string check on
// facts.constraints — never a global marketing blocklist). Fires on the confirmed E2E adversarial
// additions, unless they appear at/after an explicit PROPOSAL/HIPÓTESIS marker in the same field. ----------
const IDEA_MARKING_RULE = /idea\s+nueva[\s\S]{0,40}marcarse[\s\S]{0,30}propuesta|marcarse\s+expl[ií]citamente\s+como\s+propuesta/i;
const CONFIRMED_UNSUPPORTED_ADDITIONS = [
  /webinar\s*demo/i, /\b3\s*plantillas?\s*descargables?/i, /curso\s+de\s+90\s*min/i, /muestra\s+gratis/i,
  /testimonios?/i, /oferta\s+limitada/i, /\bdeadline\b/i, /nurture\s+por\s+email/i, /\bcalendly\b/i,
  /\bwebinar\b/i,
];
// A negated mention ("no usar testimonios", "testimonios = UNKNOWN") is the opposite of an
// unlabeled addition — it is explicitly declining or nulling the idea, exactly as the brief's own
// "missing data stays UNKNOWN" rule requires. Scoped to the sentence containing the match so a
// negation elsewhere in a long field does not blanket-excuse an unrelated addition.
function sentenceAround(val, idx) {
  const start = val.lastIndexOf('.', idx) + 1;
  const endDot = val.indexOf('.', idx); const endNl = val.indexOf('\n', idx);
  const end = endDot === -1 ? (endNl === -1 ? val.length : endNl) : (endNl === -1 ? endDot : Math.min(endDot, endNl));
  return val.slice(start, end === -1 ? val.length : end);
}
function checkUnlabeledProposal(facts, key, val, markerIndex) {
  const cf = facts.constraints;
  if (!cf || cf.status !== 'USER_PROVIDED_FACT' || !IDEA_MARKING_RULE.test(norm(cf.value))) return [];
  const violations = [];
  const seen = new Set();
  for (const re of CONFIRMED_UNSUPPORTED_ADDITIONS) {
    const idx = val.search(re);
    if (idx === -1) continue;
    if (markerIndex !== -1 && idx >= markerIndex) continue; // escaped: appears inside the PROPUESTA span
    if (NEGATION_CUE.test(sentenceAround(val, idx))) continue; // negated/nulled, not an addition
    const label = 'UNLABELED_PROPOSAL:' + re.source;
    if (seen.has(label)) continue; seen.add(label);
    violations.push({ type: 'UNLABELED_PROPOSAL', fact_field: null, matched: re.source, field_key: key });
  }
  return violations;
}

// ---------- [EXPLICIT PROHIBITION GATE] activated when the brief's constraints explicitly ban
// invented metrics/results/testimonials/proof/urgency/scarcity/evidence. These categories may
// never appear — not even marked PROPUESTA — unless that occurrence is explicitly negated
// ("no usar testimonios", "testimonios = UNKNOWN", "sin proof disponible"). ----------
// \w* covers every conjugation this gate's natural-constraint extraction can hand it verbatim
// ("no inventes", "no inventar", "no inventen", ...) without hardcoding each form separately.
const PROHIBITION_RULE = /no\s+invent\w*[\s\S]{0,200}(m[ée]tricas|testimonios|proof|evidencia)/i;
const PROHIBITED_CONTENT_PATTERNS = [
  { type: 'testimonials', re: /testimonios?/i },
  { type: 'proof', re: /\bproof\b/i },
  { type: 'social_proof', re: /prueba\s+social|caso\s+de\s+estudio/i },
  { type: 'urgency', re: /urgencia/i },
  { type: 'scarcity', re: /escasez|oferta\s+limitada/i },
  { type: 'deadline', re: /\bdeadline\b/i },
  { type: 'guarantee', re: /garantizamos|garant[ií]a\s+de\s+resultado/i },
  { type: 'invented_metric', re: /\b(cac|cpa|cpl|roas|mer|ltv)\b[\s\S]{0,20}(esperado|proyectado|estimado|objetivo|meta)/i },
];
const NEGATION_CUE = /\bno\s+(usar|incluir|utilizar|mencionar|presentar|afirmar)\b|=\s*unknown\b|\bsin\b[^.\n]{0,25}\bdisponible\b|\bno\s+hay\b/i;
function checkExplicitProhibition(facts, key, valRawSentences) {
  const cf = facts.constraints;
  if (!cf || cf.status !== 'USER_PROVIDED_FACT' || !PROHIBITION_RULE.test(norm(cf.value))) return [];
  const violations = [];
  // Commas in a negative enumeration preserve scope (CAC, ROAS, LTV, testimonios).
  // Adversatives, sentence boundaries and a new affirmative action end it. UNKNOWN
  // belongs only to its immediately preceding occurrence, never the whole clause.
  const clauses = valRawSentences.split(/[.!?;\n]|\b(?:pero|sin embargo|aunque)\b|[,\u2014]|\b(?:y|e)\s+(?=(?:usa\w*|inclu\w*|utiliza\w*|presenta\w*|afirma\w*|agrega\w*|incorpora\w*)\b)/i);
  let negativeList = false;
  let offset = 0;
  for (const s of clauses) {
    const start = valRawSentences.indexOf(s, offset);
    const separator = valRawSentences.slice(offset, start);
    if (!/^\s*,\s*$/.test(separator)) negativeList = false;
    const negative = /\bno\s+(?:inventes|inventar|inventen|usar|incluir|utilizar|mencionar|presentar|afirmar)\b|\bno\s+hay\b/gi;
    const actions = /\b(?:usa\w*|inclu\w*|utiliza\w*|menciona\w*|presenta\w*|afirma\w*|agrega\w*|incorpora\w*)\b/i;
    const isNegated = (idx, end) => {
      const before = s.slice(0, idx);
      let cueEnd = negativeList ? 0 : -1;
      for (const cue of before.matchAll(negative)) cueEnd = cue.index + cue[0].length;
      if (cueEnd >= 0 && !actions.test(before.slice(cueEnd))) return true;
      return /^\s*=\s*unknown\b/i.test(s.slice(end)) ||
        (/\bsin\s+$/i.test(before) && /^\s+disponible\b/i.test(s.slice(end)));
    };
    for (const p of PROHIBITED_CONTENT_PATTERNS) {
      for (const match of s.matchAll(new RegExp(p.re.source, 'gi'))) {
        if (!isNegated(match.index, match.index + match[0].length)) {
          violations.push({ type: 'EXPLICIT_PROHIBITION', fact_field: null, category: p.type, field_key: key });
        }
      }
    }
    negativeList = isNegated(s.length, s.length);
    offset = start + s.length;
  }
  return violations;
}

// ---------- [POSITIVE PRESERVATION] "not contradicting" is not enough for the section that is
// explicitly responsible for a fact: it must actually restate it (or an unambiguous equivalent).
// Field-aware by node — most nodes never need to mention buyer/mechanism at all, so this only
// fires when the node's own text shows it DID address the topic (audience / funnel) yet dropped
// the canonical value. `null` nodeId (the final synthesis) is included in both sets since its
// deliverable legitimately restates ICP + funnel under their own sections. ----------
// Deliberately excludes a bare "icp" token: at the final-synthesis level the serialized
// deliverable includes JSON structural keys (e.g. selected_methods_by_node.icp) that would
// otherwise false-positive this cue on every run. The replacement-signal phrases below are what
// actually detects a substituted audience; this cue only recognizes prose that genuinely
// discusses the audience topic.
const AUDIENCE_TOPIC_CUES = /audiencia|target\s*audience|p[uú]blico\s+objetivo|cliente\s+objetivo|segmento\s+objetivo/i;
const BUYER_REPLACEMENT_SIGNALS = [/profesionales?\s+(con\s+poco\s+tiempo|ocupad[oa]s?)/i, /consumidoras?\s+finales?/i, /mujeres?\s+en\s+general/i, /adultos?\s+profesionales?/i];
const BUYER_PRESERVATION_NODES = new Set(['icp', 'ads', null]);
function checkBuyerPositivePreservation(facts, nodeId, combinedText) {
  const bf = facts.buyer;
  if (!bf || bf.status !== 'USER_PROVIDED_FACT' || !bf.value) return [];
  if (!BUYER_PRESERVATION_NODES.has(nodeId)) return [];
  const addressesAudience = AUDIENCE_TOPIC_CUES.test(combinedText) || BUYER_REPLACEMENT_SIGNALS.some(re => re.test(combinedText));
  if (!addressesAudience) return [];
  if (containsFact(combinedText, bf.value)) return [];
  return [{ type: 'POSITIVE_PRESERVATION_MISSING', fact_field: 'buyer', canonical_value: bf.value, field_key: '*' }];
}
const MECHANISM_REPLACEMENT_SIGNALS = [/webinar[\s\S]{0,30}(->|→)[\s\S]{0,30}checkout/i, /\bwebinar\b[\s\S]{0,80}\bcheckout\b/i, /lead\s*magnet[\s\S]{0,80}email/i, /email\s+funnel/i, /\bq\s*(&|y)\s*a\b/i];
const MECHANISM_PRESERVATION_NODES = new Set(['funnel', 'ads', 'whatsapp_conversion', null]);
function checkMechanismPositivePreservation(facts, nodeId, combinedText) {
  const mf = facts.mechanism;
  if (!mf || mf.status !== 'USER_PROVIDED_FACT' || !mf.value) return [];
  if (!MECHANISM_PRESERVATION_NODES.has(nodeId)) return [];
  const replaced = MECHANISM_REPLACEMENT_SIGNALS.some(re => re.test(combinedText));
  if (!replaced) return [];
  if (containsFact(combinedText, 'consulta') && containsFact(combinedText, 'cita')) return [];
  return [{ type: 'MECHANISM_SUBSTITUTION', fact_field: 'mechanism', canonical_value: mf.value, field_key: '*' }];
}

function pathFor(nodeId, fieldKey) {
  if (nodeId) return `node_outputs.${nodeId}.downstream_payload.${fieldKey}`;
  return `synthesis.deliverable.${fieldKey}`;
}

// Runtime proposal provenance, independent of the user's constraints. Anchors come ONLY
// from explicitly marked upstream prose, never a global list of prohibited ideas. Remove
// canonical vocabulary and grammatical/action words: in "upsell consultoria cita", cita is
// canonical but consultoria is novel, including when reused as "agendar consultoria".
// This is lexical derivation detection, not a claim of general semantic paraphrase detection.
const PROPOSAL_GLUE = new Set(('para como desde hasta sobre entre cuando donde porque tambien cualquier cada nuevo nueva nuevos nuevas propuesta unknown current_research_required incluir usar utilizar presentar ofrecer agregar incorporar confirmar enviar agendar realizar crear generar hacer tener puede pueden debe deben sera ser estar esta este estos estas una unas unos del las los con por que sin mas').split(' '));
function proposalWords(text) { return norm(text).match(/[a-z_]{4,}/g) || []; }
function proposalLeaves(value) {
  if (typeof value === 'string') return [norm(value)];
  if (Array.isArray(value)) return value.flatMap(proposalLeaves);
  if (value && typeof value === 'object') {
    if (['UNKNOWN', 'CURRENT_RESEARCH_REQUIRED'].includes(value.status) ||
        value.support_class === 'CURRENT_RESEARCH_REQUIRED') return [];
    return Object.values(value).flatMap(proposalLeaves);
  }
  return [];
}
function proposalLeafEntries(value, path = []) {
  if (typeof value === 'string') return [{ value, path }];
  if (Array.isArray(value)) return value.flatMap((item, index) => proposalLeafEntries(item, path.concat(index)));
  if (value && typeof value === 'object') {
    if (['UNKNOWN', 'CURRENT_RESEARCH_REQUIRED'].includes(value.status) ||
        value.support_class === 'CURRENT_RESEARCH_REQUIRED') return [];
    return Object.entries(value).flatMap(([key, item]) => proposalLeafEntries(item, path.concat(key)));
  }
  return [];
}
function upstreamProposalAnchors(facts, upstreamOutputs) {
  const canonical = new Set(Object.values(facts || {})
    .filter(f => f && f.status === 'USER_PROVIDED_FACT').flatMap(f => proposalWords(textOnly(f.value))));
  const anchors = new Set();
  for (const upstream of upstreamOutputs || []) {
    const payload = upstream.downstream_payload || (upstream.output && upstream.output.downstream_payload);
    for (const text of proposalLeaves(payload)) {
      // A marker covers its sentence, including a semicolon continuation in the live offer.
      for (const sentence of text.split(/[.!?\n]/)) {
        const marker = /\bpropuesta\s*:/i.exec(sentence);
        if (!marker) continue;
        for (const word of proposalWords(sentence.slice(marker.index + marker[0].length))) {
          if (!canonical.has(word) && !PROPOSAL_GLUE.has(word)) anchors.add(word);
        }
      }
    }
  }
  return anchors;
}
function proposalClauseSpans(text) {
  const spans = []; let start = 0; let clauseIndex = 0;
  const separators = /[.!?\n]|\b(?:pero|sin embargo|aunque)\b/gi;
  for (const separator of text.matchAll(separators)) {
    spans.push({ start, end: separator.index, clauseIndex: clauseIndex++ });
    start = separator.index + separator[0].length;
  }
  spans.push({ start, end: text.length, clauseIndex });
  return spans;
}
function formatLeafPath(path) {
  return path.reduce((out, part) => out + (typeof part === 'number' ? `[${part}]` : `.${part}`), '$');
}
function proposalPropagationHits(rawValue, anchors) {
  if (!anchors.size) return [];
  const hits = []; const seen = new Set();
  for (const leaf of proposalLeafEntries(rawValue)) {
    const text = norm(leaf.value);
    // Markers/rejections belong to the local clause and only to occurrences AFTER them.
    // Neither a sibling field nor a marker appended later can launder an assertion.
    for (const span of proposalClauseSpans(text)) {
      const clause = text.slice(span.start, span.end);
      for (const match of clause.matchAll(/[a-z_]{4,}/g)) {
        if (!anchors.has(match[0])) continue;
        const before = clause.slice(0, match.index);
        const after = clause.slice(match.index + match[0].length);
        if (/\bpropuesta\s*:/.test(before)) continue;
        if (/^\s*(?:=|:)\s*(?:unknown|current_research_required)\b/.test(after) ||
            /^\s*(?:unknown|current_research_required)\s*[:=]/.test(before)) continue;
        const localBefore = before.slice(before.lastIndexOf(';') + 1);
        const rejection = /\b(?:no\s+(?:incluir|usar|utilizar|ofrecer|agendar|implementar|adoptar)|rechazar|rechazamos|descartar|descartamos)\b/g;
        let rejectedAt = -1;
        for (const r of localBefore.matchAll(rejection)) rejectedAt = r.index + r[0].length;
        if (rejectedAt >= 0 && !/\b(?:inclu\w*|us[ae]\w*|utiliz\w*|ofrec\w*|agend\w*|implement\w*|adopt\w*)\b/.test(localBefore.slice(rejectedAt))) continue;
        const localStart = clause.lastIndexOf(';', match.index) + 1;
        const repairOffset = span.start + localStart;
        const identity = JSON.stringify(leaf.path) + ':' + repairOffset;
        if (seen.has(identity)) continue;
        seen.add(identity);
        hits.push({ matched_anchor: match[0], leaf_path: formatLeafPath(leaf.path), leaf_path_parts: leaf.path, clause_index: span.clauseIndex, repair_offset: repairOffset });
      }
    }
  }
  return hits;
}
function checkUpstreamProposalPropagation(key, rawValue, anchors) {
  return proposalPropagationHits(rawValue, anchors).map(hit => ({
    type: 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION', fact_field: null, field_key: key,
    matched_anchor: hit.matched_anchor, leaf_path: hit.leaf_path, clause_index: hit.clause_index,
  }));
}
function cloneJsonValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function getAtPath(value, path) {
  return path.reduce((current, part) => current[part], value);
}
function setAtPath(value, path, replacement) {
  if (!path.length) return replacement;
  const parent = getAtPath(value, path.slice(0, -1));
  parent[path[path.length - 1]] = replacement;
  return value;
}
function prefixProposalClauses(text, offsets) {
  let repaired = text;
  for (const offset of [...offsets].sort((a, b) => b - a)) {
    const whitespace = (repaired.slice(offset).match(/^\s*/) || [''])[0].length;
    const insertion = offset + whitespace;
    repaired = repaired.slice(0, insertion) + 'PROPUESTA: ' + repaired.slice(insertion);
  }
  return repaired;
}
function repairUpstreamProposalStatus(facts, output, upstreamOutputs = []) {
  let repairedOutput = cloneJsonValue(output);
  const anchors = upstreamProposalAnchors(facts, upstreamOutputs);
  const repairs = [];
  const container = repairedOutput && repairedOutput.downstream_payload && typeof repairedOutput.downstream_payload === 'object'
    ? repairedOutput.downstream_payload : repairedOutput;
  if (!container || typeof container !== 'object' || Array.isArray(container)) return { output: repairedOutput, repairs };
  for (const [fieldKey, rawValue] of Object.entries(container)) {
    const hits = proposalPropagationHits(rawValue, anchors);
    const byLeaf = new Map();
    for (const hit of hits) {
      const identity = JSON.stringify(hit.leaf_path_parts);
      if (!byLeaf.has(identity)) byLeaf.set(identity, { path: hit.leaf_path_parts, hits: [] });
      byLeaf.get(identity).hits.push(hit);
      repairs.push({ field_key: fieldKey, matched_anchor: hit.matched_anchor, leaf_path: hit.leaf_path,
        clause_index: hit.clause_index, repair_type: 'PREFIX_PROPUESTA', deterministic: true });
    }
    let repairedValue = rawValue;
    for (const { path, hits: leafHits } of byLeaf.values()) {
      const originalLeaf = getAtPath(repairedValue, path);
      repairedValue = setAtPath(repairedValue, path, prefixProposalClauses(originalLeaf, leafHits.map(hit => hit.repair_offset)));
    }
    container[fieldKey] = repairedValue;
  }
  return { output: repairedOutput, repairs };
}

function validateOutputAgainstFacts(facts, output, { nodeId, upstream_outputs = [] } = {}) {
  const entries = relevantFields(output);
  const normEntries = entries.map(([k, v]) => [k, norm(stringify(v))]);
  const textEntries = entries.map(([k, v]) => [k, norm(textOnly(v))]);
  const violations = [];
  const proposalAnchors = upstreamProposalAnchors(facts, upstream_outputs);
  for (const [key, rawVal] of entries) {
    const textVal = norm(textOnly(rawVal));
    const markerIndex = firstMarkerIndex(textVal);
    const siblingEntries = normEntries.filter(([k]) => k !== key);
    for (const v of checkFieldSubstitutions(facts, key, rawVal, siblingEntries)) violations.push(v);
    for (const v of checkKnownFactDenial(facts, key, textVal)) violations.push(v);
    for (const v of checkUnlabeledProposal(facts, key, textVal, markerIndex)) violations.push(v);
    for (const v of checkExplicitProhibition(facts, key, textVal)) violations.push(v);
    for (const v of checkUpstreamProposalPropagation(key, rawVal, proposalAnchors)) violations.push(v);
  }
  const combinedText = textEntries.map(([, v]) => v).join(' \n ');
  for (const v of checkBuyerPositivePreservation(facts, nodeId || null, combinedText)) violations.push(v);
  for (const v of checkMechanismPositivePreservation(facts, nodeId || null, combinedText)) violations.push(v);
  return { violations: violations.map(v => ({ ...v, node: nodeId || null, path: pathFor(nodeId, v.field_key) })) };
}

function validateFinalSynthesis(facts, synthesis) {
  const entries = relevantFields(synthesis);
  const normEntries = entries.map(([k, v]) => [k, norm(stringify(v))]);
  const textEntries = entries.map(([k, v]) => [k, norm(textOnly(v))]);
  const violations = [];
  for (const [key, rawVal] of entries) {
    const textVal = norm(textOnly(rawVal));
    const markerIndex = firstMarkerIndex(textVal);
    const siblingEntries = normEntries.filter(([k]) => k !== key);
    for (const v of checkFieldSubstitutions(facts, key, rawVal, siblingEntries)) violations.push(v);
    for (const v of checkKnownFactDenial(facts, key, textVal)) violations.push(v);
    for (const v of checkUnlabeledProposal(facts, key, textVal, markerIndex)) violations.push(v);
    for (const v of checkExplicitProhibition(facts, key, textVal)) violations.push(v);
  }
  const combinedText = textEntries.map(([, v]) => v).join(' \n ');
  for (const v of checkBuyerPositivePreservation(facts, null, combinedText)) violations.push(v);
  for (const v of checkMechanismPositivePreservation(facts, null, combinedText)) violations.push(v);
  return { violations: violations.map(v => ({ ...v, node: null, path: pathFor(null, v.field_key) })) };
}

module.exports = { validateOutputAgainstFacts, validateFinalSynthesis, repairUpstreamProposalStatus, containsFact, relevantFields, CHECKED_FIELDS };
