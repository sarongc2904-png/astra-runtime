'use strict';
// KNOWLEDGE_QUERY_PLANNER — per workflow step, emit targeted, bounded Agent V1 queries.
// Applies READ_MINIMUM_NECESSARY_CONTEXT. Never requests the whole KB.
const { MAX_EVIDENCE_PER_STEP, MAX_QUERIES_PER_STEP, DEFAULT_TOP_K } = require('../../config/context_budgets');

// Generic query seeds per domain (business_type is appended for targeting; no vertical hardcoding).
const DOMAIN_QUERIES = {
  MARKET_RESEARCH: ['market context and positioning for {biz}'],
  ICP: ['ideal customer profile and buyer pains for {biz}'],
  OFFER: ['offer design and value proposition for {biz}', 'risk reversal and guarantees for services'],
  FUNNEL: ['funnel design and lead sequencing for {biz}'],
  CREATIVE: ['creative angles and hooks for {biz}'],
  ADS: ['meta ads lead qualification and targeting for {biz}'],
  SALES: ['whatsapp appointment conversion and objection handling'],
  CRO: ['conversion measurement and optimization for {biz}'],
  COPY: ['copywriting frameworks and persuasion for {biz}'],
  INFOPRODUCT: ['infoproduct architecture for {biz}'],
  COURSE: ['course design and curriculum structure'],
  CONTENT: ['marketing guidance for {biz}'],
};

function planForStep(step, brief) {
  const biz = (brief && brief.business_type) || 'the business';
  const seeds = DOMAIN_QUERIES[step.domain] || DOMAIN_QUERIES.CONTENT;
  const bounded = seeds.slice(0, MAX_QUERIES_PER_STEP);
  return bounded.map((tmpl, i) => ({
    query: tmpl.replace('{biz}', biz),
    purpose: `evidence for ${step.name}`,
    domain: step.domain,
    requested_evidence_count: DEFAULT_TOP_K,
    method_context: null, // filled after adjudication if needed
    priority: i === 0 ? 'PRIMARY' : 'SECONDARY',
    max_evidence_chars: MAX_EVIDENCE_PER_STEP,
    step_id: step.step_id,
  }));
}

function plan(workflow, brief) {
  const requests = [];
  for (const step of workflow.steps) {
    const q = planForStep(step, brief);
    step.knowledge_queries = q;
    requests.push(...q);
  }
  return {
    workflow_id: workflow.workflow_id,
    total_queries: requests.length,
    bounded: requests.every(r => r.requested_evidence_count <= DEFAULT_TOP_K),
    requests,
    policy: 'READ_MINIMUM_NECESSARY_CONTEXT',
  };
}

module.exports = { plan, planForStep, DOMAIN_QUERIES };
