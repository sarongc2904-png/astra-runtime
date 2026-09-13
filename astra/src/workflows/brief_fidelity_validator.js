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
// [BILINGUAL POSITIVE PROHIBITION SEMANTICS] confirmed pre-existing gap (surfaced by red-teaming
// the prior negation gate): the specialists genuinely emit English text even under a Spanish
// brief (the same job that produced "no testimonials" also demonstrates this), so every list below
// gets its direct English equivalent — never a giant keyword blacklist, just the same closed,
// bounded verb/noun families already used for Spanish, extended in kind. Every consumer of these
// constants (INVENTED_RESULT_CLAIM, the buyer-context claim-role model, the measurement-purpose
// escape, magnitude detection) inherits bilingual behavior automatically, with no structural change
// anywhere else — a claim is a claim regardless of which language it's typed in.
const RESULT_OUTCOME_TERMS = 'ventas?|ingres\\w*|leads?|citas?|clientes?|conversi[oó]n(?:es)?|ticket|sales?|revenue|appointments?|clients?|conversions?|customers?';
const RESULT_SELF_SUFFICIENT_VERBS = 'duplica\\w*|triplica\\w*|double[sd]?|doubling|triple[sd]?|tripling';
// [OFFER CONSTRAINT ADHERENCE — confirmed live gap] "Llena citas" ("fills your appointment
// calendar") asserts a result exactly like "aumenta ventas" does, but "llena\w*"/"llenar" was
// missing from this list entirely — paired with an OUTCOME_TERM already in RESULT_OUTCOME_TERMS
// ("citas"), it is a claim verb like any other here, not a new category.
const RESULT_CLAIM_VERBS = 'aumenta\\w*|increment[ao]\\w*|sub(?:e|es|en|ir|iendo|ido)|mejora\\w*|consig(?:o|ues|ue|uen|uiendo)\\w*|conseguir|logra\\w*|obtien\\w*|obtener|reduc\\w*|baja\\w*|paga\\w*|llena\\w*|llenar|increase[sd]?|increasing|boost[sd]?|boosting|improve[sd]?|improving|lower[sd]?|lowering|fill[sd]?|filling|get[s]?|getting';
const RESULT_MAGNITUDE_ONLY_VERBS = 'genera\\w*|generate[sd]?|generating';
const RESULT_MEASUREMENT_VERBS = 'medir|analizar|registrar|probar|testear|monitorear|evaluar|revisar|comparar|dar\\s+seguimiento|track\\w*|measur\\w*|monitor\\w*|defin\\w*|evaluat\\w*|review\\w*|compar\\w*';
// A stated currency amount ("$20", "20 dollars", "500 MXN") is itself a concrete claimed value,
// language-neutral by construction (digits are digits) except for the unit word itself.
// [SCOPED, NOT SHARED] a stated currency amount is a concrete claimed VALUE only in the narrow
// context of a metric-acronym assertion (CAC/ROAS/LTV/...) — see INVENTED_METRIC_CLAIM, which
// references this directly. It is deliberately NOT folded into RESULT_MAGNITUDE below: the
// canonical brief's own PRICE is a normal, protected fact ("$400 MXN") that legitimately sits near
// ordinary outcome-term words in offer/funnel prose ("Minicurso 400 MXN venta directa") — treating
// any nearby currency mention as a "result magnitude" would flag the product's own price as an
// invented result, which is not what any category here is meant to catch.
const RESULT_CURRENCY_VALUE = '\\$\\s*\\d+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?\\s*(?:usd|mxn|dollars?|pesos?)';
const RESULT_MAGNITUDE = `\\d+\\s*%|\\d+\\s*x\\b|en\\s+\\d+\\s*(?:d[ií]as?|semanas?|meses?)|in\\s+\\d+\\s*(?:days?|weeks?|months?)|\\d+\\s+(?:${RESULT_OUTCOME_TERMS})`;
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
const GUARANTEE_VERBS = 'garantiz\\w*|guarantee[sd]?|guaranteeing';
const RESULT_OUTCOME_TERMS_OR_BARE_RESULT = `${RESULT_OUTCOME_TERMS}|resultados?|results?`;
const INVENTED_RESULT_CLAIM = new RegExp(
  `\\b(?:${RESULT_SELF_SUFFICIENT_VERBS})\\b` +
  `|\\b(?:${RESULT_CLAIM_VERBS})\\b(?=[\\s\\S]{0,40}\\b(?:${RESULT_OUTCOME_TERMS})\\b)` +
  `|\\b(?:${RESULT_OUTCOME_TERMS})\\b(?=[\\s\\S]{0,40}\\b(?:${RESULT_CLAIM_VERBS})\\b)` +
  `|\\b(?:${RESULT_CLAIM_VERBS}|${RESULT_MAGNITUDE_ONLY_VERBS})\\b(?=[\\s\\S]{0,40}(?:${RESULT_MAGNITUDE}))` +
  // Bare "resultado(s)/results" (not just the concrete outcome channels) also counts when paired
  // with a magnitude — "Resultados en 30 días"/"Results in 30 days" — and the magnitude can
  // precede the outcome word too ("20% more appointments"), not just follow it.
  `|\\b(?:${RESULT_OUTCOME_TERMS_OR_BARE_RESULT})\\b(?=[\\s\\S]{0,40}(?:${RESULT_MAGNITUDE}))` +
  `|(?:${RESULT_MAGNITUDE})(?=[\\s\\S]{0,40}\\b(?:${RESULT_OUTCOME_TERMS_OR_BARE_RESULT})\\b)` +
  `|\\b(?:${GUARANTEE_VERBS})\\b(?=[\\s\\S]{0,40}\\b(?:${RESULT_OUTCOME_TERMS_OR_BARE_RESULT})\\b)` +
  `|\\b(?:${RESULT_OUTCOME_TERMS_OR_BARE_RESULT})\\b(?=[\\s\\S]{0,40}\\b(?:${GUARANTEE_VERBS})\\b)` +
  // A bare "100% guaranteed"/"100% garantizado" — no explicit outcome noun at all — is still a
  // guarantee claim; pairs GUARANTEE_VERBS with a magnitude the same way CLAIM_VERBS already are.
  `|\\b(?:${GUARANTEE_VERBS})\\b(?=[\\s\\S]{0,40}(?:${RESULT_MAGNITUDE}))` +
  `|(?:${RESULT_MAGNITUDE})(?=[\\s\\S]{0,40}\\b(?:${GUARANTEE_VERBS})\\b)`, 'i');
// [[REQUIRED mechanism-preservation prose]] "generar consultas y WhatsApp para convertir consulta
// → conversación → cita" is the canonical, EXPECTED mechanism restatement used throughout this
// pipeline's node/synthesis fixtures — "generar" here is magnitude-gated (no digit present, so it
// never matches) and "citas"/"conversión" here never sit within 40 chars of a CLAIM_VERB in that
// sentence, so this stays safe without any phrase-specific exception.
const RESULT_MEASUREMENT_PURPOSE_BEFORE = /\bpara\s+$|\bto\s+$/i;
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
// [DIAGNOSTIC_TRIGGER — ASTRA_CAMPAIGN360_MEASUREMENT_DERIVATION_AND_PROPOSAL_PROVENANCE_HARDENING]
// confirmed live false positive (job b2252275-fbb4-40e5-840e-8c7532f3ac71): measurement.
// optimization_triggers = "baja calificación leads" was flagged as invented_result — but this
// field's entire schema purpose (MEASUREMENT_CRO_SPECIALIST.optimization_triggers/
// diagnostic_metrics, see llm_specialists.js) is to hold DIAGNOSTIC/MONITORING CONDITIONS ("when
// X is low, trigger an optimization action"), not an advertiser claim. Grammatically this is the
// EXACT same shape already adjudicated for icp.pains/icp.buying_triggers ("Baja ocupación de
// citas", job 6682572e-b316-4f2f-9c89-fb7b165bbdac): a claim-verb-shaped adjective ("baja")
// modifying a state noun ("calificación"/"ocupación"), not governing an outcome noun directly. It
// is deliberately given its OWN role name — DIAGNOSTIC_TRIGGER, not BUYER_TRIGGER — because this
// field is not the buyer's own voice; it is the measurement node's condition/monitoring language.
// Field-key-scoped only to fields whose schema purpose IS a diagnostic/trigger condition
// (optimization_triggers, diagnostic_metrics — both unique to MEASUREMENT_CRO_SPECIALIST, so no
// node-level scoping is needed). Never a blanket measurement exemption: this role only ever grants
// the SAME structural exemption BUYER_* roles already have below (isDescriptiveStateMatch), which
// still refuses guarantee/magnitude/advertiser-voice/self-sufficient-verb matches regardless of
// role — a genuine claim smuggled into a trigger field ("Baja tu CAC a $20", "Aumenta tus ventas
// 30%", "Te garantizamos más clientes", "Duplicar citas en 30 días") still detects.
const CLAIM_CONTEXT_FIELD_ROLES = {
  pains: 'BUYER_STATE',
  desired_outcomes: 'BUYER_GOAL', // kept in the table for documentation; its own narrower rule (isDesiredOutcomeQualitativeGoal) is unchanged and unaffected by this addition.
  objections: 'BUYER_OBJECTION',
  buying_triggers: 'BUYER_TRIGGER',
  qualification_signals: 'BUYER_ATTRIBUTE',
  non_fit_signals: 'BUYER_ATTRIBUTE',
  optimization_triggers: 'DIAGNOSTIC_TRIGGER',
  diagnostic_metrics: 'DIAGNOSTIC_TRIGGER',
};
// A descriptive-state role never itself waives detection — only BUYER_STATE/BUYER_OBJECTION/
// BUYER_TRIGGER/BUYER_ATTRIBUTE/DIAGNOSTIC_TRIGGER get the structural exemption logic below.
// BUYER_GOAL (desired_outcomes) keeps its pre-existing, narrower, magnitude-gated rule untouched.
// primary_outcome, funnel_metrics, conversion_metrics and measurement_cadence are deliberately
// ABSENT from CLAIM_CONTEXT_FIELD_ROLES — primary_outcome is this campaign's own claimed business
// outcome and must stay fully strict; funnel_metrics/conversion_metrics/measurement_cadence are not
// condition/trigger fields (they name what is tracked and how often, not a diagnostic state), so
// they get no claim-role exemption here at all — only the separate UPSTREAM_PROPOSAL_PROPAGATION
// specificity gate (below) addresses their false positives, which is a different failure mode.
const DESCRIPTIVE_CLAIM_ROLES = new Set(['BUYER_STATE', 'BUYER_OBJECTION', 'BUYER_TRIGGER', 'BUYER_ATTRIBUTE', 'DIAGNOSTIC_TRIGGER']);
// Narrower subset for the UNRELATED implicit-testimonial-attribution exemption below (checkImplicit
// TestimonialAttribution) — that check is about human-sourced-endorsement voice specifically
// ("el cliente dice que..."), not about diagnostic/trigger conditions, so DIAGNOSTIC_TRIGGER is
// deliberately excluded here: a measurement field is never exempted from testimonial-attribution
// detection just because it is also a diagnostic-condition field — a different failure mode.
const BUYER_VOICE_CLAIM_ROLES = new Set(['BUYER_STATE', 'BUYER_OBJECTION', 'BUYER_TRIGGER', 'BUYER_ATTRIBUTE']);
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
// English 2nd-person address (you/your/yourself) and 1st-person-plural future promise ("we will",
// "we're going to") are the direct English mirror of the Spanish cues above — "We will increase
// YOUR revenue" / "YOU will get more clients" are exactly as much an advertiser promise as
// "Aumenta TUS ventas" is.
const ADVERTISER_CLAIM_VOICE_CUE = /\btu\b|\btus\b|\bte\b|\bti\b|\bustedes?\b|\bcontigo\b|\bvas\b|\bvamos\s+a\b|\b\w+(?:ar[aá]s|er[aá]s|ir[aá]s|dr[aá]s)\b|\bqueremos\b|\bbuscamos\b|\bnecesitamos\b|\bdeseamos\b|\baspiramos\b|\besperamos\b|\bofrecemos\b|\bayudamos\b|\bconseguimos\b|\blogramos\b|\bentregamos\b|\bbrindamos\b|\byou\b|\byour\b|\byourself\b|\bwe['’]ll\b|\bwe\s+will\b|\bwe['’]re\s+going\s+to\b|\bwe\s+are\s+going\s+to\b|\bwe\s+help\b|\bwe\s+offer\b|\bwe\s+deliver\b|\bwe\s+provide\b/i;
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
// "more" is the direct English equivalent of "más" ("Get MORE appointments" / "Consigue MÁS
// citas" are the identical imperative shape); a bare comma between the verb and its outcome term
// ("Appointments, get more") is ordinary punctuation, not an intervening noun, so it is tolerated
// on either side of the quantifier the same way whitespace already is.
const SMALL_QUANTIFIER_GAP_RE = /^[\s,]*(?:m[aá]s|tan|tant[oa]s?|muy|more)?[\s,]*$/i;
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
// true only when the match should be read as descriptive state/condition language (buyer-context
// OR diagnostic-trigger-context), never a claim. Renamed from isBuyerContextDescriptiveMatch —
// DIAGNOSTIC_TRIGGER fields are not buyer voice, so the old name no longer described what this
// function actually gates; behavior for the existing BUYER_* roles is unchanged.
function isDescriptiveStateMatch(fieldKey, clauseText, match) {
  const role = claimContextRoleForField(fieldKey);
  if (!DESCRIPTIVE_CLAIM_ROLES.has(role)) return false;
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
  return /^(?:garantiz|guarantee)/i.test(matchedText) || /^resultados?$/i.test(matchedText) || /^results?$/i.test(matchedText);
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
const GUARANTEE_SELF_NEGATION_CUE = /\bno\s+(?:te\s+|les?\s+|nos\s+)?$|\b(?:do\s+not|don['’]t|never)\s+$/i;
const GUARANTEE_ADVISORY_CUE = /\bevitar\b|\bevita\b|\bevitando\b|\bno\s+(?:debe(?:s|mos|n)?\s+)?prometer\b|\bavoid\b|\bavoiding\b|\bexclude\b|\bexcluding\b|\bdo\s+not\s+promise\b|\bdon['’]t\s+promise\b|\bnever\s+promise\b/i;
function isGuaranteeNegationOrAdvisoryEscape(s, match) {
  if (!isGuaranteedResultMatch(match[0])) return false;
  const before = s.slice(0, match.index);
  if (/^(?:garantiz|guarantee)/i.test(match[0]) && GUARANTEE_SELF_NEGATION_CUE.test(before)) return true;
  return GUARANTEE_ADVISORY_CUE.test(before);
}
// English proof/evidence-assertion verbs (proven/proves/shown/shows/demonstrated/verified/
// validated) mirror the existing Spanish assertion-verb family — "case study"/"before/after" were
// already language-neutral tokens (no translation needed).
const INVENTED_EVIDENCE_CLAIM = /\bprobad[oa]s?\b|\bvalidad[oa]s?\b|\bcomprobad[oa]s?\b|\bdemostrad[oa]s?\b|\bcase\s*stud(?:y|ies)\b|\bcasos?\s+de\s+[ée]xito\b|\bresultados?\s+anteriores?\b|\bclientes?\s+logr\w+\b|\bevidencia\s+real\b|\bantes\s*\/\s*despu[ée]s\b|\bresultados?\s+document\w+\b|\bproven\b|\bproves?\b|\bproving\b|\bshown\b|\bshows\b|\bshowing\b|\bdemonstrat\w+\b|\bverified\b|\bvalidated\b|\bprior\s+results?\b|\bclients?\s+achiev\w+\b|\breal\s+evidence\b|\bdocumented\s+results?\b/i;
// [INVENTED METRIC ORDER FIX] confirmed live miss: "Objetivo ROAS 4x" (qualifier BEFORE the
// acronym) never matched the old acronym-then-qualifier-only pattern. Now bidirectional, plus a
// bare acronym+magnitude form ("ROAS 4x") that needs no qualifier word at all. English qualifiers
// (expected/projected/estimated/target/goal/actual) mirror esperado/proyectado/estimado/objetivo/
// meta; a bare acronym next to a stated CURRENCY VALUE ("CAC is $20", "LTV $500") is itself an
// observed/claimed value, not just a %/x multiplier — RESULT_CURRENCY_VALUE (language-neutral,
// digits-based) closes that gap generically rather than special-casing dollar signs here.
// A %/x multiplier may carry a decimal component ("3.5x ROAS", "4.5% CTR") — shared between the
// ordinary clause-based metric matcher and the compact-punctuation matcher below so both recognize
// the same value shapes consistently. The trailing \b is only on the "x" alternative (never after
// a literal "%", which can never satisfy \b — see the PRE-EXISTING BUG FIX note below).
const METRIC_PCT_X_VALUE = '\\d+(?:\\.\\d+)?\\s*(?:%|x\\b)';
// [META BRAND / TARGET COLLISION FIX] confirmed live false positive (job 29a3248a-045f-4942-ba15-
// 59469d1e9369): "Costos y CPC actuales en Meta Ads México" flagged "CPC actuales en Meta" as an
// invented_metric qualifier match — "meta" is bare Spanish for "target/goal", but here it is the
// first word of the brand entity "Meta Ads" (also "Meta Business [Suite]", "Meta platform"). A
// bounded negative lookahead scoped to exactly those brand-continuation words disambiguates the
// entity usage from the target/goal usage without touching "meta" as a qualifier anywhere else
// ("Meta objetivo de CAC", "meta de CPC", "CPC meta" all still match — none of them are followed by
// ads/business/platform). Never a whole-sentence patch, never a blanket "meta" exemption.
const META_QUALIFIER = 'meta(?!\\s+(?:ads|business(?:\\s+suite)?|platform)\\b)';
const METRIC_QUALIFIERS = `esperad[oa]|proyectad[oa]|estimad[oa]|objetivo|${META_QUALIFIER}|expected|projected|estimated|target|goal`;
const INVENTED_METRIC_CLAIM = new RegExp(
  '\\b(?:cac|cpa|cpl|roas|mer|ltv|ctr|cpc|cpm)\\b[\\s\\S]{0,20}\\b(?:' + METRIC_QUALIFIERS + ')\\b' +
  '|\\b(?:' + METRIC_QUALIFIERS + ')\\b[\\s\\S]{0,20}\\b(?:cac|cpa|cpl|roas|mer|ltv|ctr|cpc|cpm)\\b' +
  // [PRE-EXISTING BUG FIX] a trailing \b right after a literal "%" can never match (neither side of
  // that position is a \w character), so "\d+\s*(?:%|x)\b" silently never matched a bare "X%"
  // magnitude for any acronym ("ROAS 4%") — only "Xx" ("ROAS 4x") ever worked, since "x" itself is
  // a word character. Splitting the \b onto only the "x" alternative (mirroring how RESULT_MAGNITUDE
  // already does it correctly) fixes this for every acronym, not just the ones this gate happens to
  // test.
  '|\\b(?:cac|cpa|cpl|roas|mer|ltv|ctr|cpc|cpm)\\b[\\s\\S]{0,10}(?:' + METRIC_PCT_X_VALUE + '|' + RESULT_CURRENCY_VALUE + ')' +
  // The %/x magnitude can precede the acronym too ("3x ROAS", "4% CTR"), not just follow it —
  // mirrors the currency-value reverse branch immediately below.
  '|(?:' + METRIC_PCT_X_VALUE + ')[\\s\\S]{0,10}\\b(?:cac|cpa|cpl|roas|mer|ltv|ctr|cpc|cpm)\\b' +
  '|(?:' + RESULT_CURRENCY_VALUE + ')[\\s\\S]{0,10}\\b(?:cac|cpa|cpl|roas|mer|ltv|ctr|cpc|cpm)\\b' +
  // [PRECISE CONNECTOR, NOT A WIDER WILDCARD] confirmed live false negative: "CPC actual es $20"
  // never matched via the {0,10}-gap branch above (the intervening "actual es " is 11 characters).
  // Blanket-widening that wildcard gap to {0,15} was tried and reverted — it let the greedy [\s\S]
  // span across an entirely unrelated LATER acronym's own value ("CAC $20 and ROAS 4x" collapsed
  // into one false match spanning both). Instead, a small, bounded set of connector words
  // (actual/actuales/real/reales/es/is) may appear between the acronym and its value — never
  // arbitrary text, never another acronym or a sentence boundary, so it cannot reach past an
  // unrelated pairing the way a wider generic gap can.
  '|\\b(?:cac|cpa|cpl|roas|mer|ltv|ctr|cpc|cpm)\\b(?:\\s+(?:actual(?:es)?|real(?:es)?|es|is))+\\s*(?::|=)?\\s*(?:' + METRIC_PCT_X_VALUE + '|' + RESULT_CURRENCY_VALUE + ')',
  'i');
// [COMPACT METRIC PUNCTUATION HARDENING] confirmed live-red-team gap: "ROAS?4x" produced ZERO
// violations. Root cause is NOT the metric matcher itself (INVENTED_METRIC_CLAIM correctly pairs
// an acronym with an adjacent magnitude) — it is that checkExplicitProhibitionOnLeaf's generic
// clause splitter treats "?" (like "." and "!") as a hard clause boundary for EVERY category, so
// "ROAS?4x" is split into two separate clauses ("ROAS" and "4x") before any category-specific
// regex ever runs, and the acronym and its magnitude are never evaluated together. The prohibition
// explicitly rules out weakening the general clause splitter (it protects every other category's
// negation/enumeration semantics) — so this is a NARROW, SEPARATE matcher: it runs on each leaf's
// RAW, un-split text, looks only for a protected metric acronym directly adjacent to a concrete
// magnitude/value with nothing but compact punctuation between them (never a full word, so it can
// never accidentally span two genuinely unrelated clauses — "ROAS is unavailable, use 4x zoom" has
// a whole clause of separating words and does not match), and contributes ADDITIONAL invented_metric
// violations alongside — never in place of — the existing clause-based check.
const COMPACT_METRIC_ACRONYMS = 'cac|cpa|cpl|roas|mer|ltv|ctr|cpc|cpm';
// Requires at least one actual punctuation mark (not pure whitespace) — "ROAS 4x" (space only) is
// already handled by the ordinary clause-based INVENTED_METRIC_CLAIM path and must never be
// double-matched here.
const COMPACT_PUNCTUATION_SEPARATOR = '\\s*[?:=/\\-—()]+\\s*';
const COMPACT_METRIC_VALUE = `${METRIC_PCT_X_VALUE}|${RESULT_CURRENCY_VALUE}`;
const COMPACT_METRIC_VALUE_CLAIM = new RegExp(
  `\\b(?:${COMPACT_METRIC_ACRONYMS})\\b${COMPACT_PUNCTUATION_SEPARATOR}(?:${COMPACT_METRIC_VALUE})` +
  `|(?:${COMPACT_METRIC_VALUE})${COMPACT_PUNCTUATION_SEPARATOR}\\b(?:${COMPACT_METRIC_ACRONYMS})\\b`,
  'gi');
// A lone "ROAS?" (no value token immediately following) never matches COMPACT_METRIC_VALUE_CLAIM
// at all — the value is a required part of the pattern, not optional — so a bare question/reference
// is safe by construction, with no separate escape needed.
// Deliberately conservative, narrow negation guard scoped to this matcher only: mirrors the same
// closed bilingual negation vocabulary already used elsewhere in this file (no/nunca/sin/evitar,
// without/never/avoid/do not/don't), checked only in the text immediately preceding the match.
const COMPACT_METRIC_NEGATION_BEFORE = /\b(?:no|nunca|sin|evitar|without|never|avoid|do\s+not|don['’]t)\b[^.!?;\n]{0,20}$/i;
function checkCompactMetricPunctuationClaims(fieldKey, leafText, leafPath) {
  const violations = [];
  for (const match of leafText.matchAll(COMPACT_METRIC_VALUE_CLAIM)) {
    const before = leafText.slice(0, match.index);
    if (COMPACT_METRIC_NEGATION_BEFORE.test(before)) continue;
    violations.push({
      type: 'EXPLICIT_PROHIBITION', fact_field: null, category: 'invented_metric', field_key: fieldKey,
      matched_text: match[0], matched_pattern: COMPACT_METRIC_VALUE_CLAIM.source,
      local_clause: match[0], clause_index: null, occurrence_start: match.index, leaf_path: leafPath,
    });
  }
  return violations;
}
const PROHIBITED_CONTENT_PATTERNS = [
  { type: 'testimonials', re: /testimonios?|\btestimonials?\b/i },
  { type: 'proof', re: /\bproof\b/i },
  { type: 'social_proof', re: /prueba\s+social|caso\s+de\s+estudio/i },
  { type: 'urgency', re: /urgencia/i },
  { type: 'scarcity', re: /escasez|oferta\s+limitada/i },
  { type: 'deadline', re: /\bdeadline\b/i },
  { type: 'guarantee', re: /garantizamos|garant[ií]a\s+de\s+resultado|guarantee[sd]?|guaranteed\s+results?/i },
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
  { type: 'guarantee', re: /garantizamos|garant[ií]a\s+de\s+resultado|guarantee[sd]?|guaranteed\s+results?/i },
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
// [NEED-TO-OBTAIN FRAMING] confirmed live adjudication: "Necesitamos conseguir testimonios
// reales" states a PLAN to acquire the prohibited content later, not that it currently exists or
// is being used — the same honest non-assertion FUTURE_HEDGE_CUE already recognizes, just phrased
// as an expressed need/requirement rather than an explicit future/conditional marker. Both the
// need-verb and the acquisition-verb are closed, stemmed vocabularies (never one exact phrase), so
// this generalizes across "necesitamos/necesito/hay que/debemos/se requiere/requerimos +
// conseguir/obtener/recopilar/reunir/juntar".
const NEED_TO_OBTAIN_CUE = /\b(?:necesitamos|necesito|hay\s+que|debemos|se\s+requiere[n]?|requerimos)\s+(?:consegu\w*|obten\w*|recopil\w*|reun\w*|junt\w*)\b/i;
// [RESEARCH/VERIFICATION FRAMING] a request to CONFIRM/VERIFY whether the prohibited content
// exists or is available is asking for evidence, not asserting it — the same non-assertion
// FUTURE_HEDGE_CUE's "si existen" branch already recognizes for a bare conditional, generalized to
// the "disponibilidad de X"/"existencia de X" noun-phrase objects a verification request commonly
// takes ("Verificar disponibilidad de testimonios con el cliente").
const RESEARCH_VERIFICATION_CUE = /\b(?:confirmar|verificar|revisar|checar)\s+(?:si\s+(?:existe[n]?|hay)|disponibilidad\s+de|existencia\s+de)\b/i;
// [HUMAN SOURCE VOCABULARY] closed, auditable, bilingual set of human-role nouns used both by the
// collection-planning cue below and by the implicit-testimonial-attribution matcher further down.
// Never expanded ad hoc per-case — any new role belongs in this single list.
const HUMAN_SOURCE_NOUN = 'client\\w*|customer\\w*|paciente\\w*|patient\\w*|alumn\\w*|student\\w*|usuari\\w*|user\\w*|comprador\\w*|buyer\\w*|persona\\w*|person\\w*';
// [COLLECTION/VERIFICATION-FROM-SOURCE FRAMING] confirmed adjudicated false positives: "Preguntar
// a clientas si darían un testimonio", "Recopilar testimonios reales de clientas", "Verificar si
// alguna clienta ha dado permiso para usar su testimonio", "Ask customers whether they would
// provide a testimonial", "Collect real testimonials from customers" — all describe a PLAN to ask/
// gather/verify FROM a human source, never an assertion that the prohibited content exists or is
// being used. RESEARCH_VERIFICATION_CUE above only covers "confirmar/verificar si existe(n)/
// disponibilidad de X"; this is the general sibling for the same planning verbs (plus request/
// interview/invite/collect-family verbs NEED_TO_OBTAIN_CUE doesn't cover) when they co-occur with
// a HUMAN_SOURCE_NOUN anywhere in the clause, in either order — a bare imperative/infinitive plan
// verb next to "clientas"/"customers" is never itself a positive claim.
const COLLECTION_REQUEST_CUE = new RegExp(
  '\\b(?:preguntar|pregunta|pedir|solicitar|entrevistar|recopilar|reunir|juntar|obtener|conseguir|invitar|verificar|confirmar|revisar|checar|ask|collect|gather|request|interview|invite|verify|confirm|check)\\w*\\b[\\s\\S]{0,60}\\b(?:' + HUMAN_SOURCE_NOUN + ')\\b' +
  '|\\b(?:' + HUMAN_SOURCE_NOUN + ')\\b[\\s\\S]{0,60}\\b(?:preguntar|pregunta|pedir|solicitar|entrevistar|recopilar|reunir|juntar|obtener|conseguir|invitar|verificar|confirmar|revisar|checar|ask|collect|gather|request|interview|invite|verify|confirm|check)\\w*\\b',
  'i'
);
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
    // Clause-based check runs FIRST: when both paths legitimately fire for the same physical
    // occurrence (a separator like ":"/"="/"/" that was never a clause boundary to begin with), the
    // clause-based violation carries the fuller, more informative diagnostic (local_clause = the
    // whole surrounding clause, e.g. "Proposed ROAS: 4x") — the compact matcher's own local_clause
    // is only the bare matched span. Dedup below keeps whichever was inserted first.
    const leafViolations = [];
    leafViolations.push(...checkExplicitProhibitionOnLeaf(key, leaf.text, leaf.leafPath, activeCategories));
    if (activeCategories.has('invented_metric')) {
      leafViolations.push(...checkCompactMetricPunctuationClaims(key, leaf.text, leaf.leafPath));
    }
    // [DEDUP] the compact-punctuation matcher intentionally overlaps the ordinary clause-based
    // matcher for separators that are NOT hard clause boundaries (":", "=", "/", "-", "(", ")") —
    // those were already reachable through the clause matcher's own [\s\S]{0,10} gap tolerance, so
    // the same physical occurrence (identical category + start offset within this leaf) can surface
    // from both paths. Collapse to one violation per genuinely distinct occurrence; never removes a
    // violation that is unique to the compact path (e.g. "ROAS?4x", where "?" IS a clause boundary
    // and only the compact matcher ever sees the pairing at all).
    const seen = new Set();
    for (const v of leafViolations) {
      const dedupeKey = `${v.category}|${v.occurrence_start}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      violations.push(v);
    }
  }
  return violations;
}
// [ARRAY/NESTED LEAF FIELD-IDENTITY FIX] confirmed regression: a naive "last non-numeric path
// segment" reading breaks the two call sites that already pass a correct, already-recognized
// field key. At the node-output call site `key` IS the field itself ('pains') and leafPath is
// '(pains[0]' or 'pains.primary' — taking the last segment wrongly yields 'pains[0]' (unstripped
// bracket, no dot to split on) or 'primary' (an incidental nested sub-key), losing the BUYER_STATE
// role and turning legitimate buyer-pain descriptions into false EXPLICIT_PROHIBITION detects.
// Only the OTHER call site (validateFinalSynthesis) needs drill-down: there `key` is a whole
// SECTION container ('2_target_audience_icp') with no claim-context role of its own, and the
// actually-meaningful field name is nested one level down in leafPath ('...icp.pains'). The fix:
// never override an already-recognized field key; only search the path for a recognized segment
// when the passed-in key itself has no known role.
function semanticLeafFieldKey(fieldKey, leafPath) {
  if (CLAIM_CONTEXT_FIELD_ROLES[norm(fieldKey)] || GOAL_INTENT_FIELD_KEYS.has(norm(fieldKey))) return fieldKey;
  const parts = String(leafPath || '').replace(/\[\d+\]/g, '').split('.').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i];
    if (CLAIM_CONTEXT_FIELD_ROLES[norm(seg)] || GOAL_INTENT_FIELD_KEYS.has(norm(seg))) return seg;
  }
  return fieldKey;
}
function checkExplicitProhibitionOnLeaf(key, valRawSentences, leafPath, activeCategories) {
  const violations = [];
  const semanticKey = semanticLeafFieldKey(key, leafPath);
  // Commas in a negative enumeration preserve scope (CAC, ROAS, LTV, testimonios).
  // Adversatives, sentence boundaries and a new affirmative action end it. UNKNOWN
  // belongs only to its immediately preceding occurrence, never the whole clause.
  const clauses = valRawSentences.split(/[.!?;\n]|\b(?:pero|sin embargo|aunque|but|however)\b|[,\u2014]|\b(?:y|e|and)\s+(?=(?:usa\w*|inclu\w*|utiliza\w*|presenta\w*|afirma\w*|agrega\w*|incorpora\w*|use[sd]?|using|includes?|including|mentions?|mentioning|presents?|presenting|states?|stating|adds?|adding)\b)/i);
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
    // [BILINGUAL NEGATION SEMANTICS] confirmed live false positive: "no testimonials" (English)
    // was invisible to every existing cue, which is entirely Spanish-vocabulary. Two DIFFERENT
    // English negation shapes exist, not one: (a) "do not/don't/never USE/INCLUDE/..." mirrors the
    // Spanish "no + VERB" shape exactly (verb-mediated — ENGLISH_NEGATIVE_VERB_DIRECTIVE, folded
    // into the same cueEnd/actions-reset mechanism as the Spanish `negative` cue); (b) English "no"
    // and "without" ALSO negate a bare NOUN directly ("no testimonials" = "there are no
    // testimonials", not "no <verb>") — Spanish has no equivalent bare-"no"-noun idiom (that role
    // is "sin X"), so this is a genuinely new shape (ENGLISH_BARE_NEGATION_BEFORE_NOUN), mirroring
    // the existing bare "sin $" check. "avoid"/"avoiding"/"exclude"/"excluding" mirror "evitar" as
    // advisory cues. Allows up to 2 intervening words ("no fake testimonials") so a modified noun
    // phrase is still recognized, without matching arbitrarily far back.
    const negative = /\b(?:no|nunca)\s+(?:inventes|inventar|inventen|usar|incluir|utilizar|mencionar|presentar|afirmar|declarar|declares?)\b|\bno\s+hay\b/gi;
    // "nunca" (Spanish "never") is included alongside the English directives themselves — a
    // mixed-language clause ("Nunca uses testimonials") pairs a Spanish negator with an English
    // verb, which neither the pure-Spanish `negative` cue (requires a Spanish verb) nor an
    // English-only "never" cue would catch on its own.
    // The verb after the negator may itself be Spanish ("Do not usar testimonios" — an English
    // negator with a Spanish verb, explicitly required by the bilingual mandate) — so the verb
    // alternation includes both languages' negatable-verb sets, not just the English ones.
    const ENGLISH_NEGATIVE_VERB_DIRECTIVE = /\b(?:do\s+not|don['’]t|never|nunca)\s+(?:use[sd]?|using|includes?|including|mentions?|mentioning|presents?|presenting|states?|stating|adds?|adding|declares?|declaring|usar|incluir|utilizar|mencionar|presentar|afirmar|declarar|declares?|inventar)\b/gi;
    const actions = /\b(?:usa\w*|inclu\w*|utiliza\w*|menciona\w*|presenta\w*|afirma\w*|agrega\w*|incorpora\w*|declara\w*|use[sd]?|using|includes?|including|mentions?|mentioning|presents?|presenting|states?|stating|adds?|adding|declares?|declaring)\b/i;
    const ADVISORY_NEGATION_CUE = /\bevitar\b|\bevita\b|\bevitando\b|\bavoid\b|\bavoiding\b|\bexclude\b|\bexcluding\b/i;
    // Capped at ONE intervening word ("no fake testimonials") rather than two: a wider cap starts
    // colliding with unrelated Spanish "no <verb> <verb>" constructions ("No debemos prometer
    // aumentar...") that must NOT be swallowed by this English-specific bare-noun negation shape.
    // Trailing `\s*$` (not requiring the optional word itself to be followed by whitespace) is
    // required so this also matches when `before` is an ENTIRE clause with no trailing space at
    // all (checked via isNegated(s.length, s.length) for the enumeration-continuation/negativeList
    // carry-over below — e.g. "No CAC" as a whole clause, immediately followed by ", ROAS or
    // testimonials" as a sibling clause in the same negated list).
    // "nunca" (Spanish "never") bare-negates a following noun/acronym the same way "no"/"without"
    // do ("Nunca ROAS:4x") — the direct Spanish mirror of this English-specific bare-noun shape.
    const ENGLISH_BARE_NEGATION_BEFORE_NOUN = /\b(?:no|without|nunca)\b(?:\s+\w+)?\s*$/i;
    // [ABSENCE / MISSING-PROOF EPISTEMIC CONTEXT] confirmed live false positive: "Desconfianza por
    // falta de testimonios" (a funnel drop_off_risk describing that customers distrust the offer
    // BECAUSE testimonials are absent) was flagged identically to an actual invented testimonial
    // claim. The user's prohibition ("no inventes ... testimonios") forbids FABRICATING the
    // prohibited content, never describing its ABSENCE — "falta de/ausencia de/carencia de X" and
    // "no existe(n) X" are the general Spanish noun-phrase idioms for "X does not exist", the exact
    // semantic mirror of the already-recognized "sin X"/"no hay X" shapes, just phrased as a noun
    // ("lack of X") or an existence verb ("X does not exist") instead of a bare preposition/"hay".
    // General across every PROHIBITED_CONTENT_PATTERNS category (proof/guarantee/evidence/...),
    // never scoped to testimonials or to this field.
    const EXISTENCE_ABSENCE_CUE = /\b(?:falta|ausencia|carencia)\s+de\s*$|\bno\s+existe[n]?\s*$/i;
    // [PASSIVE/REFLEXIVE NEGATION] confirmed live false positive: "No se proporcionaron
    // testimonios" (Spanish reflexive-passive: "testimonials were not provided") is a plain
    // negative-fact statement, not an assertion that testimonials exist — but the existing
    // `negative` cue only recognizes an ACTIVE "no + VERB" shape (no usar/incluir/...), never the
    // "no se + VERB" reflexive-passive construction Spanish uses for describing what was NOT
    // supplied/included/stated. Stemmed (not one exact conjugation) so it also covers "no se
    // proporcionó/proporciona", "no se incluyeron/mencionaron/presentaron/afirmaron/declararon/
    // obtuvieron/consiguieron" — the same verb family the active `negative` cue already covers,
    // just in its reflexive-passive form.
    // Optional auxiliary ("han/habían/habrían") between "se" and the verb stem covers compound
    // tenses ("no se han recopilado testimonios") the same way the bare simple-past form does.
    // "recopil/reun/junt" added to the stem family to mirror NEED_TO_OBTAIN_CUE's acquisition verbs.
    const PASSIVE_NEGATION_CUE = /\bno\s+se\s+(?:han?|habr[ií]an?|hab[ií]an?)?\s*(?:proporcion|inclu|mencion|present|afirm|declar|invent|obtuv|consegu|consigu|logr|recopil|reun|junt)\w*\s*$/i;
    const isNegated = (idx, end) => {
      const before = s.slice(0, idx);
      let cueEnd = negativeList ? 0 : -1;
      for (const cue of before.matchAll(negative)) cueEnd = Math.max(cueEnd, cue.index + cue[0].length);
      for (const cue of before.matchAll(ENGLISH_NEGATIVE_VERB_DIRECTIVE)) cueEnd = Math.max(cueEnd, cue.index + cue[0].length);
      if (cueEnd >= 0 && !actions.test(before.slice(cueEnd))) return true;
      if (ADVISORY_NEGATION_CUE.test(before)) return true;
      if (/\bsin\s+$/i.test(before)) return true;
      if (ENGLISH_BARE_NEGATION_BEFORE_NOUN.test(before)) return true;
      if (EXISTENCE_ABSENCE_CUE.test(before)) return true;
      if (PASSIVE_NEGATION_CUE.test(before)) return true;
      return /^\s*=\s*unknown\b/i.test(s.slice(end)) ||
        (/\bsin\s+$/i.test(before) && /^\s+disponible\b/i.test(s.slice(end)));
    };
    for (const p of PROHIBITED_CONTENT_PATTERNS) {
      if (!activeCategories.has(p.type)) continue;
      for (const match of s.matchAll(new RegExp(p.re.source, 'gi'))) {
        if (p.type === 'invented_result' && (
          isMeasurementPurposeClause(s, match.index) || hasGoalIntentContext(s) ||
          isDesiredOutcomeQualitativeGoal(semanticKey, s, match) ||
          isGuaranteeNegationOrAdvisoryEscape(s, match) ||
          isDescriptiveStateMatch(semanticKey, s, match)
        )) continue;
        // [CATEGORY-SCOPED COLLECTION CUE] confirmed regression: COLLECTION_REQUEST_CUE's
        // acquisition-verb vocabulary (conseguir/obtener/...) legitimately overlaps with common
        // CLIENT-ACQUISITION marketing claims ("Vas a conseguir más clientes") that have nothing to
        // do with collecting testimonials/evidence FROM a source — "clientes" there is the OBJECT
        // being acquired, not the SOURCE of a testimonial. Scoped to only the two categories this
        // cue was ever motivated by (testimonials/invented_evidence) so it can never exempt an
        // invented_result/guarantee/... claim just because it happens to mention a human-source
        // noun.
        const collectionCueApplies = (p.type === 'testimonials' || p.type === 'invented_evidence') && COLLECTION_REQUEST_CUE.test(s);
        if (!isNegated(match.index, match.index + match[0].length) && !FUTURE_HEDGE_CUE.test(s) && !NEED_TO_OBTAIN_CUE.test(s) && !RESEARCH_VERIFICATION_CUE.test(s) && !collectionCueApplies) {
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

// ---------- [IMPLICIT TESTIMONIAL/EVIDENCE ATTRIBUTION] confirmed adjudicated gap: "Una clienta
// dice que duplicó sus resultados" / "Clientes satisfechos recomiendan el método" are testimonial-
// like attributed claims that never contain the literal word "testimonio(s)"/"evidencia" the base
// PROHIBITED_CONTENT_PATTERNS regex requires — a human SOURCE (client/customer/patient/student/
// user/buyer/person, HUMAN_SOURCE_NOUN above) combined with an ATTRIBUTION/ENDORSEMENT VERB (dice/
// afirma/asegura/cuenta/recomienda/reporta/comenta/señala or says/states/claims/reports/
// recommends/endorses/tells), or the "Según SOURCE, ..."/"According to SOURCE, ..." attribution
// construction, is the general semantic signature of an invented testimonial regardless of literal
// vocabulary. A bare mention of the source class alone ("clientas pueden escribir por WhatsApp")
// or a PLANNING verb next to the source (preguntar/recopilar/entrevistar/verificar — see
// COLLECTION_REQUEST_CUE above) never matches this: the attribution-verb vocabulary is a
// completely separate, non-overlapping closed list from the planning-verb vocabulary, so a
// research/collection instruction can never trigger this matcher. Requires the clause to carry at
// least one word of payload beyond the source+verb themselves, so a bare "Clienta dice." with
// nothing asserted is never flagged. Implemented as its own additional matcher feeding the SAME
// EXPLICIT_PROHIBITION/testimonials category — never a broadening of any other category, and never
// touching isNegated()/FUTURE_HEDGE_CUE/NEED_TO_OBTAIN_CUE/RESEARCH_VERIFICATION_CUE/
// COLLECTION_REQUEST_CUE, which remain exactly as iteration 1 left them.
const IMPLICIT_ATTRIBUTION_VERB = 'dic(?:e|en)|dijo|afirm\\w*|asegura\\w*|cuenta\\w*|recomiend\\w*|report\\w*|coment\\w*|se\\u00f1al\\w*|says?|said|states?|stated|claims?|claimed|recommends?|recommended|endors\\w*|tells?|told';
const IMPLICIT_SOURCE_VERB_RE = new RegExp(
  '\\b(?:' + HUMAN_SOURCE_NOUN + ')\\b[\\s\\S]{0,60}\\b(?:' + IMPLICIT_ATTRIBUTION_VERB + ')\\b' +
  '|\\b(?:' + IMPLICIT_ATTRIBUTION_VERB + ')\\b[\\s\\S]{0,60}\\b(?:' + HUMAN_SOURCE_NOUN + ')\\b',
  'i'
);
const IMPLICIT_SEGUN_CONSTRUCTION_RE = new RegExp(
  '\\b(?:seg\\u00fan|according\\s+to)\\s+(?:\\w+\\s+){0,2}(?:' + HUMAN_SOURCE_NOUN + ')\\b\\s*,',
  'i'
);
function implicitTestimonialAttributionMatch(clauseText) {
  const trimmed = clauseText.trim();
  if (!trimmed) return null;
  const segunMatch = IMPLICIT_SEGUN_CONSTRUCTION_RE.exec(trimmed);
  if (segunMatch) {
    const after = trimmed.slice(segunMatch.index + segunMatch[0].length).trim();
    if (after.split(/\s+/).filter(Boolean).length >= 2) {
      return { matched_text: segunMatch[0].replace(/,\s*$/, ''), offset: segunMatch.index };
    }
  }
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const sourceVerbMatch = IMPLICIT_SOURCE_VERB_RE.exec(trimmed);
  if (sourceVerbMatch && wordCount >= 4) return { matched_text: sourceVerbMatch[0], offset: sourceVerbMatch.index };
  return null;
}
function checkImplicitTestimonialAttribution(facts, key, rawVal) {
  const cf = facts.constraints;
  if (!cf || cf.status !== 'USER_PROVIDED_FACT') return [];
  const activeCategories = activeExplicitProhibitionCategories(cf.value);
  if (!activeCategories.has('testimonials')) return [];
  const violations = [];
  for (const leaf of collectTextLeaves(rawVal, key)) {
    // [FIELD ROLE MUST NOT BE A BLANKET BYPASS] confirmed regression: "El cliente dice que es
    // caro" inside an 'objections' field describes the BUYER'S OWN anticipated objection as ICP
    // research voice, not an advertiser-fabricated endorsement — the same descriptive-voice
    // exemption isBuyerContextDescriptiveMatch already grants invented_result matches in pains/
    // objections/buying_triggers/qualification_signals/non_fit_signals. Mirrors that exemption's
    // own guard exactly: it never applies if the payload itself carries a quantified result or
    // direct advertiser voice, so a fabricated positive claim smuggled into a buyer-context field
    // still detects.
    const semanticKey = semanticLeafFieldKey(key, leaf.leafPath);
    const isBuyerDescriptiveField = BUYER_VOICE_CLAIM_ROLES.has(claimContextRoleForField(semanticKey));
    let offset = 0;
    for (const s of leaf.text.split(/[.!?\n]/)) {
      const start = leaf.text.indexOf(s, offset);
      const hit = implicitTestimonialAttributionMatch(s);
      if (hit && !(isBuyerDescriptiveField && !RESULT_MAGNITUDE_RE.test(s) && !ADVERTISER_CLAIM_VOICE_CUE.test(s))) {
        violations.push({
          type: 'EXPLICIT_PROHIBITION', fact_field: null, category: 'testimonials', field_key: key,
          matched_text: hit.matched_text, matched_pattern: 'IMPLICIT_TESTIMONIAL_ATTRIBUTION',
          local_clause: s.trim(), clause_index: null, occurrence_start: start + hit.offset,
          leaf_path: leaf.leafPath,
        });
      }
      offset = start + s.length;
    }
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
// [BILINGUAL — RT18/RT50, Part J red-team] confirmed gaps: "activar" (Spanish "activate/turn on",
// the exact same grammatical category as ofrecer/usar/incluir already here) and the English
// equivalents of this entire glue list (offer/include/use/present/add/incorporate/confirm/send/
// schedule/create/generate/make/have/this/these/with/without/more/...) were both missing — an
// English-authored specialist output's generic adoption verb ("offer a special bonus") was
// wrongly surviving as a novel anchor word itself, purely because this list, unlike every other
// vocabulary list in this file, had never been given its English mirror.
const PROPOSAL_GLUE = new Set(('para como desde hasta sobre entre cuando donde porque tambien cualquier cada nuevo nueva nuevos nuevas propuesta unknown current_research_required incluir usar utilizar presentar ofrecer activar agregar incorporar confirmar enviar agendar realizar crear generar hacer tener puede pueden debe deben sera ser estar esta este estos estas una unas unos del las los con por que sin mas ' +
  'from about between when where because also any each proposal include present offer activate incorporate confirm send schedule implement create generate make have this these with without more').split(' '));
// [MEASUREMENT/OPERATIONS VOCABULARY — Parts D/E of ASTRA_CAMPAIGN360_MEASUREMENT_DERIVATION_AND_
// PROPOSAL_PROVENANCE_HARDENING] confirmed live false positive (job b2252275-fbb4-40e5-840e-
// 8c7532f3ac71): measurement.{funnel_metrics,conversion_metrics,diagnostic_metrics,
// optimization_triggers,measurement_cadence} were flagged as UNLABELED_UPSTREAM_PROPOSAL_
// PROPAGATION purely for reusing single ordinary words (link/envio/enlace/inicial/tiempo/post/
// calificacion) that ALSO happened to appear once, incidentally, in an upstream PROPUESTA-marked
// sentence. Unlike PROPOSAL_GLUE (closed-class grammatical connectors/generic verbs, useless as
// evidence of ANY idea, proposed or not), this is a bounded, CATEGORY-grounded set of ordinary
// marketing-OPERATIONS nouns — timing/cadence, communication-channel/delivery mechanics, and
// measurement/diagnostic descriptors — that describe standard, ubiquitous funnel MACHINERY
// regardless of which specific tactic a brief proposes. A measurement node's job is inherently to
// describe WHEN something is tracked (tiempo/inicial/final/cadencia/frecuencia), THROUGH WHAT
// channel (enlace/link/envio/recordatorio/mensaje/canal), and WHAT STATE is diagnosed
// (calificacion/respuesta/seguimiento/diagnostico/medicion) — none of that is evidence a specific
// upstream PROPOSAL was silently copied, only that ordinary funnel-operations vocabulary recurs
// across nodes describing the SAME already-established mechanism. Deliberately NOT the literal 7
// live anchors (this set is built from three linguistic CATEGORIES, each with multiple members
// beyond what the live job happened to use) and deliberately NOT a field/node-scoped exemption —
// it changes anchor ELIGIBILITY globally, the same mechanism PROPOSAL_GLUE already uses, so a
// genuinely DISTINCTIVE, deal-specific noun (consultoria/auditoria/descuento/oferta — an actual
// offer/tactic name) is completely unaffected and still detects on a single reused occurrence,
// exactly as the protected regression suite (astra_campaign360_proposal_status_propagation*.test.js)
// already requires. "recordatorio" is included here (not just the measurement-node's own 5 fields)
// because the SAME category applies symmetrically downstream of it: "PROPUESTA: enviar recordatorio
// 24h" followed by an unrelated node's "medir tiempo de respuesta post-recordatorio" must not fail
// merely because both mention a reminder as a timing reference point, not as a re-proposed tactic.
// [BILINGUAL] mirrors this file's established pattern (RESULT_CLAIM_VERBS, ADVERTISER_CLAIM_VOICE_
// CUE, etc.) of pairing every Spanish vocabulary list with its direct English equivalent, rather
// than leaving English-authored specialist output to a Spanish-only list.
const MEASUREMENT_OPERATIONS_GLUE = new Set([
  // temporal / cadence — standard scheduling vocabulary, never proposal-specific on its own
  'tiempo', 'inicial', 'final', 'previo', 'posterior', 'durante', 'cadencia', 'frecuencia', 'periodo', 'ciclo',
  'initial', 'previous', 'prior', 'during', 'cadence', 'frequency', 'period', 'cycle', 'timing',
  // communication channel / delivery mechanics — standard funnel-plumbing vocabulary
  'enlace', 'link', 'envio', 'mensaje', 'recordatorio', 'canal', 'post',
  'send', 'sending', 'message', 'reminder', 'channel',
  // measurement / diagnostic descriptors — standard tracking vocabulary, not an asserted tactic
  'calificacion', 'respuesta', 'seguimiento', 'diagnostico', 'medicion', 'indicador', 'reporte',
  'qualification', 'rating', 'response', 'tracking', 'diagnostic', 'measurement', 'measuring', 'indicator', 'report',
  // [RT23/RT24/RT26/RT27, Part J red-team] measurement-PURPOSE verbs — deliberately the SAME
  // closed vocabulary RESULT_MEASUREMENT_VERBS already defines above (medir/analizar/registrar/
  // probar/testear/monitorear/evaluar/revisar/comparar + track/measure/monitor/define/evaluate/
  // review/compare), reused rather than re-invented: a bare "medir"/"analizar" is the measurement
  // node doing its own job, not evidence of a copied tactic, exactly like RESULT_MEASUREMENT_VERBS
  // already treats these same verbs as a non-claim "measurement purpose" signal elsewhere in this
  // file. "revisar"/"review"/"comparar"/"compare" deliberately excluded here even though they are
  // in RESULT_MEASUREMENT_VERBS: those are common enough as ordinary tactical verbs (not measurement-
  // specific) that excluding them from anchor eligibility risked masking genuine propagation.
  'medir', 'analizar', 'registrar', 'probar', 'testear', 'monitorear', 'evaluar',
  'measure', 'monitor', 'evaluate',
]);
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
// [PROVENANCE-PRESERVING ANCHORS — ASTRA_CAMPAIGN360_MEASUREMENT_DERIVATION_AND_PROPOSAL_
// PROVENANCE_HARDENING] confirmed live diagnostic gap (job b2252275-fbb4-40e5-840e-
// 8c7532f3ac71): a terminal UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION violation could not be
// adjudicated after the fact — the saved result exposed only a single matched WORD and a JSON
// path, never the actual downstream clause or which upstream node/proposal it supposedly came
// from. anchors is no longer a flat Set<word>; it is a Map<word, sourceClauseRecord[]>, where each
// record is { source_node, source_path, source_clause, words } — words being the FULL set of novel
// (non-canonical, non-glue) anchor words that co-occurred in that ONE upstream PROPUESTA-marked
// clause. Map supports the same .has()/.size surface proposalPropagationHits already used on the
// old Set, so downstream callers needed no interface change beyond what genuinely required the
// richer per-word source list. Marker/anchor-word EXTRACTION is functionally identical to before
// (same PROPUESTA: marker, same proposalWords() 4+-letter tokenizer, same canonical/glue
// filtering) — only what gets RECORDED alongside each anchor changed. Splitting is now done
// directly on the upstream leaf's own RAW (un-normalized) text rather than pre-normalized text,
// so source_clause can be reported with its original casing/accents for human diagnosis;
// proposalWords() still normalizes internally before tokenizing, so which words qualify as anchors
// is byte-for-byte unchanged from the previous implementation.
function upstreamProposalAnchors(facts, upstreamOutputs) {
  const canonical = new Set(Object.values(facts || {})
    .filter(f => f && f.status === 'USER_PROVIDED_FACT').flatMap(f => proposalWords(textOnly(f.value))));
  const anchorIndex = new Map(); // word -> sourceClauseRecord[]
  for (const upstream of upstreamOutputs || []) {
    const sourceNode = upstream.work_unit_id || upstream.node_id || upstream.node || null;
    const payload = upstream.downstream_payload || (upstream.output && upstream.output.downstream_payload);
    for (const entry of proposalLeafEntries(payload)) {
      const rawText = String(entry.value);
      // A marker covers its sentence, including a semicolon continuation in the live offer.
      for (const sentence of rawText.split(/[.!?\n]/)) {
        const marker = /\bpropuesta\s*:/i.exec(sentence);
        if (!marker) continue;
        const words = proposalWords(sentence.slice(marker.index + marker[0].length))
          .filter(w => !canonical.has(w) && !PROPOSAL_GLUE.has(w) && !MEASUREMENT_OPERATIONS_GLUE.has(w));
        if (!words.length) continue;
        const record = {
          source_node: sourceNode, source_path: formatLeafPath(entry.path),
          source_clause: sentence.trim(), words: new Set(words),
        };
        for (const word of words) {
          if (!anchorIndex.has(word)) anchorIndex.set(word, []);
          anchorIndex.get(word).push(record);
        }
      }
    }
  }
  return anchorIndex;
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
        // [BILINGUAL, RT33/RT50] English rejection verbs mirror the pre-existing Spanish set, and
        // "nunca" (Spanish "never") mirrors "no" as a rejection negator — this file's own
        // established pattern elsewhere (isNegated's `negative` cue already treats no/nunca as
        // equivalent); this specific rejection escape had never been given either mirror before.
        const rejection = /\b(?:(?:no|nunca)\s+(?:incluir|usar|utilizar|ofrecer|agendar|implementar|adoptar)|rechazar|rechazamos|descartar|descartamos|(?:do\s+not|don['’]t|never)\s+(?:include|use|offer|schedule|implement|adopt)|reject(?:s|ed|ing)?|discard(?:s|ed|ing)?)\b/g;
        let rejectedAt = -1;
        for (const r of localBefore.matchAll(rejection)) rejectedAt = r.index + r[0].length;
        if (rejectedAt >= 0 && !/\b(?:inclu\w*|us[ae]\w*|utiliz\w*|ofrec\w*|agend\w*|implement\w*|adopt\w*|include[sd]?|including|use[sd]?|using|offer(?:s|ed|ing)?|schedul\w*|adopt(?:s|ed|ing)?)\b/.test(localBefore.slice(rejectedAt))) continue;
        // [RT34] "sin X disponible" / "no existe X" — the same non-adoption ABSENCE framing
        // EXISTENCE_ABSENCE_CUE already recognizes elsewhere in this file (checkExplicitProhibition
        // OnLeaf) — an anchor word appearing only inside a statement that the thing is UNAVAILABLE
        // is not evidence of adoption either. Scoped to the local clause exactly like every other
        // escape here.
        if (/\bsin\s+$/i.test(localBefore) && /^\s+disponible\b/i.test(after)) continue;
        if (/\bno\s+existe[n]?\s*$/i.test(localBefore)) continue;

        // Specificity is now handled at ANCHOR-ELIGIBILITY time (MEASUREMENT_OPERATIONS_GLUE,
        // above) rather than here: a word that survived that filter to become an anchor at all is
        // by construction distinctive enough that a single unmarked reuse is sufficient evidence
        // — exactly the pre-existing behavior the protected regression suite depends on
        // (consultoria/auditoria/propietaria/oferta/descuento all still detect on one occurrence).
        const corroborating = anchors.get(match[0])[0];

        const localStart = clause.lastIndexOf(';', match.index) + 1;
        const repairOffset = span.start + localStart;
        const identity = JSON.stringify(leaf.path) + ':' + repairOffset;
        if (seen.has(identity)) continue;
        seen.add(identity);
        hits.push({
          matched_anchor: match[0], leaf_path: formatLeafPath(leaf.path), leaf_path_parts: leaf.path,
          clause_index: span.clauseIndex, repair_offset: repairOffset,
          // [PART C — diagnostic contract] downstream_clause is reported normalized (lowercase,
          // accent-stripped) rather than sliced from raw text: proposalClauseSpans() operates on
          // normalized text, and re-deriving raw-text span offsets would require assuming norm()
          // is index-length-preserving against arbitrary input, which this file does not otherwise
          // rely on. Normalized text is still fully human-adjudicable.
          downstream_clause: clause.trim(),
          upstream_source_node: corroborating.source_node, upstream_source_path: corroborating.source_path,
          upstream_source_clause: corroborating.source_clause,
        });
      }
    }
  }
  return hits;
}
function checkUpstreamProposalPropagation(key, rawValue, anchors) {
  return proposalPropagationHits(rawValue, anchors).map(hit => ({
    type: 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION', fact_field: null, field_key: key,
    matched_anchor: hit.matched_anchor, leaf_path: hit.leaf_path, clause_index: hit.clause_index,
    downstream_clause: hit.downstream_clause, upstream_source_node: hit.upstream_source_node,
    upstream_source_path: hit.upstream_source_path, upstream_source_clause: hit.upstream_source_clause,
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
    for (const v of checkImplicitTestimonialAttribution(facts, key, rawVal)) violations.push(v);
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
//
// [HUMAN_SEMANTIC_DECISION_CAMPAIGN360_2026_09_13] adjudicated three confirmed live false
// positives (funnel.conversion_intent = "Solicitar consulta por WhatsApp"; ad_strategy.measurement
// = "citas agendadas"; measurement_kpis.conversion_metrics = "tasa cita confirmada") as real: a
// funnel MICROCONVERSION and two MEASUREMENT/KPI fields were being held to the same bar as an
// actual BUSINESS_OUTCOME field. Four roles, not a blanket per-field SAFE bypass:
//   - BUSINESS_OUTCOME (formerly STRICT): the field's ENTIRE value (whole text, even with no
//     enumeration at all) IS this campaign's own claimed final conversion/endpoint — whatsapp
//     closing, whatsapp recovery (a recovery message's own proposed closing action),
//     measurement.primary_outcome. Matched against the mechanism's FULL term set (any mechanism
//     vocabulary, endpoint or intermediate, substituting for the real purchase objective is a
//     violation here) — this is the one role that must never be weakened.
//   - PROCESS_SEQUENCE (formerly SEQUENCE): the field describes an ordered PROCESS (funnel.stages/
//     transitions, measurement.funnel_metrics) — intermediate steps are always legitimate process
//     description, never candidates in their own right; only an item that is ITSELF an arrow chain
//     contributes its TERMINAL segment as a candidate (an item with no arrow at all is pure
//     description and is never inspected). This is what lets "Meta Ads genera consultas; WhatsApp
//     gestiona la conversación; compra del minicurso" pass while "Meta Ads → Landing → WhatsApp →
//     Cita" still flags its own terminal.
//   - MICROCONVERSION (funnel.conversion_intent): the field names the funnel's own intermediate
//     conversion action, which is EXPECTED to reference a mechanism stage ("Solicitar consulta por
//     WhatsApp") — that is what a funnel microconversion IS, not a redefinition of the business
//     objective. Matched against ONLY the mechanism's own ENDPOINT term(s) (same extraction as
//     BUSINESS_OUTCOME's whole-field candidate), so an intermediate-stage mention never flags, but
//     the field still flags when it asserts the mechanism's actual terminal action as the intent
//     ("Agendar cita") — that IS asserting the final commercial outcome, not a microconversion.
//   - MEASUREMENT (ad_strategy.measurement, measurement_kpis.conversion_metrics; formerly
//     ENUMERATION/LEADING_INDICATOR): a measurement/KPI/tracking-setup field is not a definition of
//     the campaign's business objective at all — it may name any mechanism stage OR the mechanism's
//     own endpoint as a tracked metric ("citas agendadas", "tasa cita confirmada") without that
//     being business-objective substitution. Never inspected by this check. This is NOT the same as
//     SAFE: it is its own named role documenting WHY (measurement/KPI semantics), reserving room
//     for a future measurement-specific check, and every other validator (EXPLICIT_PROHIBITION,
//     invented_metric, etc.) still runs on this field exactly as before — only THIS substitution
//     check is inapplicable to a field whose entire purpose is measuring stages/outcomes, not
//     declaring the business objective.
//   - SAFE: legitimate to mention the mechanism/intermediate steps without being treated as this
//     campaign's own conversion at all — whatsapp.follow_up, measurement.leading_indicators,
//     ad_strategy.campaign_objective (a MEDIA/PLATFORM objective like "Mensajes" is never the
//     same thing as the campaign's commercial objective and must never be role-confused with it).
//   Any field/section not listed here is not inspected by this check at all — mechanism/offer/
//   educational-content/ICP fields are never touched, by omission, not by a special-case escape.
const FINAL_SYNTHESIS_FIELD_ROLES = {
  '6_funnel': {
    stages: 'PROCESS_SEQUENCE', transitions: 'PROCESS_SEQUENCE', conversion_intent: 'MICROCONVERSION',
  },
  '8_ad_strategy': {
    measurement: 'MEASUREMENT', campaign_objective: 'SAFE',
  },
  '12_whatsapp_followup_closing': {
    closing: 'BUSINESS_OUTCOME', recovery: 'BUSINESS_OUTCOME', follow_up: 'SAFE', objections: 'SAFE',
  },
  '13_measurement_kpis': {
    primary_outcome: 'BUSINESS_OUTCOME', funnel_metrics: 'PROCESS_SEQUENCE', conversion_metrics: 'MEASUREMENT',
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
// [SILENT ROLE CONTAMINATION FIX] confirmed live false positive (job 29a3248a-045f-4942-ba15-
// 59469d1e9369): 8_ad_strategy.measurement = "PROPUESTA: Medir consultas generadas y conversaciones
// iniciadas (no proyectar resultados)" was flagged via matched_anchor "consulta" — an INTERMEDIATE
// mechanism stage term (the mechanism is "... generar consultas y WhatsApp para convertir: consulta
// → conversación → cita"), not the mechanism's actual ENDPOINT ("cita"). Tracking intermediate
// acquisition signals (consultas generadas, conversaciones iniciadas, chats, landing visits) as
// LEADING INDICATORS is exactly the legitimate ad-platform measurement use case this field exists
// for — the role confusion this whole check protects against is specifically the mechanism's own
// ENDPOINT being promoted to look like the campaign's primary conversion, not any mention of an
// earlier funnel stage. `extractMechanismEndpointTerms` mirrors extractMechanismStageTerms's own
// trailing-segment branch exactly (same stemming, same stopword filtering) but returns ONLY the
// LAST arrow-chain segment's terms, never the first/middle stage tokens.
function extractMechanismEndpointTerms(mechanismValue) {
  const text = String(mechanismValue || '');
  const parts = text.split(ARROW_RE);
  const terms = new Set();
  if (parts.length > 1) {
    const trailing = parts[parts.length - 1].split(/[.,;:\n]/)[0];
    for (const w of norm(trailing).split(/[^a-z0-9]+/)) if (w.length >= 3 && !MECHANISM_TERM_STOPWORDS.has(w)) terms.add(stemMechanismTerm(w));
  } else {
    // No explicit arrow chain at all — the whole mechanism IS its own "endpoint" description, so
    // endpoint-only and full-term extraction coincide (mirrors the no-arrow branch above).
    for (const w of norm(text).split(/[^a-z0-9]+/)) if (w.length >= 4 && !MECHANISM_TERM_STOPWORDS.has(w)) terms.add(stemMechanismTerm(w));
  }
  return [...terms];
}
// Endpoint-only mirror of mechanismTermsForFacts — same objective-grounding/cross-language-cluster
// treatment, restricted to the mechanism's actual terminal stage.
function mechanismEndpointTermsForFacts(facts) {
  const mf = facts.mechanism;
  if (!mf || mf.status !== 'USER_PROVIDED_FACT' || !mf.value) return [];
  const objectiveWords = new Set(norm((facts.business_objective && facts.business_objective.value) || '').split(/[^a-z0-9]+/).filter(w => w.length >= 3));
  const objectiveGrounds = term => [...objectiveWords].some(w => w.startsWith(term) || term.startsWith(w));
  const result = [];
  for (const term of extractMechanismEndpointTerms(mf.value)) {
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
function extractConversionCandidates(text, role) {
  if (role === 'BUSINESS_OUTCOME' || role === 'MICROCONVERSION') return extractStrictCandidates(text);
  if (role === 'PROCESS_SEQUENCE') return extractSequenceCandidates(text);
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
  // LEADING_INDICATOR fields are matched against ONLY the mechanism's endpoint term(s) — see the
  // FINAL_SYNTHESIS_FIELD_ROLES comment above. Computed lazily/once since most syntheses have no
  // LEADING_INDICATOR-role field at all.
  const mechanismEndpointTerms = mechanismEndpointTermsForFacts(facts);
  const objectiveWords = new Set(norm((facts.business_objective && facts.business_objective.value) || '').split(/[^a-z0-9]+/).filter(w => w.length >= 3));
  const violations = [];
  for (const [subKey, role] of Object.entries(sectionRoles)) {
    if (role === 'SAFE' || role === 'MEASUREMENT') continue;
    const raw = rawVal[subKey];
    if (!raw || typeof raw !== 'string') continue;
    const termsForRole = role === 'MICROCONVERSION' ? mechanismEndpointTerms : mechanismTerms;
    if (!termsForRole.length) continue;
    const candidates = extractConversionCandidates(raw, role);
    for (const candidate of candidates) {
      const normCandidate = norm(candidate);
      const matchedTerm = termsForRole.find(term => termMatchesCandidateWord(term, normCandidate));
      if (!matchedTerm) continue;
      if (isConversionCandidateGrounded(normCandidate, objectiveWords, termsForRole)) continue;
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
const ASSUMPTION_CERTAINTY_CUE = /\b(operativ[oa]s?|list[oa]s?|confirmad[oa]s?|definid[oa]s?|disponible|inclu[iy]d[oa]s?|activ[oa]s?)\b/i;
const ASSUMPTION_UNKNOWN_CUE = /\bdesconocid[oa]s?\b|\bpor\s+(confirmar|definir)\b|\bpendiente(s)?\b|\bno\s+(disponible|definid[oa]s?|especificad[oa]s?|proporcionad[oa]s?)\b|\bno\s+se\s+proporcion[oó]\b/i;
// [ASSUMPTION EPISTEMIC SEMANTICS — CONFIRMED LIVE OVER-DETECTION] job 29a3248a-045f-4942-ba15-
// 59469d1e9369 reported 7 CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS violations from a 4-item
// cluster where NONE were genuine contradictions — all four were variants of "budget is
// unknown/not specified/not defined/needed", which are COMPATIBLE epistemic states, not opposing
// ones. Two root bugs: (1) ASSUMPTION_CERTAINTY_CUE is negation-blind — "no definidos"/"no
// confirmado" still match the bare participle "definid[oa]s?"/"confirmad[oa]s?", so a NEGATED
// sentence was misclassified as asserting certainty; (2) a self-hedged sentence combining a
// certainty word with an unknown word in the SAME clause ("disponible (desconocido)") was treated
// as unambiguously certain instead of adjudicated as ambiguous/badly formed, letting it pairwise-
// contradict every other unknown-family statement in the list. Fixed via a proper epistemic-state
// classifier (below) instead of the old boolean certain/unknown flags — replaces "same topic +
// different status keyword = contradiction" with actual state-compatibility.
const ASSUMPTION_EXISTENCE_NEGATION_CUE = /\bno\s+(?:existe[n]?|hay)\b/i;
// A REQUIRED/NEEDS-CONFIRMATION framing ("Necesitamos X disponible", "Requerimos confirmar Y") is
// a REQUEST, not an assertion that X currently IS available — grammatically distinct from the
// PARTICIPLE forms ASSUMPTION_CERTAINTY_CUE matches (bare infinitives like "definir"/"confirmar"
// were never matched by it to begin with; this cue additionally neutralizes a participle/adjective
// that appears alongside an explicit "necesitamos/requerimos" framing in the same sentence).
const ASSUMPTION_REQUIRED_CUE = /\bnecesita\w*\b|\brequerimos\b|\brequerid[oa]s?\b|\bse\s+requiere\b|\bhace\s+falta\b|\bdebemos\s+(?:definir|confirmar|obtener|especificar)\b/i;
// Combined epistemic vocabulary, used ONLY to strip cue words before extracting a sentence's actual
// topic (Rule 2) — never used for state classification itself (classifyAssumptionEpistemicState
// above already handles that with its own priority order).
const ASSUMPTION_ANY_EPISTEMIC_CUE = new RegExp([
  ASSUMPTION_USER_ATTRIBUTION_CUE.source, ASSUMPTION_CERTAINTY_CUE.source, ASSUMPTION_UNKNOWN_CUE.source,
  ASSUMPTION_EXISTENCE_NEGATION_CUE.source, ASSUMPTION_REQUIRED_CUE.source,
].join('|'), 'i');
// Classifies one assumption sentence into a discrete epistemic-role bucket. Priority matters:
// REQUIRED is checked first (a request framing overrides any participle in the same sentence —
// "Necesitamos presupuesto disponible" is a NEED, not a claim of current availability), then
// explicit existence-negation ("no existe"/"no hay"), then genuine (non-negated) certainty vs.
// unknown-family cues — a sentence matching BOTH is AMBIGUOUS, not confidently certain.
function classifyAssumptionEpistemicState(text) {
  if (ASSUMPTION_REQUIRED_CUE.test(text)) return 'REQUIRED';
  if (ASSUMPTION_EXISTENCE_NEGATION_CUE.test(text)) return 'KNOWN_UNAVAILABLE';
  const hasUnknown = ASSUMPTION_UNKNOWN_CUE.test(text);
  let hasGenuineCertainty = false;
  for (const m of text.matchAll(new RegExp(ASSUMPTION_CERTAINTY_CUE.source, 'gi'))) {
    const before = text.slice(0, m.index);
    if (!/\b(?:no|sin)\s+$/i.test(before)) { hasGenuineCertainty = true; break; }
  }
  if (hasGenuineCertainty && hasUnknown) return 'AMBIGUOUS'; // "disponible (desconocido)" — badly formed, never anchors a contradiction
  if (hasUnknown) return 'UNKNOWN_FAMILY';
  if (hasGenuineCertainty) return 'KNOWN_AVAILABLE';
  return 'NONE';
}
// Only a confident KNOWN_AVAILABLE claim conflicting with either an explicit KNOWN_UNAVAILABLE
// claim or a plain acknowledgment of uncertainty (UNKNOWN_FAMILY) is a genuine contradiction — the
// asymmetry is deliberate: a firm "yes" is the surprising side that needs backing, whether directly
// contradicted by a firm "no" or merely by another part of the same synthesis still calling it
// unknown. REQUIRED, AMBIGUOUS, NONE, and KNOWN_UNAVAILABLE-vs-UNKNOWN_FAMILY are all compatible —
// none of them assert a confident, checkable fact that a hedge elsewhere could conflict with.
function areEpistemicStatesContradictory(a, b) {
  const states = new Set([a, b]);
  return states.has('KNOWN_AVAILABLE') && (states.has('KNOWN_UNAVAILABLE') || states.has('UNKNOWN_FAMILY'));
}
const ASSUMPTION_TOPIC_STOPWORDS = new Set('para con del las los una uno unos unas este esta estos estas cada todo toda propuesta assumption asumo existe existira habra sera seran monto valor campana campaign'.split(' '));
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
  // Rule 2 — cross-item contradiction within the same list (no rawRequest needed). Uses proper
  // epistemic-state compatibility (see classifyAssumptionEpistemicState/areEpistemicStatesContradictory
  // above), not "same topic + different status keyword". Every pair is checked exactly once
  // (i < j); topic extraction strips the FULL combined epistemic vocabulary (attribution + certainty
  // + unknown + existence-negation + required cues) from both sides so the remaining words are
  // purely the sentence's actual subject, regardless of which state either side landed in.
  const states = parsed.map(p => classifyAssumptionEpistemicState(p.text));
  const topicsFor = text => new Set(assumptionTopicWords(text, ASSUMPTION_ANY_EPISTEMIC_CUE));
  const topicsCache = parsed.map(p => topicsFor(p.text));
  for (let i = 0; i < parsed.length; i++) {
    if (!topicsCache[i].size) continue;
    for (let j = i + 1; j < parsed.length; j++) {
      if (!areEpistemicStatesContradictory(states[i], states[j])) continue;
      if (![...topicsCache[j]].some(w => topicsCache[i].has(w))) continue;
      // Report with the confident (KNOWN_AVAILABLE) side first for a consistent, meaningful
      // diagnostic — whichever original index that happens to be.
      const [confidentIdx, otherIdx] = states[i] === 'KNOWN_AVAILABLE' ? [i, j] : [j, i];
      violations.push({ type: 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS', fact_field: null, field_key: key, matched_text: parsed[confidentIdx].text, conflicting_text: parsed[otherIdx].text });
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
// earlier, legitimate steps survive untouched); if every candidate in a BUSINESS_OUTCOME/
// MICROCONVERSION field is flagged and none survive, the field falls back to the canonical
// conversion phrase alone. MEASUREMENT fields never produce violations, so repair never runs on
// them at all.
function repairConversionFieldText(text, role, facts, mechanismTerms, objectiveWords) {
  let changed = false;
  const flagged = c => isCandidateFlaggedForRepair(c, mechanismTerms, objectiveWords);
  if (role === 'BUSINESS_OUTCOME' || role === 'MICROCONVERSION') {
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
  if (role === 'PROCESS_SEQUENCE') {
    const items = text.split(/;/);
    const repairedItems = items.map(item => {
      const terminal = arrowTerminalOrNull(item);
      if (terminal && flagged(terminal)) { changed = true; return repairArrowTerminal(item, facts); }
      return item; // no arrow, or arrow terminal not flagged -> untouched (pure process description)
    });
    return { text: repairedItems.join(';'), changed };
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
  // [CONSISTENCY FIX] this loop must use the EXACT SAME epistemic-state model as
  // checkAssumptionEpistemicConsistency's Rule 2 (classifyAssumptionEpistemicState /
  // areEpistemicStatesContradictory) — it previously used the old certain/unknown booleans
  // directly, so repair could remove an assumption pair that validation itself would no longer
  // flag as contradictory (a family-level inconsistency confirmed while hardening job
  // 29a3248a-045f-4942-ba15-59469d1e9369's live 4-item cluster: validation correctly reported zero
  // contradictions, but this unpatched loop still silently deleted 3 of the 4 legitimate
  // assumptions on every repair pass).
  let again = true;
  while (again) {
    again = false;
    const states = result.map(text => classifyAssumptionEpistemicState(text));
    const topics = result.map(text => new Set(assumptionTopicWords(text, ASSUMPTION_ANY_EPISTEMIC_CUE)));
    outer: for (let i = 0; i < result.length; i++) {
      if (!topics[i].size) continue;
      for (let j = 0; j < result.length; j++) {
        if (i === j || !areEpistemicStatesContradictory(states[i], states[j])) continue;
        const sharedTopic = [...topics[j]].find(w => topics[i].has(w));
        if (!sharedTopic) continue;
        // Keep whichever side the raw brief actually grounds; drop the other. If neither (or the
        // raw request is unavailable), prefer keeping the non-KNOWN_AVAILABLE side — an unverified
        // confident claim is the one that needs to go, never a plain acknowledgment of uncertainty.
        const iIsConfident = states[i] === 'KNOWN_AVAILABLE';
        const confidentText = iIsConfident ? result[i] : result[j];
        const otherText = iIsConfident ? result[j] : result[i];
        if (knownInRaw(sharedTopic)) {
          repairs.push({ removed: otherText, kept: confidentText, reason: 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS' });
          result = result.filter(t => t !== otherText);
        } else {
          repairs.push({ removed: confidentText, kept: otherText, reason: 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS' });
          result = result.filter(t => t !== confidentText);
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
  const mechanismEndpointTerms = mechanismEndpointTermsForFacts(facts);
  const objectiveWords = new Set(norm((facts.business_objective && facts.business_objective.value) || '').split(/[^a-z0-9]+/).filter(w => w.length >= 3));
  if (mechanismTerms.length) {
    for (const [sectionKey, subKeyRoles] of Object.entries(FINAL_SYNTHESIS_FIELD_ROLES)) {
      const section = repaired.deliverable && repaired.deliverable[sectionKey];
      if (!section || typeof section !== 'object') continue;
      for (const [subKey, role] of Object.entries(subKeyRoles)) {
        if (role === 'SAFE' || role === 'MEASUREMENT') continue;
        const raw = section[subKey];
        if (!raw || typeof raw !== 'string') continue;
        // MICROCONVERSION repair must use the SAME endpoint-only term set validation does — an
        // intermediate mechanism stage mention (consultas/conversaciones) must never be stripped
        // out of a funnel microconversion field just because repair happened to run for an
        // unrelated violation elsewhere in the same synthesis.
        const termsForRole = role === 'MICROCONVERSION' ? mechanismEndpointTerms : mechanismTerms;
        if (!termsForRole.length) continue;
        const { text, changed } = repairConversionFieldText(raw, role, facts, termsForRole, objectiveWords);
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
    for (const v of checkImplicitTestimonialAttribution(facts, key, rawVal)) violations.push(v);
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
