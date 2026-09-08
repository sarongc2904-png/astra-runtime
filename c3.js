// SISTEMA C3 — orquestación compartida para creativo, copy, claims y retrieval Supabase.
// No llama al LLM: prepara contexto verificable para knowledge.js, chat.js y app/server.js.
const fs = require('fs');
const path = require('path');

const AGENT_ROOT = __dirname;
const DEFAULT_ENV_FILE = path.join(
  AGENT_ROOT,
  'transcripciones',
  'claude-code-embeddings',
  'claude-code-embeddings',
  '.env'
);

const MODES = Object.freeze({
  NONE: 'NONE',
  CREATIVE_C3: 'CREATIVE_C3',
  COPY_C3: 'COPY_C3',
  COPY_FB: 'COPY_FB',
  CREATIVE_AUDIT: 'CREATIVE_AUDIT',
  COPY_HOOKS: 'COPY_HOOKS',
  IMAGE_EXECUTION: 'IMAGE_EXECUTION',
});

const BOOKS = Object.freeze({
  'THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md': { book: 'The Advertising Concept Book', author: 'Pete Barry' },
  'HEY_WHIPPLE_SQUEEZE_THIS_LUKE_SULLIVAN.md': { book: 'Hey, Whipple, Squeeze This', author: 'Luke Sullivan' },
  'GRAPHIC_DESIGN_SOLUTIONS_4E_ROBIN_LANDA.md': { book: 'Graphic Design Solutions', author: 'Robin Landa' },
  'THE_ELEMENTS_OF_GRAPHIC_DESIGN_ALEX_WHITE.md': { book: 'The Elements of Graphic Design', author: 'Alex W. White' },
  'CAPTIVOLOGY_BEN_PARR.md': { book: 'Captivology', author: 'Ben Parr' },
  'CONTAGIOUS_JONAH_BERGER.md': { book: 'Contagious', author: 'Jonah Berger' },
  'STORYWORTHY_MATTHEW_DICKS.md': { book: 'Storyworthy', author: 'Matthew Dicks' },
  'HOOKED_NIR_EYAL.md': { book: 'Hooked', author: 'Nir Eyal' },
  'FRAMED_INK_MARCOS_MATEU_MESTRE.md': { book: 'Framed Ink: Drawing and Composition for Visual Storytellers', author: 'Marcos Mateu-Mestre', domain: 'creative_library_c3' },
  'THE_VISUAL_STORY_BRUCE_BLOCK.md': { book: 'The Visual Story: Creating the Visual Structure of Film, TV and Digital Media', author: 'Bruce Block', domain: 'creative_library_c3' },
  'CINEMATOGRAPHY_THEORY_AND_PRACTICE_BLAIN_BROWN.md': { book: 'Cinematography: Theory and Practice: Image Making for Cinematographers, Directors, and Videographers', author: 'Blain Brown', domain: 'creative_library_c3' },
});

const FIELD_ALIASES = Object.freeze({
  producto: 'product', 'producto o servicio': 'product', servicio: 'product', negocio: 'product',
  publico: 'audience', público: 'audience', avatar: 'audience', audiencia: 'audience',
  problema: 'problem', 'problema del publico': 'problem', 'problema del público': 'problem',
  deseo: 'desire', 'deseo principal': 'desire',
  beneficio: 'benefit', 'beneficio principal': 'benefit',
  oferta: 'offer', precio: 'price', plataforma: 'platform', formato: 'format',
  cta: 'cta', tono: 'tone', restricciones: 'restrictions',
  'personalidad de marca': 'brandPersonality', colores: 'colors',
  'recursos disponibles': 'resources', 'texto obligatorio': 'requiredText',
  'afirmaciones comprobables': 'verifiedClaims', 'pruebas disponibles': 'proof',
  'historia real disponible': 'realStory', 'testimonio autorizado': 'authorizedTestimonial',
  objetivo: 'goal', 'objetivo de la campaña': 'goal',
});

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase();
}

function detectMarketingMode(input) {
  const text = normalize(input);
  const has = pattern => pattern.test(text);

  if (has(/(?:^|\s)\/(?:router|sistemas|ayuda)(?:\s|$)/)) return MODES.NONE;
  if (has(/(?:^|\s)\/copyfb(?:\s|$)/)) return MODES.COPY_FB;
  if (has(/(?:^|\s)\/(?:meta|metaads)(?:\s|$)/)) return MODES.COPY_FB;
  if (has(/(?:^|\s)\/copy(?:\s|$)/)) return MODES.COPY_C3;
  if (has(/(?:^|\s)\/creativo(?:\s|$)/)) return MODES.CREATIVE_C3;
  if (has(/(?:^|\s)\/c3(?:\s|$)/) || text.includes('metodo c3') || text.includes('método c3')) {
    return has(/copy|facebook|meta ads|anuncio|hooks?/) ? MODES.COPY_C3 : MODES.CREATIVE_C3;
  }
  if (has(/analiza|audita|revisa/) && has(/anuncio|creativo|pieza|diseño|diseño/)) return MODES.CREATIVE_AUDIT;
  if (has(/crea|genera|haz/) && has(/la imagen|una imagen final|imagen aprobada/)) return MODES.IMAGE_EXECUTION;
  if (has(/haz|crea|escribe|genera/) && has(/hooks?|ganchos?/)) return MODES.COPY_HOOKS;
  if (has(/facebook|meta ads|fb ads/) && has(/ad\b|ads\b|anuncio|copy|texto/)) return MODES.COPY_FB;
  if (has(/escribe|crea|haz|necesito/) && has(/copy|anuncio|landing|texto publicitario|email|guion/)) return MODES.COPY_C3;
  if (has(/haz|crea|diseña|diseña|necesito|quiero/) && has(/creativo|pieza gráfica|pieza grafica|dirección de arte|direccion de arte/)) return MODES.CREATIVE_C3;
  if (has(/imagen disruptiva|creativo para|diseño publicitario|diseño publicitario/)) return MODES.CREATIVE_C3;
  if (has(/storyworthy|contagious|hooked/) && has(/usa|aplica|copy|historia|anuncio/)) return MODES.COPY_C3;
  if (text.includes('modo director creativo')) return MODES.CREATIVE_C3;
  if (text.includes('modo copy fb ads') || text.includes('modo copy facebook ads')) return MODES.COPY_FB;
  return MODES.NONE;
}

function extractLabeledFields(input) {
  const fields = {};
  for (const rawLine of String(input || '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([^:]{2,60})\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const key = normalize(match[1]).replace(/[¿?]/g, '').trim();
    const canonical = FIELD_ALIASES[key];
    if (canonical && match[2].trim()) fields[canonical] = match[2].trim();
  }
  return fields;
}

function inferProduct(input) {
  const text = String(input || '');
  const match = text.match(/\bpara\s+(?:una?|el|la|mi)\s+([^.,;:\n]{3,80})/i);
  return match ? match[1].trim() : '';
}

function buildCreativeBrief(input, mode = detectMarketingMode(input)) {
  const supplied = extractLabeledFields(input);
  const inferredProduct = supplied.product || inferProduct(input);
  const brief = {
    product: inferredProduct || '',
    audience: supplied.audience || '',
    problem: supplied.problem || '',
    desire: supplied.desire || '',
    benefit: supplied.benefit || '',
    offer: supplied.offer || '',
    price: supplied.price || '',
    platform: supplied.platform || (mode === MODES.COPY_FB ? 'Facebook / Meta Ads' : ''),
    format: supplied.format || '',
    cta: supplied.cta || '',
    goal: supplied.goal || '',
    brandPersonality: supplied.brandPersonality || '',
    colors: supplied.colors || '',
    resources: supplied.resources || '',
    requiredText: supplied.requiredText || '',
    restrictions: supplied.restrictions || '',
    verifiedClaims: supplied.verifiedClaims || '',
    proof: supplied.proof || '',
    realStory: supplied.realStory || '',
    authorizedTestimonial: supplied.authorizedTestimonial || '',
    tone: supplied.tone || '',
  };
  const assumptions = [];
  if (!brief.product) assumptions.push('Producto/servicio no especificado.');
  if (!brief.audience) assumptions.push('Público no especificado; usar un ejemplo neutral y etiquetarlo como supuesto.');
  if (!brief.offer) assumptions.push('Oferta no especificada; no inventar precio, promoción ni garantía.');
  if (!brief.cta) assumptions.push('CTA no especificado; proponer una acción genérica y marcarla como supuesto.');
  return { mode, fields: brief, assumptions, needsCriticalInput: !brief.product };
}

function validateClaims(input) {
  const text = String(input || '');
  const validationCue = /dato\s+(?:validado|verificado|comprobado)|informaci[oó]n\s+(?:validada|verificada)|resultado\s+(?:real|comprobado)|seg[uú]n\s+(?:nuestros|mis)\s+datos/i;
  const candidates = [];
  const patterns = [
    /[+\-]?\d+(?:[.,]\d+)?\s*%[^.!?\n]*/g,
    /\b\d+\s+(?:clientes?|ventas?|leads?|prospectos?|casos?|a[nñ]os?|d[ií]as?|meses?)[^.!?\n]*/gi,
    /\b(?:garantizado|garantizada|m[eé]todo probado|resultados comprobados|oferta por tiempo limitado|[uú]ltimos lugares)\b[^.!?\n]*/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      if (!value || candidates.some(item => item.value === value)) continue;
      candidates.push({ value, index: match.index || 0 });
    }
  }
  const facts = [];
  const blocked = [];
  const hypotheses = [];
  for (const candidate of candidates) {
    const start = Math.max(0, candidate.index - 90);
    const end = Math.min(text.length, candidate.index + candidate.value.length + 120);
    const context = text.slice(start, end);
    if (validationCue.test(context)) {
      facts.push({ claim: candidate.value, source: 'user_fact', allowed: true });
    } else {
      blocked.push({ claim: candidate.value, reason: 'Falta evidencia autorizada.', allowed: false });
      hypotheses.push({ claim: candidate.value, label: 'HYPOTHESIS', usableAsFact: false });
    }
  }
  return { facts, inferences: [], hypotheses, missing: blocked.map(item => item.claim), blocked };
}

function booksForMode(mode, input = '') {
  const selected = new Set();
  const creative = [
    'THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md',
    'HEY_WHIPPLE_SQUEEZE_THIS_LUKE_SULLIVAN.md',
    'GRAPHIC_DESIGN_SOLUTIONS_4E_ROBIN_LANDA.md',
    'THE_ELEMENTS_OF_GRAPHIC_DESIGN_ALEX_WHITE.md',
    'CAPTIVOLOGY_BEN_PARR.md',
    'CONTAGIOUS_JONAH_BERGER.md',
    'FRAMED_INK_MARCOS_MATEU_MESTRE.md',
    'THE_VISUAL_STORY_BRUCE_BLOCK.md',
    'CINEMATOGRAPHY_THEORY_AND_PRACTICE_BLAIN_BROWN.md',
  ];
  const copy = [
    'HEY_WHIPPLE_SQUEEZE_THIS_LUKE_SULLIVAN.md',
    'STORYWORTHY_MATTHEW_DICKS.md',
    'CONTAGIOUS_JONAH_BERGER.md',
    'HOOKED_NIR_EYAL.md',
  ];
  const base = [MODES.CREATIVE_C3, MODES.CREATIVE_AUDIT, MODES.IMAGE_EXECUTION].includes(mode) ? creative : copy;
  base.forEach(file => selected.add(file));
  const normalized = normalize(input);
  for (const [file, meta] of Object.entries(BOOKS)) {
    if (normalized.includes(normalize(meta.book)) || normalized.includes(normalize(meta.author))) selected.add(file);
  }
  return [...selected];
}

function buildSemanticQuery({ input, mode, brief, booksNeeded }) {
  const parts = [
    `Modo: ${mode}.`,
    brief.fields.product ? `Producto: ${brief.fields.product}.` : '',
    brief.fields.audience ? `Público: ${brief.fields.audience}.` : '',
    brief.fields.problem ? `Problema: ${brief.fields.problem}.` : '',
    brief.fields.benefit ? `Beneficio: ${brief.fields.benefit}.` : '',
    `Tarea: ${String(input || '').slice(0, 700)}.`,
    `Fuentes buscadas: ${booksNeeded.map(file => `${BOOKS[file].book} de ${BOOKS[file].author}`).join('; ')}.`,
  ];
  return parts.filter(Boolean).join(' ');
}

function parseEnvFile(filePath = DEFAULT_ENV_FILE) {
  if (!fs.existsSync(filePath)) return {};
  const pairs = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    pairs[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return pairs;
}

function loadRetrievalConfig() {
  const local = parseEnvFile(process.env.C3_ENV_FILE || DEFAULT_ENV_FILE);
  return {
    supabaseUrl: (process.env.SUPABASE_URL || local.SUPABASE_URL || '').replace(/\/$/, ''),
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || local.SUPABASE_SERVICE_ROLE_KEY || '',
    openaiKey: process.env.OPENAI_API_KEY || local.OPENAI_API_KEY || '',
  };
}

async function fetchJson(url, options, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

function normalizeKnowledgeRow(row, matchType) {
  const meta = BOOKS[row.source_file];
  if (!meta) return null;
  return {
    book: meta.book,
    author: meta.author,
    topic: row.topic || row.subtopic || row.source_section || '',
    principle: String(row.content || '').slice(0, 1800),
    source_file: row.source_file,
    source_section: row.source_section || '',
    content_type: row.content_type || '',
    confidence: row.confidence || 'unknown',
    validity: row.validity || 'unknown',
    status: row.status || 'active',
    similarity: typeof row.similarity === 'number' ? row.similarity : null,
    match_type: matchType,
    verified: true,
  };
}

async function retrieveCreativeKnowledge({ input, mode, brief, booksNeeded, limit = 7 }) {
  const config = loadRetrievalConfig();
  if (!config.supabaseUrl || !config.supabaseKey || !config.openaiKey) {
    return { source_status: 'NO_VERIFICADO', items: [], discarded: [], error: 'Configuración de retrieval no disponible.' };
  }
  try {
    const query = buildSemanticQuery({ input, mode, brief, booksNeeded });
    const embeddingResponse = await fetchJson('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: query, dimensions: 1536 }),
    });
    const embedding = embeddingResponse.data[0].embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) throw new Error('Embedding de consulta inválido.');
    const headers = {
      'Content-Type': 'application/json',
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
    };
    const normalizedInput = normalize(input);
    const explicitlyRequestedBooks = booksNeeded.filter(file => {
      const meta = BOOKS[file];
      return normalizedInput.includes(normalize(meta.book)) || normalizedInput.includes(normalize(meta.author));
    });
    const textQueries = explicitlyRequestedBooks.length
      ? explicitlyRequestedBooks.map(file => ({
        search_query: `${BOOKS[file].book} ${BOOKS[file].author}`,
        filter_domain: BOOKS[file].domain || 'biblioteca_creativa',
      }))
      : [
        { search_query: String(input || '').slice(0, 500), filter_domain: 'biblioteca_creativa' },
        { search_query: String(input || '').slice(0, 500), filter_domain: 'creative_library_c3' },
      ];
    const [semanticRows, textGroups] = await Promise.all([
      fetchJson(`${config.supabaseUrl}/rest/v1/rpc/match_kb_chunks`, {
        method: 'POST', headers,
        body: JSON.stringify({ query_embedding: embedding, match_count: 24, filter_status: 'active' }),
      }),
      Promise.all(textQueries.map(({ search_query, filter_domain }) => fetchJson(`${config.supabaseUrl}/rest/v1/rpc/search_kb_text`, {
        method: 'POST', headers,
        body: JSON.stringify({ filter_domain, match_count: 8, search_query }),
      }))),
    ]);
    const textRows = textGroups.flat();
    const discarded = [];
    const seen = new Set();
    const candidates = [];
    const add = (rows, type) => {
      for (const row of rows || []) {
        if (!booksNeeded.includes(row.source_file)) {
          if (row.source_file) discarded.push({ source_file: row.source_file, reason: 'Fuente fuera del conjunto selectivo.' });
          continue;
        }
        if (row.status === 'deprecated') {
          discarded.push({ source_file: row.source_file, reason: 'status=deprecated' });
          continue;
        }
        const key = row.chunk_id || `${row.source_file}|${row.source_section || row.subtopic || row.content?.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const normalized = normalizeKnowledgeRow(row, type);
        if (normalized) candidates.push(normalized);
      }
    };
    add(semanticRows, 'semantic');
    add(textRows, 'fulltext');
    candidates.sort((a, b) => {
      const explicitA = explicitlyRequestedBooks.includes(a.source_file) ? 1 : 0;
      const explicitB = explicitlyRequestedBooks.includes(b.source_file) ? 1 : 0;
      if (explicitA !== explicitB) return explicitB - explicitA;
      const evergreenA = a.validity === 'evergreen' ? 1 : 0;
      const evergreenB = b.validity === 'evergreen' ? 1 : 0;
      if (evergreenA !== evergreenB) return evergreenB - evergreenA;
      return (b.similarity || 0) - (a.similarity || 0);
    });
    const items = [];
    const perSource = new Map();
    for (const candidate of candidates) {
      const count = perSource.get(candidate.source_file) || 0;
      const perSourceLimit = explicitlyRequestedBooks.includes(candidate.source_file) ? 3 : 2;
      if (count >= perSourceLimit) continue;
      items.push(candidate);
      perSource.set(candidate.source_file, count + 1);
      if (items.length >= limit) break;
    }
    return {
      source_status: items.length ? 'VERIFICADO' : 'NO_VERIFICADO',
      items,
      discarded: discarded.slice(0, 20),
      query,
      embedding_model: 'text-embedding-3-small',
      embedding_dimensions: 1536,
    };
  } catch (error) {
    return { source_status: 'NO_VERIFICADO', items: [], discarded: [], error: error.message };
  }
}

async function prepareC3Context(input, options = {}) {
  const mode = options.mode || detectMarketingMode(input);
  if (mode === MODES.NONE) return null;
  const brief = buildCreativeBrief(input, mode);
  const claims = validateClaims(input);
  const booksNeeded = booksForMode(mode, input);
  const retriever = options.retriever || retrieveCreativeKnowledge;
  const knowledge = mode === MODES.IMAGE_EXECUTION && options.skipRetrieval
    ? { source_status: 'NO_VERIFICADO', items: [], discarded: [], error: 'Retrieval omitido para ejecución visual.' }
    : await retriever({ input, mode, brief, booksNeeded });
  return {
    mode,
    diagnosis: {
      layer: [MODES.COPY_C3, MODES.COPY_FB, MODES.COPY_HOOKS].includes(mode) ? 'copy' : 'creative',
      problem: brief.fields.problem || 'Se definirá con la información disponible.',
      confidence: brief.needsCriticalInput ? 'low' : (brief.assumptions.length ? 'medium' : 'high'),
    },
    brief,
    facts: claims.facts,
    inferences: claims.inferences,
    hypotheses: claims.hypotheses,
    missing: [...brief.assumptions, ...claims.missing],
    blockedClaims: claims.blocked,
    knowledge: knowledge.items,
    provenance: {
      source_status: knowledge.source_status,
      requested_books: booksNeeded.map(file => ({ ...BOOKS[file], source_file: file })),
      used: knowledge.items.map(item => ({
        book: item.book, author: item.author, topic: item.topic,
        source_file: item.source_file, source_section: item.source_section,
        content_type: item.content_type, confidence: item.confidence,
        validity: item.validity, match_type: item.match_type,
      })),
      discarded: knowledge.discarded,
      retrieval_error: knowledge.error || null,
    },
    c1: { insight: '', centralIdea: '', concepts: [] },
    c2: { focalPoint: '', hierarchy: [], grid: '', space: '', composition: '', typography: '', color: '', visual: '', lighting: '', headline: '', secondary: '' },
    c3: { goal: brief.fields.goal || '', benefit: brief.fields.benefit || '', cta: brief.fields.cta || '', nextStep: '', kpi: '' },
    tests: [],
    review: {},
  };
}

function modeInstructions(mode) {
  if (mode === MODES.CREATIVE_C3) return `
SALIDA OBLIGATORIA: 1 Diagnóstico; 2 Problema de comunicación; 3 Insight; 4 Idea central; 5 Tres conceptos genuinamente distintos; 6 Principio y fuente verificados de cada concepto; 7 Concepto recomendado; 8 Dirección de arte; 9 Wireframe textual; 10 Prompt de imagen SIN texto integrado; 11 Copy de maquetación separado; 12 Adaptación 4:5; 13 Adaptación 9:16; 14 Revisión profesional; 15 KPI y prueba.
El prompt visual del apartado 10 debe incluir explícitamente: sin texto, sin letras, sin logos inventados, sin claims, sin precios, sin promociones y sin sellos ficticios.
Puntúa legibilidad, contraste, jerarquía, coherencia, fuerza conceptual, atención, relevancia, credibilidad, CTA y potencial de conversión. Corrige cualquier dimensión crítica menor a 8/10.`;
  if (mode === MODES.COPY_FB) return `
Usa C1 CONCEPTO → C2 COPY → C3 CONVERSIÓN. Entrega una idea principal y, según el brief, versiones DIRECTA, PROBLEMA/SOLUCIÓN, STORYTELLING solo con historia real y VALOR PRÁCTICO. Incluye hook, texto principal, titular, descripción, CTA, texto de maquetación, dirección visual y una prueba controlada. No fuerces Storyworthy, STEPPS o Hooked: utilízalos solo cuando estén recuperados y sean pertinentes.`;
  if (mode === MODES.COPY_C3) return `
Usa C1 CONCEPTO → C2 COPY → C3 CONVERSIÓN. Define conciencia, problema, deseo, idea, promesa comprobable, objeción y acción. Elige AIDA, PAS, PASO, Regla del 1 u otro framework únicamente si corresponde. Separa hechos, hipótesis y claims bloqueados.`;
  if (mode === MODES.COPY_HOOKS) return `
Entrega hooks agrupados por problema, deseo, curiosidad y valor práctico. Cada hook debe sostener la misma idea principal y no introducir claims nuevos. Señala el mecanismo de atención verificado cuando exista.`;
  if (mode === MODES.CREATIVE_AUDIT) return `
Audita antes de rediseñar. Separa problema crítico, mejora recomendada y preferencia estética. Evalúa concepto, composición, conversión y congruencia con la oferta. No declares ganador por CTR/CPC sin CAC, ventas o KPI downstream.`;
  if (mode === MODES.IMAGE_EXECUTION) return `
No conviertas una petición vaga como “disruptiva” en explosiones o efectos automáticos. Confirma o deriva primero un concepto relevante. Separa PROMPT VISUAL y COPY DE MAQUETACIÓN. El prompt visual debe pedir sin texto, letras, logos inventados, claims, precios, promociones ni sellos ficticios.`;
  return '';
}

function buildSystemInstructions(context) {
  if (!context) return '';
  const verifiedSources = context.knowledge.length
    ? context.knowledge.map((item, index) => `\n[KB${index + 1}] ${item.book} — ${item.author}; ${item.source_file}; ${item.source_section || item.topic}; confidence=${item.confidence}; validity=${item.validity}\n${item.principle}`).join('\n')
    : '\nNo se recuperó evidencia suficiente. source_status="NO_VERIFICADO". No atribuyas principios a libros.';
  const blocked = context.blockedClaims.length
    ? context.blockedClaims.map(item => `- BLOQUEADO: ${item.claim} (${item.reason})`).join('\n')
    : '- Ninguno detectado.';
  return `
SISTEMA OPERATIVO C3 ACTIVADO
MODE=${context.mode}

C3 significa CONCEPTO → COMPOSICIÓN/COPY → CONVERSIÓN.
REGLA MAESTRA: 1 pieza = 1 idea principal + 1 punto focal + 1 beneficio dominante + 1 CTA. Nunca conviertas una pieza en catálogo de beneficios.

JERARQUÍA: información actual del usuario > archivos del usuario > Knowledge/Supabase > herramientas > web temporal solicitada > inferencia etiquetada.
No pidas información ya proporcionada. Si falta un dato no crítico, trabaja con supuestos neutrales marcados. Pregunta solo por un dato indispensable para no inventar producto u oferta.
Clasifica afirmaciones como FACT, INFERENCE, HYPOTHESIS o MISSING. No uses como FACT resultados, porcentajes, testimonios, premios, clientes, experiencia, garantías, promociones, precios, fechas límite o escasez no verificados.

BRIEF ESTRUCTURADO:
${JSON.stringify(context.brief, null, 2)}

CLAIMS BLOQUEADOS:
${blocked}

FUENTES RECUPERADAS SELECTIVAMENTE:
${verifiedSources}

  PROVENANCE: solo atribuye un principio si aparece en una fuente recuperada arriba. Cada atribución visible debe nombrar libro, autor y source_file; no basta con decir KB1/KB2. Si el fragmento no respalda literalmente la decisión, no lo fuerces y usa source_status="NO_VERIFICADO".

C1 CONCEPTO: problema de comunicación, insight, idea central y ángulo. El concepto no es color, tipografía, fotografía, efectos ni lista de beneficios.
C2 COMPOSICIÓN/COPY: expresa la idea con jerarquía, espacio, claridad y economía. Elimina lo que no aumente comprensión, énfasis, significado o conversión.
C3 CONVERSIÓN: define objetivo comercial, acción siguiente, fricción, beneficio, razón para creer, congruencia con la oferta y KPI downstream. Ventas/ingresos/oportunidades pesan más que clics o métricas de vanidad.

Cuando se pidan creativo y copy: AUDIENCIA → OFERTA → IDEA → ÁNGULO → HOOK → CONCEPTO VISUAL → COPY → CTA → TEST.
  Testing: cambia una sola variable; define hypothesis, variable, control, variant, primaryKPI, secondaryKPI y decisionRule. No inventes benchmarks universales.
  BARRERA NUMÉRICA: no añadas porcentajes, precios, cantidades de clientes/ventas/leads, horarios, plazos, duraciones, metas ni umbrales que no aparezcan en el brief como datos permitidos. Si falta una cifra escribe "POR DEFINIR" o "REQUIERE MEDICIÓN". No conviertas una inferencia sobre el público en un hecho real.
  FORMATO: respeta todos los apartados obligatorios del modo aunque el usuario pida brevedad; puedes ser conciso dentro de cada apartado, pero no omitirlos.
  ${modeInstructions(context.mode)}`;
}

function guardGeneratedOutput(output, userInput = '', system = '') {
  const supplied = String(userInput || '').toLowerCase();
  const blockedSection = String(system || '').split('CLAIMS BLOQUEADOS:')[1]?.split('FUENTES RECUPERADAS SELECTIVAMENTE:')[0]?.toLowerCase() || '';
  const blocked = [];
  const rules = [
    { type: 'PORCENTAJE_POR_VALIDAR', re: /(?:[<>≥≤]\s*)?\+?\d+(?:[.,]\d+)?\s*%/g },
    { type: 'PRECIO_POR_VALIDAR', re: /(?:[$€£]\s*\d+(?:[.,]\d+)*|\b\d+(?:[.,]\d+)*\s*(?:mxn|usd|eur)\b)/gi },
    { type: 'HORARIO_POR_DEFINIR', re: /\b\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}\b/g },
    { type: 'HORARIO_POR_DEFINIR', re: /\bhorarios?\s+\d{1,2}\s*[–—-]\s*\d{1,2}(?:\s+y\s+\d{1,2}\s*[–—-]\s*\d{1,2})?/gi },
    { type: 'HORARIO_POR_DEFINIR', re: /\b\d{1,2}:\d{2}\b/g },
    { type: 'HORARIO_POR_DEFINIR', re: /\b\d{1,2}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)\b/gi },
    { type: 'UMBRAL_POR_VALIDAR', re: /[<>≥≤]\s*\d+(?:[.,]\d+)?\s*(?:min(?:utos?)?|horas?|días?|semanas?|meses?|años?|clientes?|ventas?|leads?|conversiones?)\b/gi },
    { type: 'DURACIÓN_POR_VALIDAR', re: /\b\d+(?:[.,]\d+)?\s*(?:segundos?|minutos?|horas?|días?|semanas?|meses?)\b/gi },
    { type: 'CLAIM_NO_VERIFICADO', re: /\b(?:garantizad[oa]s?|método probado|sistema probado|resultados? comprobados?|sin riesgo|últim[oa]s? cupos?|cupos? limitados?)\b/gi },
    { type: 'PROMOCIÓN_POR_VALIDAR', re: /\b(?:gratis|gratuit[oa]s?)\b/gi },
  ];
  let content = String(output || '');
  for (const rule of rules) {
    content = content.replace(rule.re, (match, offset, whole) => {
      const normalized = match.trim().toLowerCase();
      if (normalized === '4:5' || normalized === '9:16') return match;
      const before = whole.slice(Math.max(0, offset - 4), offset).toLowerCase();
      if (/no\s+$/.test(before)) return match;
      const explicitlySupplied = supplied.includes(normalized);
      const explicitlyBlocked = blockedSection.includes(normalized);
      if (explicitlySupplied && !explicitlyBlocked) return match;
      blocked.push({ claim: match.trim(), replacement: rule.type, reason: 'No aparece como dato permitido en la solicitud.' });
      return `[${rule.type}]`;
    });
  }
  return { content, blocked };
}

function publicC3Summary(context) {
  if (!context) return null;
  return {
    mode: context.mode,
    confidence: context.diagnosis.confidence,
    source_status: context.provenance.source_status,
    sources: context.provenance.used.map(item => ({
      book: item.book, author: item.author, source_file: item.source_file,
      source_section: item.source_section, confidence: item.confidence, validity: item.validity,
    })),
    blocked_claims: context.blockedClaims,
    assumptions: context.brief.assumptions,
  };
}

module.exports = {
  MODES,
  BOOKS,
  detectMarketingMode,
  buildCreativeBrief,
  validateClaims,
  booksForMode,
  buildSemanticQuery,
  loadRetrievalConfig,
  retrieveCreativeKnowledge,
  prepareC3Context,
  buildSystemInstructions,
  guardGeneratedOutput,
  publicC3Summary,
};
