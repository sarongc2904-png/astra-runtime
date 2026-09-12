'use strict';
// ASTRA_CAMPAIGN360_PROPOSAL_STATUS_PROPAGATION_REMEDIATION — confirmed live defect
// (job 8a8644f2-7e6e-47ae-bc04-a27562eb9d9e, request d53a1bf1-09f7-4a45-b517-d809c5f1a258):
// whatsapp_conversion failed closed correctly (fail-closed behavior itself was NOT the bug), but
// for two DISTINCT, confirmed root causes traced through the full lifecycle (upstream node output
// → downstream_payload → whatsapp_conversion input → whatsapp_conversion output → deterministic
// proposal repair → brief fidelity validation):
//
// DEFECT A — REPAIR GATE TOO STRICT (marketing_campaign_360_hardened.js's processNode()):
// repair was only ever ATTEMPTED when EVERY violation on the node was
// UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION. The live node's violations were a genuine MIX of that
// type (qualification: propietaria/salon/reservas propagated from an upstream PROPUESTA, and
// recovery: oferta) PLUS plain UNLABELED_PROPOSAL (follow_up: "24h", recovery: "48h" — brand-new
// tactical details with no upstream anchor at all) — so repair was skipped ENTIRELY, even for the
// propagation violations repairUpstreamProposalStatus could already fix cleanly on their own.
// Reproduced and confirmed offline before any fix (see "LIVE FIXTURE" below).
//
// DEFECT B — NO REPAIR PATH FOR NEW TACTICAL ADDITIONS (brief_fidelity_validator.js):
// repairUpstreamProposalStatus was ENTIRELY anchor-based — it could only ever repair a word that
// had appeared after an upstream "PROPUESTA:" marker. A tactical detail invented FRESH inside
// whatsapp_conversion itself (no upstream anchor exists for "recordatorio 24h" — nothing upstream
// ever proposed it) had literally no repair mechanism; UNLABELED_PROPOSAL just failed closed.
//
// Fix: (1) processNode()'s repair gate now attempts repair when every violation is EITHER
// repairable type (UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION or UNLABELED_PROPOSAL) — any OTHER
// type (EXPLICIT_PROHIBITION, *_SUBSTITUTION, KNOWN_FACT_DENIAL, UNKNOWN_FACT_FABRICATION, ...)
// still skips repair and fails closed immediately, unchanged; (2) repairUpstreamProposalStatus
// now also repairs local, non-upstream-anchored UNLABELED_PROPOSAL hits sourced from
// TACTICAL_DETAIL_PATTERNS (the same source checkUnlabeledProposal itself validates against) —
// deliberately EXCLUDING CONFIRMED_UNSUPPORTED_ADDITIONS (testimonials/deadline/webinar demo/...),
// which are a separate, more serious defect class that must keep failing closed for a human to
// address, never silently auto-labeled by this mechanical repair (confirmed by a real regression
// caught while building this fix: astra_campaign360_node_fidelity_diagnostic_propagation.test.js
// specifically requires "webinar demo sin marcar como propuesta" to stay a hard FAILED).
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

const METHOD360_CONSTRAINTS = 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
function factsWith(overrides = {}) {
  const base = {
    product_name: { status: 'UNKNOWN', value: null }, product_type: { status: 'UNKNOWN', value: null },
    price: { status: 'UNKNOWN', value: null }, currency: { status: 'UNKNOWN', value: null },
    buyer: { status: 'UNKNOWN', value: null }, geography: { status: 'UNKNOWN', value: null },
    business_objective: { status: 'UNKNOWN', value: null }, mechanism: { status: 'UNKNOWN', value: null },
    constraints: { status: 'USER_PROVIDED_FACT', value: METHOD360_CONSTRAINTS },
  };
  return { ...base, ...overrides };
}
function violate(facts, text, fieldKey, nodeId, upstream_outputs = []) {
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [fieldKey]: text } }, { nodeId, upstream_outputs }).violations;
}

// ========== CASO A — plain fact restated, no PROPUESTA required ==========
t('CASO A brief mechanism fact restated plainly => no violation, no PROPUESTA required', () => {
  const facts = factsWith({ mechanism: { status: 'USER_PROVIDED_FACT', value: 'WhatsApp para convertir consulta → conversación → cita' } });
  const v = violate(facts, 'Usar WhatsApp para convertir consulta → conversación → cita', 'mechanism', 'whatsapp_conversion');
  assert.deepStrictEqual(v, []);
});

// ========== CASO B — upstream PROPUESTA reused unmarked downstream ==========
t('CASO B upstream PROPUESTA anchor reused unmarked downstream => DETECT propagation loss', () => {
  const facts = factsWith();
  const upstream = [{ work_unit_id: 'icp', downstream_payload: { qualification_signals: 'PROPUESTA: calificar si es propietaria del salón' } }];
  const v = violate(facts, 'calificar si es propietaria del salón', 'qualification', 'whatsapp_conversion', upstream);
  assert(v.some(x => x.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION'), JSON.stringify(v));
});

// ========== CASO C-H — new tactical additions born inside whatsapp_conversion ==========
t('CASO C "recordatorio 24h" (new tactical addition, no brief support) => DETECT', () => {
  const v = violate(factsWith(), 'recordatorio 24h', 'follow_up', 'whatsapp_conversion');
  assert(v.some(x => x.type === 'UNLABELED_PROPOSAL'), JSON.stringify(v));
});
t('CASO D "si no responde 48h" => DETECT', () => {
  const v = violate(factsWith(), 'si no responde 48h', 'recovery', 'whatsapp_conversion');
  assert(v.some(x => x.type === 'UNLABELED_PROPOSAL'), JSON.stringify(v));
});
t('CASO E "contenido breve de valor" => DETECT', () => {
  const v = violate(factsWith(), 'contenido breve de valor', 'follow_up', 'whatsapp_conversion');
  assert(v.some(x => x.type === 'UNLABELED_PROPOSAL'), JSON.stringify(v));
});
t('CASO F "opción agendar llamada" => DETECT', () => {
  const v = violate(factsWith(), 'opción agendar llamada', 'follow_up', 'whatsapp_conversion');
  assert(v.some(x => x.type === 'UNLABELED_PROPOSAL'), JSON.stringify(v));
});
t('CASO G "oferta limitada" propagated from an upstream PROPUESTA anchor => DETECT (via propagation, not a new hardcoded exception)', () => {
  const upstream = [{ work_unit_id: 'offer', downstream_payload: { risk_reduction: 'PROPUESTA: oferta con seguimiento' } }];
  const v = violate(factsWith(), 'oferta limitada', 'recovery', 'whatsapp_conversion', upstream);
  assert(v.some(x => x.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION'), JSON.stringify(v));
});
t('CASO H "lead magnet" (new tactical addition) => DETECT', () => {
  const v = violate(factsWith(), 'lead magnet', 'recovery', 'whatsapp_conversion');
  assert(v.some(x => x.type === 'UNLABELED_PROPOSAL'), JSON.stringify(v));
});

// ========== CASO I/J — explicit prohibition precedence over PROPUESTA ==========
t('CASO I "PROPUESTA: aumentar ventas 30%" under "no inventar resultados" => EXPLICIT_PROHIBITION DETECT', () => {
  const v = violate(factsWith(), 'PROPUESTA: aumentar ventas 30%', 'hooks', 'creative_strategy');
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_result'), JSON.stringify(v));
});
t('CASO J "PROPUESTA: scripts WhatsApp probados" under "no inventar evidencia" => EXPLICIT_PROHIBITION DETECT', () => {
  const v = violate(factsWith(), 'PROPUESTA: scripts WhatsApp probados', 'follow_up', 'whatsapp_conversion');
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_evidence'), JSON.stringify(v));
});

// ========== CASO K — user fact must not be downgraded ==========
t('CASO K "dueñas de estéticas en México" (user fact) restated exactly => not flagged as unlabeled proposal', () => {
  const facts = factsWith({ buyer: { status: 'USER_PROVIDED_FACT', value: 'dueñas de estéticas en México' } });
  const v = violate(facts, 'dueñas de estéticas en México', 'audience_approach', 'ads');
  assert.deepStrictEqual(v.filter(x => x.type === 'UNLABELED_PROPOSAL' || x.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION'), []);
});

// ========== CASO L — a correctly labeled derived strategy passes ==========
t('CASO L "PROPUESTA: usar preguntas de calificación antes de presentar el minicurso" => valid PROPUESTA, PASS', () => {
  const v = violate(factsWith(), 'PROPUESTA: usar preguntas de calificación antes de presentar el minicurso', 'qualification', 'whatsapp_conversion');
  assert.deepStrictEqual(v.filter(x => x.type === 'UNLABELED_PROPOSAL' || x.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION'), []);
});

// ========== LIVE FIXTURE — job 8a8644f2-7e6e-47ae-bc04-a27562eb9d9e ==========
const LIVE_UPSTREAM = [
  { work_unit_id: 'icp', downstream_payload: { qualification_signals: 'PROPUESTA: calificar si es propietaria del salon y si acepta reservas' } },
  { work_unit_id: 'offer', downstream_payload: { risk_reduction: 'PROPUESTA: oferta con seguimiento' } },
];
const LIVE_OUTPUT = {
  downstream_payload: {
    qualification: 'confirmar si es propietaria. confirmar si tiene salon. preguntar por reservas actuales',
    follow_up: 'recordatorio 24h, contenido breve de valor, opcion agendar llamada',
    recovery: 'si no responde 48h: mensaje con oferta limitada y lead magnet recordatorio',
  },
};
t('LIVE FIXTURE: reproduces all 6 confirmed live violations before repair', () => {
  const facts = factsWith();
  const v = fidelity.validateOutputAgainstFacts(facts, LIVE_OUTPUT, { nodeId: 'whatsapp_conversion', upstream_outputs: LIVE_UPSTREAM }).violations;
  assert(v.filter(x => x.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION').length >= 3, JSON.stringify(v));
  assert(v.some(x => x.type === 'UNLABELED_PROPOSAL' && x.field_key === 'follow_up'), JSON.stringify(v));
  assert(v.some(x => x.type === 'UNLABELED_PROPOSAL' && x.field_key === 'recovery'), JSON.stringify(v));
  assert(v.some(x => x.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION' && x.field_key === 'recovery' && x.matched_anchor === 'oferta'), JSON.stringify(v));
});
t('LIVE FIXTURE: deterministic repair resolves every violation, single PROPUESTA prefix per clause (no double-prefix), and facts survive untouched', () => {
  const facts = factsWith();
  const repaired = fidelity.repairUpstreamProposalStatus(facts, LIVE_OUTPUT, LIVE_UPSTREAM);
  const second = fidelity.validateOutputAgainstFacts(facts, repaired.output, { nodeId: 'whatsapp_conversion', upstream_outputs: LIVE_UPSTREAM });
  assert.deepStrictEqual(second.violations, [], JSON.stringify(second.violations));
  // No double-prefix: exactly one "PROPUESTA:" per repaired field, at the start.
  for (const value of Object.values(repaired.output.downstream_payload)) {
    assert.equal((value.match(/PROPUESTA:/g) || []).length <= (value.split(/[.!?\n]/).length), true, value);
    assert(!/PROPUESTA:\s*PROPUESTA:/i.test(value), `double-prefixed: ${value}`);
  }
  assert.deepStrictEqual(LIVE_OUTPUT.downstream_payload.qualification, 'confirmar si es propietaria. confirmar si tiene salon. preguntar por reservas actuales', 'input must not be mutated');
});

// ========== Repair gate: mixed violation types still get repaired (Defect A) ==========
t('DEFECT A REGRESSION GUARD: a mix of UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION and UNLABELED_PROPOSAL on the SAME node no longer skips repair', () => {
  const facts = factsWith();
  const upstream = [{ work_unit_id: 'icp', downstream_payload: { qualification_signals: 'PROPUESTA: calificar si es propietaria' } }];
  const output = { downstream_payload: { qualification: 'confirmar si es propietaria', follow_up: 'recordatorio 24h' } };
  const before = fidelity.validateOutputAgainstFacts(facts, output, { nodeId: 'whatsapp_conversion', upstream_outputs: upstream }).violations;
  assert(before.some(v => v.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION') && before.some(v => v.type === 'UNLABELED_PROPOSAL'), 'fixture must reproduce a genuine mix of both types');
  const repaired = fidelity.repairUpstreamProposalStatus(facts, output, upstream);
  const after = fidelity.validateOutputAgainstFacts(facts, repaired.output, { nodeId: 'whatsapp_conversion', upstream_outputs: upstream }).violations;
  assert.deepStrictEqual(after, []);
});

// ========== FALSE_POSITIVE_CONTROL: CONFIRMED_UNSUPPORTED_ADDITIONS must NOT be auto-repaired ==========
t('FALSE_POSITIVE_CONTROL: "webinar demo" (CONFIRMED_UNSUPPORTED_ADDITIONS, a separate/older defect class) is NOT auto-repaired by this mechanism — stays a violation', () => {
  const facts = factsWith({ constraints: { status: 'USER_PROVIDED_FACT', value: 'Cualquier idea nueva debe marcarse explícitamente como PROPUESTA.' } });
  const output = { downstream_payload: { stages: 'webinar demo sin marcar como propuesta' } };
  const before = fidelity.validateOutputAgainstFacts(facts, output, { nodeId: 'funnel' }).violations;
  assert(before.some(v => v.type === 'UNLABELED_PROPOSAL'), JSON.stringify(before));
  const repaired = fidelity.repairUpstreamProposalStatus(facts, output, []);
  assert.deepStrictEqual(repaired.repairs, [], 'CONFIRMED_UNSUPPORTED_ADDITIONS must not be silently auto-labeled');
  const after = fidelity.validateOutputAgainstFacts(facts, repaired.output, { nodeId: 'funnel' }).violations;
  assert(after.some(v => v.type === 'UNLABELED_PROPOSAL'), 'must still fail closed, unrepaired');
});

// ========== USER_PROVIDED_FACT must never be downgraded to a proposal by repair ==========
t('FALSE_POSITIVE_CONTROL: repair never touches a field that has no violation at all (USER_PROVIDED_FACT content untouched)', () => {
  const facts = factsWith({ buyer: { status: 'USER_PROVIDED_FACT', value: 'dueñas de estéticas' } });
  const output = { downstream_payload: { audience_approach: 'dueñas de estéticas en México' } };
  const repaired = fidelity.repairUpstreamProposalStatus(facts, output, []);
  assert.deepStrictEqual(repaired.repairs, []);
  assert.equal(repaired.output.downstream_payload.audience_approach, 'dueñas de estéticas en México');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_PROPOSAL_STATUS_PROPAGATION_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
