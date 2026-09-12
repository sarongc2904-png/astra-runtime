'use strict';
// ASTRA_CAMPAIGN360_NEGATIVE_CONSTRAINT_AND_PROPOSAL_STATUS_REMEDIATION — confirmed live defects
// (job df50af36-5a14-4449-9b31-19b33a96b8e8, request 1282e2f5-30f0-4ee9-af34-1ee4ed5e1fd7):
//
// DEFECT A — NEGATIVE CONSTRAINT BYPASS: the brief prohibited "resultados"/"evidencia", yet
// final_synthesis carried "PROPUESTA: Citas que pagan más en 30 días" (invented result) and
// "PROPUESTA: Scripts WhatsApp listos y probados" (invented evidence) with
// brief_fidelity_violations = []. Root cause: PROHIBITION_CATEGORY_TERMS/PROHIBITED_CONTENT_
// PATTERNS in brief_fidelity_validator.js had NO category at all for "resultados" or "evidencia"
// — those words never activated anything, so EXPLICIT_PROHIBITION never even looked for them,
// marker or no marker (this file's EXPLICIT_PROHIBITION has never treated PROPUESTA as an escape
// for any category — the gap was upstream, in category coverage). Separately, invented_metric's
// order-dependent pattern missed "Objetivo ROAS 4x" (qualifier BEFORE the acronym).
// Fix: two new categories (invented_result, invented_evidence) using semantic/magnitude-aware
// detection (never a hardcoded phrase), a bidirectional invented_metric pattern, and a
// FUTURE_HEDGE_CUE escape so a genuinely forward-looking proposal ("testimonios futuros si
// existen") is not conflated with an assertion that the content exists now.
//
// DEFECT B — PROPOSAL STATUS LOSS: new tactical specifics ("Campaña umbrella con 3 ejecuciones",
// "Test 3 hooks y 2 creativos por hook", "Recordatorio 48h y 24h") reached final_synthesis as flat
// assertions. Root cause: UNLABELED_PROPOSAL's only pattern source (CONFIRMED_UNSUPPORTED_
// ADDITIONS) is a closed list of phrases from an earlier, different confirmed defect — it was
// never built to catch open-ended new counts/cadences/structures, and its own gate
// (IDEA_MARKING_RULE) requires the brief to literally say "mark new ideas as PROPUESTA", which
// the live Método 360 brief never does.
// Fix: a new semantic-category pattern set (TACTICAL_DETAIL_PATTERNS — a number bound to a
// tactical unit, or a recognized campaign-structure term), gated more broadly (any brief that
// already prohibits inventing content implies new tactics must be labeled too) but still
// requiring facts.constraints to be a USER_PROVIDED_FACT, so R1 (a brief with no constraints at
// all) stays completely unaffected.
//
// Both fixes live inside the EXISTING EXPLICIT_PROHIBITION / UNLABELED_PROPOSAL mechanisms —
// no second validator, no hardcoded exact phrases, no relaxed negative-constraint semantics.
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

const METHOD360_CONSTRAINTS = 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
function factsWith(constraintsValue = METHOD360_CONSTRAINTS, overrides = {}) {
  const base = {
    product_name: { status: 'UNKNOWN', value: null }, product_type: { status: 'UNKNOWN', value: null },
    price: { status: 'UNKNOWN', value: null }, currency: { status: 'UNKNOWN', value: null },
    buyer: { status: 'UNKNOWN', value: null }, geography: { status: 'UNKNOWN', value: null },
    business_objective: { status: 'UNKNOWN', value: null }, mechanism: { status: 'UNKNOWN', value: null },
    constraints: constraintsValue ? { status: 'USER_PROVIDED_FACT', value: constraintsValue } : { status: 'UNKNOWN', value: null },
  };
  return { ...base, ...overrides };
}
function violations(text, fieldKey = 'hooks', nodeId = 'creative_strategy', constraintsValue = METHOD360_CONSTRAINTS) {
  const facts = factsWith(constraintsValue);
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [fieldKey]: text } }, { nodeId }).violations;
}
function detects(text, type) { const v = violations(text); assert(v.some(x => x.type === type), JSON.stringify({ text, v })); }
function passes(text) { assert.deepStrictEqual(violations(text), []); }

// ========== CASE 1-4: negative constraint bypass via PROPUESTA — DETECT ==========
t('CASE 1 result claim: PROPUESTA: "Citas que pagan más en 30 días" => DETECT', () => detects('PROPUESTA: "Citas que pagan más en 30 días"', 'EXPLICIT_PROHIBITION'));
t('CASE 2 evidence claim: PROPUESTA: "Scripts WhatsApp listos y probados" => DETECT', () => detects('PROPUESTA: Scripts WhatsApp listos y probados', 'EXPLICIT_PROHIBITION'));
t('CASE 3 testimonials claim: PROPUESTA: "Mostrar testimonios de clientas satisfechas" => DETECT', () => detects('PROPUESTA: Mostrar testimonios de clientas satisfechas', 'EXPLICIT_PROHIBITION'));
t('CASE 4 metric claim (reversed order): PROPUESTA: "Objetivo ROAS 4x" => DETECT', () => detects('PROPUESTA: Objetivo ROAS 4x', 'EXPLICIT_PROHIBITION'));

// ========== CASE 5-6: operational proposals without a claim — PASS ==========
t('CASE 5 PROPUESTA: "Medir compras del minicurso" => PASS (operational, no claim)', () => passes('PROPUESTA: Medir compras del minicurso'));
t('CASE 6 PROPUESTA: "Probar tres hooks" => PASS (operational, no claim)', () => passes('PROPUESTA: Probar tres hooks'));

// ========== CASE 7-8: mixed fact + proposal clause ==========
t('CASE 7 "Dueñas de estéticas México; segmentar fríos, cálidos y similares" => DETECT unlabeled proposal (second clause)', () => detects('Dueñas de estéticas México; segmentar fríos, cálidos y similares', 'UNLABELED_PROPOSAL'));
t('CASE 8 "Dueñas de estéticas México; PROPUESTA: segmentar fríos, cálidos y similares" => PASS', () => passes('Dueñas de estéticas México; PROPUESTA: segmentar fríos, cálidos y similares'));

// ========== CASE 9-14: proposal status coverage (tactical detail) ==========
t('CASE 9 "Campaña umbrella con 3 ejecuciones" (no supporting fact) => DETECT unlabeled proposal', () => detects('Campaña umbrella con 3 ejecuciones', 'UNLABELED_PROPOSAL'));
t('CASE 10 "PROPUESTA: Campaña umbrella con 3 ejecuciones" => PASS', () => passes('PROPUESTA: Campaña umbrella con 3 ejecuciones'));
t('CASE 11 "Test 3 hooks y 2 creativos por hook" => DETECT', () => detects('Test 3 hooks y 2 creativos por hook', 'UNLABELED_PROPOSAL'));
t('CASE 12 "PROPUESTA: Test 3 hooks y 2 creativos por hook" => PASS', () => passes('PROPUESTA: Test 3 hooks y 2 creativos por hook'));
t('CASE 13 "Recordatorio 48h y 24h" => DETECT', () => detects('Recordatorio 48h y 24h', 'UNLABELED_PROPOSAL'));
t('CASE 14 "PROPUESTA: Recordatorio 48h y 24h" => PASS', () => passes('PROPUESTA: Recordatorio 48h y 24h'));

// ========== CASE 15-18: result/evidence claim precision (no false positives on operational verbs) ==========
t('CASE 15 "PROPUESTA: medir ventas" => PASS (operational verb, no magnitude)', () => passes('PROPUESTA: medir ventas'));
t('CASE 16 "PROPUESTA: obtener 50 ventas" => DETECT (quantified result claim)', () => detects('PROPUESTA: obtener 50 ventas', 'EXPLICIT_PROHIBITION'));
t('CASE 17 "PROPUESTA: recopilar casos de éxito futuros si existen" => PASS (future hedge, not an existing-evidence claim)', () => passes('PROPUESTA: recopilar casos de éxito futuros si existen'));
t('CASE 18 "PROPUESTA: usar nuestros casos de éxito" => DETECT (asserts evidence that does not exist)', () => detects('PROPUESTA: usar nuestros casos de éxito', 'EXPLICIT_PROHIBITION'));

// ========== CASE 19: array/nested — only the offending entry is a claim ==========
t('CASE 19 nested array: ["PROPUESTA: probar hook A", "PROPUESTA: aumentar ventas 40%"] => second entry DETECT (marker never excuses a negative-constraint claim)', () => {
  const v = violations(['PROPUESTA: probar hook A', 'PROPUESTA: aumentar ventas 40%'], 'hooks');
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_result'), JSON.stringify(v));
});

// ========== CASE 20: known canonical fact exact match — no false positive ==========
t('CASE 20 canonical business_objective known = "vender el minicurso", echoed exactly => PASS, no false positive', () => {
  const facts = factsWith(METHOD360_CONSTRAINTS, { business_objective: { status: 'USER_PROVIDED_FACT', value: 'vender el minicurso' } });
  const { violations: v } = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { campaign_objective: 'vender el minicurso' } }, { nodeId: 'ads' });
  assert.deepStrictEqual(v, []);
});

// ========== Occurrence diagnostics preserved on the new categories ==========
t('occurrence diagnostics: invented_result violation carries matched_text/local_clause/clause_index/occurrence_start', () => {
  const v = violations('PROPUESTA: "Citas que pagan más en 30 días"').filter(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_result');
  assert(v.length > 0, 'expected an invented_result violation');
  for (const item of v) {
    assert.equal(typeof item.matched_text, 'string');
    assert.equal(typeof item.matched_pattern, 'string');
    assert.equal(typeof item.local_clause, 'string');
    assert.equal(typeof item.clause_index, 'number');
    assert.equal(typeof item.occurrence_start, 'number');
    assert.equal(item.field_key, 'hooks');
  }
});
t('occurrence diagnostics: new UNLABELED_PROPOSAL (tactical detail) violation carries matched_text/local_clause/clause_index/occurrence_start', () => {
  const v = violations('Recordatorio 48h y 24h').filter(x => x.type === 'UNLABELED_PROPOSAL');
  assert(v.length > 0);
  for (const item of v) {
    assert.equal(typeof item.matched_text, 'string');
    assert.equal(typeof item.matched_pattern, 'string');
    assert.equal(typeof item.local_clause, 'string');
    assert.equal(typeof item.clause_index, 'number');
    assert.equal(typeof item.occurrence_start, 'number');
  }
});

// ========== Regression guard: R1-style false-positive protection stays intact ==========
t('REGRESSION GUARD: no constraints at all (R1-style brief) => new tactical-detail check never fires', () => {
  const v = violations('Campaña umbrella con 3 ejecuciones; Recordatorio 48h y 24h', 'structure', 'ads', null);
  assert.deepStrictEqual(v.filter(x => x.type === 'UNLABELED_PROPOSAL'), []);
});
t('REGRESSION GUARD: required mechanism-preservation prose ("generar consultas ... convertir consulta -> cita") never false-positives as invented_result', () => {
  passes('Enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.');
});
t('REGRESSION GUARD: canonical price "$400 MXN" restated verbatim never false-positives as a tactical numeric detail', () => {
  const facts = factsWith(METHOD360_CONSTRAINTS, { price: { status: 'USER_PROVIDED_FACT', value: '400' }, currency: { status: 'USER_PROVIDED_FACT', value: 'MXN' } });
  const { violations: v } = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { offer_structure: 'Precio: $400 MXN, sin cambios.' } }, { nodeId: 'offer' });
  assert.deepStrictEqual(v.filter(x => x.type === 'UNLABELED_PROPOSAL'), []);
});

// ========== Preserve prior fix: UNKNOWN_FACT_FABRICATION must not regress ==========
t('UNKNOWN_FACT_FABRICATION regression guard: business_objective UNKNOWN -> deliverable asserts CLIENT_ACQUISITION still DETECTs', () => {
  const facts = factsWith(METHOD360_CONSTRAINTS);
  const synthesis = { deliverable: { '1_business_objective': 'CLIENT_ACQUISITION' } };
  const { violations: v } = fidelity.validateFinalSynthesis(facts, synthesis);
  assert(v.some(x => x.type === 'UNKNOWN_FACT_FABRICATION'), JSON.stringify(v));
});

// ========== LIVE REGRESSION FIXTURE — job df50af36-5a14-4449-9b31-19b33a96b8e8 ==========
t('LIVE FIXTURE: the confirmed live final_synthesis content now produces violations for every category of the defect', () => {
  const facts = factsWith(METHOD360_CONSTRAINTS, {
    product_name: { status: 'USER_PROVIDED_FACT', value: 'Método 360' },
    business_objective: { status: 'USER_PROVIDED_FACT', value: 'vender el minicurso' },
  });
  const synthesis = {
    deliverable: {
      '1_business_objective': 'vender el minicurso',
      '7_creative_strategy': {
        hooks: ['PROPUESTA: "Citas que pagan más en 30 días"', 'PROPUESTA: Scripts WhatsApp listos y probados'],
        objection_coverage: 'PROPUESTA: Muestra casos de uso operativo y plan 30 días; ofrecer demo breve.',
      },
      '8_ad_strategy': {
        audience_approach: 'Dueñas de estéticas México; segmentar fríos, cálidos y similares',
        structure: 'Campaña umbrella con 3 ejecuciones; PROPUESTA: anuncio→landing→WhatsApp',
        creative_testing: 'Test 3 hooks y 2 creativos por hook',
      },
      '12_whatsapp_followup_closing': { follow_up: 'Recordatorio 48h y 24h; enviar resumen y pasos previos a la cita' },
    },
  };
  const { violations: v } = fidelity.validateFinalSynthesis(facts, synthesis);
  assert(v.length > 0, 'expected brief_fidelity_violations to be non-empty for the live fixture');
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_result'), 'expected a prohibited result claim violation: ' + JSON.stringify(v));
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_evidence'), 'expected a prohibited evidence claim violation: ' + JSON.stringify(v));
  assert(v.some(x => x.type === 'UNLABELED_PROPOSAL'), 'expected at least one unlabeled-proposal violation: ' + JSON.stringify(v));
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_NEGATIVE_CONSTRAINT_AND_PROPOSAL_STATUS_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
