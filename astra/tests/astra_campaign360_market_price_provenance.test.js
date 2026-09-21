'use strict';
const assert = require('assert');
const N = require('../src/workflows/market_context_fidelity_normalizer');

const facts = {
  problem_context: { status: 'USER_PROVIDED_FACT', value: 'Los negocios pueden perder oportunidades por falta de seguimiento.' },
  price: { status: 'USER_PROVIDED_FACT', value: '1397' },
};

const input = {
  findings: [
    { claim: 'Competidor publica $1,897 MXN/mes', source_class: 'EXTERNAL_RESEARCH', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'WEB_1' },
  ],
  downstream_payload: {
    problem_context: 'Problema inventado con precio $1,897 MXN.',
    market_assumptions: ['Competidor cobra $1,897 MXN', 'Mercado fragmentado'],
    constraints: 'Usar $1,897 MXN como referencia competitiva.',
  },
};

const r = N.normalizeMarketContextOutput(input, facts);

assert.equal(r.output.downstream_payload.problem_context, facts.problem_context.value, 'explicit problem context must be restored');
assert(!JSON.stringify(r.output.downstream_payload.market_assumptions).includes('$1,897'), 'competitor price must not leak into market_assumptions');
assert(!JSON.stringify(r.output.downstream_payload.constraints).includes('$1,897'), 'competitor price must not leak into market constraints');
assert(JSON.stringify(r.output.downstream_payload).includes('[PRECIO_COMPETITIVO_EXTERNO_VER_EVIDENCIA]'), 'redaction marker expected');

// Evidence remains intact and attributable; only downstream propagation is blocked.
assert.equal(r.output.findings[0].claim, 'Competidor publica $1,897 MXN/mes');
assert(r.repairs.some(x => x.repair_type === 'REDACT_EXTERNAL_COMPETITOR_PRICE_FROM_MARKET_PAYLOAD'));

console.log('ASTRA_CAMPAIGN360_MARKET_PRICE_PROVENANCE_TEST_RESULT pass=1 fail=0');
