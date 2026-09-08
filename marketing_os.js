// MARKETING OS — router, brief universal, paquetes de conocimiento y prompts especialistas.
// No llama al LLM ni modifica Supabase. Selecciona fuentes locales relevantes y construye
// instrucciones reproducibles para knowledge.js, chat.js y app/server.js.
const fs = require('fs');
const path = require('path');
const c3 = require('./c3.js');

const AGENT_ROOT = __dirname;
const HARNESS_ROOT = path.dirname(AGENT_ROOT);
const SOURCE_ROOTS = Object.freeze([
  { id: 'curso_ventas', dir: path.join(AGENT_ROOT, 'transcripciones'), confidence: 'medium' },
  { id: 'velocity', dir: path.join(AGENT_ROOT, 'transcripciones_velocity'), confidence: 'medium' },
  { id: 'protege', dir: path.join(AGENT_ROOT, 'transcripciones_protege'), confidence: 'medium' },
  { id: 'protege_descargas', dir: path.join(AGENT_ROOT, 'transcripciones_protege_descargas'), confidence: 'medium' },
  { id: 'modulos_expertos', dir: path.join(AGENT_ROOT, 'CONOCIMIENTO'), confidence: 'high' },
  { id: 'biblioteca_c3', dir: path.join(AGENT_ROOT, 'BIBLIOTECA_C3'), confidence: 'high' },
  { id: 'skool', dir: path.join(HARNESS_ROOT, 'skool_download', 'memoria_agente', 'transcripciones'), confidence: 'medium' },
]);

const MODES = Object.freeze({
  NONE: 'NONE',
  ROUTER: 'ROUTER_MAESTRO',
  CREATIVE: 'DIRECCION_CREATIVA_C3',
  META_ADS: 'LABORATORIO_META_ADS',
  COPY: 'COPY_Y_MENSAJES',
  FUNNEL: 'ARQUITECTO_DE_EMBUDOS',
  INFOPRODUCT: 'FABRICA_DE_INFOPRODUCTOS',
  OFFER: 'INGENIERIA_DE_OFERTAS',
  LANDING_CRO: 'LANDING_Y_CRO',
  BRAND: 'MARCA_Y_POSICIONAMIENTO',
  SALES: 'VENTAS_Y_WHATSAPP',
  VIDEO: 'VIDEO_Y_CONTENIDO_VIRAL',
  SEO: 'SEO_Y_CONTENIDOS',
  GROWTH: 'ANALITICA_Y_CRECIMIENTO',
  AUDIT: 'AUDITOR_GLOBAL',
});

const PACKS = Object.freeze({
  VISUAL_DESIGN: {
    label: 'Diseño visual y composición',
    hints: ['jerarquía visual', 'composición', 'retícula', 'espacio', 'tipografía', 'contraste', 'punto focal'],
    sources: /graphic_design|elements_of_graphic|framed_ink|visual_story|cinematography_theory/i,
  },
  AD_CONCEPT: {
    label: 'Concepto publicitario',
    hints: ['concepto publicitario', 'idea central', 'dirección creativa', 'campaña', 'titular'],
    sources: /advertising_concept|hey_whipple|creaci[oó]n de anuncios|campañas rentables/i,
  },
  ATTENTION_VIRALITY: {
    label: 'Atención y viralidad',
    hints: ['atención', 'hook', 'disparador', 'viralidad', 'memorabilidad', 'compartir'],
    sources: /captivology|contagious|ideas_que_pegan|hook marketing|copybranding/i,
  },
  STORYTELLING: {
    label: 'Storytelling y narrativa',
    hints: ['historia', 'narrativa', 'escena', 'conflicto', 'transformación', 'storytelling'],
    sources: /storyworthy|visual_story|framed_ink|narrativa de marca|blockbuster/i,
  },
  HABIT_RETENTION: {
    label: 'Hábitos y retención',
    hints: ['hábito', 'trigger', 'acción', 'recompensa variable', 'inversión', 'retención'],
    sources: /hooked_nir_eyal|growth marketing|blockbuster/i,
  },
  META_ADS: {
    label: 'Meta Ads y creación de anuncios',
    hints: ['meta ads', 'facebook ads', 'anuncio', 'creativo', 'ángulo', 'campaña', 'segmentación'],
    sources: /meta ads|facebook|creaci[oó]n de anuncios|campañas rentables|mentor[ií]as creaci[oó]n/i,
  },
  COPY: {
    label: 'Copywriting y arquitectura de mensajes',
    hints: ['copywriting', 'hook', 'titular', 'promesa', 'objeción', 'llamada a la acción', 'mensaje'],
    sources: /copy|hey_whipple|storyworthy|contagious|ideas_que_pegan|biblia_del_vendedor/i,
  },
  FUNNELS: {
    label: 'Embudos y recorrido de conversión',
    hints: ['funnel', 'embudo', 'captación', 'conversión', 'seguimiento', 'temperatura', 'modelo económico'],
    sources: /funnel|embudo|conversion|captaci[oó]n|modelo econ[oó]mico|amplify/i,
  },
  INFOPRODUCTS: {
    label: 'Creación y lanzamiento de infoproductos',
    hints: ['infoproducto', 'transformación', 'currículo', 'validación', 'lanzamiento', 'evergreen', 'producto'],
    sources: /infoproduct|info producto|lanzar tu propio|abc para lanzar|cursos sprint\\4\.5|blockbuster/i,
  },
  OFFERS: {
    label: 'Oferta y propuesta de valor',
    hints: ['oferta', 'propuesta de valor', 'promesa', 'mecanismo', 'beneficio', 'objeción', 'valor'],
    sources: /oferta|propuesta.*irresistible|propuesta ideal|audiencia|avatar|biblia_del_vendedor|venta elegante/i,
  },
  CRO: {
    label: 'Landing pages y optimización de conversión',
    hints: ['landing page', 'conversión', 'fricción', 'prueba', 'cta', 'experimentación', 'cro'],
    sources: /landing|cro m[aá]xima|optimizaci[oó]n de conversi[oó]n|cartas de venta|venta en v[ií]deo/i,
  },
  BRAND: {
    label: 'Marca, posicionamiento e identidad',
    hints: ['marca', 'posicionamiento', 'identidad', 'arquetipo', 'voz', 'narrativa', 'diferenciación'],
    sources: /copybranding|marca|posicionamiento|arquetipos|activos de marca|blockbuster/i,
  },
  SALES: {
    label: 'Ventas, objeciones y seguimiento',
    hints: ['ventas', 'diagnóstico', 'objeciones', 'seguimiento', 'cierre', 'whatsapp', 'calificación'],
    sources: /transcripciones\\video|biblia_del_vendedor|venta elegante|ventas|whatsapp/i,
  },
  VIDEO: {
    label: 'Video, guion y narrativa visual',
    hints: ['video', 'guion', 'escena', 'composición', 'ritmo', 'retención', 'storytelling'],
    sources: /roi v[ií]deo|blockbuster|framed_ink|visual_story|cinematography_theory|storyworthy|guion|v[ií]deo marketing/i,
  },
  SEO: {
    label: 'SEO y contenido',
    hints: ['seo', 'intención de búsqueda', 'palabras clave', 'contenido', 'on-page', 'autoridad'],
    sources: /seo|ecuaci[oó]n seo|palabras clave|motores de b[uú]squeda/i,
  },
  GROWTH: {
    label: 'Growth, analítica y economía',
    hints: ['growth', 'métrica', 'hipótesis', 'experimento', 'economía', 'ltv', 'priorización'],
    sources: /growth|m[eé]tricas|optimizaci[oó]n|ecuaci[oó]n econ[oó]mica|ice score|conversiones/i,
  },
});

const COMMON_QA = Object.freeze([
  'Una sola decisión estratégica dominante por entregable.',
  'Coherencia entre audiencia, problema, oferta, mensaje, canal y CTA.',
  'No inventar precios, resultados, testimonios, garantías, promociones, urgencia ni datos del producto.',
  'Separar FACT, INFERENCE, HYPOTHESIS y MISSING cuando afecten una decisión.',
  'Usar fuentes recuperadas pertinentes; no nombrar una fuente que no respalde la decisión.',
  'Proponer una prueba controlada con una variable principal y KPI downstream.',
]);

const SYSTEMS = Object.freeze({
  [MODES.ROUTER]: {
    title: 'Router maestro', commands: ['/sistemas', '/router', '/ayuda'], packs: [],
    purpose: 'Diagnosticar la solicitud, elegir especialista y ordenar dependencias sin producir todavía estrategia, copy, oferta ni activos.',
    workflow: ['Clasificar objetivo y entregable', 'Identificar etapa del embudo', 'Revisar brief y datos faltantes', 'Elegir especialista principal y auxiliares', 'Definir secuencia de trabajo'],
    output: ['Objetivo interpretado', 'Especialista principal y auxiliares', 'Datos disponibles y faltantes', 'Secuencia de sistemas', 'Comando válido usando solo datos conocidos y POR DEFINIR en los faltantes'],
  },
  [MODES.CREATIVE]: {
    title: 'Dirección Creativa C3', commands: ['/creativo', '/c3'], packs: ['VISUAL_DESIGN', 'AD_CONCEPT', 'ATTENTION_VIRALITY'],
    purpose: 'Crear conceptos y dirección de arte publicitaria con una idea, un foco, un beneficio y un CTA.',
    workflow: ['Problema de comunicación', 'Insight e idea central', 'Tres conceptos', 'Selección estratégica', 'Dirección de arte C3', 'Adaptaciones y prueba'],
    output: ['Diagnóstico', 'Tres conceptos', 'Concepto ganador', 'Dirección de arte', 'Wireframe', 'Prompt visual sin texto', 'Copy de maquetación', 'Formatos y QA'],
  },
  [MODES.META_ADS]: {
    title: 'Laboratorio Meta Ads', commands: ['/meta', '/metaads'], packs: ['META_ADS', 'OFFERS', 'COPY', 'VISUAL_DESIGN', 'AD_CONCEPT', 'ATTENTION_VIRALITY'],
    purpose: 'Diseñar campañas y matrices de anuncios conectando audiencia, oferta, ángulo, copy, creativo y medición.',
    workflow: ['Diagnóstico de negocio y etapa', 'Audiencia y nivel de conciencia', 'Oferta y razón para creer', 'Matriz ángulo-hook-concepto', 'Copy y dirección visual', 'Arquitectura de prueba', 'Lectura y decisión'],
    output: ['Brief de campaña', 'Hipótesis', 'Matriz de anuncios', 'Copys', 'Dirección C3', 'Plan de prueba', 'KPIs y reglas de decisión'],
  },
  [MODES.COPY]: {
    title: 'Copy y Mensajes', commands: ['/copy', '/copyfb'], packs: ['COPY', 'OFFERS', 'STORYTELLING', 'ATTENTION_VIRALITY'],
    purpose: 'Escribir mensajes persuasivos para ads, páginas, emails, VSL y WhatsApp sin claims inventados.',
    workflow: ['Conciencia y contexto', 'Problema, deseo y objeción', 'Promesa comprobable', 'Idea y mecanismo', 'Estructura de copy', 'Edición de claridad', 'Prueba'],
    output: ['Mapa de mensaje', 'Concepto', 'Copy final', 'Variantes de hook/titular/CTA', 'Claims y supuestos', 'Dirección visual si aplica', 'Prueba'],
  },
  [MODES.FUNNEL]: {
    title: 'Arquitecto de Embudos', commands: ['/embudo', '/funnel'], packs: ['FUNNELS', 'OFFERS', 'CRO', 'COPY', 'GROWTH'],
    purpose: 'Diseñar el recorrido completo desde tráfico hasta conversión, seguimiento y economía.',
    workflow: ['Objetivo y economía', 'Audiencia y temperatura', 'Oferta y evento de conversión', 'Elegir tipo de funnel', 'Mapear etapas y activos', 'Seguimiento', 'Instrumentación y optimización'],
    output: ['Diagnóstico', 'Mapa del embudo', 'Mensaje por etapa', 'Activos/páginas', 'Automatizaciones', 'Modelo económico con campos por validar', 'KPIs', 'Plan de implementación'],
  },
  [MODES.INFOPRODUCT]: {
    title: 'Fábrica de Infoproductos', commands: ['/infoproducto', '/curso'], packs: ['INFOPRODUCTS', 'OFFERS', 'FUNNELS', 'COPY', 'BRAND', 'GROWTH'],
    purpose: 'Investigar, validar, estructurar, posicionar y lanzar un producto de conocimiento.',
    workflow: ['Problema y transformación', 'Audiencia y evidencia', 'Mecanismo y propuesta', 'Validación previa', 'Arquitectura curricular', 'Experiencia y entrega', 'Oferta', 'Lanzamiento o evergreen', 'Feedback y mejora'],
    output: ['Tesis del producto', 'Avatar', 'Transformación y mecanismo', 'Validación', 'Currículo', 'Oferta', 'Embudo', 'Plan de lanzamiento', 'Métricas y riesgos'],
  },
  [MODES.OFFER]: {
    title: 'Ingeniería de Ofertas', commands: ['/oferta'], packs: ['OFFERS', 'COPY', 'FUNNELS', 'SALES'],
    purpose: 'Convertir un producto en una propuesta relevante, diferenciada y comprobable.',
    workflow: ['Segmento y contexto', 'Problema y resultado deseado', 'Mecanismo', 'Propuesta de valor', 'Arquitectura de valor', 'Prueba y objeciones', 'CTA y validación'],
    output: ['Diagnóstico', 'Propuesta de valor', 'Promesa permitida', 'Mecanismo', 'Componentes', 'Objeciones', 'Mensajes', 'Plan de validación'],
  },
  [MODES.LANDING_CRO]: {
    title: 'Landing Page y CRO', commands: ['/landing', '/cro'], packs: ['CRO', 'COPY', 'OFFERS', 'VISUAL_DESIGN', 'GROWTH'],
    purpose: 'Crear o auditar páginas con claridad, congruencia, prueba, baja fricción y medición.',
    workflow: ['Objetivo y tráfico', 'Message match', 'Jerarquía de información', 'Oferta y prueba', 'Objeciones y fricción', 'CTA', 'Medición', 'Backlog de experimentos'],
    output: ['Diagnóstico', 'Arquitectura de página', 'Copy por sección', 'Wireframe textual', 'Dirección visual', 'Instrumentación', 'Backlog CRO priorizado'],
  },
  [MODES.BRAND]: {
    title: 'Marca y Posicionamiento', commands: ['/marca', '/branding'], packs: ['BRAND', 'STORYTELLING', 'COPY', 'VISUAL_DESIGN', 'ATTENTION_VIRALITY'],
    purpose: 'Definir posicionamiento, narrativa, personalidad, voz e identidad coherentes.',
    workflow: ['Mercado y alternativas', 'Audiencia y tensión', 'Diferenciación', 'Posicionamiento', 'Narrativa', 'Personalidad y voz', 'Sistema visual', 'Aplicaciones'],
    output: ['Plataforma de marca', 'Posicionamiento', 'Idea de marca', 'Narrativa', 'Voz', 'Mensajes', 'Dirección visual', 'Reglas de consistencia'],
  },
  [MODES.SALES]: {
    title: 'Ventas y WhatsApp', commands: ['/ventas', '/whatsapp'], packs: ['SALES', 'OFFERS', 'COPY'],
    purpose: 'Diseñar diagnóstico, calificación, conversación, objeciones, seguimiento y cierre ético.',
    workflow: ['Contexto y objetivo', 'Criterios de calificación', 'Diagnóstico', 'Presentación de valor', 'Objeciones', 'Siguiente paso', 'Seguimiento', 'Registro y mejora'],
    output: ['Proceso', 'Preguntas', 'Guion adaptable', 'Objeciones', 'Mensajes de seguimiento', 'Criterios de avance', 'KPIs comerciales'],
  },
  [MODES.VIDEO]: {
    title: 'Video y Contenido Viral', commands: ['/video', '/guion'], packs: ['VIDEO', 'STORYTELLING', 'ATTENTION_VIRALITY', 'VISUAL_DESIGN', 'COPY'],
    purpose: 'Crear guiones y dirección audiovisual con atención, progresión narrativa, claridad visual y CTA.',
    workflow: ['Objetivo y plataforma', 'Hook y promesa', 'Estructura narrativa', 'Beat sheet', 'Lenguaje visual', 'Guion', 'Edición y sonido', 'CTA', 'Variantes y retención'],
    output: ['Concepto', 'Hook', 'Beat sheet', 'Guion hablado', 'Lista de planos', 'Dirección visual/sonora', 'CTA', 'Adaptaciones', 'Prueba'],
  },
  [MODES.SEO]: {
    title: 'SEO y Contenidos', commands: ['/seo', '/contenido'], packs: ['SEO', 'COPY', 'BRAND', 'OFFERS'],
    purpose: 'Diseñar contenidos alineados con intención de búsqueda, autoridad temática y conversión.',
    workflow: ['Objetivo y audiencia', 'Intención', 'Arquitectura temática', 'Brief de contenido', 'Producción', 'On-page', 'Conversión', 'Distribución y actualización'],
    output: ['Mapa de intención', 'Clusters', 'Brief', 'Estructura', 'CTA', 'Checklist on-page', 'Plan de medición y actualización'],
  },
  [MODES.GROWTH]: {
    title: 'Analítica y Crecimiento', commands: ['/growth', '/metricas'], packs: ['GROWTH', 'FUNNELS', 'CRO'],
    purpose: 'Transformar datos en hipótesis, experimentos y decisiones económicas priorizadas.',
    workflow: ['Objetivo y métrica de valor', 'Baseline disponible', 'Diagnóstico del cuello de botella', 'Hipótesis', 'Priorización', 'Diseño experimental', 'Lectura', 'Decisión'],
    output: ['Árbol de métricas', 'Diagnóstico', 'Hipótesis', 'Backlog priorizado', 'Ficha de experimentos', 'Criterios de decisión', 'Próximo ciclo'],
  },
  [MODES.AUDIT]: {
    title: 'Auditor Global', commands: ['/auditar'], packs: ['OFFERS', 'COPY', 'FUNNELS', 'CRO', 'VISUAL_DESIGN', 'GROWTH'],
    purpose: 'Revisar un activo o sistema sin modificarlo y priorizar problemas por impacto y evidencia.',
    workflow: ['Definir objeto y objetivo', 'Separar observado/inferido/no determinable', 'Evaluar estrategia', 'Evaluar mensaje y experiencia', 'Evaluar medición', 'Priorizar', 'Proponer pruebas'],
    output: ['Resumen ejecutivo', 'Evidencia', 'Hallazgos', 'Prioridad P0/P1/P2', 'Riesgos', 'Recomendaciones', 'Plan de verificación'],
  },
});

const COMMAND_TO_MODE = Object.freeze(Object.fromEntries(
  Object.entries(SYSTEMS).flatMap(([mode, spec]) => spec.commands.map(command => [command, mode]))
));

const FIELD_ALIASES = Object.freeze({
  business: ['negocio', 'marca', 'empresa'],
  product: ['producto', 'servicio', 'infoproducto'],
  audience: ['público', 'publico', 'audiencia', 'avatar', 'cliente ideal'],
  problem: ['problema', 'dolor', 'necesidad'],
  desire: ['deseo', 'transformación', 'transformacion', 'resultado deseado'],
  benefit: ['beneficio principal', 'beneficio'],
  offer: ['oferta'],
  proof: ['prueba', 'evidencia', 'razón para creer', 'razon para creer'],
  objections: ['objeciones', 'objeción', 'objecion'],
  awareness: ['nivel de conciencia', 'conciencia'],
  funnelStage: ['etapa del embudo', 'fase del embudo'],
  platform: ['plataforma', 'canal'],
  format: ['formato'],
  objective: ['objetivo', 'meta'],
  cta: ['cta', 'llamada a la acción', 'llamada a la accion'],
  budget: ['presupuesto'],
  resources: ['recursos', 'activos disponibles', 'colores y recursos disponibles'],
  mandatoryText: ['texto obligatorio'],
  constraints: ['restricciones'],
  verifiedClaims: ['afirmaciones comprobables', 'claims comprobables', 'datos comprobables'],
});

function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function detectMode(input) {
  const text = normalize(input);
  const command = text.match(/(?:^|\s)(\/[a-z0-9_-]+)/)?.[1];
  if (command && COMMAND_TO_MODE[command]) return COMMAND_TO_MODE[command];
  if (/audita|auditar|revisa mi|analiza mi (?:campana|embudo|pagina|oferta)/.test(text)) return MODES.AUDIT;
  if (/infoproduct|info producto|crear (?:un )?curso|producto digital/.test(text)) return MODES.INFOPRODUCT;
  if (/embudo|funnel|recorrido de venta|secuencia de paginas/.test(text)) return MODES.FUNNEL;
  if (/meta ads|facebook ads|campana de anuncios|matriz de anuncios/.test(text)) return MODES.META_ADS;
  if (/landing|pagina de ventas|pagina web|cro|conversion de la pagina/.test(text)) return MODES.LANDING_CRO;
  if (/propuesta de valor|crear oferta|mejorar oferta|oferta irresistible/.test(text)) return MODES.OFFER;
  if (/branding|posicionamiento|identidad de marca|voz de marca|narrativa de marca/.test(text)) return MODES.BRAND;
  if (/whatsapp|guion de ventas|objeciones de venta|seguimiento comercial|cerrar ventas/.test(text)) return MODES.SALES;
  if (/guion|reel|video|tiktok|shorts|contenido viral/.test(text)) return MODES.VIDEO;
  if (/seo|palabras clave|intencion de busqueda|contenido organico/.test(text)) return MODES.SEO;
  if (/growth|metricas|analitica|experimento|ltv|retencion|escalar/.test(text)) return MODES.GROWTH;
  if (/copy|texto publicitario|email de venta|titular|hooks?/.test(text)) return MODES.COPY;
  if (/creativo|diseno publicitario|direccion de arte|pieza grafica/.test(text)) return MODES.CREATIVE;
  if (/que sistema|como uso|lista de sistemas|comandos disponibles/.test(text)) return MODES.ROUTER;
  return MODES.NONE;
}

function extractLabeledFields(input) {
  const raw = String(input || '');
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]?\s*([^:]{2,60})\s*:\s*(.+?)\s*$/);
    if (match) entries.push([normalize(match[1]).trim(), match[2].trim()]);
  }
  const aliases = [...new Set(Object.values(FIELD_ALIASES).flat())].sort((a, b) => b.length - a.length);
  const escaped = aliases.map(alias => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  const labels = escaped.join('|');
  const inline = new RegExp(`(?:^|[\\n\\r;]|\\.\\s+|\\s)(?:[-*]\\s*)?(${labels})\\s*:\\s*([\\s\\S]*?)(?=(?:[\\n\\r;]|\\.\\s+|\\s)(?:[-*]\\s*)?(?:${labels})\\s*:|$)`, 'giu');
  let hit;
  while ((hit = inline.exec(raw)) !== null) {
    const value = hit[2].trim().replace(/[.;]+$/, '').trim();
    if (value) entries.push([normalize(hit[1]).trim(), value]);
  }
  return entries;
}

function buildRouterPlan(input) {
  const text = normalize(input);
  const sequence = [];
  const push = mode => { if (!sequence.includes(mode)) sequence.push(mode); };
  if (/validar (?:la )?oferta|propuesta de valor|definir precio|mejorar (?:la )?oferta/.test(text)) push(MODES.OFFER);
  if (/(?:crear|estructurar|desarrollar|lanzar).*(?:infoproduct|curso digital|producto digital)/.test(text)) push(MODES.INFOPRODUCT);
  if (/embudo|funnel|recorrido de venta/.test(text)) push(MODES.FUNNEL);
  if (/meta ads|facebook ads|campana de anuncios/.test(text)) push(MODES.META_ADS);
  if (/landing|pagina de ventas|pagina web|cro/.test(text)) push(MODES.LANDING_CRO);
  if (/marca|branding|posicionamiento/.test(text)) push(MODES.BRAND);
  if (/ventas|whatsapp|objeciones|cierre/.test(text)) push(MODES.SALES);
  if (/video|guion|reel|contenido viral/.test(text)) push(MODES.VIDEO);
  if (/seo|palabras clave|contenido organico/.test(text)) push(MODES.SEO);
  if (/growth|metricas|analitica|optimizar/.test(text)) push(MODES.GROWTH);
  if (!sequence.length) push(MODES.AUDIT);
  return {
    primary: sequence[0],
    primaryCommand: SYSTEMS[sequence[0]].commands[0],
    sequence: sequence.map(mode => ({ mode, command: SYSTEMS[mode].commands[0], title: SYSTEMS[mode].title })),
    rule: 'Resolver primero la dependencia estratégica y después producir activos y medición.',
  };
}

function buildUniversalBrief(input) {
  const entries = extractLabeledFields(input);
  const brief = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const hit = entries.find(([label]) => aliases.some(alias => label === normalize(alias)));
    brief[field] = hit ? hit[1] : null;
  }
  const raw = String(input || '').replace(/(?:^|\s)\/[a-z0-9_-]+/i, '').trim();
  if (!brief.product && raw.length > 4) brief.request = raw.slice(0, 1200);
  const missing = [];
  if (!brief.product && !brief.business) missing.push('producto_o_negocio');
  if (!brief.audience) missing.push('audiencia');
  if (!brief.objective) missing.push('objetivo');
  if (!brief.offer && [MODES.META_ADS, MODES.FUNNEL, MODES.OFFER, MODES.LANDING_CRO].includes(detectMode(input))) missing.push('oferta');
  brief.missing = missing;
  brief.assumptions = missing.map(item => `${item}=NO_PROPORCIONADO`);
  return brief;
}

function walkTextFiles(dir, source, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTextFiles(fullPath, source, acc);
    else if (/\.(?:txt|md)$/i.test(entry.name)) {
      acc.push({
        source: source.id,
        confidence: source.confidence,
        path: fullPath,
        rel: path.relative(AGENT_ROOT, fullPath),
      });
    }
  }
  return acc;
}

let FILE_CACHE = null;
function listKnowledgeFiles() {
  if (FILE_CACHE) return FILE_CACHE;
  FILE_CACHE = [];
  for (const source of SOURCE_ROOTS) walkTextFiles(source.dir, source, FILE_CACHE);
  return FILE_CACHE;
}

function resetFileCache() {
  FILE_CACHE = null;
}

const STOP = new Set(['para', 'como', 'esta', 'este', 'esto', 'una', 'unos', 'con', 'por', 'que', 'los', 'las', 'del', 'desde', 'entre', 'sobre', 'quiero', 'necesito', 'hacer', 'crear', 'dame', 'hazlo']);
function queryTerms(input) {
  return [...new Set(normalize(input).split(/[^a-z0-9ñ]+/).filter(word => word.length >= 4 && !STOP.has(word)))];
}

function splitText(text) {
  const normalized = String(text || '').replace(/\r/g, '');
  const blocks = normalized.split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length >= 60);
  const chunks = [];
  for (const block of blocks) {
    if (block.length <= 1400) chunks.push(block);
    else {
      for (let start = 0; start < block.length; start += 1100) {
        const chunk = block.slice(start, start + 1400).trim();
        if (chunk.length >= 60) chunks.push(chunk);
      }
    }
  }
  return chunks;
}

function combinedSourceRegex(packIds) {
  const parts = packIds.map(id => PACKS[id]?.sources?.source).filter(Boolean);
  return parts.length ? new RegExp(parts.map(part => `(?:${part})`).join('|'), 'i') : null;
}

function retrieveSpecialistKnowledge(input, mode = detectMode(input), options = {}) {
  if (mode === MODES.NONE || mode === MODES.ROUTER) return [];
  const spec = SYSTEMS[mode];
  if (!spec) return [];
  const packIds = spec.packs || [];
  const fileFilter = combinedSourceRegex(packIds);
  const primarySource = PACKS[packIds[0]]?.sources || null;
  const inputTerms = queryTerms(input);
  const hintTerms = [...new Set(packIds.flatMap(id => (PACKS[id]?.hints || []).flatMap(queryTerms)))];
  const files = listKnowledgeFiles().filter(file => !fileFilter || fileFilter.test(normalize(file.rel)));
  const candidates = [];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file.path, 'utf8'); } catch (error) { continue; }
    const relNorm = normalize(file.rel);
    const filenameHits = inputTerms.filter(term => relNorm.includes(term)).length;
    const primarySourceBoost = primarySource && primarySource.test(relNorm) ? 8 : 0;
    for (const chunk of splitText(text)) {
      const low = normalize(chunk);
      const directHits = inputTerms.filter(term => low.includes(term)).length;
      const hintHits = hintTerms.filter(term => low.includes(term)).length;
      if (!directHits && !hintHits && !filenameHits) continue;
      const score = directHits * 5 + Math.min(hintHits, 5) + filenameHits * 3 + primarySourceBoost + (file.confidence === 'high' ? 1 : 0);
      candidates.push({ ...file, text: chunk, score, directHits, hintHits });
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.directHits - a.directHits || a.rel.localeCompare(b.rel));
  const limit = options.limit || 10;
  const maxChars = options.maxChars || 12000;
  const perFile = new Map();
  const seen = new Set();
  const selected = [];
  let chars = 0;
  for (const item of candidates) {
    if ((perFile.get(item.rel) || 0) >= 2) continue;
    const key = normalize(item.text);
    if (seen.has(key)) continue;
    if (chars + item.text.length > maxChars) continue;
    seen.add(key);
    perFile.set(item.rel, (perFile.get(item.rel) || 0) + 1);
    selected.push({
      src: `OS ${item.source.toUpperCase()}`,
      file: item.rel,
      text: item.text,
      confidence: item.confidence,
      validity: 'requires_context_check',
      retrieval_status: 'local_active',
      score: item.score,
    });
    chars += item.text.length;
    if (selected.length >= limit) break;
  }
  return selected;
}

function readinessForMode(mode) {
  if ([MODES.CREATIVE, MODES.META_ADS, MODES.COPY, MODES.VIDEO].includes(mode)) {
    return { creative: 'supabase_active', operational_courses: 'local_active_supabase_mixed' };
  }
  if (mode === MODES.ROUTER || mode === MODES.NONE) return { router: 'local_active' };
  return { operational_courses: 'local_active_supabase_review_required' };
}

function prepareMarketingContext(input, options = {}) {
  const mode = options.mode || detectMode(input);
  if (mode === MODES.NONE) return null;
  const spec = SYSTEMS[mode];
  const brief = buildUniversalBrief(input);
  const claims = c3.validateClaims(input);
  let fragments = options.fragments || retrieveSpecialistKnowledge(input, mode, options);
  if (options.excludeCreativeBooks) {
    const creativeFiles = new Set(Object.keys(c3.BOOKS).map(file => normalize(file)));
    fragments = fragments.filter(item => !creativeFiles.has(normalize(path.basename(item.file))));
  }
  return {
    mode,
    title: spec.title,
    command: spec.commands[0],
    purpose: spec.purpose,
    brief,
    packs: spec.packs.map(id => ({ id, label: PACKS[id].label })),
    workflow: spec.workflow,
    output: spec.output,
    qa: COMMON_QA,
    knowledge: fragments,
    blockedClaims: claims.blocked,
    readiness: readinessForMode(mode),
    routePlan: mode === MODES.ROUTER ? buildRouterPlan(input) : null,
  };
}

function buildSystemInstructions(context, options = {}) {
  if (!context) return '';
  const blocked = context.blockedClaims.length
    ? context.blockedClaims.map(item => `- ${item.claim}: ${item.reason}`).join('\n')
    : '- Ninguno detectado; aun así, no añadas datos no proporcionados.';
  const sources = context.knowledge.length
    ? context.knowledge.map((item, index) => `\n[OS${index + 1}] ${item.file}; confidence=${item.confidence}; retrieval_status=${item.retrieval_status}; validity=${item.validity}\n${item.text}`).join('\n')
    : '\n- No se recuperaron fragmentos locales suficientemente pertinentes. Trabaja con el brief y marca las inferencias; no inventes fuentes.';
  const c3Rule = options.c3Active
    ? 'C3 TAMBIÉN ESTÁ ACTIVO: su contrato de salida obligatorio tiene prioridad. Integra estas decisiones estratégicas dentro de C3 y no generes una segunda estructura duplicada.'
    : 'Usa el contrato de salida de este especialista.';
  const routerGuard = context.mode === MODES.ROUTER
    ? `LÍMITE DEL ROUTER:
- No escribas copy, anuncios, ofertas, lead magnets, segmentaciones, páginas, activos ni benchmarks.
- No completes problema, deseo, beneficio, mecanismo, prueba, recursos o restricciones que el usuario no proporcionó.
- El comando final debe usar exactamente uno de estos comandos válidos: ${Object.values(SYSTEMS).flatMap(spec => spec.commands).join(', ')}.
- Conserva únicamente datos literales del usuario; escribe POR DEFINIR en cada campo faltante.
- Entrega obligatoriamente los cinco apartados del CONTRATO DE SALIDA; nunca respondas solo con un comando.
- En Router no aplica la regla de supuestos neutrales: no asumas temperatura, conciencia, tráfico, métricas, oferta, CTA ni activos.
- Termina al finalizar el apartado 5. No añadas notas, KPIs, pruebas, recomendaciones tácticas ni próximos pasos.
RUTA CALCULADA DETERMINÍSTICAMENTE:
${JSON.stringify(context.routePlan, null, 2)}`
    : '';
  const missingRule = context.mode === MODES.ROUTER
    ? 'No pidas ni completes datos: registra cada campo ausente como POR DEFINIR.'
    : 'No pidas datos ya proporcionados. Si falta un dato no crítico, usa un supuesto neutral marcado. Detente solo si falta un dato indispensable para no inventar el producto, la oferta o una acción externa.';
  return `MARKETING OS ACTIVADO

SISTEMA ESPECIALISTA: ${context.title} (${context.mode})
OBJETIVO: ${context.purpose}
${c3Rule}
${routerGuard}

JERARQUÍA: datos actuales del usuario > archivos adjuntos del usuario > fuentes recuperadas > conocimiento general > inferencia etiquetada.
${missingRule}

BRIEF UNIVERSAL:
${JSON.stringify(context.brief, null, 2)}

PAQUETES ACTIVOS:
${context.packs.length ? context.packs.map(pack => `- ${pack.id}: ${pack.label}`).join('\n') : '- Ninguno; solo enruta la solicitud.'}

DISPONIBILIDAD:
${JSON.stringify(context.readiness)}
"local_active" permite usar el fragmento como contexto operativo local. "supabase_review_required" prohíbe afirmar que está activo o atribuido en Supabase.

CLAIMS BLOQUEADOS:
${blocked}

FUENTES RECUPERADAS SELECTIVAMENTE:
${sources}

PROVENANCE:
- Cita únicamente archivos realmente recuperados arriba.
- No atribuyas una idea a un libro, autor o curso si el fragmento no la respalda.
- Las transcripciones pueden contener errores: úsalas como orientación operativa y evita citas textuales dudosas.
- Separa hechos del usuario, principios recuperados, inferencias e hipótesis de prueba.

PROCESO OBLIGATORIO:
${context.workflow.map((step, index) => `${index + 1}. ${step}`).join('\n')}

CONTRATO DE SALIDA:
${context.output.map((item, index) => `${index + 1}. ${item}`).join('\n')}

CONTROL DE CALIDAD ANTES DE RESPONDER:
${context.qa.map(item => `- ${item}`).join('\n')}

BARRERA COMERCIAL Y NUMÉRICA:
No inventes precios, porcentajes, horarios, plazos, resultados, clientes, testimonios, promociones, garantías, escasez ni benchmarks. Usa POR DEFINIR, POR VALIDAR o REQUIERE MEDICIÓN cuando falte evidencia.`;
}

function publicSummary(context) {
  if (!context) return null;
  return {
    mode: context.mode,
    title: context.title,
    command: context.command,
    packs: context.packs,
    sources: context.knowledge.map(item => ({
      file: item.file,
      confidence: item.confidence,
      retrieval_status: item.retrieval_status,
    })),
    missing: context.brief.missing,
    blocked_claims: context.blockedClaims,
    readiness: context.readiness,
    route_plan: context.routePlan,
  };
}

function renderUniversalBrief() {
  return `# Brief universal de Marketing OS

Completa solo lo que conozcas. El agente no debe pedir de nuevo un dato ya proporcionado.

\`\`\`text
Negocio:
Producto o servicio:
Público / avatar:
Problema:
Deseo / transformación:
Beneficio principal:
Oferta:
Prueba / razón para creer:
Objeciones:
Nivel de conciencia:
Etapa del embudo:
Plataforma / canal:
Formato:
Objetivo:
CTA:
Presupuesto:
Recursos disponibles:
Texto obligatorio:
Restricciones:
Afirmaciones comprobables:
\`\`\`
`;
}

function renderRouterPrompt() {
  const systems = Object.entries(SYSTEMS).filter(([mode]) => mode !== MODES.ROUTER).map(([mode, spec]) => `- ${spec.commands.join(' / ')} — ${spec.title}: ${spec.purpose}`).join('\n');
  return `# Prompt maestro — Router de Marketing OS

Actúa como router de un sistema de marketing. Lee el brief y la solicitud. Elige un especialista principal y solo los auxiliares necesarios. Ordena el trabajo por dependencias. No produzcas estrategia, copy, ofertas, páginas, anuncios, activos ni métricas.

Conserva únicamente los datos literales del usuario. No hagas supuestos: escribe POR DEFINIR en cada campo faltante. Entrega los cinco apartados completos y termina al finalizar el comando.

Sistemas disponibles:
${systems}

Entrega: 1) objetivo interpretado; 2) especialista principal y auxiliares; 3) datos disponibles y faltantes; 4) secuencia de sistemas; 5) comando válido con datos conocidos y POR DEFINIR en los faltantes.
`;
}

function renderStandalonePrompt(mode) {
  const spec = SYSTEMS[mode];
  if (!spec) throw new Error(`Sistema desconocido: ${mode}`);
  return `# Prompt maestro — ${spec.title}

Comando del agente: ${spec.commands.join(' o ')}

Actúa como ${spec.title}. ${spec.purpose}

Consulta primero los paquetes de conocimiento: ${spec.packs.length ? spec.packs.map(id => `${id} (${PACKS[id].label})`).join(', ') : 'ninguno; enruta la solicitud'}.

Respeta esta jerarquía: datos actuales del usuario > adjuntos > fuentes recuperadas > conocimiento general > inferencia etiquetada. No inventes datos del negocio, testimonios, precios, resultados, promociones, garantías, urgencia ni métricas.

Trabaja en este orden:
${spec.workflow.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Entrega:
${spec.output.map((item, index) => `${index + 1}. ${item}`).join('\n')}

Control profesional:
${COMMON_QA.map(item => `- ${item}`).join('\n')}

Si falta un dato no crítico, usa un supuesto neutral marcado. Si falta un dato indispensable, formula una sola pregunta concreta. Indica al final las fuentes realmente utilizadas y una prueba controlada.
`;
}

function renderManual() {
  const rows = Object.entries(SYSTEMS).map(([mode, spec]) => `| ${spec.commands.join(', ')} | ${spec.title} | ${spec.purpose} |`).join('\n');
  return `# Marketing OS — Manual de uso

Marketing OS elige fuentes y procesos según el caso. Puedes escribir de forma natural o empezar con un comando.

## Comandos

| Comando | Sistema | Úsalo para |
|---|---|---|
${rows}

## Forma rápida

\`\`\`text
/meta Producto: ... Público: ... Oferta: ... Objetivo: ...
\`\`\`

## Forma profesional

Pega el Brief Universal completo y comienza con el comando del sistema. Si el trabajo tiene varias etapas, usa primero \`/router\`.

## Regla de encadenamiento

Audiencia → Oferta → Mensaje → Activo → Embudo → Medición. El agente no debe diseñar páginas o anuncios antes de identificar qué se vende, a quién y para qué acción.

## Disponibilidad

- La biblioteca creativa C3 usa recuperación verificada en Supabase.
- Cursos de embudos, infoproductos, CRO, marca, SEO, growth y ventas pueden usarse mediante el recuperador local.
- Un fragmento local no debe presentarse como activo en Supabase si su estado no fue validado.
`;
}

module.exports = {
  MODES,
  PACKS,
  SYSTEMS,
  SOURCE_ROOTS,
  COMMON_QA,
  detectMode,
  buildUniversalBrief,
  buildRouterPlan,
  listKnowledgeFiles,
  resetFileCache,
  retrieveSpecialistKnowledge,
  readinessForMode,
  prepareMarketingContext,
  buildSystemInstructions,
  publicSummary,
  renderUniversalBrief,
  renderRouterPrompt,
  renderStandalonePrompt,
  renderManual,
};
