'use strict';
// TASK_DECOMPOSER — TASK_BRIEF/intent -> workflow DAG (ordered, validated, cycle-checked).
// Deterministic step ids. Generic workflow support. Does NOT execute specialists.
const crypto = require('crypto');

function stepId(workflowSeed, name) {
  return 'S_' + crypto.createHash('sha256').update(workflowSeed + '|' + name).digest('hex').slice(0, 10);
}

// Canonical MULTI_STEP_MARKETING skeleton (generic; no vertical hardcoding).
const MULTI_STEP_TEMPLATE = [
  { name: 'market_context', specialist_type: 'MARKET_RESEARCH_SPECIALIST', deps: [], domain: 'MARKET_RESEARCH' },
  { name: 'icp', specialist_type: 'ICP_SPECIALIST', deps: ['market_context'], domain: 'ICP' },
  { name: 'offer', specialist_type: 'OFFER_SPECIALIST', deps: ['icp'], domain: 'OFFER' },
  { name: 'funnel', specialist_type: 'FUNNEL_SPECIALIST', deps: ['offer', 'icp'], domain: 'FUNNEL' },
  { name: 'creative_strategy', specialist_type: 'CREATIVE_STRATEGY_SPECIALIST', deps: ['icp', 'offer'], domain: 'CREATIVE' },
  { name: 'ads', specialist_type: 'META_ADS_SPECIALIST', deps: ['offer', 'funnel', 'creative_strategy'], domain: 'ADS' },
  { name: 'whatsapp_conversion', specialist_type: 'WHATSAPP_SALES_SPECIALIST', deps: ['funnel'], domain: 'SALES' },
  { name: 'measurement', specialist_type: 'CRO_SPECIALIST', deps: ['funnel', 'ads', 'whatsapp_conversion'], domain: 'CRO' },
];

// Single-intent -> one-node (or tiny) workflow map.
const SINGLE_INTENT_MAP = {
  MARKET_RESEARCH: [{ name: 'market_context', specialist_type: 'MARKET_RESEARCH_SPECIALIST', deps: [], domain: 'MARKET_RESEARCH' }],
  OFFER_DESIGN: [{ name: 'offer', specialist_type: 'OFFER_SPECIALIST', deps: [], domain: 'OFFER' }],
  FUNNEL_DESIGN: [{ name: 'funnel', specialist_type: 'FUNNEL_SPECIALIST', deps: [], domain: 'FUNNEL' }],
  COPYWRITING: [{ name: 'copy', specialist_type: 'COPY_SPECIALIST', deps: [], domain: 'COPY' }],
  CREATIVE_STRATEGY: [{ name: 'creative_strategy', specialist_type: 'CREATIVE_STRATEGY_SPECIALIST', deps: [], domain: 'CREATIVE' }],
  META_ADS: [{ name: 'ads', specialist_type: 'META_ADS_SPECIALIST', deps: [], domain: 'ADS' }],
  WHATSAPP_SALES: [{ name: 'whatsapp_conversion', specialist_type: 'WHATSAPP_SALES_SPECIALIST', deps: [], domain: 'SALES' }],
  INFOPRODUCT: [{ name: 'infoproduct', specialist_type: 'INFOPRODUCT_SPECIALIST', deps: [], domain: 'INFOPRODUCT' }],
  COURSE_CREATION: [{ name: 'course', specialist_type: 'COURSE_BUILDER_SPECIALIST', deps: [], domain: 'COURSE' }],
  VIDEO_SCRIPT: [{ name: 'video_script', specialist_type: 'VIDEO_SCRIPT_SPECIALIST', deps: [], domain: 'CREATIVE' }],
  STORYBOARD: [{ name: 'storyboard', specialist_type: 'STORYBOARD_SPECIALIST', deps: [], domain: 'CREATIVE' }],
  CRO: [{ name: 'cro', specialist_type: 'CRO_SPECIALIST', deps: [], domain: 'CRO' }],
};

function buildNodes(intent) {
  if (intent === 'MULTI_STEP_MARKETING' || intent === 'CLIENT_ACQUISITION') return MULTI_STEP_TEMPLATE;
  if (SINGLE_INTENT_MAP[intent]) return SINGLE_INTENT_MAP[intent];
  return [{ name: 'generic_marketing', specialist_type: 'GENERIC_SPECIALIST', deps: [], domain: 'CONTENT' }];
}

// cycle detection (DFS) + Kahn topological sort. Returns { order } or throws on cycle.
function topoSort(steps) {
  const byName = new Map(steps.map(s => [s.name, s]));
  for (const s of steps) for (const d of s.deps) if (!byName.has(d)) throw new Error(`unknown dependency: ${s.name} -> ${d}`);
  const indeg = new Map(steps.map(s => [s.name, 0]));
  const adj = new Map(steps.map(s => [s.name, []]));
  for (const s of steps) for (const d of s.deps) { adj.get(d).push(s.name); indeg.set(s.name, indeg.get(s.name) + 1); }
  const queue = steps.filter(s => indeg.get(s.name) === 0).map(s => s.name).sort(); // deterministic
  const order = [];
  while (queue.length) {
    const n = queue.shift(); order.push(n);
    for (const m of adj.get(n).sort()) { indeg.set(m, indeg.get(m) - 1); if (indeg.get(m) === 0) queue.push(m); }
    queue.sort();
  }
  if (order.length !== steps.length) throw new Error('CYCLE_DETECTED');
  return order;
}

function decompose(brief, intent) {
  const seed = brief && brief.task_id ? brief.task_id : 'wf';
  const raw = buildNodes(intent);
  const steps = raw.map((n, i) => ({
    step_id: stepId(seed, n.name),
    name: n.name,
    specialist_type: n.specialist_type,
    domain: n.domain,
    dependencies: n.deps.map(d => stepId(seed, d)),
    dependency_names: n.deps.slice(),
    required_inputs: n.deps.slice(),
    knowledge_queries: [], // filled by KnowledgeQueryPlanner
    output_contract: { specialist_type: n.specialist_type, must_cite: true },
    status: 'PLANNED',
    order_index: i,
  }));
  // validate & order (throws on cycle / unknown dep)
  const order = topoSort(raw);
  const idByName = new Map(steps.map(s => [s.name, s.step_id]));
  const workflow = {
    workflow_id: 'WF_' + crypto.createHash('sha256').update(seed + '|' + intent).digest('hex').slice(0, 12),
    intent, steps,
    topological_order: order.map(n => idByName.get(n)),
    topological_order_names: order,
    valid: true,
  };
  return workflow;
}

module.exports = { decompose, topoSort, buildNodes, stepId, MULTI_STEP_TEMPLATE };
