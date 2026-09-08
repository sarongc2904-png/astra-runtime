// ═══════════════════════════════════════════════════════════════════════
//  KNOWLEDGE.JS — módulo compartido del agente Trafficker AI
//  Lógica de recuperación de conocimiento + llamada al LLM (OpenRouter)
//  Usado por: chat.js (terminal) y app/server.js (web app)
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const c3 = require('./c3.js');
const marketingOS = require('./marketing_os.js');
const groundedPolicy = require('./rag_answer_policy_runtime.js');

const ROOT = 'D:\\josed\\Descargas\\DEEPSEEK HARNESS';
const AGENTE = path.join(ROOT, 'agente_ia');
const CONFIG = path.join(AGENTE, 'config.json');
const TRANS_DIR = path.join(AGENTE, 'transcripciones');
const SKOOL_SUBS = path.join(ROOT, 'skool_download', 'memoria_agente', 'transcripciones');
const CREATIVE_PROMPT_FILE = path.join(AGENTE, 'CONOCIMIENTO', 'PROMPT_DIRECTOR_CREATIVO_PROFESIONAL.md');
const COPY_FB_PROMPT_FILE = path.join(AGENTE, 'CONOCIMIENTO', 'PROMPT_COPY_FB_ADS_LIBROS.md');

const CANONICAL_MODEL = 'openai/gpt-5-mini';
const DEFAULT_MODEL = CANONICAL_MODEL;

// ─────────── CONFIGURACIÓN ───────────
function loadConfig() {
  const c = { apiKey: '', model: DEFAULT_MODEL, baseUrl: 'https://openrouter.ai/api/v1' };
  if (fs.existsSync(CONFIG)) {
    try {
      const loaded = Object.assign(c, JSON.parse(fs.readFileSync(CONFIG, 'utf8')));
      loaded.model = CANONICAL_MODEL;
      return loaded;
    } catch (e) {}
  }
  return c;
}
function saveConfig(config) {
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));
}

// ─────────── TOKENIZACIÓN ───────────
const STOP = new Set(['para','como','cual','esta','este','una','unas','unos','con','por','que','los','las','del','de','el','la','en','y','a','o','es','se','su','al','lo','mas','muy','ser','hacer','hace','puedo','puede','quiero','necesito','me','te','mi','tu','tus','sus','donde','cuando','porque','pero','tambien','bien','ahora','tengo','tiene','hay','son','fue','era','estar','más','qué','cuál','dónde','cuándo','cómo','¿','?']);

function tokenize(q) {
  return q.toLowerCase().split(/[^a-záéíóúñü0-9]+/i)
    .filter(w => w.length >= 4 && !STOP.has(w));
}

// ─────────── RECUPERACIÓN DE CONOCIMIENTO ───────────
function retrieve(terms, maxTotal = 8000) {
  const out = [];
  const seenFragments = new Set();
  let chars = 0;
  const push = (src, file, text) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length < 30) return;
    const duplicateKey = t.normalize('NFKC').toLowerCase();
    if (seenFragments.has(duplicateKey)) return;
    if (chars + t.length > maxTotal) return;
    seenFragments.add(duplicateKey);
    out.push({ src, file, text: t });
    chars += t.length;
  };
  if (!terms.length) return out;

  // 1) Transcripciones Whisper (curso de ventas, español — fuente principal)
  if (fs.existsSync(TRANS_DIR)) {
    const files = fs.readdirSync(TRANS_DIR).filter(f => f.endsWith('.txt'))
      .sort((a, b) => (a.match(/\d+/) || [0])[0] - (b.match(/\d+/) || [0])[0]);
    for (const f of files) {
      const txt = fs.readFileSync(path.join(TRANS_DIR, f), 'utf8');
      const sentences = txt.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 40);
      const scored = [];
      for (const s of sentences) {
        const low = s.toLowerCase();
        const n = terms.filter(t => low.includes(t)).length;
        if (n >= Math.max(1, Math.min(2, terms.length))) scored.push({ n, s });
      }
      scored.sort((a, b) => b.n - a.n);
      for (const h of scored.slice(0, 3)) push('CURSO VENTAS', f, h.s);
    }
  }

  // 1b) Transcripciones Whisper de Skool (español, en memoria_agente\transcripciones)
  const SKOOL_ES = path.join(ROOT, 'skool_download', 'memoria_agente', 'transcripciones');
  if (fs.existsSync(SKOOL_ES)) {
    for (const f of fs.readdirSync(SKOOL_ES)) {
      if (!f.endsWith('.txt')) continue;
      const txt = fs.readFileSync(path.join(SKOOL_ES, f), 'utf8');
      const sentences = txt.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 40);
      const scored = [];
      for (const s of sentences) {
        const low = s.toLowerCase();
        const n = terms.filter(t => low.includes(t)).length;
        if (n >= Math.max(1, Math.min(2, terms.length))) scored.push({ n, s });
      }
      scored.sort((a, b) => b.n - a.n);
      const curso = (f.match(/^(.+?)\s*-\s*\d+\s*-/) || [0, 'SKOOL'])[1];
      for (const h of scored.slice(0, 2)) push(`SKOOL ${curso}`, f, h.s);
    }
  }

  // 1c) Transcripciones Whisper de VELOCITY (español, transcripciones_velocity — recursivo)
  const VEL_DIR = path.join(AGENTE, 'transcripciones_velocity');
  if (fs.existsSync(VEL_DIR)) {
    const walk = (dir, acc) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.name.endsWith('.txt')) acc.push(p);
      }
      return acc;
    };
    const files = walk(VEL_DIR, []).sort();
    for (const fp of files) {
      let txt;
      try { txt = fs.readFileSync(fp, 'utf8'); } catch (e) { continue; }
      const sentences = txt.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 40);
      const scored = [];
      for (const s of sentences) {
        const low = s.toLowerCase();
        const n = terms.filter(t => low.includes(t)).length;
        if (n >= Math.max(1, Math.min(2, terms.length))) scored.push({ n, s });
      }
      scored.sort((a, b) => b.n - a.n);
      if (!scored.length) continue;
      const rel = path.relative(VEL_DIR, fp);
      const curso = rel.split(path.sep)[0] || 'VELOCITY';
      for (const h of scored.slice(0, 2)) push(`VELOCITY ${curso}`, rel, h.s);
    }
  }

  // 1d) Transcripciones Whisper de PROTEGE (español, transcripciones_protege — recursivo)
  const PROT_DIR = path.join(AGENTE, 'transcripciones_protege');
  if (fs.existsSync(PROT_DIR)) {
    const walk = (dir, acc) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.name.endsWith('.txt')) acc.push(p);
      }
      return acc;
    };
    const files = walk(PROT_DIR, []).sort();
    for (const fp of files) {
      let txt;
      try { txt = fs.readFileSync(fp, 'utf8'); } catch (e) { continue; }
      const sentences = txt.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 40);
      const scored = [];
      for (const s of sentences) {
        const low = s.toLowerCase();
        const n = terms.filter(t => low.includes(t)).length;
        if (n >= Math.max(1, Math.min(2, terms.length))) scored.push({ n, s });
      }
      scored.sort((a, b) => b.n - a.n);
      if (!scored.length) continue;
      const rel = path.relative(PROT_DIR, fp);
      const curso = rel.split(path.sep)[0] || 'PROTEGE';
      for (const h of scored.slice(0, 2)) push(`PROTEGE ${curso}`, rel, h.s);
    }
  }

  // 1e) Transcripciones Whisper de PROTEGE DESCARGAS (español, transcripciones_protege_descargas — recursivo)
  const PROTD_DIR = path.join(AGENTE, 'transcripciones_protege_descargas');
  if (fs.existsSync(PROTD_DIR)) {
    const walk = (dir, acc) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.name.endsWith('.txt')) acc.push(p);
      }
      return acc;
    };
    const files = walk(PROTD_DIR, []).sort();
    for (const fp of files) {
      let txt;
      try { txt = fs.readFileSync(fp, 'utf8'); } catch (e) { continue; }
      const sentences = txt.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 40);
      const scored = [];
      for (const s of sentences) {
        const low = s.toLowerCase();
        const n = terms.filter(t => low.includes(t)).length;
        if (n >= Math.max(1, Math.min(2, terms.length))) scored.push({ n, s });
      }
      scored.sort((a, b) => b.n - a.n);
      if (!scored.length) continue;
      const rel = path.relative(PROTD_DIR, fp);
      const curso = rel.split(path.sep)[0] || 'PROTEGE';
      for (const h of scored.slice(0, 2)) push(`PROTEGE DESCARGAS ${curso}`, rel, h.s);
    }
  }

  // 2) Subtítulos Skool (referencia, solo si hay espacio)
  if (fs.existsSync(SKOOL_SUBS) && chars < maxTotal * 0.5) {
    const files = fs.readdirSync(SKOOL_SUBS).filter(f => f.endsWith('.srt')).slice(0, 30);
    for (const f of files) {
      const txt = fs.readFileSync(path.join(SKOOL_SUBS, f), 'utf8').toLowerCase();
      const matched = terms.filter(t => txt.includes(t));
      if (matched.length >= 2) {
        const idx = txt.indexOf(matched[0]);
        push('SKOOL (ref)', f, txt.substring(Math.max(0, idx - 100), idx + 300));
      }
    }
  }

  // 3) Módulos expertos (CONOCIMIENTO/*.md — psicología, ofertas, etc.)
  const KNOW_DIR = path.join(AGENTE, 'CONOCIMIENTO');
  if (fs.existsSync(KNOW_DIR) && chars < maxTotal * 0.75) {
    const files = fs.readdirSync(KNOW_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const txt = fs.readFileSync(path.join(KNOW_DIR, f), 'utf8');
      const sentences = txt.split(/\n+/).map(s => s.trim()).filter(s => s.length > 50);
      const scored = [];
      for (const s of sentences) {
        const low = s.toLowerCase();
        const n = terms.filter(t => low.includes(t)).length;
        if (n >= Math.max(1, Math.min(2, terms.length))) scored.push({ n, s });
      }
      scored.sort((a, b) => b.n - a.n);
      for (const h of scored.slice(0, 3)) push('MÓDULO', f, h.s);
    }
  }
  return out;
}

function countTranscribed() {
  if (!fs.existsSync(TRANS_DIR)) return 0;
  return fs.readdirSync(TRANS_DIR).filter(f => f.endsWith('.txt')).length;
}

// ─────────── PROMPT DE SISTEMA ───────────
function creativeModeRequested(userQuery) {
  const normalized = String(userQuery || '').normalize('NFKC').toLowerCase();
  return /(?:^|\s)\/creativo(?:\s|$)/.test(normalized)
    || normalized.includes('modo director creativo')
    || normalized.includes('director creativo profesional');
}

function copyFbModeRequested(userQuery) {
  const normalized = String(userQuery || '').normalize('NFKC').toLowerCase();
  return /(?:^|\s)\/copyfb(?:\s|$)/.test(normalized)
    || normalized.includes('modo copy fb ads')
    || normalized.includes('modo copy facebook ads');
}

function buildSystem(fragments, userQuery = '', c3Context = null, marketingContext = null) {
  const specialistContext = c3Context || marketingContext;
  let sys = `Eres Trafficker AI, un agente experto en marketing digital y ventas entrenado con el conocimiento del curso "Aceleración en Ventas" de Trafficker Lab (Centro Trafficker Lab), los 7 cursos de Skool (Trafficker Lab) y la formación VELOCITY (Cursos Sprint, Series, Workshops, Podcasts, Amplify, Accelerate).

Tu objetivo: ayudar a negocios de cualquier tamaño a atraer clientes, convertirlos y vender más, usando estrategias probadas de embudos, anuncios y copywriting.

REGLAS:
- Responde SIEMPRE en español, con tono directo, claro y accionable.
- NUNCA des teoría genérica: da pasos concretos aplicables al negocio del usuario.
${marketingContext && marketingContext.mode === marketingOS.MODES.ROUTER
    ? '- En Router no hagas supuestos: conserva los datos literales y marca cada dato faltante como POR DEFINIR.'
    : specialistContext
      ? '- No detengas el trabajo por datos no críticos: usa supuestos neutrales marcados. Formula una sola pregunta únicamente si falta un dato indispensable.'
    : '- Pregunta los datos que falten antes de recomendar (producto, avatar, presupuesto).'}
- Usa siempre los datos que el usuario YA proporcionó en su mensaje: no pidas dos veces lo que ya te dio.
${specialistContext
    ? '- Hay un sistema especialista activo: respeta su proceso, contrato de salida, jerarquía de fuentes y control de calidad.'
    : '- Estructura las respuestas largas así: 🎯 Diagnóstico → 🧠 Estrategia → 📋 Plan → 🛠️ Recursos → 📊 Métricas.'}
- Si el usuario no tiene presupuesto de ads, sugiere estrategias orgánicas primero.
- Sé honesto sobre resultados: no prometas ventas garantizadas.
- Cuando el usuario adjunte un documento, su contenido viene pegado en el mensaje entre las marcas "--- INICIO/FIN DEL DOCUMENTO ADJUNTO ---". LÉELO siempre y responde usando esa información; nunca digas que no puedes ver el archivo si su contenido está pegado en el mensaje.
- Cuando el conocimiento del curso (abajo) responda la pregunta, APÓYATE en él y cita la fuente, ej: "(fuente: Video 14)".
- Si el conocimiento del curso no cubre la pregunta, dilo y responde con tu criterio profesional.

${specialistContext
    ? 'MÉTRICAS EN SISTEMAS ESPECIALISTAS: no uses benchmarks, metas, horarios o umbrales heredados. Define el KPI, pero deja el valor objetivo POR DEFINIR hasta contar con datos actuales verificados.'
    : `REFERENCIA DE MÉTRICAS:
- CPM: costo por 1000 impresiones. Buen rango $3-15 USD. Alto → revisar segmentación/creativo.
- CTR: % que hace clic. Bueno 1-3%+. Bajo → creativo/ángulo.
- CPC: costo por clic. Bajo es mejor.
- CPA: costo por conversión. Debe ser < margen del producto.
- ROAS: $ por cada $ invertido. 2x+ rentable, 3x+ ideal.
- Regla de escalado Meta Ads: aumentar presupuesto máx. 20% cada 1-2 días si cumple CPA/ROAS y tiene 50+ conversiones (25+ leads).`}`;

  if (creativeModeRequested(userQuery) && !c3Context) {
    if (!fs.existsSync(CREATIVE_PROMPT_FILE)) {
      throw new Error(`No se encontró el prompt creativo operativo: ${CREATIVE_PROMPT_FILE}`);
    }
    const creativePrompt = fs.readFileSync(CREATIVE_PROMPT_FILE, 'utf8').trim();
    sys += `\n\nMODO DIRECTOR CREATIVO ACTIVADO. Estas instrucciones específicas tienen prioridad para esta solicitud:\n\n${creativePrompt}`;
  }

  if (copyFbModeRequested(userQuery) && !c3Context) {
    if (!fs.existsSync(COPY_FB_PROMPT_FILE)) {
      throw new Error(`No se encontró el prompt de copy para Facebook Ads: ${COPY_FB_PROMPT_FILE}`);
    }
    const copyFbPrompt = fs.readFileSync(COPY_FB_PROMPT_FILE, 'utf8').trim();
    sys += `\n\nMODO COPY FB ADS ACTIVADO. Estas instrucciones específicas tienen prioridad para esta solicitud:\n\n${copyFbPrompt}`;
  }

  const selectedFragments = c3Context
    ? fragments.slice(0, 8)
    : marketingContext && marketingContext.mode === marketingOS.MODES.ROUTER
      ? []
      : marketingContext
        ? fragments.slice(0, 4)
        : fragments;
  if (selectedFragments.length) {
    sys += specialistContext
      ? `\n\nAGENT OS LOCAL (máximo 8 fragmentos operativos para audiencia/oferta/conversión; no usar para atribuir libros):\n`
      : `\n\nCONOCIMIENTO DEL CURSO (fragmentos relevantes a tu pregunta, úsalos como fuente primaria):\n`;
    for (const f of selectedFragments) {
      sys += `\n[${f.src} — ${f.file}]\n${f.text}`;
    }
  }
  if (marketingContext) {
    sys += `\n\n${marketingOS.buildSystemInstructions(marketingContext, { c3Active: !!c3Context })}`;
  }
  if (c3Context) sys += `\n\n${c3.buildSystemInstructions(c3Context)}`;
  return sys;
}

// ─────────── LLAMADA A OPENROUTER ───────────
async function askLLM(config, model, system, history, userMsg) {
  const messages = [{ role: 'system', content: system }].concat(history).concat([{ role: 'user', content: userMsg }]);
  const guardedSystem = system.includes('SISTEMA OPERATIVO C3 ACTIVADO') || system.includes('MARKETING OS ACTIVADO');
  const call = async (withReasoning) => {
    const body = { model, messages, temperature: 0.7, max_tokens: guardedSystem ? 5000 : 3000 };
    if (withReasoning) body.reasoning = { enabled: false }; // oculta razonamiento interno
    const r = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost/trafficker-ai',
        'X-Title': 'Trafficker AI'
      },
      body: JSON.stringify(body)
    });
    return r;
  };
  let r = await call(true);
  let errText = '';
  if (!r.ok) errText = await r.text();
  if (r.status === 400 && /reasoning/i.test(errText)) {
    r = await call(false);
    if (!r.ok) errText = await r.text();
  }
  if (!r.ok) {
    if (r.status === 401) throw new Error('API key inválida. Revisa config.json o usa: node chat.js --key sk-or-TU-KEY');
    if (r.status === 404) throw new Error(`Modelo "${model}" no encontrado. Usa: node chat.js --list-models`);
    if (r.status === 429) throw new Error('Límite de peticiones del modelo gratis alcanzado. Espera un minuto o cambia de modelo (node chat.js --list-models).');
    throw new Error(`HTTP ${r.status}: ${errText.substring(0, 300)}`);
  }
  const j = await r.json();
  const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!content) throw new Error('Respuesta vacía del modelo');
  const usage = j.usage ? { prompt: j.usage.prompt_tokens || 0, completion: j.usage.completion_tokens || 0 } : null;
  const guarded = guardedSystem ? c3.guardGeneratedOutput(content.trim(), userMsg, system) : { content: content.trim(), blocked: [] };
  return { content: guarded.content, usage, outputClaimsBlocked: guarded.blocked };
}

function parseStrictJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(raw);
  const decision = String(value.decision || '').trim().toUpperCase();
  if (!['SUFFICIENT', 'FULL', 'PARTIAL', 'INSUFFICIENT', 'AMBIGUOUS'].includes(decision)) {
    throw new Error(`Decisión de suficiencia inválida: ${decision || '(vacía)'}`);
  }
  return {
    decision,
    hasSupportedMaterial: Boolean(value.has_supported_material),
    specificLimitation: String(value.specific_limitation || '').trim(),
    reason: String(value.reason || '').trim(),
  };
}

// Frozen classifier system prompt (lifted to a module constant so the decision
// cache can content-address it via prompt_version; the string value is unchanged).
const CLASSIFIER_SYSTEM_PROMPT = `You are the frozen evidence-sufficiency router for a grounded RAG system. Classify only whether the supplied evidence supports the user's request. Use SUFFICIENT when all requested material facts appear; PARTIAL when some but not all salient aspects appear; INSUFFICIENT when the requested facts do not appear and the evidence is topically mismatched or materially absent; AMBIGUOUS when the query has multiple readings that the evidence cannot disambiguate. Do not use outside knowledge. Return strict JSON only with keys decision, has_supported_material, specific_limitation, reason. For PARTIAL, specific_limitation must state only what the evidence does not establish. For other states it must be an empty string.`;
// Stable, content-independent version tags for the operational decision cache.
// Bump on a material change to the classifier implementation / model config / output schema.
const CLASSIFIER_VERSION = 'clf-impl-1';
const CLASSIFIER_MODEL_CONFIG_VERSION = 'mc-1'; // temperature 0 / max_tokens 4000 / json_object / reasoning-disabled-then-fallback
const CLASSIFIER_SCHEMA_VERSION = 'sfx-1';      // {decision, has_supported_material, specific_limitation, reason}

// FROZEN classifier — unchanged semantics. This is the single materializing call
// used on a cache MISS. Cold-start output may be intrinsically nondeterministic.
async function classifyEvidenceSufficiencyUncached(config, model, userMsg, evidenceText) {
  const classifierSystem = CLASSIFIER_SYSTEM_PROMPT;
  const buildBody = (withReasoning) => {
    const body = {
      model,
      messages: [
        { role: 'system', content: classifierSystem },
        { role: 'user', content: `QUERY:\n${userMsg}\n\nRETRIEVED EVIDENCE:\n${String(evidenceText || '').slice(0, 24000) || '[none]'}` },
      ],
      temperature: 0,
      max_tokens: 4000, // techo alto para reasoning obligatorio de gpt-5-mini + JSON del clasificador (E2E-DEFECT-002)
      response_format: { type: 'json_object' },
    };
    if (withReasoning) body.reasoning = { enabled: false }; // oculta razonamiento interno
    return body;
  };
  const call = (withReasoning) => fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://localhost/trafficker-ai', 'X-Title': 'Trafficker AI' },
    body: JSON.stringify(buildBody(withReasoning)),
  });
  let response = await call(true);
  let errText = '';
  if (!response.ok) errText = await response.text();
  if (response.status === 400 && /reasoning/i.test(errText)) {
    response = await call(false); // mismo fallback que askLLM: si el 400 indica incompatibilidad con reasoning, quitar la propiedad y reintentar una sola vez (case-insensitive para el mensaje real "Reasoning is mandatory...")
    if (!response.ok) errText = await response.text();
  }
  if (!response.ok) throw new Error(`Sufficiency classifier HTTP ${response.status}: ${errText.slice(0, 300)}`);
  const payload = await response.json();
  const content = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  if (!content) throw new Error('Respuesta vacía del clasificador de suficiencia');
  return { ...parseStrictJson(content), usage: payload.usage || null };
}

// Content-addressed persistent decision cache wrapper (OPERATIONAL determinism only).
// HIT -> exact persisted result, 0 LLM calls. MISS -> classify ONCE, persist atomically
// (singular winner), reread canonical winner, return it. Disable with CLASSIFIER_CACHE=off.
// Downstream contract {decision, hasSupportedMaterial, specificLimitation, reason, usage}
// is preserved; a backward-compatible `cache` provenance field is added.
async function classifyEvidenceSufficiency(config, model, userMsg, evidenceText) {
  if (process.env.CLASSIFIER_CACHE === 'off') {
    return classifyEvidenceSufficiencyUncached(config, model, userMsg, evidenceText);
  }
  const cache = require('./classifier_decision_cache.js');
  const promptVersion = cache.sha256Hex(cache.nfcLF(CLASSIFIER_SYSTEM_PROMPT));
  const evidence_hash = cache.evidenceHash(evidenceText);
  const parts = {
    classifier_version: CLASSIFIER_VERSION,
    prompt_version: promptVersion,
    model,
    model_config_version: CLASSIFIER_MODEL_CONFIG_VERSION,
    schema_version: CLASSIFIER_SCHEMA_VERSION,
    query: userMsg,
    evidence_hash,
  };
  const key = cache.decisionKey(parts);
  const prov = (status, created_at, llm_calls) => ({
    status, decision_key: key, classifier_version: CLASSIFIER_VERSION, prompt_version: promptVersion,
    model, model_config_version: CLASSIFIER_MODEL_CONFIG_VERSION, schema_version: CLASSIFIER_SCHEMA_VERSION,
    evidence_hash, created_at: created_at || null, llm_calls,
  });
  // ── HIT ──
  let existing = null;
  try { existing = cache.get(key); } catch (e) { existing = null; }
  if (existing && !existing.__corrupt) {
    const r = existing.structured_classifier_result;
    return { decision: r.decision, hasSupportedMaterial: r.hasSupportedMaterial, specificLimitation: r.specificLimitation, reason: r.reason, usage: null, cache: prov('CACHE_HIT', existing.created_at, 0) };
  }
  // ── MISS (or corrupt existing -> re-materialize; never serve corrupt) ──
  const out = await classifyEvidenceSufficiencyUncached(config, model, userMsg, evidenceText); // API failure propagates (fail-closed)
  const structured = { decision: out.decision, hasSupportedMaterial: out.hasSupportedMaterial, specificLimitation: out.specificLimitation, reason: out.reason };
  const record = {
    decision_key: key, query_hash: cache.sha256Hex(cache.nfcLF(userMsg)), evidence_hash,
    classifier_version: CLASSIFIER_VERSION, prompt_version: promptVersion, model,
    model_config_version: CLASSIFIER_MODEL_CONFIG_VERSION, schema_version: CLASSIFIER_SCHEMA_VERSION,
    label: out.decision, structured_classifier_result: structured,
    created_at: new Date().toISOString(), provenance: 'CLASSIFIER_MISS_MATERIALIZATION',
  };
  try {
    cache.putIfAbsent(key, record); // singular winner; loser (EEXIST) just rereads below
  } catch (e) {
    // Store unavailable -> fail-open BYPASS: return the fresh result, flagged, never a wrong/stale one.
    return { ...out, cache: prov('CACHE_BYPASS', record.created_at, 1) };
  }
  const winner = cache.get(key); // reread canonical persisted winner
  if (winner && !winner.__corrupt) {
    const r = winner.structured_classifier_result;
    return { decision: r.decision, hasSupportedMaterial: r.hasSupportedMaterial, specificLimitation: r.specificLimitation, reason: r.reason, usage: out.usage || null, cache: prov('CLASSIFIER_MISS_MATERIALIZATION', winner.created_at, 1) };
  }
  return { ...out, cache: prov('CACHE_BYPASS', record.created_at, 1) };
}

function buildGroundingEvidence(fragments, c3Context = null, marketingContext = null) {
  const rows = (fragments || []).map(f => `[${f.src} — ${f.file}]\n${f.text}`);
  if (c3Context && Array.isArray(c3Context.knowledge)) {
    rows.push(...c3Context.knowledge.map((item, i) => `[KB${i + 1}] ${item.book || ''} — ${item.author || ''}; ${item.source_file || ''}; ${item.source_section || item.topic || ''}\n${item.principle || item.content || ''}`));
  }
  if (marketingContext && Array.isArray(marketingContext.sources)) {
    rows.push(...marketingContext.sources.map((item, i) => `[MARKETING${i + 1}]\n${typeof item === 'string' ? item : JSON.stringify(item)}`));
  }
  return rows.join('\n\n');
}

async function answerGrounded(config, model, system, history, userMsg, options = {}) {
  const classify = options.classify || classifyEvidenceSufficiency;
  const generate = options.generate || askLLM;
  const classification = await classify(config, model, userMsg, options.evidenceText || '');
  const language = options.language || groundedPolicy.detectLanguage(userMsg);
  if (classification.decision === 'INSUFFICIENT' || (classification.decision === 'PARTIAL' && !classification.hasSupportedMaterial)) {
    const preflight = groundedPolicy.enforceSufficiencyOutput(classification.decision, '', {
      language,
      hasSupportedMaterial: classification.hasSupportedMaterial,
      specificLimitation: classification.specificLimitation,
    });
    return { content: preflight.answer, usage: null, classifierUsage: classification.usage || null, outputClaimsBlocked: [], sufficiency: { ...classification, effectiveDecision: preflight.effectiveDecision, generationBypassed: true } };
  }
  let generationSystem = system;
  if (classification.decision === 'PARTIAL') {
    generationSystem += `\n\nEVIDENCE SUFFICIENCY: PARTIAL. Answer only the supported portion. Do not fill gaps with outside knowledge. State this specific evidence limitation: ${classification.specificLimitation}`;
  } else if (classification.decision === 'AMBIGUOUS') {
    generationSystem += '\n\nEVIDENCE SUFFICIENCY: AMBIGUOUS. Give only a bounded, evidence-grounded interpretation or ask for clarification.';
  }
  const generated = await generate(config, model, generationSystem, history, userMsg);
  const guarded = groundedPolicy.enforceSufficiencyOutput(classification.decision, generated.content, {
    language,
    hasSupportedMaterial: classification.hasSupportedMaterial,
    specificLimitation: classification.specificLimitation,
  });
  return { ...generated, content: guarded.answer, classifierUsage: classification.usage || null, sufficiency: { ...classification, effectiveDecision: guarded.effectiveDecision, generationBypassed: guarded.generationBypassed, globalAbstentionRemoved: guarded.globalAbstentionRemoved, specificLimitationAdded: guarded.specificLimitationAdded } };
}

// ─────────── LISTAR MODELOS GRATIS ───────────
async function listFreeModels(config) {
  const r = await fetch(`${config.baseUrl}/models`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
  if (!r.ok) throw new Error(`HTTP ${r.status} al consultar modelos`);
  const j = await r.json();
  return (j.data || []).filter(m => m.id.includes(':free')).map(m => m.id).sort();
}

// ─────────── STRATEGY-F RUNTIME RETRIEVAL (canonical, over kb_chunks_v2) ───────────
// Aligns the E2E agent runtime retrieval with the validated Strategy-F pipeline
// (exact cosine top20 + BM25 top20 -> RRF k=60 -> deterministic rerank -> top5) over
// public.kb_chunks_v2 (763 rows). Delegates to the SHARED canonical implementation in
// retrieval_strategy_f.py (which reuses build_generate.py's validated rank_strategy) rather
// than duplicating the ranking algorithm in JS. Read-only; never mutates corpus/embeddings.
const STRATEGY_F_SCRIPT = path.join(AGENTE, 'retrieval_strategy_f.py');
function strategyFPython() { return process.env.STRATEGY_F_PYTHON || process.env.PYTHON || 'python'; }
function retrieveStrategyF(query, topK = 5) {
  const out = execFileSync(strategyFPython(), [STRATEGY_F_SCRIPT, '--query', String(query), '--top-k', String(topK)],
    { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024, timeout: 120000 });
  const parsed = JSON.parse(out);
  if (parsed.error) throw new Error(`Strategy-F retrieval: ${parsed.error}`);
  return parsed; // { top5:[{rank,chunk_id,content,source_pdf_name,pdf_page_refs,rag_decision,quality_status,warning_flags,provenance,original_query_cosine}], advisory_top1_cosine, ... }
}
// Format Strategy-F hits into the grounded-answer evidence contract (citation-ready), preserving
// downstream fields so existing classifier/answer-generation code consumes it unchanged.
function buildStrategyFEvidence(result) {
  const hits = (result && result.top5) || [];
  const evidenceText = hits.map(h => `[chunk:${h.chunk_id} | source:${h.source_pdf_name} | page:${h.pdf_page_refs}]\n${h.content}`).join('\n\n');
  return { evidenceText, hits, advisoryTop1Cosine: result ? result.advisory_top1_cosine : null, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' };
}
// Canonical grounded retrieval entry for the E2E agent: query -> Strategy-F top5 evidence.
function groundedRetrieve(query, topK = 5) { return buildStrategyFEvidence(retrieveStrategyF(query, topK)); }

module.exports = {
  ROOT, AGENTE, CONFIG, TRANS_DIR, SKOOL_SUBS, CANONICAL_MODEL, DEFAULT_MODEL, CREATIVE_PROMPT_FILE, COPY_FB_PROMPT_FILE,
  loadConfig, saveConfig, tokenize, retrieve, creativeModeRequested, copyFbModeRequested, buildSystem, askLLM, answerGrounded, classifyEvidenceSufficiency, buildGroundingEvidence, listFreeModels, countTranscribed,
  retrieveStrategyF, buildStrategyFEvidence, groundedRetrieve,
  MODES: c3.MODES,
  detectMarketingMode: c3.detectMarketingMode,
  buildCreativeBrief: c3.buildCreativeBrief,
  validateClaims: c3.validateClaims,
  retrieveCreativeKnowledge: c3.retrieveCreativeKnowledge,
  prepareC3Context: c3.prepareC3Context,
  publicC3Summary: c3.publicC3Summary,
  MARKETING_MODES: marketingOS.MODES,
  detectMarketingOSMode: marketingOS.detectMode,
  buildUniversalBrief: marketingOS.buildUniversalBrief,
  retrieveSpecialistKnowledge: marketingOS.retrieveSpecialistKnowledge,
  prepareMarketingContext: marketingOS.prepareMarketingContext,
  publicMarketingSummary: marketingOS.publicSummary
};
