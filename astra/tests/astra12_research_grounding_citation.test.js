'use strict';
const assert = require('assert');
const S = require('../src/specialists/llm_specialists');

const evidence = [
  { chunk_id: 'WEB_1', source_class: 'EXTERNAL_RESEARCH', text: 'Competidor A publica agenda, WhatsApp y CRM para salones en México.' },
  { chunk_id: 'INT_1', source_class: 'INTERNAL_KNOWLEDGE', text: 'Internal method note.' },
];

const noExternal = [{ claim: 'Internal note', source_class: 'INTERNAL_KNOWLEDGE', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'INT_1' }];
const fixedIcp = S.ensureExternalResearchFinding('ICP_SPECIALIST', noExternal, evidence);
assert.strictEqual(fixedIcp[0].evidence_ref, 'WEB_1');
assert.strictEqual(fixedIcp[0].source_class, 'EXTERNAL_RESEARCH');
assert.strictEqual(fixedIcp[0].support_class, 'DIRECTLY_SUPPORTED');
assert(/^EVIDENCIA_EXTERNA:/.test(fixedIcp[0].claim));

const fixedOffer = S.ensureExternalResearchFinding('OFFER_SPECIALIST', [], evidence);
assert.strictEqual(fixedOffer.length, 1);
assert.strictEqual(fixedOffer[0].evidence_ref, 'WEB_1');

const already = [{ claim: 'External cited', source_class: 'EXTERNAL_RESEARCH', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'WEB_1' }];
assert.deepStrictEqual(S.ensureExternalResearchFinding('MARKET_CONTEXT_SPECIALIST', already, evidence), already);

const unrelated = S.ensureExternalResearchFinding('FUNNEL_SPECIALIST', noExternal, evidence);
assert.deepStrictEqual(unrelated, noExternal);

const noWebEvidence = S.ensureExternalResearchFinding('ICP_SPECIALIST', noExternal, [evidence[1]]);
assert.deepStrictEqual(noWebEvidence, noExternal);

console.log('ASTRA12_RESEARCH_GROUNDING_CITATION_REGRESSION PASS');
