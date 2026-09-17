'use strict';

const fs = require('fs');
const router = require('../knowledge/creative_knowledge_router.js');

const DEFAULT_MAX_EVIDENCE = 12;

function sourceOf(e = {}) {
  return e.source_file || e.source_pdf_name || e.sourceDocument || null;
}

function isCreativeIntent(intent = {}) {
  return !!(intent.wantsVisual || intent.wantsCopy || intent.wantsMeta || intent.wantsAndromeda);
}

function localAndromeda(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return [];
  return [{
    evidence_id: 'ANDROMEDA:1',
    family: 'andromeda_local',
    source_file: 'META_ANDROMEDA_VERIFIED_2026.md',
    excerpt: fs.readFileSync(sourcePath, 'utf8').slice(0, 1800),
    match_type: 'local_versioned_source',
  }];
}

async function retrieveFamily({ kbUrl, kbKey, family, query, topK, fetchImpl = fetch }) {
  const response = await fetchImpl(kbUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-astra-next-key': kbKey,
    },
    body: JSON.stringify({ family, query, top_k: topK }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`KNOWLEDGE_RETRIEVAL_FAILED:${family}:${response.status}`);
  return Array.isArray(body.results) ? body.results : [];
}

async function prepareCreativeRequest(input, options = {}) {
  const request = String(input || '').trim();
  if (!request) throw new Error('EMPTY_REQUEST');

  const plan = router.buildPlan(request);
  if (!isCreativeIntent(plan.intent)) {
    return {
      status: 'BYPASS_NON_CREATIVE',
      request,
      plan,
      evidence: [],
      evidence_verdict: null,
    };
  }

  // Explicit overrides, including an intentionally empty value, must win over ENV.
  // This is required for fail-closed behavior and deterministic testing.
  const kbUrl = options.kbUrl ?? process.env.ASTRA_NEXT_KB_URL ?? '';
  const kbKey = options.kbKey ?? process.env.ASTRA_NEXT_KB_API_KEY ?? '';
  const andromedaPath = options.andromedaPath ?? process.env.ASTRA_NEXT_ANDROMEDA_SOURCE ?? '';
  const maxEvidence = Math.min(options.maxEvidence ?? plan.max_total_evidence_chunks ?? DEFAULT_MAX_EVIDENCE, DEFAULT_MAX_EVIDENCE);

  if (!kbUrl || !kbKey) {
    return {
      status: 'BLOCKED_KNOWLEDGE_UNAVAILABLE',
      request,
      plan,
      evidence: [],
      evidence_verdict: { ready: false, violations: ['KNOWLEDGE_BRIDGE_NOT_CONFIGURED'] },
    };
  }

  const localCount = plan.queries.filter(q => q.family === 'andromeda_local').length;
  const remoteQueries = plan.queries.filter(q => q.family !== 'andromeda_local');
  const remoteBudget = Math.max(0, maxEvidence - localCount);
  const perRemote = remoteQueries.length ? Math.max(1, Math.floor(remoteBudget / remoteQueries.length)) : 0;
  const evidence = [];

  for (const q of plan.queries) {
    if (q.family === 'andromeda_local') {
      evidence.push(...localAndromeda(andromedaPath));
      continue;
    }
    const rows = await retrieveFamily({
      kbUrl,
      kbKey,
      family: q.family,
      query: q.query,
      topK: Math.min(4, perRemote || 1),
      fetchImpl: options.fetchImpl,
    });
    evidence.push(...rows);
  }

  const bounded = evidence.slice(0, maxEvidence);
  const verdict = router.validateEvidence(request, bounded);

  if (!verdict.ready) {
    return {
      status: 'BLOCKED_KNOWLEDGE_GAP',
      request,
      plan,
      evidence: bounded,
      evidence_verdict: verdict,
    };
  }

  const compactEvidence = bounded.map((e, i) => ({
    evidence_id: e.evidence_id || `E${i + 1}`,
    family: e.family || null,
    source: sourceOf(e),
    excerpt: String(e.excerpt || e.content || '').slice(0, 1200),
  }));

  return {
    status: 'READY_WITH_EVIDENCE',
    request,
    plan,
    evidence: bounded,
    evidence_pack: compactEvidence,
    evidence_verdict: verdict,
    enforcement: {
      policy: 'NO_CREATIVE_WITHOUT_EVIDENCE',
      max_evidence_chunks: maxEvidence,
      generator_may_run: true,
    },
  };
}

function buildGroundedCreativeInstruction(prepared) {
  if (!prepared || prepared.status !== 'READY_WITH_EVIDENCE') {
    throw new Error('CREATIVE_GENERATION_BLOCKED');
  }
  return [
    'You are ASTRA NEXT Creative Director.',
    'Use the evidence pack below as the only external knowledge basis for material design, advertising, copywriting, Meta Ads, or Andromeda claims.',
    'Do not invent business facts, performance numbers, testimonials, discounts, guarantees, or results.',
    'Separate direct evidence from creative inference.',
    'Every material decision must cite one or more supplied evidence_id values, unless explicitly classified as INFERENCE.',
    'If the evidence is insufficient, return BLOCKED_KNOWLEDGE_GAP instead of improvising expert knowledge.',
    '',
    `USER REQUEST:\n${prepared.request}`,
    '',
    `EVIDENCE PACK:\n${JSON.stringify(prepared.evidence_pack)}`,
  ].join('\n');
}

module.exports = {
  isCreativeIntent,
  prepareCreativeRequest,
  buildGroundedCreativeInstruction,
};
