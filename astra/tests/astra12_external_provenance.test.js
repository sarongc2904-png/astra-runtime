'use strict';
const assert = require('assert');
const LLM = require('../src/specialists/llm_specialists');

let pass = 0;
let fail = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log('PASS', name);
  } catch (err) {
    fail++;
    failures.push(`${name} :: ${err.message}`);
    console.log('FAIL', name, '::', err.message);
  }
}

function inputWithEvidence(evidence) {
  return {
    task_id: 'ASTRA12_PROVENANCE',
    work_unit_id: 'market_context',
    specialist_type: 'MARKET_CONTEXT_SPECIALIST',
    task_brief: { objective: 'CLIENT_ACQUISITION', business_type: 'CRM para estéticas', language: 'es', constraints: {} },
    canonical_brief_facts: {},
    upstream_outputs: [],
    selected_methods: { primary_method: 'METHOD_MARKET_CONTEXT', primary_method_object: null, secondary_methods: [] },
    knowledge_evidence: evidence,
    constraints: {},
    output_requirements: { must_cite: true },
  };
}

function mockLLM(evidenceRef, supportClass = 'DIRECTLY_SUPPORTED') {
  return async () => ({
    raw: JSON.stringify({
      findings: [{ claim: 'Hallazgo sustentado.', support_class: supportClass, evidence_ref: evidenceRef }],
      recommendations: [],
      decisions: [],
      assumptions: [],
      conflicts: [],
      confidence: 0.5,
      current_research_required: [],
      downstream_payload: { problem_context: 'contexto', market_assumptions: [], constraints: [] },
    }),
    usage: { prompt: 10, completion: 10 },
  });
}

(async () => {
  const webEvidence = [{
    chunk_id: 'WEB_1',
    // Reproduces the current hardened workflow's intermediate relabeling.
    source_class: 'INTERNAL_KNOWLEDGE',
    source_id: 'https://example.com/reviews',
    source_pdf_name: 'WEB_RESEARCH:Example Reviews | https://example.com/reviews',
    text: 'Clientes mencionan rapidez de respuesta como criterio de compra.',
  }];

  await test('WEB_n survives intermediate INTERNAL_KNOWLEDGE relabeling', async () => {
    const out = await LLM.runLLMSpecialist(inputWithEvidence(webEvidence), { llm: mockLLM('E1') });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.output.findings[0].source_class, 'EXTERNAL_RESEARCH');
  });

  await test('direct WEB_n citation resolves as EXTERNAL_RESEARCH', async () => {
    const out = await LLM.runLLMSpecialist(inputWithEvidence(webEvidence), { llm: mockLLM('WEB_1') });
    assert.strictEqual(out.output.findings[0].source_class, 'EXTERNAL_RESEARCH');
  });

  await test('prompt labels WEB_n evidence as EXTERNAL_RESEARCH', async () => {
    const prompt = LLM.buildPrompt(inputWithEvidence(webEvidence));
    assert(prompt.user.includes('class:EXTERNAL_RESEARCH'));
    assert(prompt.user.includes('https://example.com/reviews'));
  });

  await test('ordinary internal evidence remains INTERNAL_KNOWLEDGE', async () => {
    const internal = [{ chunk_id: 'C1', source_class: 'INTERNAL_KNOWLEDGE', source_pdf_name: 'Internal.pdf', text: 'Internal evidence.' }];
    const out = await LLM.runLLMSpecialist(inputWithEvidence(internal), { llm: mockLLM('E1') });
    assert.strictEqual(out.output.findings[0].source_class, 'INTERNAL_KNOWLEDGE');
  });

  await test('non-direct findings remain INFERENCE', async () => {
    const out = await LLM.runLLMSpecialist(inputWithEvidence(webEvidence), { llm: mockLLM('E1', 'INFERENCE') });
    assert.strictEqual(out.output.findings[0].source_class, 'INFERENCE');
  });

  await test('sourceClassForFinding uses explicit EXTERNAL_RESEARCH too', async () => {
    const evidence = [{ chunk_id: 'X1', source_class: 'EXTERNAL_RESEARCH', text: 'external' }];
    assert.strictEqual(LLM.sourceClassForFinding({ support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }, evidence), 'EXTERNAL_RESEARCH');
  });

  console.log(`\nASTRA12_EXTERNAL_PROVENANCE_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) {
    console.log(failures.join('\n'));
    process.exit(1);
  }
})();
