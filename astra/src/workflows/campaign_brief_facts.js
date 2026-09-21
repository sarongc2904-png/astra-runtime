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

const FACT_STATUS = Object.freeze(['USER_PROVIDED_FACT', 'INFERENCE', 'PROPOSAL', 'UNKNOWN', 'CONFLICTO_INTERNO']);

const AUTHORITY_ORDER = Object.freeze([
  'DATO_INTERNO_EXPLICITO',
  'DATO_INTERNO_IMPLICITO_FUERTEMENTE_ANCLADO',
  'DATO_CONFIRMADO_EN_CONTEXTO_ESTRUCTURADO',
  'INVESTIGACION_EXTERNA',
  'INFERENCIA',
  'PROPUESTA',
  'UNKNOWN',
]);

function unknownFact() {
  return Object.freeze({ value: null, status: 'UNKNOWN', provenance: 'UNKNOWN', confidence: 'NONE' });
}
function explicitFact(value, evidenceText) {
  if (!value) return unknownFact();
  return Object.freeze({
    value,
    status: 'USER_PROVIDED_FACT',
    provenance: 'DATO_INTERNO',
    confidence: 'EXPLICITO',
    authority: 'DATO_INTERNO_EXPLICITO',
    evidence: evidenceText ? [String(evidenceText)] : [],
  });
}
function conflictFact(field, candidates) {
  return Object.freeze({
    value: null,
    status: 'CONFLICTO_INTERNO',
    provenance: 'DATO_INTERNO',
    confidence: 'CONFLICTO',
    authority: 'DATO_INTERNO_EXPLICITO',
    conflict_field: field,
    candidates: candidates.map(c => c.value),
    evidence: candidates.map(c => c.evidence),
    recommendation: 'Solicitar aclaración; no elegir un valor final automáticamente.',
  });
}
function normalizeComparable(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
}
function resolveExplicitCandidates(field, candidates) {
  const clean = (candidates || []).filter(c => c && c.value != null && String(c.value).trim() !== '');
  if (!clean.length) return unknownFact();
  const unique = [];
  for (const c of clean) {
    const k = normalizeComparable(c.value);
    if (!unique.some(u => normalizeComparable(u.value) === k)) unique.push(c);
  }
  if (unique.length > 1) return conflictFact(field, unique);
  return explicitFact(unique[0].value, unique[0].evidence);
}
function collectLabeledCandidates(text, patterns, transform = cleanValue) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m && m[1] && m[1].trim()) {
        const value = transform(m[1]);
        if (value != null) out.push({ value, evidence: line.trim() });
        break;
      }
    }
  }
  return out;
}

// ---------- labeled fields: one canonical field per line, "Label: value" ----------
// NOTE on "Producto:": historically this label held the product NAME ("Producto: Método 360"),
// and that legacy meaning is preserved. But in the structured brief contract the name is stated
// in the opening sentence ("Crea una campaña 360 para Método 360.") and "Producto:" instead holds
// the TYPE ("Producto: minicurso grabado."). extract() below resolves this: when the opening
// pattern already supplied product_name, "Producto:" is read as product_type instead — it never
// overwrites a product_name that's already been found. "Tipo:" is unambiguous and always wins for
// product_type when present.
const FIELD_LABELS = {
  product_name: [/^\s*producto\s*:\s*(.+)$/i, /^\s*product\s*:\s*(.+)$/i, /^\s*product\s*name\s*:\s*(.+)$/i],
  product_type: [/^\s*tipo(?:\s+de\s+producto)?\s*:\s*(.+)$/i, /^\s*product\s*type\s*:\s*(.+)$/i, /^\s*type\s*:\s*(.+)$/i],
  price: [/^\s*precio\s*:\s*(.+)$/i, /^\s*price\s*:\s*(.+)$/i],
  buyer: [/^\s*comprador(?:a)?\s*:\s*(.+)$/i, /^\s*buyer\s*:\s*(.+)$/i, /^\s*dirigido\s*a\s*:\s*(.+)$/i],
  audience: [/^\s*audiencia\s*:\s*(.+)$/i, /^\s*audience\s*:\s*(.+)$/i, /^\s*target\s*audience\s*:\s*(.+)$/i],
  geography: [/^\s*geograf[ií]a\s*:\s*(.+)$/i, /^\s*pa[ií]s\s*:\s*(.+)$/i, /^\s*geography\s*:\s*(.+)$/i],
  business_objective: [/^\s*objetivo\s*:\s*(.+)$/i, /^\s*objective\s*:\s*(.+)$/i],
  problem_context: [/^\s*problema(?:\s+principal)?\s*:\s*(.+)$/i, /^\s*problem(?:\s+context)?\s*:\s*(.+)$/i],
  mechanism: [/^\s*mecanismo\s+exacto\s*:\s*(.+)$/i, /^\s*exact\s+mechanism\s*:\s*(.+)$/i, /^\s*mecanismo\s*:\s*(.+)$/i, /^\s*mechanism\s*:\s*(.+)$/i, /^\s*funnel\s*:\s*(.+)$/i],
  constraints: [/^\s*restricciones?\s*:\s*(.+)$/i, /^\s*constraints?\s*:\s*(.+)$/i],
};
// "Restricciones obligatorias:" (or "Constraints:"/"Required constraints:") introduces a
// multi-line bulleted block rather than a same-line value — captured separately by
// captureConstraintsBlock() below, up to the next structural heading.
const CONSTRAINTS_BLOCK_HEADING = /^\s*(restricciones(\s+obligatorias)?|required\s+constraints|constraints)\s*:?\s*(.*)$/i;
const STRUCTURAL_HEADING_STOP = /^\s*(estructura(\s+obligatoria)?|prioridad\s+comercial|structure|commercial\s+priority)\s*:/i;

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

// Captures the full multi-line block introduced by a "Restricciones obligatorias:"-style heading
// (or any of its recognized synonyms), up to the next structural heading or end of text. Every
// non-blank line in the block is preserved verbatim (leading bullet marker stripped) — nothing is
// summarized or invented; an empty block still counts as "found the heading" only if it actually
// has content, otherwise it's treated as not present.
function captureConstraintsBlock(text) {
  const lines = text.split(/\r?\n/);
  let startIdx = -1, sameLineTail = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CONSTRAINTS_BLOCK_HEADING);
    if (m) { startIdx = i; sameLineTail = m[3] ? m[3].trim() : ''; break; }
  }
  if (startIdx === -1) return null;
  const collected = [];
  if (sameLineTail) collected.push(sameLineTail);
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (STRUCTURAL_HEADING_STOP.test(line) || isKnownSectionHeading(line)) break;
    const trimmed = line.trim();
    if (!trimmed) continue; // blank lines inside the block are skipped, not treated as the end
    collected.push(trimmed.replace(/^[-*•]\s*/, ''));
  }
  return collected.length ? collected.join('\n') : null;
}

// [Natural Constraint Extraction] A brief with no "Restricciones:"/"Restricciones obligatorias:"
// heading can still state a binding restriction as a plain prose sentence — e.g. "No inventes
// métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia." Captured verbatim, sentence by
// sentence, whenever a sentence begins with one of a fixed set of prohibition/immutability verbs
// ("No inventes/inventar/cambies/cambiar"). Nothing is reinterpreted, summarized, or expanded — the
// captured value is the sentence(s) exactly as written, and only sentences that actually start this
// way are captured (no keyword scanning that could invent a prohibition the user never wrote). This
// is a fallback only: the structured "Restricciones obligatorias:" block always takes precedence
// when present (see extract() below).
const NATURAL_CONSTRAINT_SENTENCE = /^\s*no\s+(inventes|inventar|cambies|cambiar)\b/i;
function captureNaturalConstraintSentences(text) {
  const sentences = text.match(/[^.\n]+[.\n]?/g) || [];
  const matches = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (NATURAL_CONSTRAINT_SENTENCE.test(s)) matches.push(s.replace(/\s+/g, ' ').trim());
  }
  return matches.length ? matches.join('\n') : null;
}

function firstNaturalMatch(naturalText, patterns) {
  for (const re of patterns || []) {
    const m = naturalText.match(re);
    if (m && m[1] && m[1].trim()) return cleanValue(m[1]);
  }
  return null;
}

// ---------- structured multi-line section briefs ----------
// Campaign360 production briefs commonly use heading-only blocks such as:
// NEGOCIO / PRODUCTO
// OBJETIVO PRINCIPAL
// AUDIENCIA
// MERCADO / GEOGRAFÍA
// rather than "Label: value" lines. Treat those blocks as first-class user-provided facts.
const KNOWN_SECTION_HEADING = /^(?:NEGOCIO\s*\/\s*PRODUCTO|OBJETIVO\s+PRINCIPAL|AUDIENCIA|OFERTA\s+ACTUAL|CONTROL\s+ACTUAL|OFERTA\s+DE\s+ENTRADA(?:\s+A\s+VALIDAR)?|OFERTA\s+PRINCIPAL|OFERTA\s+ANUAL|CANAL\s+PRINCIPAL|MERCADO\s*\/\s*GEOGRAF[IÍ]A|PRESUPUESTO|RESTRICCIONES?|INVESTIGACI[OÓ]N\s+OBLIGATORIA|REGLA\s+DE\s+PROCEDENCIA|SECUENCIA\s+OBLIGATORIA|ENTREGABLE\s+FINAL)$/i;

function normalizeHeadingLine(line) {
  return String(line || '')
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .replace(/:\s*$/, '')
    .trim();
}
function isKnownSectionHeading(line) { return KNOWN_SECTION_HEADING.test(normalizeHeadingLine(line)); }

function captureSectionLines(text, headingRe) {
  const lines = String(text || '').split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(normalizeHeadingLine(lines[i]))) { start = i + 1; break; }
  }
  if (start === -1) return [];
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (isKnownSectionHeading(trimmed)) break;
    if (!trimmed) {
      if (out.length) out.push('');
      continue;
    }
    out.push(trimmed);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

function firstMeaningfulSectionLine(lines) {
  for (const line of lines || []) {
    const v = cleanValue(String(line || '').replace(/^[-*•]\s*/, ''));
    if (v) return v;
  }
  return null;
}

function extractProblemContextFromAudience(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  for (const raw of lines) {
    const line = String(raw || '').trim();
    const m = line.match(/^problema\s+principal\s*:\s*(.+)$/i);
    if (m && m[1]) return cleanValue(m[1]);
  }
  return null;
}

function extractAudienceBuyer(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const values = [];
  let collectingBullets = false;
  let prefix = null;
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    if (/^problema\s+principal\s*:/i.test(line)) break;
    if (/^due[ñn]as?,\s*due[ñn]os?\s+y\s+administradores?\s+de\s*:\s*$/i.test(line)) {
      prefix = 'Dueñas, dueños y administradores de ';
      collectingBullets = true;
      continue;
    }
    const bullet = line.match(/^[-*•]\s*(.+)$/);
    if (collectingBullets && bullet) {
      const v = cleanValue(bullet[1]);
      if (v) values.push(v);
      continue;
    }
    if (!prefix && /^(?:due[ñn]as?|due[ñn]os?|administradores?|propietarios?)/i.test(line)) {
      return cleanValue(line);
    }
  }
  if (prefix && values.length) return cleanValue(prefix + values.join(', '));
  return null;
}

function extractProductNameFromSection(lines) {
  const first = firstMeaningfulSectionLine(lines);
  if (!first) return null;
  const crm = first.match(/\b(CRM\s+con\s+IA)\b/i);
  if (crm) return cleanValue(crm[1]);
  const beforeFor = first.match(/^([^.!?]{2,100}?)(?:\s+para\b|\.|$)/i);
  return beforeFor ? cleanValue(beforeFor[1]) : null;
}

function extractProductTypeFromSection(lines) {
  const joined = (lines || []).join(' ');
  const explicit = joined.match(/\b(CRM\s+con\s+IA)\b/i);
  if (explicit) return cleanValue(explicit[1]);
  const first = firstMeaningfulSectionLine(lines);
  if (!first) return null;
  const m = first.match(/^([^.!?]{2,80}?)(?:\s+para\b|\.|$)/i);
  return m ? cleanValue(m[1]) : null;
}

function extractMechanismFromSection(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const candidates = lines
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .filter(x => !/^[-*•]/.test(x))
    .filter(x => /\b(?:sistema|centraliza|utiliza|usa|bot|clasifica|seguimiento|agenda|agendar|calendar|whatsapp)\b/i.test(x));
  return candidates.length ? cleanValue(candidates.join(' ')) : null;
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

function fact(value, evidenceText) { return value ? explicitFact(value, evidenceText) : unknownFact(); }

// extract(rawRequest) -> frozen CanonicalBriefFacts. Never throws; a field absent from BOTH the
// labeled and natural-language forms stays UNKNOWN — never invented. Deterministic: identical
// rawRequest text -> identical facts + raw_request_hash.
// Splits a value like "dueñas de estéticas en México" into { buyer, geography } when it ends in
// "en <Capitalized Place>"; otherwise returns { buyer: value, geography: null }.
function splitBuyerGeography(value) {
  if (!value) return { buyer: null, geography: null };
  const m = value.match(/^(.+?)\s+en\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)$/);
  if (m) return { buyer: cleanValue(m[1]), geography: cleanValue(m[2]) };
  return { buyer: value, geography: null };
}

function extract(rawRequest) {
  const text = String(rawRequest || '');
  const naturalText = collapseWhitespace(text);

  const productSection = captureSectionLines(text, /^NEGOCIO\s*\/\s*PRODUCTO$/i);
  const objectiveSection = captureSectionLines(text, /^OBJETIVO\s+PRINCIPAL$/i);
  const audienceSection = captureSectionLines(text, /^AUDIENCIA$/i);
  const geographySection = captureSectionLines(text, /^MERCADO\s*\/\s*GEOGRAF[IÍ]A$/i);
  const offerSection = captureSectionLines(text, /^OFERTA\s+ACTUAL$/i);

  // product_name: the structured-brief opening ("Crea una campaña 360 para Método 360.") is the
  // authoritative source when present — it names the product independently of what "Producto:"
  // holds below it. Falls back to the labeled "Producto:"/"Product:" line (legacy meaning: the
  // label held the name directly, e.g. "Producto: Método 360"), then other natural forms.
  const sectionProductName = extractProductNameFromSection(productSection);
  const openingProductName = firstNaturalMatch(naturalText, NATURAL_PATTERNS.product_name.slice(0, 1));
  const productoLabelRaw = firstLabeledMatch(text, FIELD_LABELS.product_name);
  const product_name = sectionProductName || openingProductName || productoLabelRaw || firstNaturalMatch(naturalText, NATURAL_PATTERNS.product_name.slice(1));
  // product_type: "Tipo:" is unambiguous and always wins. Otherwise, if the opening sentence
  // already supplied product_name, "Producto:" is read as the type instead (structured-brief
  // contract: "Producto: minicurso grabado.") rather than being wasted as an unused duplicate of
  // product_name. If there was no opening product name, "Producto:" was already consumed above
  // as the legacy product_name and is not reused here.
  const tipoLabelRaw = firstLabeledMatch(text, FIELD_LABELS.product_type);
  const product_type = tipoLabelRaw || (openingProductName ? productoLabelRaw : null) || extractProductTypeFromSection(productSection) || firstNaturalMatch(naturalText, NATURAL_PATTERNS.product_type);

  const priceRaw = firstLabeledMatch(text, FIELD_LABELS.price) || naturalPrice(naturalText);
  const parsedPrincipalPrice = parsePrice(priceRaw);
  const amount = parsedPrincipalPrice.amount;
  const currency = parsedPrincipalPrice.currency;

  let geography = firstLabeledMatch(text, FIELD_LABELS.geography) || firstMeaningfulSectionLine(geographySection);
  let buyer = firstLabeledMatch(text, FIELD_LABELS.buyer) || extractAudienceBuyer(audienceSection);
  // "Audiencia:" is buyer-bearing and frequently carries the geography in the same clause
  // ("Audiencia: dueñas de estéticas en México.") — split them; an explicit "Geografía:"/buyer
  // label elsewhere in the brief still takes precedence if already found.
  if (!buyer) {
    const audienceRaw = firstLabeledMatch(text, FIELD_LABELS.audience);
    if (audienceRaw) {
      const split = splitBuyerGeography(audienceRaw);
      buyer = split.buyer;
      if (!geography) geography = split.geography;
    }
  }
  if (!buyer || !geography) {
    const bg = firstNaturalMatchPair(naturalText, NATURAL_PATTERNS.buyer_geo);
    if (bg) { buyer = buyer || bg.buyer; geography = geography || bg.geography; }
  }
  if (!geography) geography = firstNaturalMatch(naturalText, NATURAL_PATTERNS.geography);

  const business_objective = firstLabeledMatch(text, FIELD_LABELS.business_objective) || firstMeaningfulSectionLine(objectiveSection) || firstNaturalMatch(naturalText, NATURAL_PATTERNS.business_objective);
  const problem_context = firstLabeledMatch(text, FIELD_LABELS.problem_context) || extractProblemContextFromAudience(audienceSection);
  const mechanism = firstLabeledMatch(text, FIELD_LABELS.mechanism) || extractMechanismFromSection(productSection) || firstNaturalMatch(naturalText, NATURAL_PATTERNS.mechanism);
  const offerText = (offerSection || []).join('\n');

  // [Brief Authority] Current commercial facts are extracted globally from the raw brief, not
  // only from OFERTA ACTUAL. This prevents a valid "Demo actual: 3 días" under CONTROL ACTUAL
  // (or another structured block) from being silently degraded to UNKNOWN.
  const demoFact = resolveExplicitCandidates('demo_duration', collectLabeledCandidates(text, [
    /^\s*demo\s+actual\s*:\s*(.+)$/i,
    /^\s*prueba\s+actual\s*:\s*(.+)$/i,
  ]));
  const monthlyPriceFact = resolveExplicitCandidates('monthly_price', collectLabeledCandidates(text, [
    /^\s*precio\s+mensual\s*:\s*(.+)$/i,
    /^\s*plan\s+mensual\s*:\s*(.+)$/i,
  ], raw => parsePrice(raw).amount));
  const annualPriceFact = resolveExplicitCandidates('annual_price', collectLabeledCandidates(text, [
    /^\s*plan\s+anual\s*:\s*(.+)$/i,
    /^\s*precio\s+anual\s*:\s*(.+)$/i,
    /^\s*oferta\s+anual\s*:\s*(.+)$/i,
  ], raw => parsePrice(raw).amount));

  const ctaCandidates = collectLabeledCandidates(text, [/^\s*cta\s+actual\s*:\s*(.+)$/i], raw =>
    cleanValue(cleanValue(raw).replace(/^[\s\"'“”‘’]+|[\s\"'“”‘’]+$/g, ''))
  );
  const ctaFact = resolveExplicitCandidates('current_cta', ctaCandidates);
  // constraints: a same-line value ("Restricciones: presupuesto limitado") wins first (legacy,
  // unchanged); otherwise capture the full "Restricciones obligatorias:" block verbatim, line by
  // line, up to the next structural heading — nothing summarized, nothing invented.
  const constraintsRaw = firstLabeledMatch(text, FIELD_LABELS.constraints) || captureConstraintsBlock(text) || captureNaturalConstraintSentences(text);

  const facts = {
    product_name: fact(product_name),
    product_type: fact(product_type),
    // Existing principal price remains backward compatible. When an explicit monthly price is
    // supplied, it has authority over a generic/natural first-dollar match (which might otherwise
    // accidentally pick an entry offer such as $197).
    price: monthlyPriceFact.status === 'USER_PROVIDED_FACT'
      ? monthlyPriceFact
      : (monthlyPriceFact.status === 'CONFLICTO_INTERNO' ? monthlyPriceFact : (amount ? explicitFact(amount, priceRaw) : unknownFact())),
    currency: currency ? explicitFact(currency, priceRaw) : unknownFact(),
    monthly_price: monthlyPriceFact,
    annual_price: annualPriceFact,
    buyer: fact(buyer),
    geography: fact(geography),
    business_objective: fact(business_objective),
    problem_context: fact(problem_context),
    mechanism: fact(mechanism),
    demo_duration: demoFact,
    demo_actual: demoFact,
    current_cta: ctaFact,
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

module.exports = { FACT_STATUS, AUTHORITY_ORDER, extract, resolveExplicitCandidates };
