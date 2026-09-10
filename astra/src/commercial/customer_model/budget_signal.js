'use strict';
// [ASTRA-11G §M] Budget / ability-to-pay discipline. ASTRA does NOT infer personal income,
// wealth, or ability to pay from geography, job title, device, or spending language.
// Only commercial budget *signals* are represented. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const BUDGET_SIGNALS = Object.freeze(['BUDGET_DECLARED', 'PRICE_SENSITIVE', 'FINANCING_REQUIRED', 'BUDGET_FLEXIBLE', 'NO_BUDGET_SIGNAL', 'UNKNOWN']);

// Controlled concept -> signal map. Note: a price complaint is a PRICE_SENSITIVE *signal*,
// never a statement about the customer's income.
const CONCEPT_SIGNAL = Object.freeze({
  PRICE_CONCERN: 'PRICE_SENSITIVE',
  PRICE_ACCEPTANCE: 'BUDGET_FLEXIBLE',
  FINANCING_DEMAND: 'FINANCING_REQUIRED',
});

// classifyBudgetSignal({ observations, explicit }) -> frozen assessment
//   explicit: { signal, evidence_refs, declared_amount? } — B2B declared budget etc.
function classifyBudgetSignal({ observations = [], explicit = null } = {}) {
  if (explicit && BUDGET_SIGNALS.includes(explicit.signal)) {
    return deepFreeze(mk({
      signal: explicit.signal, basis: 'OBSERVED', evidence_refs: explicit.evidence_refs || [],
      declared_amount: explicit.declared_amount != null ? explicit.declared_amount : null,
      mix: {}, note: 'explicitly supplied (e.g. declared company budget)',
    }));
  }
  const mix = {};
  const ev = [];
  for (const o of observations) {
    if (o.status !== 'OBSERVED') continue;
    const s = CONCEPT_SIGNAL[o.normalized_concept];
    if (s) { mix[s] = (mix[s] || 0) + 1; ev.push(...o.evidence_refs); }
  }
  const present = Object.keys(mix);
  let signal, basis = 'ANALYTICAL';
  if (present.length === 0) { signal = 'NO_BUDGET_SIGNAL'; basis = 'UNKNOWN'; }
  else if (present.length >= 2) signal = 'MIXED_SIGNALS_PRESENT'; // preserved, see note
  else signal = present[0];
  if (signal === 'MIXED_SIGNALS_PRESENT') {
    // preserve the split rather than average it away; expose the dominant + all present
    signal = present.sort((a, b) => mix[b] - mix[a] || (a < b ? -1 : 1))[0];
    return deepFreeze(mk({ signal, basis, evidence_refs: [...new Set(ev)].sort(), declared_amount: null, mix, note: 'multiple budget signals present in the sample — dominant shown, full mix preserved; NO income/wealth inference' }));
  }
  return deepFreeze(mk({ signal, basis, evidence_refs: [...new Set(ev)].sort(), declared_amount: null, mix, note: 'commercial budget signal only — NO personal income or wealth inference' }));
}

function mk(x) {
  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'BudgetSignalAssessment',
    signal: x.signal, basis: x.basis, evidence_refs: x.evidence_refs,
    declared_amount: x.declared_amount, signal_mix: x.mix,
    note: x.note, generated_by: 'deterministic:ucdm/customer_model/budget',
  };
  body.budget_signal_id = 'cmbg_' + sha256Hex(canonicalize({ ...body, budget_signal_id: undefined }));
  return body;
}

const INCOME_INFERENCE_RE = /\b(income|salary|salario|ingresos?|earns?|net worth|wealth|patrimonio|gana \$?\d|can afford because|rich|poor|clase (alta|baja|media))\b/i;

function validateBudgetSignal(b) {
  const errors = [];
  if (!BUDGET_SIGNALS.includes(b.signal)) errors.push(`bad budget signal "${b.signal}"`);
  if (['BUDGET_DECLARED', 'PRICE_SENSITIVE', 'FINANCING_REQUIRED', 'BUDGET_FLEXIBLE'].includes(b.signal) && b.evidence_refs.length === 0) errors.push('a concrete budget signal needs evidence_refs');
  if (INCOME_INFERENCE_RE.test(JSON.stringify({ note: b.note, amount: b.declared_amount }).replace(b.note, ''))) errors.push('budget signal must not encode an income/wealth inference');
  return { valid: errors.length === 0, errors };
}

module.exports = { BUDGET_SIGNALS, CONCEPT_SIGNAL, classifyBudgetSignal, validateBudgetSignal };
