'use strict';
// INTENT_ANALYZER — raw request -> { intent, TASK_BRIEF }. Deterministic keyword-based
// analysis (no LLM required for obvious intents). A pluggable `enrich` hook allows a future
// LLM-backed enrichment pass without changing callers.
const crypto = require('crypto');
const { makeBrief } = require('../schemas/task_brief');

const INTENTS = ['CLIENT_ACQUISITION', 'MARKET_RESEARCH', 'OFFER_DESIGN', 'FUNNEL_DESIGN', 'COPYWRITING',
  'CREATIVE_STRATEGY', 'META_ADS', 'WHATSAPP_SALES', 'INFOPRODUCT', 'COURSE_CREATION', 'VIDEO_SCRIPT',
  'STORYBOARD', 'CRO', 'MULTI_STEP_MARKETING', 'GENERIC_MARKETING_TASK'];

// keyword signals (es/en), lowercased match
const SIGNALS = [
  ['MARKET_RESEARCH', ['investiga', 'research', 'competencia', 'competitor', 'mercado', 'market size', 'tendencia', 'trend']],
  ['OFFER_DESIGN', ['oferta', 'offer', 'propuesta de valor', 'value proposition', 'guarantee', 'garantía', 'precio', 'pricing']],
  ['FUNNEL_DESIGN', ['embudo', 'funnel', 'secuencia', 'sequence', 'nurture']],
  ['COPYWRITING', ['copy', 'copywriting', 'texto', 'headline', 'titular', 'redacta']],
  ['CREATIVE_STRATEGY', ['creativo', 'creative', 'ángulo', 'angle', 'concepto', 'concept', 'hook']],
  ['META_ADS', ['meta ads', 'facebook ads', 'instagram ads', 'anuncios', 'ads', 'campaña de anuncios']],
  ['WHATSAPP_SALES', ['whatsapp', 'wa', 'cierre por chat', 'chat sales', 'agenda cita', 'appointment']],
  ['INFOPRODUCT', ['infoproducto', 'infoproduct', 'ebook', 'membresía', 'membership']],
  ['COURSE_CREATION', ['curso', 'course', 'módulo', 'module', 'currículo', 'curriculum']],
  ['VIDEO_SCRIPT', ['guion', 'guión', 'script', 'video script', 'reel', 'vsl']],
  ['STORYBOARD', ['storyboard', 'guion gráfico', 'escenas', 'shot list']],
  ['CRO', ['cro', 'conversión', 'conversion rate', 'optimiza', 'optimize', 'landing']],
  ['CLIENT_ACQUISITION', ['captación', 'captacion', 'adquisición', 'acquisition', 'conseguir clientes', 'client acquisition', 'atraer clientes', 'leads']],
];
// requests that clearly span the full journey -> multi-step
const MULTISTEP = ['campaña', 'campaign', 'lanzamiento', 'launch', '360', 'de principio a fin', 'end to end', 'end-to-end', 'sistema de ventas', 'sales system', 'plan de marketing', 'marketing plan'];

function detectLanguage(text) {
  const t = (text || '').toLowerCase();
  const es = (t.match(/[áéíóúñ¿¡]| el | la | los | una | para | crear | anuncios | clientes /g) || []).length;
  const en = (t.match(/ the | a | for | create | campaign | clients | ads | funnel /g) || []).length;
  return es >= en ? 'es' : 'en';
}

function deterministicId(prefix, seed) {
  return prefix + '_' + crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 12);
}

// Very lightweight business-type guess: pull a noun phrase near "for/para/de"; generic fallback.
function guessBusinessType(text) {
  const t = (text || '').trim();
  const m = t.match(/(?:para|for|de|of)\s+(?:una?|an?|the|el|la)?\s*([a-záéíóúñ0-9 \-]{3,40})/i);
  if (m) return m[1].trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 40);
  return 'UNSPECIFIED_BUSINESS';
}

function analyze(rawRequest, opts = {}) {
  const text = String(rawRequest || '');
  const lc = text.toLowerCase();
  const matched = [];
  for (const [intent, kws] of SIGNALS) if (kws.some(k => lc.includes(k))) matched.push(intent);
  const isMulti = MULTISTEP.some(k => lc.includes(k)) || matched.length >= 3;

  let intent;
  if (isMulti) intent = 'MULTI_STEP_MARKETING';
  else if (matched.length === 1) intent = matched[0];
  else if (matched.length === 0) intent = 'GENERIC_MARKETING_TASK';
  else intent = matched[0]; // dominant single

  // objective normalization
  const objective = matched.includes('CLIENT_ACQUISITION') || isMulti ? 'CLIENT_ACQUISITION' : (matched[0] || 'GENERIC_MARKETING_TASK');
  const language = opts.language || detectLanguage(text);
  const task_id = opts.task_id || deterministicId('task', text + '|' + (opts.salt || ''));

  const brief = makeBrief({
    task_id,
    raw_user_request: text,
    objective,
    business_type: guessBusinessType(text),
    target_customer: null,
    desired_deliverable: isMulti ? 'MULTI_STEP_MARKETING_PLAN' : (matched[0] || 'MARKETING_DELIVERABLE'),
    funnel_stage: intent === 'CRO' ? ['conversion'] : (objective === 'CLIENT_ACQUISITION' ? ['acquisition', 'conversion'] : ['acquisition']),
    urgency: /urgente|urgent|ya|asap|hoy/i.test(text) ? 'HIGH' : 'MEDIUM',
    research_need: matched.includes('MARKET_RESEARCH') || isMulti ? 'HIGH' : 'MEDIUM',
    knowledge_need: 'HIGH',
    uncertainty: matched.length === 0 ? 'HIGH' : 'MEDIUM',
    language,
    status: 'READY',
  });

  const result = { intent, matched_intents: matched, is_multi_step: isMulti, brief };
  // optional future LLM enrichment (interface only; not called in ASTRA-02)
  if (typeof opts.enrich === 'function') return opts.enrich(result, text);
  return result;
}

module.exports = { INTENTS, analyze, detectLanguage, deterministicId };
