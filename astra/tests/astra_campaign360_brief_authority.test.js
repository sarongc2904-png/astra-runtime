'use strict';
// Regression suite for Campaign360 explicit Brief Fidelity authority.
// Deterministic/offline: no web, LLM, or production writes.
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const H = require('../src/workflows/marketing_campaign_360_hardened');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }
function assertExplicit(f, value) {
  assert.equal(f.value, value);
  assert.equal(f.status, 'USER_PROVIDED_FACT');
  assert.equal(f.provenance, 'DATO_INTERNO');
  assert.equal(f.confidence, 'EXPLICITO');
  assert.equal(f.authority, 'DATO_INTERNO_EXPLICITO');
}

// Case 1
t('Demo actual: 3 días is preserved globally, including outside OFERTA ACTUAL', () => {
  const f = briefFacts.extract('CONTROL ACTUAL\nDemo actual: 3 días.');
  assertExplicit(f.demo_duration, '3 días');
  assertExplicit(f.demo_actual, '3 días');
  assert(!f.explicit_unknowns.includes('demo_duration'));
});

// Case 2
t('Precio mensual: $1,397 MXN is authoritative principal price', () => {
  const f = briefFacts.extract('OFERTA PRINCIPAL\nPrecio mensual: $1,397 MXN');
  assertExplicit(f.monthly_price, '1397');
  assertExplicit(f.price, '1397');
});

// Case 3
t('Plan anual: $13,000 MXN is preserved as explicit internal fact', () => {
  const f = briefFacts.extract('OFERTA ANUAL\nPlan anual: $13,000 MXN');
  assertExplicit(f.annual_price, '13000');
});

// Case 4
t('external market trial context cannot overwrite explicit current demo', () => {
  const f = briefFacts.extract([
    'CONTROL ACTUAL',
    'Demo actual: 3 días',
    'INVESTIGACIÓN',
    'Fuente externa: la prueba común de mercado es de 7 a 14 días.',
  ].join('\n'));
  assertExplicit(f.demo_duration, '3 días');
  assert.equal(f.demo_duration.value, '3 días');
});

// Case 5
t('two contradictory explicit current demos become CONFLICTO_INTERNO, never UNKNOWN or arbitrarily selected', () => {
  const f = briefFacts.extract([
    'Demo actual: 3 días',
    'Demo actual: 7 días',
  ].join('\n'));
  assert.equal(f.demo_duration.status, 'CONFLICTO_INTERNO');
  assert.equal(f.demo_duration.value, null);
  assert.deepStrictEqual(f.demo_duration.candidates, ['3 días', '7 días']);
  assert.equal(f.demo_duration.evidence.length, 2);
  assert(/aclaraci/i.test(f.demo_duration.recommendation));
  assert.equal(f.demo_actual.status, 'CONFLICTO_INTERNO');
});

// Authority order must remain deterministic and explicit.
t('authority order is fixed and puts explicit internal facts first and UNKNOWN last', () => {
  assert.deepStrictEqual(briefFacts.AUTHORITY_ORDER, [
    'DATO_INTERNO_EXPLICITO',
    'DATO_INTERNO_IMPLICITO_FUERTEMENTE_ANCLADO',
    'DATO_CONFIRMADO_EN_CONTEXTO_ESTRUCTURADO',
    'INVESTIGACION_EXTERNA',
    'INFERENCIA',
    'PROPUESTA',
    'UNKNOWN',
  ]);
});

// Known fact denial defense in depth.
t('known demo cannot be degraded downstream to UNKNOWN', () => {
  const f = briefFacts.extract('Demo actual: 3 días');
  const out = { downstream_payload: { constraints: 'Demo actual desconocida.' } };
  const r = fidelity.validateOutputAgainstFacts(f, out, { nodeId: 'offer' });
  assert(r.violations.some(v => v.type === 'KNOWN_FACT_DENIAL' && v.fact_field === 'demo_duration'), JSON.stringify(r.violations));
});

// Conflict preflight: no retrieval/model spend, no arbitrary winner.
t('Campaign360 stops before execution when explicit internal facts conflict', async () => {
  const r = await H.run('Demo actual: 3 días\nDemo actual: 7 días\nCrea una Campaign360 para un CRM.', {
    mode: 'deterministic',
    retrieve: false,
  });
  assert.equal(r.workflow_state_status, 'WAITING_FOR_INPUT');
  assert.equal(r.reason, 'BRIEF_INTERNAL_CONFLICT');
  assert.equal(r.cost.model_calls, 0);
  assert(r.brief_internal_conflicts.some(x => x.field === 'demo_duration'));
  assert.equal(r.synthesis, null);
});

// Existing epistemic taxonomy is additive, not weakened.
t('existing fact statuses remain available and conflict status is additive', () => {
  for (const x of ['USER_PROVIDED_FACT', 'INFERENCE', 'PROPOSAL', 'UNKNOWN', 'CONFLICTO_INTERNO']) {
    assert(briefFacts.FACT_STATUS.includes(x), x);
  }
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass++; console.log('PASS', x.name); }
    catch (e) { fail++; console.log('FAIL', x.name, '::', e && e.stack || e); }
  }
  console.log(`\nASTRA_CAMPAIGN360_BRIEF_AUTHORITY_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
