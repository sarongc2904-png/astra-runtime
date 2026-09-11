'use strict';
// ASTRA_CAMPAIGN360_EXPLICIT_PROHIBITION_OCCURRENCE_DIAGNOSTICS — an EXPLICIT_PROHIBITION
// violation used to carry only {type, fact_field, category, field_key}: no pointer to which
// occurrence in the node's own output actually triggered it. This adds deterministic,
// non-LLM diagnostics (matched_text, matched_pattern, local_clause, clause_index,
// occurrence_start) sourced verbatim from the field's real text — never re-summarized. It must
// change no PASS/FAIL decision, no negation semantics, and no category scoping: every existing
// EXPLICIT_PROHIBITION assertion in the sibling suites is required to keep passing unmodified.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = [];
function t(name, fn) { tests.push({ name, fn }); }
function violations(constraints, output, fieldKey = 'limitations', nodeId = 'ads') {
  const facts = { constraints: { status: 'USER_PROVIDED_FACT', value: constraints } };
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [fieldKey]: output } }, { nodeId })
    .violations.filter(v => v.type === 'EXPLICIT_PROHIBITION');
}

const NO_TESTIMONIALS = 'No usar testimonios sin evidencia.';

// ========== A. affirmative occurrence carries real matched_text + local_clause ==========
t('A affirmative testimonios violation carries matched_text and the real local_clause', () => {
  const found = violations(NO_TESTIMONIALS, 'Usar testimonios de clientes');
  assert.equal(found.length, 1, JSON.stringify(found));
  const v = found[0];
  assert.equal(v.category, 'testimonials');
  assert.equal(v.matched_text, 'testimonios');
  assert.equal(v.local_clause, 'Usar testimonios de clientes');
  assert.equal(typeof v.clause_index, 'number');
  assert.equal(typeof v.matched_pattern, 'string');
  assert.equal(v.field_key, 'limitations');
});

// ========== B. negated occurrence: unchanged PASS behavior ==========
t('B negated "No usar testimonios" still PASSes (no violation, no diagnostic)', () => {
  assert.deepStrictEqual(violations(NO_TESTIMONIALS, 'No usar testimonios'), []);
});

// ========== C. UNKNOWN status: unchanged PASS behavior ==========
t('C "testimonios = UNKNOWN" still PASSes', () => {
  assert.deepStrictEqual(violations(NO_TESTIMONIALS, 'testimonios = UNKNOWN'), []);
});

// ========== D. absence phrasing: unchanged PASS behavior ==========
t('D "no hay testimonios" still PASSes', () => {
  assert.deepStrictEqual(violations(NO_TESTIMONIALS, 'no hay testimonios'), []);
});

// ========== E. mixed field: diagnostic points ONLY at the affirmative occurrence ==========
t('E a negated occurrence plus an affirmative one in the same field diagnoses only the affirmative', () => {
  const found = violations(NO_TESTIMONIALS, 'No usar testimonios falsos. Usar testimonios reales de clientes.');
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].local_clause.trim(), 'Usar testimonios reales de clientes');
  assert.equal(found[0].matched_text, 'testimonios');
});

// ========== F. nested/array leaf preserves correct diagnostics ==========
t('F a violation inside a nested object leaf still carries correct matched_text/local_clause', () => {
  const found = violations(NO_TESTIMONIALS, { es: 'Usar testimonios de clientes satisfechos', notes: ['UNKNOWN'] });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].matched_text, 'testimonios');
  assert.equal(found[0].local_clause.trim(), 'Usar testimonios de clientes satisfechos UNKNOWN');
});

// ========== occurrence_start points at the real match position ==========
t('occurrence_start indexes the real matched_text position inside local_clause\'s containing text', () => {
  const text = 'Usar testimonios de clientes';
  const found = violations(NO_TESTIMONIALS, text);
  assert.equal(found.length, 1);
  const v = found[0];
  assert.equal(typeof v.occurrence_start, 'number');
  assert.equal(text.slice(v.occurrence_start, v.occurrence_start + v.matched_text.length), 'testimonios');
});

// ========== G/H/I sanity: sibling suites are the actual GREEN gates for these letters; this
// file only re-confirms the diagnostic addition does not alter their outcome for a shared case.
t('G/H category scoping is untouched: unrelated category never activates', () => {
  assert.deepStrictEqual(violations(NO_TESTIMONIALS, 'oferta limitada'), []);
});
t('same-field multiple distinct occurrences each get their own diagnostic', () => {
  const found = violations(NO_TESTIMONIALS, 'Usar testimonios y presentar testimonios.');
  assert.equal(found.length, 2, JSON.stringify(found));
  for (const v of found) assert.equal(v.matched_text, 'testimonios');
});

(async () => {
  let pass = 0; let fail = 0;
  for (const test of tests) {
    try { await test.fn(); pass += 1; console.log('PASS', test.name); }
    catch (error) { fail += 1; console.log('FAIL', test.name, error.stack); }
  }
  console.log(`EXPLICIT_PROHIBITION_OCCURRENCE_DIAGNOSTICS_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
