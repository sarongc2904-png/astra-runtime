'use strict';
// ASTRA_CAMPAIGN360_MEASUREMENT_DERIVATION_AND_PROPOSAL_PROVENANCE_HARDENING_2026_09_13
// Covers Parts A (diagnostic-condition claim-role), B/C/H (structured provenance diagnostics
// contract), D/E (specificity gate against generic single-anchor false positives), F (live-shaped
// 8-field fixture), G (PROPUESTA repair round-trip). See brief_fidelity_validator.js for the
// underlying mechanism (CLAIM_CONTEXT_FIELD_ROLES/DIAGNOSTIC_TRIGGER, MEASUREMENT_OPERATIONS_GLUE,
// upstreamProposalAnchors/proposalPropagationHits).
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const tests = []; function t(name, fn) { tests.push({ name, fn }); }

const BRIEF = ['Crea una campaña 360 para Método 360.', '',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.', '',
  'Objetivo: vender el minicurso.', '',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.', '',
  'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.'].join('\n');
const facts = briefFacts.extract(BRIEF);
const PROP = 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION';
const INVENTED_RESULT = 'EXPLICIT_PROHIBITION';

function anyViolation(field, text, nodeId = 'measurement') {
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [field]: text } }, { nodeId, upstream_outputs: [] }).violations;
}
function invRes(field, text) {
  return anyViolation(field, text).filter(v => v.type === INVENTED_RESULT && v.category === 'invented_result');
}
function propagation(field, downstream, upstreamClause, upstreamField, upstreamNode = 'whatsapp_conversion') {
  const r = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [field]: downstream } }, {
    nodeId: 'measurement',
    upstream_outputs: [{ work_unit_id: upstreamNode, downstream_payload: { [upstreamField]: upstreamClause } }],
  });
  return r.violations.filter(v => v.type === PROP);
}

// ===================== PART A: DIAGNOSTIC_TRIGGER role =====================
t('A1 MUST PASS: optimization_triggers "baja calificación de leads"', () => {
  assert.deepStrictEqual(invRes('optimization_triggers', 'baja calificación de leads'), []);
});
t('A1-live MUST PASS: exact live text "baja calificación leads"', () => {
  assert.deepStrictEqual(invRes('optimization_triggers', 'baja calificación leads'), []);
});
t('A2 MUST PASS: optimization_triggers "baja respuesta inicial"', () => {
  assert.deepStrictEqual(invRes('optimization_triggers', 'baja respuesta inicial'), []);
});
t('A3 MUST PASS: optimization_triggers "alta tasa de abandono"', () => {
  assert.deepStrictEqual(invRes('optimization_triggers', 'alta tasa de abandono'), []);
});
t('A4 MUST PASS: diagnostic_metrics "tiempo de respuesta"', () => {
  assert.deepStrictEqual(invRes('diagnostic_metrics', 'tiempo de respuesta'), []);
});
t('A5 MUST DETECT (invented_metric): "Baja tu CAC a $20"', () => {
  const v = anyViolation('optimization_triggers', 'Baja tu CAC a $20');
  assert(v.some(x => x.type === INVENTED_RESULT && x.category === 'invented_metric'));
});
t('A6 MUST DETECT: "Aumenta tus ventas 30%"', () => {
  assert(invRes('optimization_triggers', 'Aumenta tus ventas 30%').length >= 1);
});
t('A7 MUST DETECT (guarantee verb, invented_result category): "Te garantizamos más clientes"', () => {
  // The brief's own constraints never prohibit the separate PROHIBITED_CONTENT_PATTERNS
  // 'guarantee' category by name (no "garantía"/"guarantee" text in "No inventes métricas,
  // resultados, CAC, ROAS, LTV, testimonios ni evidencia."), so that category is never activated —
  // but INVENTED_RESULT_CLAIM's own GUARANTEE_VERBS branch fires under the 'invented_result'
  // category regardless, which the brief DOES prohibit ("resultados").
  const v = anyViolation('optimization_triggers', 'Te garantizamos más clientes');
  assert(v.some(x => x.type === INVENTED_RESULT && x.category === 'invented_result'));
});
t('A8 MUST DETECT: "Duplicar citas en 30 días"', () => {
  assert(invRes('optimization_triggers', 'Duplicar citas en 30 días').length >= 1);
});
t('A9 diagnostic_metrics symmetric case: "baja tasa inicial" stays safe', () => {
  assert.deepStrictEqual(invRes('diagnostic_metrics', 'baja tasa inicial'), []);
});
t('A10 role must not leak to unrelated fields (pains untouched, still buyer-scoped)', () => {
  // pains was already BUYER_STATE before this change; confirm still exempt (regression guard).
  assert.deepStrictEqual(invRes('pains', 'Baja ocupación de citas'), []);
});
t('A11 role must not blanket-exempt a DIFFERENT field name in the measurement node', () => {
  // "conversion_metrics" is NOT in CLAIM_CONTEXT_FIELD_ROLES — a genuine claim there still detects.
  assert(invRes('conversion_metrics', 'Aumenta tus ventas 30%').length >= 1);
});
t('A12 primary_outcome strictness untouched by DIAGNOSTIC_TRIGGER addition', () => {
  assert(invRes('primary_outcome', 'Aumenta tus ventas 30%').length >= 1);
});
t('A13 English mirror MUST PASS: optimization_triggers "low lead qualification"', () => {
  // "low"/"qualification" are not in RESULT_CLAIM_VERBS/OUTCOME_TERMS at all — sanity check, zero match expected.
  assert.deepStrictEqual(invRes('optimization_triggers', 'low lead qualification'), []);
});
t('A14 advertiser-voice override fires even with English: "We will increase YOUR leads"', () => {
  assert(invRes('optimization_triggers', 'We will increase YOUR leads').length >= 1);
});

// ===================== PART B/C/H: structured provenance diagnostics =====================
t('B1 propagation violation exposes matched_anchor, downstream_clause, upstream_source_node/path/clause', () => {
  const v = propagation('optimization_triggers', 'activar auditoria gratuita', 'PROPUESTA: ofrecer auditoria gratuita', 'offer_structure', 'offer');
  assert(v.length >= 1);
  const hit = v[0];
  assert.strictEqual(hit.matched_anchor, 'auditoria');
  assert.strictEqual(typeof hit.downstream_clause, 'string');
  assert(hit.downstream_clause.includes('auditoria'));
  assert.strictEqual(hit.upstream_source_node, 'offer');
  assert.strictEqual(hit.upstream_source_path, '$.offer_structure');
  assert(hit.upstream_source_clause.toLowerCase().includes('propuesta'));
  assert(hit.upstream_source_clause.toLowerCase().includes('auditoria'));
  // pre-existing fields must remain present and unchanged in shape
  assert.strictEqual(hit.field_key, 'optimization_triggers');
  assert.strictEqual(hit.leaf_path, '$');
  assert.strictEqual(typeof hit.clause_index, 'number');
  assert.strictEqual(hit.node, 'measurement');
  assert.strictEqual(hit.path, 'node_outputs.measurement.downstream_payload.optimization_triggers');
});
t('H1 diagnostic contract holds across every field/anchor location (no field-specific gap)', () => {
  const combos = [
    ['primary_outcome', 'activar consultoria premium', 'PROPUESTA: vender consultoria premium'],
    ['funnel_metrics', 'seguimiento de consultoria premium', 'PROPUESTA: vender consultoria premium'],
    ['conversion_metrics', 'tasa de consultoria premium', 'PROPUESTA: vender consultoria premium'],
    ['diagnostic_metrics', 'diagnostico de consultoria premium', 'PROPUESTA: vender consultoria premium'],
    ['optimization_triggers', 'activar consultoria premium', 'PROPUESTA: vender consultoria premium'],
    ['measurement_cadence', 'revisar consultoria premium semanal', 'PROPUESTA: vender consultoria premium'],
  ];
  for (const [field, downstream, upstream] of combos) {
    const v = propagation(field, downstream, upstream, 'offer_structure', 'offer');
    assert(v.length >= 1, `${field} should detect`);
    for (const hit of v) {
      assert.strictEqual(typeof hit.matched_anchor, 'string');
      assert.strictEqual(typeof hit.downstream_clause, 'string');
      assert.strictEqual(typeof hit.upstream_source_clause, 'string');
      assert(hit.upstream_source_node);
      assert(hit.upstream_source_path);
    }
  }
});

// ===================== PART D/E: specificity gate against generic anchors =====================
t('D1 worked example: "recordatorio 24h" -> "post-recordatorio" timing reference MUST NOT fail', () => {
  const v = propagation('diagnostic_metrics', 'medir tiempo de respuesta post-recordatorio', 'PROPUESTA: enviar recordatorio 24h', 'follow_up');
  assert.deepStrictEqual(v, []);
});
t('D2 worked example: "ofrecer descuento del 20%" reused verbatim unmarked MUST fail', () => {
  const v = propagation('optimization_triggers', 'ofrecer descuento del 20%', 'PROPUESTA: ofrecer descuento del 20%', 'recovery');
  assert(v.length >= 1);
});
t('E1 single generic anchor "tiempo" alone never establishes propagation', () => {
  const v = propagation('diagnostic_metrics', 'tiempo de respuesta general', 'PROPUESTA: reducir tiempo de espera', 'follow_up');
  assert.deepStrictEqual(v, []);
});
t('E2 single generic anchor "enlace" alone never establishes propagation', () => {
  const v = propagation('conversion_metrics', 'clics en el enlace principal', 'PROPUESTA: compartir enlace de pago', 'offer_structure', 'offer');
  assert.deepStrictEqual(v, []);
});
t('E3 single generic anchor "calificacion" alone never establishes propagation', () => {
  const v = propagation('optimization_triggers', 'calificacion baja detectada', 'PROPUESTA: mejorar calificacion del equipo', 'offer_structure', 'offer');
  assert.deepStrictEqual(v, []);
});
t('E4 a DISTINCTIVE single anchor (not generic vocabulary) still detects on its own — regression guard', () => {
  const v = propagation('optimization_triggers', 'activar auditoria', 'PROPUESTA: upsell auditoria', 'offer_structure', 'offer');
  assert(v.length >= 1);
});
t('E5 generic-vocabulary exclusion is global, not field-scoped — also protects a non-measurement node', () => {
  // Source clause's only non-glue, non-measurement-operations word is "revisar" (a PROPOSAL_GLUE-
  // style ordinary verb not itself in either glue list, kept deliberately out of the downstream
  // text below); "tiempo"/"inicial"/"respuesta" are all MEASUREMENT_OPERATIONS_GLUE and must not
  // independently trigger propagation in ANY field/node, not just the measurement node's own 5.
  const v = propagation('conversion_intent', 'medir tiempo inicial de respuesta', 'PROPUESTA: revisar tiempo inicial', 'follow_up');
  assert.deepStrictEqual(v, []);
});
t('E6 generic-vocabulary exclusion never exempts a genuinely distinctive word placed in the SAME clause shape', () => {
  const v = propagation('conversion_intent', 'seguimiento por webinar demo', 'PROPUESTA: lanzar webinar demo', 'follow_up');
  assert(v.length >= 1);
});

// ===================== PART F: live-shaped 8-field fixture =====================
t('F1 all 8 live field/anchor locations: legitimate derived-measurement phrasing PASSes', () => {
  const upstream = { work_unit_id: 'whatsapp_conversion', downstream_payload: { follow_up: 'PROPUESTA: enviar recordatorio 24h y ofrecer seguimiento por enlace' } };
  const legit = [
    ['primary_outcome', 'compras completadas del minicurso'],
    ['funnel_metrics', 'consultas generadas mediante el envio de mensajes de WhatsApp'],
    ['conversion_metrics', 'tasa de clic en el enlace de WhatsApp'],
    ['diagnostic_metrics', 'tiempo de respuesta inicial'],
    ['diagnostic_metrics', 'calificacion inicial del lead'],
    ['optimization_triggers', 'post publicado sin respuesta en 24 horas'],
    ['optimization_triggers', 'baja calificacion de leads'],
    ['measurement_cadence', 'medicion inicial y luego cada 7 dias'],
  ];
  for (const [field, text] of legit) {
    const r = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [field]: text } }, { nodeId: 'measurement', upstream_outputs: [upstream] });
    const propV = r.violations.filter(v => v.type === PROP);
    assert.deepStrictEqual(propV, [], `${field}="${text}" should not propagate-detect: ${JSON.stringify(propV)}`);
  }
});
t('F2 a genuine unlabeled proposal planted in those SAME 8 fields still DETECTs', () => {
  const upstream = { work_unit_id: 'offer', downstream_payload: { offer_structure: 'PROPUESTA: vender auditoria exprés adicional' } };
  const planted = [
    ['primary_outcome', 'activar auditoria exprés adicional'],
    ['funnel_metrics', 'seguimiento de auditoria exprés adicional'],
    ['conversion_metrics', 'tasa de auditoria exprés adicional'],
    ['diagnostic_metrics', 'diagnostico de auditoria exprés adicional'],
    ['optimization_triggers', 'activar auditoria exprés adicional'],
    ['measurement_cadence', 'revisar auditoria exprés adicional semanal'],
  ];
  for (const [field, text] of planted) {
    const r = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [field]: text } }, { nodeId: 'measurement', upstream_outputs: [upstream] });
    const propV = r.violations.filter(v => v.type === PROP);
    assert(propV.length >= 1, `${field}="${text}" should propagate-detect`);
  }
});
t('F3 primary_outcome: "compras completadas" PASSes when objective is selling', () => {
  assert.deepStrictEqual(invRes('primary_outcome', 'compras completadas'), []);
});
t('F4 primary_outcome: "agendar citas" DETECTs (MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION) when objective is selling and cita is only the mechanism endpoint', () => {
  // primary_outcome is role BUSINESS_OUTCOME in FINAL_SYNTHESIS_FIELD_ROLES['13_measurement_kpis']
  // — this role-coherence check (checkMechanismToCampaignConversionPromotion) is cross-node, only
  // ever runs at validateFinalSynthesis, and reads deliverable['13_measurement_kpis'].primary_outcome
  // — never touched or weakened by any change in this hardening pass.
  const r = fidelity.validateFinalSynthesis(facts, { deliverable: { '13_measurement_kpis': { primary_outcome: 'agendar citas' } } });
  assert(r.violations.some(v => v.type === 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION' && v.field_key === 'primary_outcome'));
});
t('F5 primary_outcome: unlabeled genuinely propagated tactical proposal DETECTs', () => {
  const v = propagation('primary_outcome', 'activar consultoria premium', 'PROPUESTA: vender consultoria premium', 'offer_structure', 'offer');
  assert(v.length >= 1);
});

// ===================== PART G: PROPUESTA repair preservation =====================
t('G1 genuine propagated proposal: violation -> repair -> revalidate CLEAN', () => {
  const upstream = { work_unit_id: 'offer', downstream_payload: { offer_structure: 'PROPUESTA: vender consultoria premium' } };
  const output = { downstream_payload: { optimization_triggers: 'activar consultoria premium' } };
  const before = fidelity.validateOutputAgainstFacts(facts, output, { nodeId: 'measurement', upstream_outputs: [upstream] });
  assert(before.violations.some(v => v.type === PROP));
  const { output: repaired } = fidelity.repairUpstreamProposalStatus(facts, output, [upstream]);
  assert(repaired.downstream_payload.optimization_triggers.toLowerCase().includes('propuesta'));
  const after = fidelity.validateOutputAgainstFacts(facts, repaired, { nodeId: 'measurement', upstream_outputs: [upstream] });
  assert.deepStrictEqual(after.violations.filter(v => v.type === PROP), []);
});
t('G2 derived-measurement reference: no violation raised, repair is a no-op', () => {
  const upstream = { work_unit_id: 'whatsapp_conversion', downstream_payload: { follow_up: 'PROPUESTA: enviar recordatorio 24h' } };
  const output = { downstream_payload: { diagnostic_metrics: 'medir tiempo de respuesta post-recordatorio' } };
  const before = fidelity.validateOutputAgainstFacts(facts, output, { nodeId: 'measurement', upstream_outputs: [upstream] });
  assert.deepStrictEqual(before.violations.filter(v => v.type === PROP), []);
  const { output: repaired, repairs } = fidelity.repairUpstreamProposalStatus(facts, output, [upstream]);
  assert.deepStrictEqual(repairs.filter(r => r.field_key === 'diagnostic_metrics'), []);
  assert.strictEqual(repaired.downstream_payload.diagnostic_metrics, output.downstream_payload.diagnostic_metrics);
});

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); }
    catch (e) { fail++; console.log('FAIL', name, e.stack); }
  }
  console.log(`MEASUREMENT_DERIVATION_AND_PROPOSAL_PROVENANCE_HARDENING_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
