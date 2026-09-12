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
const RESULT_CLAIM_VERBS = 'aumenta\\w*|increment[ao]\\w*|sub(?:e|es|en|ir|iendo|ido)|mejora\\w*|consig(?:o|ues|ue|uen|uiendo)\\w*|conseguir|logra\\w*|obtien\\w*|obtener|reduc\\w*|baja\\w*|paga\\w*';
const RESULT_MAGNITUDE_ONLY_VERBS = 'genera\\w*';
const RESULT_MEASUREMENT_VERBS = 'medir|analizar|registrar|probar|testear|monitorear|evaluar|revisar|comparar|dar\\s+seguimiento';
const RESULT_MAGNITUDE = `\\d+\\s*%|\\d+\\s*x\\b|en\\s+\\d+\\s*(?:d[ií]as?|semanas?|meses?)|\\d+\\s+(?:${RESULT_OUTCOME_TERMS})`;
const INVENTED_RESULT_CLAIM = new RegExp(
  `\\b(?:${RESULT_SELF_SUFFICIENT_VERBS})\\b` +
  `|\\b(?:${RESULT_CLAIM_VERBS})\\b(?=[\\s\\S]{0,40}\\b(?:${RESULT_OUTCOME_TERMS})\\b)` +
  `|\\b(?:${RESULT_OUTCOME_TERMS})\\b(?=[\\s\\S]{0,40}\\b(?:${RESULT_CLAIM_VERBS})\\b)` +
  `|\\b(?:${RESULT_CLAIM_VERBS}|${RESULT_MAGNITUDE_ONLY_VERBS})\\b(?=[\\s\\S]{0,40}(?:${RESULT_MAGNITUDE}))` +
  `|\\b(?:${RESULT_OUTCOME_TERMS})\\b(?=[\\s\\S]{0,40}(?:${RESULT_MAGNITUDE}))`, 'i');
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
function checkExplicitProhibition(facts, key, valRawSentences) {
  const cf = facts.constraints;
  if (!cf || cf.status !== 'USER_PROVIDED_FACT') return [];
  const activeCategories = activeExplicitProhibitionCategories(cf.value);
  if (!activeCategories.size) return [];
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
      if (!activeCategories.has(p.type)) continue;
      for (const match of s.matchAll(new RegExp(p.re.source, 'gi'))) {
        if (p.type === 'invented_result' && (isMeasurementPurposeClause(s, match.index) || hasGoalIntentContext(s))) continue;
        if (!isNegated(match.index, match.index + match[0].length) && !FUTURE_HEDGE_CUE.test(s)) {
          violations.push({
            type: 'EXPLICIT_PROHIBITION', fact_field: null, category: p.type, field_key: key,
            matched_text: match[0], matched_pattern: p.re.source,
            local_clause: s.trim(), clause_index: clauseIndex, occurrence_start: start + match.index,
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
    for (const v of checkExplicitProhibition(facts, key, rawTextVal)) violations.push(v);
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
    const rawTextVal = textOnly(rawVal);
    const markerIndex = firstMarkerIndex(textVal);
    const siblingEntries = normEntries.filter(([k]) => k !== key);
    for (const v of checkFieldSubstitutions(facts, key, rawVal, siblingEntries)) violations.push(v);
    for (const v of checkKnownFactDenial(facts, key, textVal)) violations.push(v);
    for (const v of checkUnknownFactFabrication(facts, key, textVal, markerIndex)) violations.push(v);
    for (const v of checkUnlabeledProposal(facts, key, textVal, markerIndex)) violations.push(v);
    for (const v of checkExplicitProhibition(facts, key, rawTextVal)) violations.push(v);
  }
  const combinedText = textEntries.map(([, v]) => v).join(' \n ');
  for (const v of checkBuyerPositivePreservation(facts, null, combinedText)) violations.push(v);
  for (const v of checkMechanismPositivePreservation(facts, null, combinedText)) violations.push(v);
  return { violations: violations.map(v => ({ ...v, node: null, path: pathFor(null, v.field_key) })) };
}

module.exports = { validateOutputAgainstFacts, validateFinalSynthesis, repairUpstreamProposalStatus, containsFact, relevantFields, CHECKED_FIELDS };
