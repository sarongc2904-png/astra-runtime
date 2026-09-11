'use strict';
// Campaign360 canonical brief contract alignment. Confirmed defects: "Producto:" was always
// read as product_name (breaking the structured contract where the name comes from the opening
// sentence and "Producto:" holds the type); "Audiencia:" wasn't recognized as buyer(+geography);
// "Mecanismo exacto:" wasn't recognized as mechanism; a multi-line "Restricciones obligatorias:"
// block could vanish entirely instead of being preserved as a USER_PROVIDED_FACT constraint.
// Deterministic regex only — no LLM. Scope: campaign_brief_facts.js exclusively.
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

// ---------- exact structured Método 360 fixture, verbatim from the authorization ----------
const STRUCTURED_METHOD360_BRIEF = [
  'Crea una campaña 360 para Método 360.',
  '',
  'Producto: minicurso grabado.',
  'Precio: $400 MXN.',
  'Audiencia: dueñas de estéticas en México.',
  'Geografía: México.',
  'Objetivo: vender el minicurso.',
  'Mecanismo exacto: enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.',
  '',
  'Restricciones obligatorias:',
  '- No cambiar el nombre Método 360.',
  '- No cambiar el precio de $400 MXN.',
  '- No cambiar la audiencia.',
  '- No cambiar el producto ni convertirlo en mentoría, servicio, membresía o asesoría.',
  '- No cambiar el mecanismo consulta → conversación → cita.',
  '- No inventar métricas, resultados, CAC, CPA, CPL, ROAS, MER, LTV, revenue, margen, conversiones, benchmarks, testimonios, proof, urgencia, escasez ni evidencia.',
  '- Cualquier dato faltante debe mantenerse como UNKNOWN.',
  '- Cualquier idea nueva debe marcarse explícitamente como PROPUESTA.',
  '- No presentar hipótesis como hechos.',
  '',
  'Estructura obligatoria:',
  'Mercado → ICP → Oferta → Funnel → Creatividad → Ads → Conversión → Medición.',
  '',
  'Prioridad comercial:',
  'Ventas > Ingresos > Oportunidades > Leads > Conversaciones > Clics > Métricas de vanidad.',
].join('\n');

// ---------- STRUCTURED_METHOD360_EXACT ----------
t('STRUCTURED_METHOD360_EXACT: every field extracts exactly as specified', () => {
  const f = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  assert.equal(f.product_name.value, 'Método 360');
  assert.equal(f.product_name.status, 'USER_PROVIDED_FACT');
  assert.equal(f.product_type.value, 'minicurso grabado');
  assert.equal(f.product_type.status, 'USER_PROVIDED_FACT');
  assert.equal(f.price.value, '400');
  assert.equal(f.currency.value, 'MXN');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
  assert.equal(f.business_objective.value, 'vender el minicurso');
  assert(/Meta Ads/i.test(f.mechanism.value), f.mechanism.value);
  assert(/WhatsApp/i.test(f.mechanism.value), f.mechanism.value);
  assert(/consulta/i.test(f.mechanism.value), f.mechanism.value);
  assert(/conversaci[oó]n/i.test(f.mechanism.value), f.mechanism.value);
  assert(/cita/i.test(f.mechanism.value), f.mechanism.value);
  assert.equal(f.constraints.status, 'USER_PROVIDED_FACT');
});
t('A. product_name is extracted from the opening sentence, not from "Producto:"', () => {
  const f = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  assert.equal(f.product_name.value, 'Método 360');
  assert.notEqual(f.product_name.value, 'minicurso grabado');
});
t('B. "Producto: minicurso grabado." maps to product_type in this contract, without overwriting product_name', () => {
  const f = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  assert.equal(f.product_type.value, 'minicurso grabado');
  assert.equal(f.product_name.value, 'Método 360');
});
t('C. "Audiencia:" is recognized as buyer, splitting off "en México" as geography', () => {
  const f = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
});
t('C2. "Audiencia:" alone (no explicit Geografía: line) still splits buyer/geography correctly', () => {
  const f = briefFacts.extract('Audiencia: dueñas de estéticas en México.');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
});
t('D. "Mecanismo exacto:" is recognized explicitly as mechanism', () => {
  const f = briefFacts.extract('Mecanismo exacto: enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.');
  assert(/Meta Ads/.test(f.mechanism.value) && /WhatsApp/.test(f.mechanism.value) && f.mechanism.value.includes('→'));
});

// ---------- CONSTRAINTS_PRESERVED ----------
t('CONSTRAINTS_PRESERVED: the full "Restricciones obligatorias:" block is captured verbatim as USER_PROVIDED_FACT', () => {
  const f = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  assert.equal(f.constraints.status, 'USER_PROVIDED_FACT');
  const c = f.constraints.value;
  assert(/No cambiar el nombre Método 360/.test(c), c);
  assert(/No cambiar el precio/.test(c), c);
  assert(/No cambiar la audiencia/.test(c), c);
  assert(/No inventar m[ée]tricas/.test(c), c);
  assert(/UNKNOWN/.test(c), c);
  assert(/PROPUESTA/.test(c), c);
  assert(/No presentar hip[oó]tesis como hechos/.test(c), c);
});
t('CONSTRAINTS_PRESERVED: the block stops at the next structural heading — it does not swallow "Estructura obligatoria" or "Prioridad comercial"', () => {
  const f = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  const c = f.constraints.value;
  assert(!/Estructura obligatoria/i.test(c), c);
  assert(!/Prioridad comercial/i.test(c), c);
  assert(!/Mercado.*ICP.*Oferta/i.test(c), c);
});
t('CONSTRAINTS_PRESERVED: nothing is summarized — every one of the 9 bullet lines survives intact', () => {
  const f = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  const lines = f.constraints.value.split('\n');
  assert.equal(lines.length, 9, JSON.stringify(lines));
});

// ---------- LEGACY_LABELED_BRIEF (F. backward compatibility) ----------
const LABELED_METHOD360_BRIEF = [
  'Producto: Método 360',
  'Tipo: minicurso grabado',
  'Precio: 400 MXN',
  'Comprador: dueñas de estéticas',
  'Geografía: México',
  'Objetivo: vender el minicurso',
  'Mecanismo: Meta Ads para generar consultas, seguido de WhatsApp consulta -> conversación -> cita',
].join('\n');
t('LEGACY_LABELED_BRIEF: "Producto: Método 360" / "Tipo:" / "Comprador:" still work exactly as before', () => {
  const f = briefFacts.extract(LABELED_METHOD360_BRIEF);
  assert.equal(f.product_name.value, 'Método 360');
  assert.equal(f.product_type.value, 'minicurso grabado');
  assert.equal(f.price.value, '400'); assert.equal(f.currency.value, 'MXN');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
  assert.equal(f.business_objective.value, 'vender el minicurso');
  assert(/Meta Ads/.test(f.mechanism.value) && /WhatsApp/.test(f.mechanism.value));
});
t('LEGACY_LABELED_BRIEF: a plain one-line "Restricciones: X" still works exactly as before (not swallowed into block-capture)', () => {
  const f = briefFacts.extract('Restricciones: presupuesto limitado a $5000 MXN');
  assert.equal(f.constraints.value, 'presupuesto limitado a $5000 MXN');
  assert.equal(f.constraints.status, 'USER_PROVIDED_FACT');
});

// ---------- LIVE_NATURAL_BRIEF (previously-authorized natural-language fixture, no labels) ----------
const LIVE_METHOD360_BRIEF_EXACT = [
  'Crea una campaña 360 para Método 360.',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.',
  'Objetivo: vender el minicurso.',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir',
  'consulta → conversación → cita.',
].join('\n');
t('LIVE_NATURAL_BRIEF: the natural-language (no-label) fixture still extracts every fact identically', () => {
  const f = briefFacts.extract(LIVE_METHOD360_BRIEF_EXACT);
  assert.equal(f.product_name.value, 'Método 360');
  assert.equal(f.product_type.value, 'minicurso grabado');
  assert.equal(f.price.value, '400'); assert.equal(f.currency.value, 'MXN');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
  assert.equal(f.business_objective.value, 'vender el minicurso');
  assert(/Meta Ads/.test(f.mechanism.value) && /WhatsApp/.test(f.mechanism.value) && f.mechanism.value.includes('→'));
});

// ---------- extra regression: MIXED_SINGLE_LINE_BRIEF (from an earlier gate) ----------
const MIXED_SINGLE_LINE_BRIEF = 'Crea Método 360, minicurso de $400 MXN para dueñas de estéticas en México. Objetivo: vender el minicurso. Enseña Meta Ads y WhatsApp para pasar de consulta a cita.';
t('regression: MIXED_SINGLE_LINE_BRIEF (no labels, one sentence) is unaffected by the reordering', () => {
  const f = briefFacts.extract(MIXED_SINGLE_LINE_BRIEF);
  assert.equal(f.product_name.value, 'Método 360');
  assert.equal(f.product_type.value, 'minicurso');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
});
t('regression: a brief with ONLY "Producto: X" and no opening "para X" sentence still treats it as product_name (never silently becomes product_type)', () => {
  const f = briefFacts.extract('Producto: Método 360\nPrecio: 400 MXN');
  assert.equal(f.product_name.value, 'Método 360');
  assert.equal(f.product_type.status, 'UNKNOWN');
});
t('determinism: identical structured-brief text yields identical facts + hash', () => {
  const a = briefFacts.extract(STRUCTURED_METHOD360_BRIEF), b = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  assert.deepStrictEqual(a, b);
});
t('nothing is invented: a field genuinely absent from the structured brief stays UNKNOWN', () => {
  const noAudience = STRUCTURED_METHOD360_BRIEF.replace(/^Audiencia:.*$/m, '');
  const f = briefFacts.extract(noAudience);
  assert.equal(f.buyer.status, 'UNKNOWN');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_CANONICAL_BRIEF_CONTRACT_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
