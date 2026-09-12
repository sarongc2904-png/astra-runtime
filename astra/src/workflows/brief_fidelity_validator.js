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

// ---------- [UNKNOWN FACT FABRICATION] confirmed live defect: canonicalBriefFacts marked
// business_objective UNKNOWN (the raw brief never stated one) yet the final synthesis's
// dedicated "1_business_objective" section asserted a concrete value anyway — sourced from
// intent_analyzer's heuristic ROUTING classification (which can collapse to "CLIENT_ACQUISITION"
// whenever several intents match), never itself a business fact — with brief_fidelity_violations
// staying empty. The mirror image of KNOWN_FACT_DENIAL above: there, a KNOWN fact must not be
// denied; here, an UNKNOWN fact must not be silently promoted to an affirmed one.
//
// Scoped ONLY to the small set of field keys whose entire schema purpose IS to state that exact
// fact (mirrors OBJECTIVE_BEARING_FIELD_KEYS and PRINCIPAL_FIELD_KEYS' "always" sets) — never a
// blanket "any concrete text in any field is fabrication" rule. A specialist node routinely
// writes ordinary tactical/exploratory prose into fields like campaign_objective or mechanism
// while the corresponding canonical fact is legitimately UNKNOWN (the brief just never specified
// one) — that is normal node elaboration, not fabrication, and flagging it would false-positive
// on confirmed-passing behavior (astra_campaign360_brief_fidelity.test.js R1). For that reason
// this check runs ONLY at the final-synthesis gate (validateFinalSynthesis), never per-node
// (validateOutputAgainstFacts) — the confirmed defect is a property of the single authoritative
// deliverable section, not of a specialist's in-progress tactical field.
const UNKNOWN_ASSERTION_FIELD_KEYS = {
  business_objective: OBJECTIVE_BEARING_FIELD_KEYS,
  product_name: new Set(['product_name', 'product']),
  price: new Set(['price']),
  buyer: new Set(['buyer']),
  geography: new Set(['geography']),
  mechanism: new Set(['mechanism']),
};
// Empty, whitespace/punctuation-only, or literally UNKNOWN/CURRENT_RESEARCH_REQUIRED: the fact is
// honestly left unresolved rather than silently asserted.
const UNKNOWN_PRESERVED_ONLY = /^[\s.,;:\-]*(unknown|current_research_required)?[\s.,;:\-]*$/;
function bareFieldKey(key) { return norm(key).replace(/^\d+_/, ''); }
function checkUnknownFactFabrication(facts, key, val, markerIndex) {
  const bareKey = bareFieldKey(key);
  const violations = [];
  for (const [category, fieldKeys] of Object.entries(UNKNOWN_ASSERTION_FIELD_KEYS)) {
    if (!fieldKeys.has(bareKey)) continue;
    const f = facts[category];
    if (!f || f.status !== 'UNKNOWN') continue;
    // Same position gate as every other proposal-escape in this file: only the text BEFORE a
    // PROPUESTA/HIPÓTESIS marker is judged as an assertion — a marked span is a labeled proposal,
    // not a silent replacement of the still-UNKNOWN canonical fact.
    const primary = markerIndex === -1 ? val : val.slice(0, markerIndex);
    if (UNKNOWN_PRESERVED_ONLY.test(primary)) continue;
    violations.push({ type: 'UNKNOWN_FACT_FABRICATION', fact_field: category, field_key: key });
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
// [PROPOSAL STATUS LOSS FIX] confirmed live defect: brand-new tactical specifics — "Test 3 hooks
// y 2 creativos por hook", "Recordatorio 48h y 24h", "Campaña umbrella con 3 ejecuciones" —
// reached final_synthesis as flat, unmarked assertions with zero violations, because
// CONFIRMED_UNSUPPORTED_ADDITIONS is a closed list of specific known-bad phrases (built for a
// different, earlier confirmed defect) that was never meant to catch open-ended new tactics. Per
// REGLA 4, ANY new count/cadence/structural detail not itself a canonical fact must be PROPUESTA-
// labeled — semantic-category detection (a number bound to a tactical unit or a recognized
// campaign-structure term), not a hardcoded phrase list. Gated more broadly than
// CONFIRMED_UNSUPPORTED_ADDITIONS: a brief need not spell out the exact "mark ideas as PROPUESTA"
// sentence for this to apply — any brief that already prohibits inventing content (the same
// EXPLICIT_PROHIBITION_DIRECTIVE gate used for negative-constraint categories) implies new
// tactical specifics must not be silently asserted either. Still requires facts.constraints to be
// a USER_PROVIDED_FACT, so a brief with no constraints at all (e.g. the R1 regression fixture)
// stays completely unaffected — no new false positives on ordinary node prose.
const TACTICAL_DETAIL_PATTERNS = [
  /\b\d+\s*(?:h|hrs?|horas?)\b/i,
  /\b\d+\s+(?:ejecuciones?|hooks?|creativos?|preguntas?|mensajes?|recordatorios?|reportes?|anuncios?|variantes?|versiones?)\b/i,
  /\bcampa[ñn]a\s+umbrella\b/i,
  /\bsegmentar\b[\s\S]{0,30}\b(?:fr[ií][oa]s?|c[aá]lid[oa]s?|similares?|lookalike)\b/i,
  /\breportes?\s+diarios?\b/i,
  /\blead\s*magnet\b/i,
  /\bcontenido\s+(?:breve\s+)?de\s+valor\b/i,
  /\bopci[oó]n\s+(?:de\s+)?agendar\b/i,
];
function unlabeledProposalGateActive(cf) {
  if (!cf || cf.status !== 'USER_PROVIDED_FACT') return false;
  const val = norm(cf.value);
  return IDEA_MARKING_RULE.test(val) || EXPLICIT_PROHIBITION_DIRECTIVE.test(val);
}
function clauseIndexAt(val, idx) { return val.slice(0, idx).split(/[.!?;\n]/).length - 1; }
function checkUnlabeledProposal(facts, key, val, markerIndex) {
  const cf = facts.constraints;
  if (!cf || cf.status !== 'USER_PROVIDED_FACT') return [];
  const violations = [];
  const seen = new Set();
  if (IDEA_MARKING_RULE.test(norm(cf.value))) {
    for (const re of CONFIRMED_UNSUPPORTED_ADDITIONS) {
      const idx = val.search(re);
      if (idx === -1) continue;
      if (markerIndex !== -1 && idx >= markerIndex) continue; // escaped: appears inside the PROPUESTA span
      if (NEGATION_CUE.test(sentenceAround(val, idx))) continue; // negated/nulled, not an addition
      const label = 'UNLABELED_PROPOSAL:' + re.source;
      if (seen.has(label)) continue; seen.add(label);
      violations.push({ type: 'UNLABELED_PROPOSAL', fact_field: null, matched: re.source, field_key: key });
    }
  }
  if (unlabeledProposalGateActive(cf)) {
    for (const re of TACTICAL_DETAIL_PATTERNS) {
      const match = re.exec(val);
      if (!match) continue;
      const idx = match.index;
      if (markerIndex !== -1 && idx >= markerIndex) continue; // escaped: appears inside the PROPUESTA span
      if (NEGATION_CUE.test(sentenceAround(val, idx))) continue;
      const label = 'UNLABELED_PROPOSAL:' + re.source;
      if (seen.has(label)) continue; seen.add(label);
      violations.push({
        type: 'UNLABELED_PROPOSAL', fact_field: null, matched: re.source, field_key: key,
        matched_text: match[0], matched_pattern: re.source,
        local_clause: sentenceAround(val, idx).trim(), clause_index: clauseIndexAt(val, idx), occurrence_start: idx,
      });
    }
  }
  return violations;
}

// ---------- [EXPLICIT PROHIBITION GATE] category-scoped to what the brief's own constraints
// explicitly prohibit. A ban on metrics/testimonials never activates scarcity, urgency or any
// other sibling category by association. An active category may never appear — not even marked
// PROPUESTA — unless that occurrence is explicitly negated
// ("no usar testimonios", "testimonios = UNKNOWN", "sin proof disponible"). ----------
// [NEGATIVE CONSTRAINT BYPASS FIX] confirmed live defect: a brief prohibiting "resultados" or
// "evidencia" had NO corresponding category here at all — "resultados"/"evidencia" never matched
// any PROHIBITION_CATEGORY_TERMS entry, so activeExplicitProhibitionCategories() never activated
// for them, and EXPLICIT_PROHIBITION never even attempted to scan for phrases like "Citas que
// pagan más en 30 días" (an invented result) or "Scripts... probados" (invented evidence) — with
// or without a PROPUESTA marker (this file's EXPLICIT_PROHIBITION check has never honored the
// marker as an escape for any category; the gap was upstream, in category coverage, not in
// marker handling). invented_result/invented_evidence close that gap the same way every other
// category here works: semantic term/pattern matching, never a hardcoded exact phrase.
// [QUALITATIVE RESULT CLAIM] a result claim is not always numeric — "conseguir más ventas",
// "mejorar ingresos", "citas que pagan más" promise an improvement just as much as "aumentar
// ventas 30%" does, with no digit anywhere. Detection is layered so it never collapses into a
// blanket "any of these words together" rule:
//   - CLAIM_VERBS (aumentar/incrementar/.../pagan) paired with an OUTCOME_TERM in either order,
//     with NO magnitude required — these verbs are comparative/achievement verbs that essentially
//     never appear in ordinary mechanism/funnel description without asserting a change.
//   - "generar" is kept in its OWN, magnitude-REQUIRED tier: it is the one verb in this family
//     that is completely ordinary, expected language for describing what the funnel itself does
//     ("generar consultas", "generar leads") — see [[REQUIRED mechanism-preservation prose]]
//     below — so it only counts as a claim when paired with an explicit magnitude.
//   - duplicar/triplicar inherently claim a magnitude (x2/x3) on their own.
//   - A CLAIM_VERB immediately preceded by "para " (a purpose/goal clause) whose own clause opens
//     with a MEASUREMENT_VERB (medir/analizar/registrar/probar/testear/...) is a description of
//     an EXPERIMENT'S GOAL, not an assertion that the result was achieved or is expected — e.g.
//     "probar mensajes para mejorar conversión" — and is explicitly excluded.
// [CONJUGATED FORM FIX] confirmed live gap: the verb list only matched bare infinitives, missing
// imperative/conjugated forms like "Consigue más ventas" or "Aumenta tu ticket promedio" — a
// direct claim is a direct claim regardless of conjugation. Each entry below is a shared stem
// that covers its regular conjugations (aumenta/aumentar/aumentas/aumentan/aumentando) without
// resorting to full morphological analysis; the stem-changing irregulars (conseguir → consigue,
// obtener → obtiene) list their conjugated stem as a second alternative alongside the infinitive.
const RESULT_OUTCOME_TERMS = 'ventas?|ingres\\w*|leads?|citas?|clientes?|conversi[oó]n(?:es)?|ticket';
const RESULT_SELF_SUFFICIENT_VERBS = 'duplica\\w*|triplica\\w*';
// [OFFER CONSTRAINT ADHERENCE — confirmed live gap] "Llena citas" ("fills your appointment
// calendar") asserts a result exactly like "aumenta ventas" does, but "llena\w*"/"llenar" was
// missing from this list entirely — paired with an OUTCOME_TERM already in RESULT_OUTCOME_TERMS
// ("citas"), it is a claim verb like any other here, not a new category.
const RESULT_CLAIM_VERBS = 'aumenta\\w*|increment[ao]\\w*|sub(?:e|es|en|ir|iendo|ido)|mejora\\w*|consig(?:o|ues|ue|uen|uiendo)\\w*|conseguir|logra\\w*|obtien\\w*|obtener|reduc\\w*|baja\\w*|paga\\w*|llena\\w*|llenar';
const RESULT_MAGNITUDE_ONLY_VERBS = 'genera\\w*';
const RESULT_MEASUREMENT_VERBS = 'medir|analizar|registrar|probar|testear|monitorear|evaluar|revisar|comparar|dar\\s+seguimiento';
const RESULT_MAGNITUDE = `\\d+\\s*%|\\d+\\s*x\\b|en\\s+\\d+\\s*(?:d[ií]as?|semanas?|meses?)|\\d+\\s+(?:${RESULT_OUTCOME_TERMS})`;
// [GUARANTEED RESULT CLAIM] confirmed preexisting gap: "Resultados garantizados" (and
// "garantizamos X"/"X garantizado(s)") never matched INVENTED_RESULT_CLAIM at all — RESULT_CLAIM_VERBS
// has no guarantee verb, and RESULT_OUTCOME_TERMS never listed the bare word "resultado(s)" itself
// (only concrete channels like ventas/leads/citas/clientes). A guarantee is a STRONGER assertion
// than any of the comparative claim verbs above — certainty of an outcome, not just a claimed
// change — so it gets its own verb family (garantiz\w* — covers garantizar/garantizo/garantizamos/
// garantizado/garantizada/garantizando, every conjugation via one shared stem) paired with either
// a concrete RESULT_OUTCOME_TERM or the generic word "resultado(s)" itself (kept OUT of the base
// RESULT_OUTCOME_TERMS so this addition never changes what the CLAIM_VERB branches above already
// match). Deliberately verb-STEM based, never matching the unrelated noun "garantía" (no
// "garantiz" substring in it) — see isGuaranteedResultMatch()/GUARANTEE_ADVISORY_CUE below for why
// "garantía de reembolso/producto/satisfacción" and "evitar prometer resultados garantizados" stay
// clear of this category.
const GUARANTEE_VERBS = 'garantiz\\w*';
const RESULT_OUTCOME_TERMS_OR_BARE_RESULT = `${RESULT_OUTCOME_TERMS}|resultados?`;
const INVENTED_RESULT_CLAIM = new RegExp(
  `\\b(?:${RESULT_SELF_SUFFICIENT_VERBS})\\b` +
  `|\\b(?:${RESULT_CLAIM_VERBS})\\b(?=[\\s\\S]{0,40}\\b(?:${RESULT_OUTCOME_TERMS})\\b)` +
  `|\\b(?:${RESULT_OUTCOME_TERMS})\\b(?=[\\s\\S]{0,40}\\b(?:${RESULT_CLAIM_VERBS})\\b)` +
  `|\\b(?:${RESULT_CLAIM_VERBS}|${RESULT_MAGNITUDE_ONLY_VERBS})\\b(?=[\\s\\S]{0,40}(?:${RESULT_MAGNITUDE}))` +
  `|\\b(?:${RESULT_OUTCOME_TERMS})\\b(?=[\\s\\S]{0,40}(?:${RESULT_MAGNITUDE}))` +
  `|\\b(?:${GUARANTEE_VERBS})\\b(?=[\\s\\S]{0,40}\\b(?:${RESULT_OUTCOME_TERMS_OR_BARE_RESULT})\\b)` +
  `|\\b(?:${RESULT_OUTCOME_TERMS_OR_BARE_RESULT})\\b(?=[\\s\\S]{0,40}\\b(?:${GUARANTEE_VERBS})\\b)`, 'i');
// [[REQUIRED mechanism-preservation prose]] "generar consultas y WhatsApp para convertir consulta
// → conversación → cita" is the canonical, EXPECTED mechanism restatement used throughout this
// pipeline's node/synthesis fixtures — "generar" here is magnitude-gated (no digit present, so it
// never matches) and "citas"/"conversión" here never sit within 40 chars of a CLAIM_VERB in that
// sentence, so this stays safe without any phrase-specific exception.
const RESULT_MEASUREMENT_PURPOSE_BEFORE = /\bpara\s+$/i;
const RESULT_MEASUREMENT_VERBS_RE = new RegExp(`\\b(?:${RESULT_MEASUREMENT_VERBS})\\b`, 'i');
function isMeasurementPurposeClause(clauseText, idx) {
  const before = clauseText.slice(0, idx);
  return RESULT_MEASUREMENT_PURPOSE_BEFORE.test(before) && RESULT_MEASUREMENT_VERBS_RE.test(before);
}
// [GOAL/INTENT/DESIRE CONTEXT] confirmed live false positive (job ec5fa16f-2cdf-4a9d-9439-
// 8e6ea7761725): "Compradoras buscan capacitación práctica para aumentar ingresos" is a
// market_assumptions statement describing the BUYER's own goal/desire — not the system asserting
// or promising a result. A result claim is a PROMISE THE SYSTEM MAKES; a sentence that frames the
// same verb as something a third party wants/needs/aims for is a description of intent, not a
// claim. Grammatical person is the load-bearing signal: third-person forms (buscan/quiere/
// necesitan/...) describe someone else's goal and escape; first-person-plural forms (buscamos/
// queremos/necesitamos/...) are the advertiser's OWN voice and must NOT escape — "Queremos
// aumentar tus ventas" is still every bit a claim. Scoped to the whole clause (like
// FUTURE_HEDGE_CUE) since the intent cue is rarely adjacent to the claim verb itself
// ("Compradoras buscan capacitación práctica para aumentar ingresos" — "buscan" and "aumentar"
// are several words apart).
const GOAL_INTENT_ESCAPE_CUE = /\bbuscan\b|\bbusca\b|\bquieren\b|\bquiere\b|\bdesean\b|\bdesea\b|\bnecesitan\b|\bnecesita\b|\baspiran\b|\baspira\b|\besperan\b|\bespera\b|\bsu\s+objetivo\s+es\b|\bsu\s+meta\s+es\b|\bobjetivo\s+es\b|\bmeta\s+es\b|\bintenci[oó]n\s+es\b/i;
function hasGoalIntentContext(clauseText) { return GOAL_INTENT_ESCAPE_CUE.test(clauseText); }
// [DESIRED-OUTCOME FIELD SEMANTICS] confirmed live false positive (job
// 02293f22-6736-4fe3-bf77-a52805e68939): icp.desired_outcomes = "Aumentar citas y clientela
// Mejorar conversión consulta→cita Aprender pasos prácticos y replicables" flagged "Aumentar",
// "citas" and "Mejorar" as invented_result — but desired_outcomes is a field the ICP_SPECIALIST
// schema itself defines to hold the BUYER's own desired outcomes (see SPEC_FIELDS in
// llm_specialists.js). Its schema purpose already IS the goal/intent framing that
// GOAL_INTENT_ESCAPE_CUE otherwise requires an explicit textual cue ("quieren"/"buscan"/...) to
// establish — a bare qualitative wish list here needs no such cue to read as intent rather than a
// claim the system is making. Deliberately narrow and field-key-scoped (not a text-content
// exception for "Aumentar citas"/"Mejorar conversión" specifically, and not a blanket disable of
// invented_result inside this field): a magnitude-bearing claim (a number, %, "Nx", or timeframe
// anywhere in the same clause — e.g. "Aumentar ventas 30% en 30 días") is a concrete promise even
// as a stated "desired outcome" and is NOT escaped by this rule. Every other prohibition category
// (guarantee/evidence/invented_metric/testimonials/...) is untouched — desired_outcomes remains
// fully subject to them.
const GOAL_INTENT_FIELD_KEYS = new Set(['desired_outcomes']);
const RESULT_MAGNITUDE_RE = new RegExp(RESULT_MAGNITUDE, 'i');
function isDesiredOutcomeQualitativeGoal(fieldKey, clauseText, match) {
  // [FIELD ROLE MUST NOT BE A BYPASS] "Te ayudamos a aumentar ingresos" (advertiser voice) and
  // "Consigue más citas" (a CONJUGATED imperative, not the field's usual bare-infinitive goal-list
  // phrasing) must still detect even placed inside desired_outcomes. The field's original,
  // protected leniency — a BARE INFINITIVE claim-verb ("Aumentar citas", "Mejorar conversión") is
  // always read as a goal-list label, unconditionally exempt — stays completely unchanged (this is
  // exactly what keeps the already-protected gate-14 fixture, "Aumentar citas y clientela Mejorar
  // conversión consulta→cita Aprender pasos...", passing). What's NEW is that a match whose verb is
  // NOT a bare infinitive (a conjugated/imperative form) no longer gets that same free pass just for
  // being in this field — it falls through to the same adjacency-based structural check the other
  // BUYER_* roles use. nearestPairInfo's `verbText` is checked (not raw match[0]) because
  // INVENTED_RESULT_CLAIM matches the SAME "Aumentar citas" bigram from BOTH sides independently —
  // once with match[0]="Aumentar", once with match[0]="citas" — and both occurrences of one goal
  // phrase must resolve to the identical exemption verdict. All the referenced helpers/consts are
  // defined further down in this file; that is safe since this function is only ever CALLED after
  // the whole module has finished loading.
  if (!GOAL_INTENT_FIELD_KEYS.has(norm(fieldKey))) return false;
  if (isGuaranteedResultMatch(match[0])) return false;
  if (RESULT_MAGNITUDE_RE.test(clauseText)) return false;
  if (ADVERTISER_CLAIM_VOICE_CUE.test(clauseText)) return false;
  if (RESULT_SELF_SUFFICIENT_VERBS_RE.test(match[0])) return false;
  const pair = nearestPairInfo(clauseText, match);
  if (pair && BARE_INFINITIVE_RE.test(pair.verbText)) return true;
  if (BARE_INFINITIVE_RE.test(match[0])) return true; // no locatable pair (e.g. self-contained infinitive mention) — still a goal label
  return !isDirectlyAdjacentPair(clauseText, match);
}
// [CLAIM-CONTEXT ROLE MODEL] confirmed live false positive (job 6682572e-b316-4f2f-9c89-
// fb7b165bbdac): icp.pains = "Baja ocupación de citas" / "Dificultad para subir ticket medio" and
// icp.buying_triggers = "Baja ocupación de citas" were flagged as invented_result — but these
// fields hold the BUYER's own state/objection/trigger/attribute language, not an advertiser
// promise. The SAME lexical pair (claim-verb-shaped word + outcome noun) has a different meaning
// depending on CLAIM-CONTEXT ROLE and VOICE — "Baja ocupación" (adjective describing a low current
// state) vs "Baja tus precios" (imperative command); "Dificultad para subir ticket" (a buyer's
// difficulty, nominalized infinitive) vs "Sube tu ticket" (a direct second-person command).
// Generalized, deterministic, field-role-scoped — NEVER a literal exception for "Baja ocupación"
// or "subir ticket" specifically, and NEVER a blanket exemption for these fields (a genuine
// advertiser claim maliciously placed inside pains/buying_triggers/objections/qualification/
// non-fit still detects — see ADVERTISER_CLAIM_VOICE_CUE and the magnitude/guarantee/self-
// sufficient-verb overrides below, all of which take precedence over the field-role exemption).
const CLAIM_CONTEXT_FIELD_ROLES = {
  pains: 'BUYER_STATE',
  desired_outcomes: 'BUYER_GOAL', // kept in the table for documentation; its own narrower rule (isDesiredOutcomeQualitativeGoal) is unchanged and unaffected by this addition.
  objections: 'BUYER_OBJECTION',
  buying_triggers: 'BUYER_TRIGGER',
  qualification_signals: 'BUYER_ATTRIBUTE',
  non_fit_signals: 'BUYER_ATTRIBUTE',
};
// A descriptive buyer-context role never itself waives detection — only BUYER_STATE/
// BUYER_OBJECTION/BUYER_TRIGGER/BUYER_ATTRIBUTE get the structural exemption logic below.
// BUYER_GOAL (desired_outcomes) keeps its pre-existing, narrower, magnitude-gated rule untouched.
const BUYER_DESCRIPTIVE_CLAIM_ROLES = new Set(['BUYER_STATE', 'BUYER_OBJECTION', 'BUYER_TRIGGER', 'BUYER_ATTRIBUTE']);
function claimContextRoleForField(fieldKey) { return CLAIM_CONTEXT_FIELD_ROLES[norm(fieldKey)] || 'UNKNOWN'; }
// [VOICE / CLAIM-BEARING SIGNALS] deterministic, closed, grammatical-category cues — never a
// specific-phrase list. Second-person address (tú/tus/te/ti/usted/contigo/vas[+a]) and the generic
// Spanish future-tense 2nd-person-singular verb suffix (-arás/-erás/-irás/-drás, ANY verb stem) are
// the advertiser speaking directly TO the buyer ("Aumenta TUS ventas", "Duplicarás tus ventas",
// "Vas a conseguir más clientes"). First-person-plural advertiser verbs (queremos/ofrecemos/
// ayudamos/conseguimos/logramos/entregamos/brindamos/buscamos/necesitamos/deseamos/aspiramos/
// esperamos) are the exact grammatical-person mirror of the pre-existing GOAL_INTENT_ESCAPE_CUE's
// third-person set — that list already treats "buscan/quiere/necesitan/..." (someone else's goal)
// as escaping, and by the same logic "buscamos/queremos/necesitamos/..." (OUR OWN goal, stated to
// the buyer) must never escape. Any of these presentin the clause means the match is NOT
// descriptive buyer language, regardless of role.
const ADVERTISER_CLAIM_VOICE_CUE = /\btu\b|\btus\b|\bte\b|\bti\b|\bustedes?\b|\bcontigo\b|\bvas\b|\bvamos\s+a\b|\b\w+(?:ar[aá]s|er[aá]s|ir[aá]s|dr[aá]s)\b|\bqueremos\b|\bbuscamos\b|\bnecesitamos\b|\bdeseamos\b|\baspiramos\b|\besperamos\b|\bofrecemos\b|\bayudamos\b|\bconseguimos\b|\blogramos\b|\bentregamos\b|\bbrindamos\b/i;
// [NOMINALIZED INFINITIVE / PURPOSE-NEED CLAUSE] "Dificultad PARA subir ticket", "Necesidad DE
// conseguir más clientes" — a bare infinitive immediately governed by "de"/"para" is a Spanish
// noun-complement construction describing a NEED/DIFFICULTY/GOAL, grammatically incapable of being
// an imperative (an infinitive is never a command form) — generic by construction (any verb stem
// ending -ar/-er/-ir), never a lookup of which specific infinitive appears.
const NOMINALIZING_PREPOSITION_BEFORE_INFINITIVE = /\b(?:de|para)\s+$/i;
const BARE_INFINITIVE_RE = /^[a-záéíóúñ]+(?:ar|er|ir)$/i;
// [DIRECT-ADJACENCY TO PAIRED TERM] "Aumenta ventas"/"Consigue más citas" — the claim verb and its
// outcome noun sit with nothing (or only a small intensifier — más/mas/tan/tanto/tanta/muy) between
// them: a direct verb+object imperative/assertion shape. "Baja ocupación DE citas" — the outcome
// noun ("citas") is NOT what the claim-verb-shaped word directly governs; it is attached, via a
// genitive "de", to a DIFFERENT intervening noun ("ocupación") that the claim-verb-shaped word
// modifies as an ADJECTIVE instead. Measuring the actual gap between the two paired terms — not
// just "are both words present somewhere within 40 chars" — is what tells apart "the claim verb
// governs the outcome noun directly" from "an unrelated noun sits between them."
const CLAIM_VERB_RE_BARE = new RegExp(`\\b(?:${RESULT_CLAIM_VERBS})\\b`, 'i');
const OUTCOME_TERM_RE_BARE = new RegExp(`\\b(?:${RESULT_OUTCOME_TERMS})\\b`, 'i');
const SMALL_QUANTIFIER_GAP_RE = /^\s*(?:m[aá]s|tan|tant[oa]s?|muy)?\s*$/i;
// Returns { gapText, verbText } for the NEAREST occurrence of the "other" term paired with match —
// verbText is whichever of the two (match itself, or the paired occurrence) is the CLAIM_VERB side,
// regardless of which one triggered this particular match. This matters because INVENTED_RESULT_CLAIM
// matches BOTH directions independently ("Aumentar" via the verb-then-outcome branch, and "citas" via
// the outcome-then-verb branch, for the exact same "Aumentar citas" bigram) — a caller asking "is the
// VERB of this pairing a bare infinitive" must get the same answer for either occurrence, not just
// whichever half happened to be `match[0]` this time.
function nearestPairInfo(clauseText, match) {
  const isVerb = CLAIM_VERB_RE_BARE.test(match[0]);
  const otherRe = new RegExp(isVerb ? `\\b(?:${RESULT_OUTCOME_TERMS})\\b` : `\\b(?:${RESULT_CLAIM_VERBS})\\b`, 'gi');
  const matchStart = match.index; const matchEnd = match.index + match[0].length;
  let best = null;
  for (const m of clauseText.matchAll(otherRe)) {
    let gapText = null;
    if (m.index >= matchEnd) gapText = clauseText.slice(matchEnd, m.index);
    else if (m.index + m[0].length <= matchStart) gapText = clauseText.slice(m.index + m[0].length, matchStart);
    if (gapText == null) continue; // overlapping occurrence — not a valid pairing
    if (best == null || gapText.length < best.gapText.length) best = { gapText, otherText: m[0] };
  }
  if (!best) return null;
  return { gapText: best.gapText, verbText: isVerb ? match[0] : best.otherText };
}
function isDirectlyAdjacentPair(clauseText, match) {
  const info = nearestPairInfo(clauseText, match);
  if (info == null) return true; // no locatable paired term at all — conservatively treat as a claim, never exempt
  return SMALL_QUANTIFIER_GAP_RE.test(info.gapText);
}
const RESULT_SELF_SUFFICIENT_VERBS_RE = new RegExp(`^(?:${RESULT_SELF_SUFFICIENT_VERBS})$`, 'i');
// The single entry point checkExplicitProhibition calls for every invented_result match: returns
// true only when the match should be read as descriptive buyer-context language, never a claim.
function isBuyerContextDescriptiveMatch(fieldKey, clauseText, match) {
  const role = claimContextRoleForField(fieldKey);
  if (!BUYER_DESCRIPTIVE_CLAIM_ROLES.has(role)) return false;
  if (isGuaranteedResultMatch(match[0])) return false; // a guarantee is never descriptive, in any field
  if (RESULT_MAGNITUDE_RE.test(clauseText)) return false; // a quantified result is never descriptive, in any field
  if (RESULT_SELF_SUFFICIENT_VERBS_RE.test(match[0])) return false; // duplicar/triplicar always self-sufficiently claim a magnitude
  if (ADVERTISER_CLAIM_VOICE_CUE.test(clauseText)) return false; // advertiser voice present — field role is not a bypass
  const before = clauseText.slice(0, match.index);
  if (BARE_INFINITIVE_RE.test(match[0]) && NOMINALIZING_PREPOSITION_BEFORE_INFINITIVE.test(before)) return true;
  if (!isDirectlyAdjacentPair(clauseText, match)) return true;
  return false;
}
// [GUARANTEED RESULT CLAIM — precedence over desired_outcomes semantics] A guarantee is strictly
// stronger than a qualitative wish: "Resultados garantizados"/"Ventas garantizadas" must still be
// caught inside desired_outcomes even with zero magnitude present — isDesiredOutcomeQualitativeGoal
// above must never swallow a guarantee-verb match. A matched occurrence can only be this category
// if its own text is a guarantiz\w* form OR the bare word "resultado(s)" — neither can arise from
// any OTHER branch of INVENTED_RESULT_CLAIM (RESULT_CLAIM_VERBS has no guarantee verb, and
// "resultado(s)" was deliberately kept out of RESULT_OUTCOME_TERMS), so this test is exact, not a
// heuristic guess at which branch fired.
function isGuaranteedResultMatch(matchedText) {
  return /^garantiz/i.test(matchedText) || /^resultados?$/i.test(matchedText);
}
// [GUARANTEE NEGATION / ADVISORY ESCAPE] "No garantizamos resultados" and "Sin garantía de
// resultados" must not fail — but the generic negation cue list (isNegated() inside
// checkExplicitProhibition, below) is built around "no <ACTION> <OBJECT>" phrasing where the
// matched OBJECT follows the negated verb ("no usar testimonios"). A guarantee match is often the
// VERB itself ("no garantizamos" — the match IS "garantizamos", immediately after "no", with
// nothing else in between for the generic cue to anchor on), so it needs its own direct check: is
// the match text a garantiz\w* form immediately preceded by "no " (optionally with a clitic
// pronoun — "no te/les/nos garantizamos")? "Sin garantía de resultados" needs no special handling
// at all: "garantía" (the noun) never contains the "garantiz" verb stem, so it never matches this
// category's patterns in the first place — see isGuaranteedResultMatch() above.
// A second, distinct escape: advisory/avoidance framing ("Evitar prometer resultados
// garantizados", "no debemos prometer resultados garantizados") describes NOT making the claim,
// not making it — scoped to the same clause, before the match, and only for a guarantee-category
// match (never widened to any other invented_result phrasing).
const GUARANTEE_SELF_NEGATION_CUE = /\bno\s+(?:te\s+|les?\s+|nos\s+)?$/i;
const GUARANTEE_ADVISORY_CUE = /\bevitar\b|\bevita\b|\bevitando\b|\bno\s+(?:debe(?:s|mos|n)?\s+)?prometer\b/i;
function isGuaranteeNegationOrAdvisoryEscape(s, match) {
  if (!isGuaranteedResultMatch(match[0])) return false;
  const before = s.slice(0, match.index);
  if (/^garantiz/i.test(match[0]) && GUARANTEE_SELF_NEGATION_CUE.test(before)) return true;
  return GUARANTEE_ADVISORY_CUE.test(before);
}
const INVENTED_EVIDENCE_CLAIM = /\bprobad[oa]s?\b|\bvalidad[oa]s?\b|\bcomprobad[oa]s?\b|\bdemostrad[oa]s?\b|\bcase\s*stud(?:y|ies)\b|\bcasos?\s+de\s+[ée]xito\b|\bresultados?\s+anteriores?\b|\bclientes?\s+logr\w+\b|\bevidencia\s+real\b|\bantes\s*\/\s*despu[ée]s\b|\bresultados?\s+document\w+\b/i;
// [INVENTED METRIC ORDER FIX] confirmed live miss: "Objetivo ROAS 4x" (qualifier BEFORE the
// acronym) never matched the old acronym-then-qualifier-only pattern. Now bidirectional, plus a
// bare acronym+magnitude form ("ROAS 4x") that needs no qualifier word at all.
const INVENTED_METRIC_CLAIM = /\b(?:cac|cpa|cpl|roas|mer|ltv)\b[\s\S]{0,20}\b(?:esperad[oa]|proyectad[oa]|estimad[oa]|objetivo|meta)\b|\b(?:esperad[oa]|proyectad[oa]|estimad[oa]|objetivo|meta)\b[\s\S]{0,20}\b(?:cac|cpa|cpl|roas|mer|ltv)\b|\b(?:cac|cpa|cpl|roas|mer|ltv)\b[\s\S]{0,10}\d+\s*(?:%|x)\b/i;
const PROHIBITED_CONTENT_PATTERNS = [
  { type: 'testimonials', re: /testimonios?|\btestimonials?\b/i },
  { type: 'proof', re: /\bproof\b/i },
  { type: 'social_proof', re: /prueba\s+social|caso\s+de\s+estudio/i },
  { type: 'urgency', re: /urgencia/i },
  { type: 'scarcity', re: /escasez|oferta\s+limitada/i },
  { type: 'deadline', re: /\bdeadline\b/i },
  { type: 'guarantee', re: /garantizamos|garant[ií]a\s+de\s+resultado/i },
  { type: 'invented_metric', re: INVENTED_METRIC_CLAIM },
  { type: 'invented_result', re: INVENTED_RESULT_CLAIM },
  { type: 'invented_evidence', re: INVENTED_EVIDENCE_CLAIM },
];
const PROHIBITION_CATEGORY_TERMS = [
  { type: 'testimonials', re: /testimonios?|\btestimonials?\b/i },
  { type: 'proof', re: /\bproof\b/i },
  { type: 'social_proof', re: /prueba\s+social|caso\s+de\s+estudio/i },
  { type: 'urgency', re: /urgencia/i },
  { type: 'scarcity', re: /escasez|oferta\s+limitada/i },
  { type: 'deadline', re: /\bdeadline\b/i },
  { type: 'guarantee', re: /garantizamos|garant[ií]a\s+de\s+resultado/i },
  { type: 'invented_metric', re: /m[ée]tricas?|\b(cac|cpa|cpl|roas|mer|ltv)\b/i },
  { type: 'invented_result', re: /\bresultados?\b|\bresults?\b/i },
  { type: 'invented_evidence', re: /\bevidencia\b|\bevidence\b/i },
];
const EXPLICIT_PROHIBITION_DIRECTIVE = /\bno\s+(?:invent\w*|usar|incluir|utilizar|mencionar|presentar|afirmar|agregar|incorporar|garantiza\w*)\b/i;
function activeExplicitProhibitionCategories(constraintValue) {
  const active = new Set();
  for (const clause of norm(textOnly(constraintValue)).split(/[.!?;\n]/)) {
    const directive = EXPLICIT_PROHIBITION_DIRECTIVE.exec(clause);
    if (!directive) continue;
    // An adversative starts a new assertion and cannot extend the preceding prohibition.
    const prohibitedSpan = clause.slice(directive.index + directive[0].length).split(/\b(?:pero|sin embargo|aunque)\b/i)[0];
    const prohibitedText = directive[0] + ' ' + prohibitedSpan;
    for (const category of PROHIBITION_CATEGORY_TERMS) {
      if (category.re.test(prohibitedText)) active.add(category.type);
    }
  }
  return active;
}
const NEGATION_CUE = /\bno\s+(usar|incluir|utilizar|mencionar|presentar|afirmar)\b|=\s*unknown\b|\bsin\b[^.\n]{0,25}\bdisponible\b|\bno\s+hay\b/i;
// A genuinely FUTURE/conditional framing ("testimonios futuros si existen", "recopilar casos de
// éxito a futuro") is not a claim that the prohibited content exists now — it is the same kind of
// honest non-assertion NEGATION_CUE already recognizes, just phrased as a forward-looking
// contingency instead of an outright negation. Scoped to the same clause as the match, exactly
// like every other escape in this function.
const FUTURE_HEDGE_CUE = /\bfuturo?s?\b|\ba\s+futuro\b|\bsi\s+(?:existen?|hubiera|los\s+hay)\b|\beventualmente\b|\bcuando\s+(?:existan?|haya|los\s+haya)\b/i;
// [OCCURRENCE DIAGNOSTICS] valRawSentences is the field's own real text (case/accents intact,
// via textOnly() \u2014 never norm()'d). All matching below already relies on case-insensitive ('i')
// regexes, and every pattern that needs an accented variant already spells it out (e.g.
// garant[i\u00ed]a) \u2014 so running the exact same matching against real text instead of the
// lowercased/accent-stripped form changes no PASS/FAIL decision. It only lets each violation
// carry the literal matched substring and its literal containing clause, instead of nothing.
// [ARRAY ELEMENT BOUNDARY ISOLATION] confirmed live defect: textOnly() flattens an array into one
// space-joined string ("Falta de formación práctica Baja ocupación de citas Dificultad para subir
// ticket medio Gestión ineficiente de citas"), so checkExplicitProhibition's own clause-splitting
// (which only breaks on punctuation/adversatives — arrays are joined with a bare space, no
// punctuation at all) then treated FOUR separate pains array items as ONE clause, letting a
// CLAIM_VERB in one item pair with an OUTCOME_TERM in a completely different item via ordinary
// regex proximity. Each primitive leaf of the raw value (a string, or a string inside nested
// arrays/objects) keeps its OWN leaf_path and is run through the clause-splitting/detection logic
// SEPARATELY — never concatenated with a sibling array element first. A plain string field (no
// array) is unaffected: it still gets exactly one leaf, with leaf_path === key, matching prior
// behavior and output shape for every non-array field already covered by existing tests.
function collectTextLeaves(value, pathPrefix) {
  if (value == null) return [];
  if (typeof value === 'string') return value ? [{ text: value, leafPath: pathPrefix }] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [{ text: String(value), leafPath: pathPrefix }];
  if (Array.isArray(value)) {
    const out = [];
    value.forEach((item, i) => out.push(...collectTextLeaves(item, `${pathPrefix}[${i}]`)));
    return out;
  }
  if (typeof value === 'object') {
    const out = [];
    for (const [k, v] of Object.entries(value)) out.push(...collectTextLeaves(v, pathPrefix ? `${pathPrefix}.${k}` : k));
    return out;
  }
  return [{ text: String(value), leafPath: pathPrefix }];
}
function checkExplicitProhibition(facts, key, rawVal) {
  const cf = facts.constraints;
  if (!cf || cf.status !== 'USER_PROVIDED_FACT') return [];
  const activeCategories = activeExplicitProhibitionCategories(cf.value);
  if (!activeCategories.size) return [];
  const violations = [];
  for (const leaf of collectTextLeaves(rawVal, key)) {
    violations.push(...checkExplicitProhibitionOnLeaf(key, leaf.text, leaf.leafPath, activeCategories));
  }
  return violations;
}
function checkExplicitProhibitionOnLeaf(key, valRawSentences, leafPath, activeCategories) {
  const violations = [];
  // Commas in a negative enumeration preserve scope (CAC, ROAS, LTV, testimonios).
  // Adversatives, sentence boundaries and a new affirmative action end it. UNKNOWN
  // belongs only to its immediately preceding occurrence, never the whole clause.
  const clauses = valRawSentences.split(/[.!?;\n]|\b(?:pero|sin embargo|aunque)\b|[,\u2014]|\b(?:y|e)\s+(?=(?:usa\w*|inclu\w*|utiliza\w*|presenta\w*|afirma\w*|agrega\w*|incorpora\w*)\b)/i);
  let negativeList = false;
  let offset = 0;
  let clauseIndex = 0;
  for (const s of clauses) {
    const start = valRawSentences.indexOf(s, offset);
    const separator = valRawSentences.slice(offset, start);
    if (!/^\s*,\s*$/.test(separator)) negativeList = false;
    // [NEGATIVE CONSTRAINT SEMANTICS] confirmed live false positive: "No declarar métricas ni
    // testimonios" (a constraints field STATING a prohibition, exactly the same shape as the
    // canonical brief's own restriction) flagged "testimonios" as an EXPLICIT_PROHIBITION —
    // mentioning a prohibited category INSIDE a negative instruction is not using/inventing it.
    // "declarar" was simply missing from the negatable-verb list (usar/incluir/utilizar/mencionar/
    // presentar/afirmar/inventar were already covered); "evitar X" and bare "sin X" (without
    // requiring a following "disponible") are additional, independent negation shapes that never
    // had ANY cue at all. Each is scoped per-occurrence via `before` (the text up to the match),
    // exactly like the existing cues — never a blanket field/category escape: "Usar testimonios
    // reales" / "Incluir testimonios" (no negation cue present) still detect.
    const negative = /\bno\s+(?:inventes|inventar|inventen|usar|incluir|utilizar|mencionar|presentar|afirmar|declarar|declares?)\b|\bno\s+hay\b/gi;
    const actions = /\b(?:usa\w*|inclu\w*|utiliza\w*|menciona\w*|presenta\w*|afirma\w*|agrega\w*|incorpora\w*|declara\w*)\b/i;
    const ADVISORY_NEGATION_CUE = /\bevitar\b|\bevita\b|\bevitando\b/i;
    const isNegated = (idx, end) => {
      const before = s.slice(0, idx);
      let cueEnd = negativeList ? 0 : -1;
      for (const cue of before.matchAll(negative)) cueEnd = cue.index + cue[0].length;
      if (cueEnd >= 0 && !actions.test(before.slice(cueEnd))) return true;
      if (ADVISORY_NEGATION_CUE.test(before)) return true;
      if (/\bsin\s+$/i.test(before)) return true;
      return /^\s*=\s*unknown\b/i.test(s.slice(end)) ||
        (/\bsin\s+$/i.test(before) && /^\s+disponible\b/i.test(s.slice(end)));
    };
    for (const p of PROHIBITED_CONTENT_PATTERNS) {
      if (!activeCategories.has(p.type)) continue;
      for (const match of s.matchAll(new RegExp(p.re.source, 'gi'))) {
        if (p.type === 'invented_result' && (
          isMeasurementPurposeClause(s, match.index) || hasGoalIntentContext(s) ||
          isDesiredOutcomeQualitativeGoal(key, s, match) ||
          isGuaranteeNegationOrAdvisoryEscape(s, match) ||
          isBuyerContextDescriptiveMatch(key, s, match)
        )) continue;
        if (!isNegated(match.index, match.index + match[0].length) && !FUTURE_HEDGE_CUE.test(s)) {
          violations.push({
            type: 'EXPLICIT_PROHIBITION', fact_field: null, category: p.type, field_key: key,
            matched_text: match[0], matched_pattern: p.re.source,
            local_clause: s.trim(), clause_index: clauseIndex, occurrence_start: start + match.index,
            leaf_path: leafPath,
          });
        }
      }
    }
    negativeList = isNegated(s.length, s.length);
    offset = start + s.length;
    clauseIndex += 1;
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
// [NEW TACTICAL ADDITION REPAIR — confirmed live defect, job 8a8644f2-7e6e-47ae-bc04-
// a27562eb9d9e] repairUpstreamProposalStatus only ever repaired anchors that originated
// UPSTREAM (marked PROPUESTA there, then reused unmarked downstream). A brand-new tactical
// detail invented ENTIRELY within THIS node — no upstream anchor exists for it at all, e.g.
// "recordatorio 24h" dreamed up by WHATSAPP_SALES_SPECIALIST itself — had no repair path:
// UNLABELED_PROPOSAL just failed closed with zero attempt to fix it. This walks the SAME
// TACTICAL_DETAIL_PATTERNS source checkUnlabeledProposal already validates against — leaf-aware
// (arrays/nested objects), same negation/marker escapes — and prefixes PROPUESTA: at the start of
// the containing clause: the identical deterministic PREFIX_PROPUESTA repair already used for
// upstream propagation, just sourced locally instead of from an upstream anchor.
//
// Deliberately excludes CONFIRMED_UNSUPPORTED_ADDITIONS: those are the confirmed E2E adversarial
// additions from an EARLIER, separate defect (testimonials, deadline, oferta limitada, webinar
// demo, ...) — content serious enough that it must keep failing closed for a human/LLM to
// address, never silently auto-labeled PROPUESTA by this mechanical repair. Auto-repairing them
// was a confirmed regression here: astra_campaign360_node_fidelity_diagnostic_propagation.test.js
// specifically exercises "webinar demo sin marcar como propuesta" staying a hard FAILED. Gated
// exactly like checkUnlabeledProposal's tactical branch (facts.constraints must be a
// USER_PROVIDED_FACT and the broader unlabeledProposalGateActive check), so it is a no-op
// wherever that check itself would never have fired.
function localUnlabeledProposalHits(facts, rawValue) {
  const cf = facts.constraints;
  if (!cf || cf.status !== 'USER_PROVIDED_FACT' || !unlabeledProposalGateActive(cf)) return [];
  const patterns = TACTICAL_DETAIL_PATTERNS;
  if (!patterns.length) return [];
  const hits = []; const seen = new Set();
  for (const leaf of proposalLeafEntries(rawValue)) {
    const text = norm(leaf.value);
    const markerIndex = firstMarkerIndex(text);
    for (const span of proposalClauseSpans(text)) {
      const clause = text.slice(span.start, span.end);
      if (NEGATION_CUE.test(clause)) continue; // negated/nulled, not an addition
      for (const re of patterns) {
        const match = re.exec(clause);
        if (!match) continue;
        const idx = span.start + match.index;
        if (markerIndex !== -1 && idx >= markerIndex) continue; // already labeled
        const identity = JSON.stringify(leaf.path) + ':' + span.start + ':' + re.source;
        if (seen.has(identity)) continue;
        seen.add(identity);
        hits.push({ matched_anchor: match[0], leaf_path: formatLeafPath(leaf.path), leaf_path_parts: leaf.path, clause_index: span.clauseIndex, repair_offset: span.start });
      }
    }
  }
  return hits;
}
function repairUpstreamProposalStatus(facts, output, upstreamOutputs = []) {
  let repairedOutput = cloneJsonValue(output);
  const anchors = upstreamProposalAnchors(facts, upstreamOutputs);
  const repairs = [];
  const container = repairedOutput && repairedOutput.downstream_payload && typeof repairedOutput.downstream_payload === 'object'
    ? repairedOutput.downstream_payload : repairedOutput;
  if (!container || typeof container !== 'object' || Array.isArray(container)) return { output: repairedOutput, repairs };
  for (const [fieldKey, rawValue] of Object.entries(container)) {
    const hits = proposalPropagationHits(rawValue, anchors).concat(localUnlabeledProposalHits(facts, rawValue));
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
      // Two hits at the same clause (e.g. an upstream-propagated anchor and a brand-new
      // tactical addition both inside "si no responde 48h: ... oferta limitada ...") must only
      // insert one PROPUESTA: prefix, not one per hit — dedupe by repair_offset.
      const offsets = [...new Set(leafHits.map(hit => hit.repair_offset))];
      repairedValue = setAtPath(repairedValue, path, prefixProposalClauses(originalLeaf, offsets));
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
    const rawTextVal = textOnly(rawVal);
    const markerIndex = firstMarkerIndex(textVal);
    const siblingEntries = normEntries.filter(([k]) => k !== key);
    for (const v of checkFieldSubstitutions(facts, key, rawVal, siblingEntries)) violations.push(v);
    for (const v of checkKnownFactDenial(facts, key, textVal)) violations.push(v);
    for (const v of checkUnlabeledProposal(facts, key, textVal, markerIndex)) violations.push(v);
    for (const v of checkExplicitProhibition(facts, key, rawVal)) violations.push(v);
    for (const v of checkUpstreamProposalPropagation(key, rawVal, proposalAnchors)) violations.push(v);
  }
  const combinedText = textEntries.map(([, v]) => v).join(' \n ');
  for (const v of checkBuyerPositivePreservation(facts, nodeId || null, combinedText)) violations.push(v);
  for (const v of checkMechanismPositivePreservation(facts, nodeId || null, combinedText)) violations.push(v);
  return { violations: violations.map(v => ({ ...v, node: nodeId || null, path: pathFor(nodeId, v.field_key) })) };
}

// ---------- [FINAL SYNTHESIS ROLE COHERENCE] confirmed live defect (job
// bf7fca56-0575-45d4-8bc1-f8791ed1abf7): the first live run to complete all 8 nodes revealed that
// a MECHANISM_OUTCOME (a stage the product TEACHES — "consulta → conversación → cita") can be
// silently promoted into a CAMPAIGN_CONVERSION (what this specific campaign's ad spend is actually
// selling) purely because it shares commercial vocabulary. Neither the per-node validator (each
// node individually is fine — "cita" is legitimate mechanism prose) nor synthesize() (a pure
// pass-through/aggregator of each node's own downstream_payload — it invents nothing itself) is
// the place this belongs; it is a genuinely CROSS-NODE, FINAL-SYNTHESIS-ONLY coherence problem:
// funnel/whatsapp_conversion/measurement each independently and validly describe "the mechanism
// ends at X", and only when their outputs sit together in the deliverable does "campaign conversion
// = purchase, OR X" become visible as a role conflict. Deliberately NOT a hardcoded "cita" ban:
// the mechanism's own arrow-chain endpoint(s) are extracted generically (works identically for
// "anuncio → reserva → visita" or a bare "conseguir clientes"), and a term is flagged only when it
// appears as an ENUMERATED ALTERNATIVE in one of the three fields that literally ARE this
// campaign's conversion definition — never inside mechanism/offer/educational-content prose,
// which is untouched. A term already present in business_objective is never a mechanism-only term
// (CASE A8/A9: an explicitly requested appointment/lead objective stays fully valid).
// Bilingual, bounded (connectors + generic teaching/using/converting verbs only — never endpoint
// NOUNS like "appointment"/"demo"/"call", which must stay extractable regardless of language).
const MECHANISM_TERM_STOPWORDS = new Set(('para con del las los una uno unos unas por que como este esta estos estas cada todo toda todos todas para sera seran hacia sobre entre desde hasta '
  + 'meta ads facebook instagram google tiktok whatsapp '
  + 'genera generar generando convierte convertir convirtiendo gestiona gestionar gestionando ensena ensenar enseñar enseña aplica aplicar aprende aprender usa usar utiliza utilizar teach teaches teaching '
  + 'using use uses convert converts converting manage manages managing generate generates generating learn learns learning '
  + 'for and the to with via through on at of a an is are book books booking schedule schedules scheduling request requests requesting register registers registering '
  + 'get gets getting obtain obtains obtaining contact contacts contacting click clicks clicking').split(/\s+/));
function escapeRegExpLiteral(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// [LANGUAGE-ROBUST STRUCTURE-FIRST EXTRACTION] a mechanism's stage chain is recognized by its
// ARROW STRUCTURE, never by which language names the stages — "ad -> WhatsApp -> appointment" and
// "anuncio -> WhatsApp -> cita" extract their terminal candidate the exact same way, by POSITION,
// with no vocabulary lookup at all. This is the single shared arrow-token pattern for every split
// in this file (→/⇒/➜/-->/->/> — longest tokens first so "-->" isn't half-consumed as "->").
// Deliberately no 'g' flag: reused via .split() (which doesn't need it) and this exact instance
// is never reused with .test()/.exec() elsewhere, so there is no shared-lastIndex statefulness risk.
const ARROW_RE = /→|⇒|➜|-->|->|>/;
// Naive de-pluralization (English/Spanish "-s" only, never applied to words <=4 chars to avoid
// mangling short real words) so a plural mechanism-chain word ("appointments") and its singular
// use elsewhere ("Book appointment") resolve to the SAME stem — the stem-match regex built from a
// term only ever extends forward (`\bterm\w*\b`), so storing the shorter/singular form is what
// lets it match both directions.
function stemMechanismTerm(w) { return w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w; }
function extractMechanismStageTerms(mechanismValue) {
  const text = String(mechanismValue || '');
  const parts = text.split(ARROW_RE);
  const terms = new Set();
  if (parts.length > 1) {
    // Arrow chain present: take ONLY the stage token immediately touching each arrow (never the
    // descriptive lead-up prose, which is where tool/channel names like "Meta Ads"/"WhatsApp" live).
    parts.forEach((seg, i) => {
      if (i === 0) {
        const words = norm(seg).split(/[^a-z0-9]+/).filter(Boolean);
        if (words.length) terms.add(stemMechanismTerm(words[words.length - 1]));
      } else if (i === parts.length - 1) {
        const trailing = seg.split(/[.,;:\n]/)[0];
        for (const w of norm(trailing).split(/[^a-z0-9]+/)) if (w.length >= 3 && !MECHANISM_TERM_STOPWORDS.has(w)) terms.add(stemMechanismTerm(w));
      } else {
        for (const w of norm(seg).split(/[^a-z0-9]+/)) if (w.length >= 3 && !MECHANISM_TERM_STOPWORDS.has(w)) terms.add(stemMechanismTerm(w));
      }
    });
  } else {
    // No explicit stage chain — fall back to filtered whole-text keywords (e.g. "conseguir
    // clientes"): still excludes tool/channel names and generic teaching/using verbs.
    for (const w of norm(text).split(/[^a-z0-9]+/)) if (w.length >= 4 && !MECHANISM_TERM_STOPWORDS.has(w)) terms.add(stemMechanismTerm(w));
  }
  return [...terms];
}
const PURCHASE_GROUNDING_VOCAB = ['compra', 'compras', 'comprar', 'pago', 'pagar', 'pagos', 'venta', 'ventas', 'vender', 'purchase', 'buy', 'pay', 'sale', 'sales', 'checkout', 'pedido', 'orden'];

// [BOUNDED CROSS-LANGUAGE ENDPOINT EQUIVALENCE] confirmed gap: structure-first arrow-position
// extraction never does a vocabulary lookup, so it already treats "ad -> WhatsApp -> appointment"
// and "anuncio -> WhatsApp -> cita" identically WHEN both sides of a comparison use the same
// language — but a mechanism naming its endpoint in one language and a synthesis field naming the
// SAME concept in the other has zero string overlap ("cita" vs "appointment" share no characters)
// and was silently invisible to both detection and grounding. This is a small, explicit, SYMMETRIC
// table over generic commercial CONVERSION-ENDPOINT NOUNS ONLY — the exact closed set already
// named by this system's own language-invariance property (never a Método 360 phrase, never an
// industry-specific term, never general prose translation, which stays forbidden). A cognate pair
// that already shares a lexical root ("consulta"/"consultation", "demo"/"demostración") needs no
// table entry at all — TERM_MATCHES_CANDIDATE_WORD below already recognizes those bidirectionally.
const ENDPOINT_SYNONYM_PAIRS = [
  ['cita', 'appointment'], ['reserva', 'reservation'], ['visita', 'visit'],
  ['llamada', 'call'], ['consulta', 'consultation'], ['conversacion', 'conversation'],
];
// Returns [term, ...its bounded synonym(s)] — always includes term itself. A mechanism term and
// its cross-language counterpart must be treated as ONE unit for objective-grounding purposes (see
// mechanismTermsForFacts): an objective stated in either language must exempt BOTH forms, or a
// synthesis simply restating the mechanism's own endpoint in the objective's language would still
// be flagged.
function endpointSynonymCluster(term) {
  const cluster = new Set([term]);
  for (const [es, en] of ENDPOINT_SYNONYM_PAIRS) {
    if (term === es || es.startsWith(term) || term.startsWith(es)) cluster.add(en);
    if (term === en || en.startsWith(term) || term.startsWith(en)) cluster.add(es);
  }
  return [...cluster];
}
// Generalizes the forward-only "\bterm\w*\b" stem match to also catch the REVERSE cognate
// direction — a mechanism term that is the LONGER form of a shared root ("consultation") while the
// candidate uses the shorter cognate ("consulta"), or vice versa ("demostración" mechanism term vs
// "demo" candidate). Gated to words of length >= 4 on both sides so a short incidental substring
// ("co" inside "compra") can never count as a spurious prefix match.
function termMatchesCandidateWord(term, normCandidate) {
  if (new RegExp('\\b' + escapeRegExpLiteral(term) + '\\w*\\b').test(normCandidate)) return true;
  if (term.length < 4) return false;
  return normCandidate.split(/[^a-z0-9]+/).some(w => w.length >= 4 && term.startsWith(w));
}

// [ROLE-COHERENCE COVERAGE] Explicit semantic-role table by leaf/path, instead of a growing pile
// of isolated field-specific regex hacks — every field this system inspects is registered ONCE,
// with the classification that determines HOW STRICTLY it is checked. This is the single place a
// new field is added when coverage needs to grow; no per-field logic ever lives outside this
// table plus the shared extraction/grounding helpers below.
//   - STRICT: the field's ENTIRE value (whole text, even with no enumeration at all) IS this
//     campaign's own claimed conversion/endpoint — funnel.conversion_intent, whatsapp closing,
//     whatsapp recovery (a recovery message's own proposed closing action), measurement.primary_outcome.
//   - SEQUENCE: the field describes an ordered PROCESS (funnel.stages/transitions,
//     measurement.funnel_metrics) — intermediate steps are always legitimate process description,
//     never candidates in their own right; only an item that is ITSELF an arrow chain contributes
//     its TERMINAL segment as a candidate (an item with no arrow at all is pure description and is
//     never inspected). This is what lets "Meta Ads genera consultas; WhatsApp gestiona la
//     conversación; compra del minicurso" pass while "Meta Ads → Landing → WhatsApp → Cita" still
//     flags its own terminal.
//   - ENUMERATION: the field lists several independently-named metrics/items (ad_strategy.measurement,
//     measurement.conversion_metrics) — split on ";" AND "," (each item genuinely claims to BE a
//     named endpoint/metric on its own, unlike a SEQUENCE's intermediate steps), and each item's
//     own arrow-terminal (if it has one) or whole text (if it doesn't) is a candidate.
//   - SAFE: legitimate to mention the mechanism/intermediate steps without being treated as this
//     campaign's own conversion at all — whatsapp.follow_up, measurement.leading_indicators,
//     ad_strategy.campaign_objective (a MEDIA/PLATFORM objective like "Mensajes" is never the
//     same thing as the campaign's commercial objective and must never be role-confused with it).
//   Any field/section not listed here is not inspected by this check at all — mechanism/offer/
//   educational-content/ICP fields are never touched, by omission, not by a special-case escape.
const FINAL_SYNTHESIS_FIELD_ROLES = {
  '6_funnel': {
    stages: 'SEQUENCE', transitions: 'SEQUENCE', conversion_intent: 'STRICT',
  },
  '8_ad_strategy': {
    measurement: 'ENUMERATION', campaign_objective: 'SAFE',
  },
  '12_whatsapp_followup_closing': {
    closing: 'STRICT', recovery: 'STRICT', follow_up: 'SAFE', objections: 'SAFE',
  },
  '13_measurement_kpis': {
    primary_outcome: 'STRICT', funnel_metrics: 'SEQUENCE', conversion_metrics: 'ENUMERATION',
    leading_indicators: 'SAFE', diagnostic_metrics: 'SAFE', optimization_triggers: 'SAFE', measurement_cadence: 'SAFE',
  },
};
function mechanismTermsForFacts(facts) {
  const mf = facts.mechanism;
  if (!mf || mf.status !== 'USER_PROVIDED_FACT' || !mf.value) return [];
  const objectiveWords = new Set(norm((facts.business_objective && facts.business_objective.value) || '').split(/[^a-z0-9]+/).filter(w => w.length >= 3));
  // Stem-aware, not exact-match: "citas" (objective) must exclude the mechanism term "cita" —
  // singular/plural and light conjugation differences are common between a brief's own wording
  // of its objective and the mechanism's stage-chain token for the same concept.
  const objectiveGrounds = term => [...objectiveWords].some(w => w.startsWith(term) || term.startsWith(w));
  // Expand each extracted term with its bounded cross-language synonym cluster BEFORE testing
  // objective-grounding, and exclude/keep the WHOLE cluster together — an objective stated in
  // either language ("generar citas" / "book appointments") must exempt both the Spanish and the
  // English form of the same endpoint concept, never just whichever form happens to share the
  // objective's language.
  const result = [];
  for (const term of extractMechanismStageTerms(mf.value)) {
    const cluster = endpointSynonymCluster(term);
    if (cluster.some(objectiveGrounds)) continue;
    for (const c of cluster) result.push(c);
  }
  return [...new Set(result)];
}
// Reduces one segment to its candidate phrase: if it's itself an arrow chain, only the TERMINAL
// (the part after the last arrow, up to the next punctuation) is a candidate — everything before
// the last arrow is process description, never a claimed endpoint on its own. Returns null for an
// arrow-free segment when the caller doesn't want whole-segment fallback (SEQUENCE shape).
function arrowTerminalOrNull(seg) {
  const arrowParts = seg.split(ARROW_RE);
  if (arrowParts.length < 2) return null;
  return arrowParts[arrowParts.length - 1].split(/[.,;:\n]/)[0].trim() || null;
}
function extractStrictCandidates(text) {
  const candidates = [];
  for (const item of text.split(/;/).map(s => s.trim()).filter(Boolean)) {
    for (const seg of item.split(/\s+o\s+|\s+or\s+/i).map(s => s.trim()).filter(Boolean)) {
      candidates.push(arrowTerminalOrNull(seg) || seg);
    }
  }
  return candidates;
}
function extractSequenceCandidates(text) {
  const candidates = [];
  for (const item of text.split(/;/).map(s => s.trim()).filter(Boolean)) {
    const terminal = arrowTerminalOrNull(item);
    if (terminal) candidates.push(terminal); // an item with no arrow is pure process description — never a candidate
  }
  return candidates;
}
function extractEnumerationCandidates(text) {
  const candidates = [];
  for (const item of text.split(/[;,]/).map(s => s.trim()).filter(Boolean)) {
    candidates.push(arrowTerminalOrNull(item) || item); // each item independently claims to BE a named endpoint/metric
  }
  return candidates;
}
function extractConversionCandidates(text, role) {
  if (role === 'STRICT') return extractStrictCandidates(text);
  if (role === 'SEQUENCE') return extractSequenceCandidates(text);
  if (role === 'ENUMERATION') return extractEnumerationCandidates(text);
  return [];
}
// [COMPOUND-NOUN COLLISION FIX] confirmed gap: "sales" (PURCHASE_GROUNDING_VOCAB) can occur purely
// as a MODIFIER of the mechanism's own endpoint noun — "sales call" is a KIND OF CALL (the
// mechanism's own term), not an assertion that a sale happened. A purchase-vocab match immediately
// adjacent to one of this mechanism's own extracted terms is that compound, not grounding — so it
// is excluded; any OTHER, non-adjacent purchase-vocab match (the normal case: "Comprar minicurso",
// "Ofrecer link pago") still grounds normally.
function isConversionCandidateGrounded(normCandidate, objectiveWords, mechanismTerms) {
  const groundedByObjective = [...objectiveWords].some(w => normCandidate.includes(w));
  if (groundedByObjective) return true;
  for (const w of PURCHASE_GROUNDING_VOCAB) {
    const m = new RegExp('\\b' + w + '\\w*\\b').exec(normCandidate);
    if (!m) continue;
    const before = normCandidate.slice(0, m.index).trim().split(/\s+/).pop() || '';
    const after = normCandidate.slice(m.index + m[0].length).trim().split(/\s+/)[0] || '';
    const isCompoundWithMechanismTerm = (mechanismTerms || []).some(t => before === t || after === t || before.startsWith(t) || after.startsWith(t));
    if (!isCompoundWithMechanismTerm) return true;
  }
  return false;
}
function checkMechanismToCampaignConversionPromotion(facts, key, rawVal) {
  const sectionRoles = FINAL_SYNTHESIS_FIELD_ROLES[key];
  if (!sectionRoles || !rawVal || typeof rawVal !== 'object') return [];
  const mechanismTerms = mechanismTermsForFacts(facts);
  if (!mechanismTerms.length) return [];
  const objectiveWords = new Set(norm((facts.business_objective && facts.business_objective.value) || '').split(/[^a-z0-9]+/).filter(w => w.length >= 3));
  const violations = [];
  for (const [subKey, role] of Object.entries(sectionRoles)) {
    if (role === 'SAFE') continue;
    const raw = rawVal[subKey];
    if (!raw || typeof raw !== 'string') continue;
    const candidates = extractConversionCandidates(raw, role);
    for (const candidate of candidates) {
      const normCandidate = norm(candidate);
      const matchedTerm = mechanismTerms.find(term => termMatchesCandidateWord(term, normCandidate));
      if (!matchedTerm) continue;
      if (isConversionCandidateGrounded(normCandidate, objectiveWords, mechanismTerms)) continue;
      violations.push({
        type: 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION', fact_field: 'mechanism', field_key: subKey,
        matched_text: candidate, matched_anchor: matchedTerm, section: key,
      });
    }
  }
  return violations;
}

// ---------- [FINAL SYNTHESIS EPISTEMIC CONSISTENCY] confirmed live defect: the SAME
// final_synthesis.14_assumptions array contained "Presupuesto de anuncios disponible y definido
// por usuario." alongside "Presupuesto de ads desconocido." — dedupeStrings() in synthesize()
// only removes byte-identical duplicates; two node outputs asserting OPPOSITE epistemic status
// about the same topic both survive verbatim. Two independent, symmetric checks, neither of which
// requires a new canonical-fact field (this stays scoped to the synthesized assumptions list, not
// a rewrite of campaign_brief_facts.js's schema):
//   1. an assumption attributing a fact to the USER ("definido/indicado/... por el usuario",
//      "disponible y definido") for a topic whose own significant keyword is absent from the raw
//      brief text is a fabricated attribution — the user never said it;
//   2. symmetrically, an assumption denying knowledge ("desconocido", "por confirmar/definir") of
//      a topic whose keyword IS present in the raw brief is a false denial of a known fact;
//   3. independent of rawRequest: two assumptions in the SAME list asserting opposite epistemic
//      status (one confident/attributed, one pending/unknown) about a shared significant keyword
//      contradict each other outright.
// `s?` after each adjective ending tolerates plural agreement ("KPI definidos", "requisitos
// confirmados") — a purely grammatical robustness fix, not a new semantic category.
// [PRE-EXISTING BUG FIX, surfaced by B1] the trailing \b after an accented verb ending
// ("confirm[oó]") never matches: JS regex \b is defined over the ASCII \w class, so "ó" itself
// never counts as a word character — the position right after it sits between two NON-word
// characters ("ó" and, say, a following space), which is never a boundary, so \b silently fails
// every time this branch's verb form ends in an accented vowel ("indicó"/"confirmó"/
// "proporcionó"/"especificó"). Replaced with a lookahead that only rejects a CONTINUING letter
// (never breaks on the accented vowel itself), which is what the trailing \b was actually meant to
// guard against.
const ASSUMPTION_USER_ATTRIBUTION_CUE = /\b(definid[oa]s?|indicad[oa]s?|proporcionad[oa]s?|confirmad[oa]s?|especificad[oa]s?)\s+por\s+(el\s+)?usuario\b|\busuario\s+(indic[oó]|proporcion[oó]|confirm[oó]|especific[oó])(?![a-záéíóúñA-ZÁÉÍÓÚÑ])|\bdisponible\s+y\s+definid[oa]s?\b/i;
const ASSUMPTION_CERTAINTY_CUE = /\b(operativ[oa]s?|list[oa]s?|confirmad[oa]s?|definid[oa]s?|disponible|inclu[iy]d[oa]s?)\b/i;
const ASSUMPTION_UNKNOWN_CUE = /\bdesconocid[oa]s?\b|\bpor\s+(confirmar|definir)\b|\bpendiente(s)?\b|\bno\s+(disponible|definid[oa]s?|especificad[oa]s?)\b/i;
const ASSUMPTION_TOPIC_STOPWORDS = new Set('para con del las los una uno unos unas este esta estos estas cada todo toda propuesta assumption asumo existe existira habra sera seran monto valor'.split(' '));
// [SHORT-TOPIC EPISTEMIC COVERAGE] confirmed gap: a real topic can be a short business acronym
// (CAC, KPI, CRM, LTV, API, SEO, IVA, ...) that the >=4-char normal-word floor discards entirely.
// Generic rule, not a closed whitelist: 2-5 ALL-CAPS ASCII/Latin letters, word-bounded, checked on
// the ORIGINAL (case-preserved) text — lowercase short tokens ("de", "la", "abc") never qualify
// this way, so they still can't become an accidental anchor just by coincidence of length. An
// optional trailing lowercase "s" (plural — "KPIs") is captured and stripped so "KPI" and "KPIs"
// resolve to the same topic.
const ACRONYM_TOPIC_RE = /\b([A-Z]{2,5})s?\b/g;
// [ACRONYM FALSE-POSITIVE CONTROL] confirmed gap: a sentence typed or pasted in ALL CAPS (or one
// that simply capitalizes an ordinary short function word) makes that word indistinguishable from
// a real acronym by case alone — "EL CAC DEL MES ESTA DEFINIDO..." matches "EL", "DEL" and "ESTA"
// under ACRONYM_TOPIC_RE exactly as readily as it matches "CAC". This is the SAME short-function-
// word category (articles/prepositions/copulas/conjunctions in both languages) the >=4-char normal-
// word floor already excluded by length alone — extending it to acronym-length tokens too is reusing
// the existing filter, not inventing a new one, and it stays purely grammatical/closed-class (never
// a business or industry term), so a genuine short acronym is never at risk of exclusion.
const ACRONYM_TOPIC_STOPWORDS = new Set(('el la lo le se su mi tu un al es de en no si ya y o u ni tan mas '
  + 'is at on of an to in be do so up as it if or my we he by go no us the and are was').split(' '));
// Returns candidate topic words for a cue sentence, ACRONYMS FIRST (longest-first within each
// group). An acronym is a deliberately-extracted, high-signal business term (CAC, KPI...); an
// incidental long word elsewhere in the same sentence ("reunión", "mensualidad") is noise by
// comparison. Callers take words[0] as THE topic, so acronym-first ordering — not just acronym
// inclusion — is required: otherwise a sentence naming both a real acronym and an unrelated long
// word (e.g. "El CAC del mes fue definido por el usuario en la reunión de ayer") would anchor on
// the long word and could false-flag (or fail to flag) based on that word's grounding instead of
// the acronym's, even though the acronym is the actual subject of the assumption.
function assumptionTopicWords(text, cueRegex) {
  const stripped = String(text || '').replace(new RegExp(cueRegex.source, cueRegex.flags.replace('g', '') + 'g'), ' ');
  const acronyms = [...stripped.matchAll(ACRONYM_TOPIC_RE)]
    .map(m => m[1].toLowerCase())
    .filter(w => !ACRONYM_TOPIC_STOPWORDS.has(w) && !ASSUMPTION_TOPIC_STOPWORDS.has(w));
  const acronymSet = new Set(acronyms);
  const normalWords = norm(stripped).split(/[^a-z0-9]+/).filter(w => {
    if (w.length < 4 || ASSUMPTION_TOPIC_STOPWORDS.has(w)) return false;
    // Skip a plural surface form ("kpis") already covered by its singular acronym ("kpi") — keeping
    // both would let the longer-wins topic-selection pick a form that never matches the raw brief.
    if (w.endsWith('s') && acronymSet.has(w.slice(0, -1))) return false;
    return true;
  });
  const uniqueAcronyms = [...new Set(acronyms)].sort((a, b) => b.length - a.length);
  const uniqueNormalWords = [...new Set(normalWords)].sort((a, b) => b.length - a.length);
  return [...uniqueAcronyms, ...uniqueNormalWords];
}
function checkAssumptionEpistemicConsistency(key, rawVal, rawRequest) {
  if (key !== '14_assumptions' || !Array.isArray(rawVal)) return [];
  const items = rawVal.filter(x => typeof x === 'string');
  const violations = [];
  const normRequest = rawRequest ? norm(String(rawRequest)) : null;
  const parsed = items.map(text => ({
    text,
    attributed: ASSUMPTION_USER_ATTRIBUTION_CUE.test(text),
    unknown: ASSUMPTION_UNKNOWN_CUE.test(text),
    certain: ASSUMPTION_CERTAINTY_CUE.test(text) || ASSUMPTION_USER_ATTRIBUTION_CUE.test(text),
  }));
  // Rule 1 — isolated unsupported attribution / false known-fact denial (needs rawRequest).
  if (normRequest != null) {
    for (const p of parsed) {
      if (p.attributed) {
        const words = assumptionTopicWords(p.text, ASSUMPTION_USER_ATTRIBUTION_CUE);
        const topic = words[0];
        if (topic && !new RegExp('\\b' + escapeRegExpLiteral(topic) + '\\w*\\b').test(normRequest)) {
          violations.push({ type: 'UNSUPPORTED_USER_ATTRIBUTION', fact_field: null, field_key: key, matched_text: p.text, matched_anchor: topic });
        }
      } else if (p.unknown) {
        const words = assumptionTopicWords(p.text, ASSUMPTION_UNKNOWN_CUE);
        const topic = words[0];
        if (topic && new RegExp('\\b' + escapeRegExpLiteral(topic) + '\\w*\\b').test(normRequest)) {
          violations.push({ type: 'KNOWN_FACT_DENIAL', fact_field: null, field_key: key, matched_text: p.text, matched_anchor: topic });
        }
      }
    }
  }
  // Rule 2 — cross-item contradiction within the same list (no rawRequest needed).
  for (let i = 0; i < parsed.length; i++) {
    if (!parsed[i].certain) continue;
    const certainTopics = new Set(assumptionTopicWords(parsed[i].text, parsed[i].attributed ? ASSUMPTION_USER_ATTRIBUTION_CUE : ASSUMPTION_CERTAINTY_CUE));
    if (!certainTopics.size) continue;
    for (let j = 0; j < parsed.length; j++) {
      if (i === j || !parsed[j].unknown) continue;
      const unknownTopics = assumptionTopicWords(parsed[j].text, ASSUMPTION_UNKNOWN_CUE);
      if (unknownTopics.some(w => certainTopics.has(w))) {
        violations.push({ type: 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS', fact_field: null, field_key: key, matched_text: parsed[i].text, conflicting_text: parsed[j].text });
      }
    }
  }
  return violations;
}

// ---------- [FINAL SYNTHESIS REPAIR — bounded, deterministic-first] Per the authorized sequence:
// node outputs -> synthesize() -> validateFinalSynthesis() -> repair ONLY if every violation
// present is an explicitly authorized repairable class -> revalidate -> COMPLETE only if clean,
// else fail closed. EXPLICIT_PROHIBITION, invented metrics/evidence/guarantees/testimonials,
// *_SUBSTITUTION, UNLABELED_PROPOSAL, and the FACT-based KNOWN_FACT_DENIAL (price/buyer/geography/
// product/mechanism — field_key != '14_assumptions') are never in this set; any one of them present
// anywhere makes the whole violation list ineligible for repair, unchanged from before this gate.
const REPAIRABLE_FINAL_SYNTHESIS_TYPES = new Set(['MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION', 'UNSUPPORTED_USER_ATTRIBUTION', 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS']);
function isRepairableFinalSynthesisViolation(v) {
  if (REPAIRABLE_FINAL_SYNTHESIS_TYPES.has(v.type)) return true;
  // KNOWN_FACT_DENIAL is emitted by TWO different systems: the strict canonical-fact denial check
  // (fact_field = price/buyer/geography/product_name/product_type/mechanism — never repairable,
  // denying a core canonical fact is serious) and this gate's own assumption-epistemic-consistency
  // check (field_key === '14_assumptions', fact_field null) — only the latter is authorized here.
  if (v.type === 'KNOWN_FACT_DENIAL' && v.field_key === '14_assumptions') return true;
  return false;
}
function canonicalConversionPhrase(facts) {
  const name = (facts.product_type && facts.product_type.value) || (facts.product_name && facts.product_name.value) || 'la oferta';
  return `Compra/pago de ${name}`;
}
function isCandidateFlaggedForRepair(candidate, mechanismTerms, objectiveWords) {
  const normCandidate = norm(candidate);
  const matchedTerm = mechanismTerms.find(term => termMatchesCandidateWord(term, normCandidate));
  if (!matchedTerm) return false;
  return !isConversionCandidateGrounded(normCandidate, objectiveWords, mechanismTerms);
}
// Replaces ONLY the terminal segment of an arrow chain with the canonical conversion phrase,
// preserving every earlier stage verbatim — "los pasos intermediarios pueden conservarse, pero el
// endpoint debe estar alineado con la campaña."
const ARROW_RE_CAPTURE = /(→|⇒|➜|-->|->|>)/;
function repairArrowTerminal(seg, facts) {
  const arrowParts = seg.split(ARROW_RE_CAPTURE);
  if (arrowParts.length < 2) return seg;
  const lastIdx = arrowParts.length - 1;
  const trailingPunct = (arrowParts[lastIdx].match(/[.,;:\n]*$/) || [''])[0];
  arrowParts[lastIdx] = ' ' + canonicalConversionPhrase(facts) + trailingPunct;
  return arrowParts.join('');
}
// Repairs one field's text according to its role. Never invents content beyond canonical facts:
// a wholly-flagged non-chain segment/item is DROPPED (an alternative among several — dropping it
// leaves the others standing); a flagged ARROW-CHAIN terminal is REPLACED in place (the chain's
// earlier, legitimate steps survive untouched); if every candidate in a STRICT/ENUMERATION field
// is flagged and none survive, the field falls back to the canonical conversion phrase alone.
function repairConversionFieldText(text, role, facts, mechanismTerms, objectiveWords) {
  let changed = false;
  const flagged = c => isCandidateFlaggedForRepair(c, mechanismTerms, objectiveWords);
  if (role === 'STRICT') {
    const items = text.split(/;/);
    const repairedItems = items.map(item => {
      const segParts = item.split(/(\s+o\s+|\s+or\s+)/i);
      const kept = [];
      for (let i = 0; i < segParts.length; i += 2) {
        const seg = segParts[i];
        const delim = i > 0 ? segParts[i - 1] : '';
        const terminal = arrowTerminalOrNull(seg);
        if (terminal) {
          if (flagged(terminal)) { changed = true; kept.push({ delim, text: repairArrowTerminal(seg, facts) }); }
          else kept.push({ delim, text: seg });
        } else if (flagged(seg.trim())) { changed = true; }
        else kept.push({ delim, text: seg });
      }
      return kept.length ? kept.map((p, i2) => (i2 === 0 ? p.text : p.delim + p.text)).join('').trim() : null;
    }).filter(x => x !== null);
    if (!repairedItems.length) { changed = true; return { text: canonicalConversionPhrase(facts) + '.', changed }; }
    return { text: repairedItems.join('; '), changed };
  }
  if (role === 'SEQUENCE') {
    const items = text.split(/;/);
    const repairedItems = items.map(item => {
      const terminal = arrowTerminalOrNull(item);
      if (terminal && flagged(terminal)) { changed = true; return repairArrowTerminal(item, facts); }
      return item; // no arrow, or arrow terminal not flagged -> untouched (pure process description)
    });
    return { text: repairedItems.join(';'), changed };
  }
  if (role === 'ENUMERATION') {
    const items = text.split(/([;,])/);
    const kept = [];
    for (let i = 0; i < items.length; i += 2) {
      const item = items[i]; if (!item || !item.trim()) continue;
      const delim = i > 0 ? items[i - 1] : '';
      const terminal = arrowTerminalOrNull(item);
      const candidate = terminal || item.trim();
      if (flagged(candidate)) {
        changed = true;
        if (terminal) kept.push({ delim, text: repairArrowTerminal(item, facts) }); // drop non-chain item; replace chain terminal
      } else kept.push({ delim, text: item });
    }
    if (!kept.length) { changed = true; return { text: canonicalConversionPhrase(facts) + '.', changed }; }
    return { text: kept.map((p, i2) => (i2 === 0 ? p.text : p.delim + p.text)).join('').trim(), changed };
  }
  return { text, changed: false };
}
// Removes (never rewrites into a new positive claim) assumption strings that are either an
// isolated fabricated user-attribution, an isolated false denial of a raw-brief-confirmed topic,
// or one side of a same-list contradiction — preferring the UNKNOWN/uncertain side when neither
// side is grounded by the raw brief, and the raw-brief-grounded side when one is.
function repairAssumptions(items, rawRequest) {
  const normRequest = rawRequest ? norm(String(rawRequest)) : null;
  let result = items.filter(x => typeof x === 'string');
  const repairs = [];
  const topicOf = (text, cue) => assumptionTopicWords(text, cue)[0];
  const knownInRaw = topic => topic != null && normRequest != null && new RegExp('\\b' + escapeRegExpLiteral(topic) + '\\w*\\b').test(normRequest);
  if (normRequest != null) {
    result = result.filter(text => {
      if (ASSUMPTION_USER_ATTRIBUTION_CUE.test(text)) {
        const topic = topicOf(text, ASSUMPTION_USER_ATTRIBUTION_CUE);
        if (topic && !knownInRaw(topic)) { repairs.push({ removed: text, reason: 'UNSUPPORTED_USER_ATTRIBUTION' }); return false; }
      } else if (ASSUMPTION_UNKNOWN_CUE.test(text)) {
        const topic = topicOf(text, ASSUMPTION_UNKNOWN_CUE);
        if (topic && knownInRaw(topic)) { repairs.push({ removed: text, reason: 'KNOWN_FACT_DENIAL' }); return false; }
      }
      return true;
    });
  }
  let again = true;
  while (again) {
    again = false;
    const parsed = result.map(text => ({
      text, attributed: ASSUMPTION_USER_ATTRIBUTION_CUE.test(text), unknown: ASSUMPTION_UNKNOWN_CUE.test(text),
      certain: ASSUMPTION_CERTAINTY_CUE.test(text) || ASSUMPTION_USER_ATTRIBUTION_CUE.test(text),
    }));
    outer: for (let i = 0; i < parsed.length; i++) {
      if (!parsed[i].certain) continue;
      const certainTopics = new Set(assumptionTopicWords(parsed[i].text, parsed[i].attributed ? ASSUMPTION_USER_ATTRIBUTION_CUE : ASSUMPTION_CERTAINTY_CUE));
      if (!certainTopics.size) continue;
      for (let j = 0; j < parsed.length; j++) {
        if (i === j || !parsed[j].unknown) continue;
        const sharedTopic = assumptionTopicWords(parsed[j].text, ASSUMPTION_UNKNOWN_CUE).find(w => certainTopics.has(w));
        if (!sharedTopic) continue;
        if (knownInRaw(sharedTopic)) {
          repairs.push({ removed: parsed[j].text, kept: parsed[i].text, reason: 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS' });
          result = result.filter(t => t !== parsed[j].text);
        } else {
          repairs.push({ removed: parsed[i].text, kept: parsed[j].text, reason: 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS' });
          result = result.filter(t => t !== parsed[i].text);
        }
        again = true;
        break outer;
      }
    }
  }
  return { items: result, repairs };
}
// Attempts a deterministic repair of `synthesis` for the given (already-computed) `violations`.
// Returns null when NOT eligible (any violation outside REPAIRABLE_FINAL_SYNTHESIS_TYPES) — the
// caller must fail closed on the ORIGINAL violations in that case, never attempt a partial repair.
function repairFinalSynthesis(facts, synthesis, violations, { rawRequest } = {}) {
  if (!violations.length || !violations.every(isRepairableFinalSynthesisViolation)) return null;
  const repaired = cloneJsonValue(synthesis);
  const repairs = [];
  const mechanismTerms = mechanismTermsForFacts(facts);
  const objectiveWords = new Set(norm((facts.business_objective && facts.business_objective.value) || '').split(/[^a-z0-9]+/).filter(w => w.length >= 3));
  if (mechanismTerms.length) {
    for (const [sectionKey, subKeyRoles] of Object.entries(FINAL_SYNTHESIS_FIELD_ROLES)) {
      const section = repaired.deliverable && repaired.deliverable[sectionKey];
      if (!section || typeof section !== 'object') continue;
      for (const [subKey, role] of Object.entries(subKeyRoles)) {
        if (role === 'SAFE') continue;
        const raw = section[subKey];
        if (!raw || typeof raw !== 'string') continue;
        const { text, changed } = repairConversionFieldText(raw, role, facts, mechanismTerms, objectiveWords);
        if (changed) { section[subKey] = text; repairs.push({ type: 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION', field_key: subKey, section: sectionKey, repair_type: 'DETERMINISTIC' }); }
      }
    }
  }
  const assumptions = repaired.deliverable && repaired.deliverable['14_assumptions'];
  if (Array.isArray(assumptions)) {
    const { items, repairs: aRepairs } = repairAssumptions(assumptions, rawRequest);
    if (aRepairs.length) {
      repaired.deliverable['14_assumptions'] = items;
      for (const r of aRepairs) repairs.push({ ...r, field_key: '14_assumptions', repair_type: 'DETERMINISTIC' });
    }
  }
  return { synthesis: repaired, repairs };
}

function validateFinalSynthesis(facts, synthesis, { rawRequest } = {}) {
  const entries = relevantFields(synthesis);
  const normEntries = entries.map(([k, v]) => [k, norm(stringify(v))]);
  const textEntries = entries.map(([k, v]) => [k, norm(textOnly(v))]);
  const violations = [];
  for (const [key, rawVal] of entries) {
    const textVal = norm(textOnly(rawVal));
    const rawTextVal = textOnly(rawVal);
    const markerIndex = firstMarkerIndex(textVal);
    const siblingEntries = normEntries.filter(([k]) => k !== key);
    for (const v of checkFieldSubstitutions(facts, key, rawVal, siblingEntries)) violations.push(v);
    for (const v of checkKnownFactDenial(facts, key, textVal)) violations.push(v);
    for (const v of checkUnknownFactFabrication(facts, key, textVal, markerIndex)) violations.push(v);
    for (const v of checkUnlabeledProposal(facts, key, textVal, markerIndex)) violations.push(v);
    for (const v of checkExplicitProhibition(facts, key, rawVal)) violations.push(v);
    for (const v of checkMechanismToCampaignConversionPromotion(facts, key, rawVal)) violations.push(v);
    for (const v of checkAssumptionEpistemicConsistency(key, rawVal, rawRequest)) violations.push(v);
  }
  const combinedText = textEntries.map(([, v]) => v).join(' \n ');
  for (const v of checkBuyerPositivePreservation(facts, null, combinedText)) violations.push(v);
  for (const v of checkMechanismPositivePreservation(facts, null, combinedText)) violations.push(v);
  return { violations: violations.map(v => ({ ...v, node: null, path: pathFor(null, v.field_key) })) };
}

module.exports = {
  validateOutputAgainstFacts, validateFinalSynthesis, repairUpstreamProposalStatus, containsFact, relevantFields, CHECKED_FIELDS, activeExplicitProhibitionCategories,
  repairFinalSynthesis, isRepairableFinalSynthesisViolation,
};
