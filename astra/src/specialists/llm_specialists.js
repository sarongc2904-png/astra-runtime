'use strict';
// Hardened LLM-backed specialists (evidence-bounded). One generic runner + per-node specs.
// Model may interpret/synthesize/draft within evidence; may NOT invent doctrine/current-platform
// facts/benchmarks/provider mechanics/hide uncertainty. Every recommendation carries support_class.
const llm = require('../llm/llm_executor');
const { OUTPUT_KEYS } = require('./base_specialist');
const { MAX_EVIDENCE_PER_STEP } = require('../../config/context_budgets');
// [Offer Constraint Adherence] reuses the SAME deterministic category-activation detector the
// fidelity validator uses to decide which EXPLICIT_PROHIBITION categories are active for this
// brief's canonical constraints — never a second, parallel classification of the constraint text.
const { activeExplicitProhibitionCategories } = require('../workflows/brief_fidelity_validator');

const SUPPORT_CLASSES = ['DIRECTLY_SUPPORTED', 'INFERENCE', 'ASSUMPTION', 'CURRENT_RESEARCH_REQUIRED'];

// per-specialist role + required downstream_payload fields + current-research domain hints
const SPECS = {
  MARKET_CONTEXT_SPECIALIST: { fields: ['problem_context', 'market_assumptions', 'constraints'], current: [] },
  ICP_SPECIALIST: { fields: ['pains', 'desired_outcomes', 'objections', 'buying_triggers', 'qualification_signals', 'non_fit_signals'], current: [] },
  OFFER_SPECIALIST: { fields: ['value_proposition', 'offer_structure', 'mechanism', 'risk_reduction', 'value_stack', 'constraints'], current: [] },
  FUNNEL_SPECIALIST: { fields: ['stages', 'transitions', 'conversion_intent', 'qualification_points', 'drop_off_risks', 'dependencies'], current: [] },
  CREATIVE_STRATEGY_SPECIALIST: { fields: ['core_idea', 'single_minded_proposition', 'angles', 'creative_territories', 'hooks', 'proof', 'objection_coverage'], current: [] },
  META_ADS_SPECIALIST: { fields: ['campaign_objective', 'audience_approach', 'structure', 'creative_testing', 'qualification', 'measurement', 'limitations'], current: ['CAPI', 'Advantage+', 'current attribution mechanics', 'current UI/interface', 'current platform defaults'] },
  WHATSAPP_SALES_SPECIALIST: { fields: ['qualification', 'discovery', 'objection_handling', 'appointment_closing', 'follow_up', 'recovery', 'conversational_logic', 'limitations'], current: ['provider-specific behavior', 'current WhatsApp API mechanics', 'current platform policy'] },
  MEASUREMENT_CRO_SPECIALIST: { fields: ['primary_outcome', 'leading_indicators', 'funnel_metrics', 'conversion_metrics', 'diagnostic_metrics', 'optimization_triggers', 'measurement_cadence'], current: [] },
};

function evidenceBlock(evidence) {
  return (evidence || []).map((e, i) => `[E${i + 1} chunk:${e.chunk_id} src:${e.source_pdf_name || e.source_id || '?'}]\n${String(e.text || '').replace(/\s+/g, ' ').trim().slice(0, 600)}`).join('\n\n').slice(0, MAX_EVIDENCE_PER_STEP);
}

// [Offer Constraint Adherence — confirmed live defect, job 58a4113f-9e0a-413f-b84f-094a7132298a]
// OFFER_SPECIALIST generated "PROPUESTA: Llena citas y aumenta ventas..." under a canonical
// constraint that explicitly prohibits inventing "resultados" — the validator correctly caught it
// and failed the node closed (exactly as designed; EXPLICIT_PROHIBITION is deliberately never
// auto-repaired, see marketing_campaign_360_hardened.js's REPAIRABLE_VIOLATION_TYPES), but the
// generation itself never had a fair chance: CANONICAL_CONSTRAINTS was passed through only as raw
// brief text ("No inventes métricas, resultados, ... testimonios ni evidencia."), with no
// actionable translation of what "resultados" means for THIS specialist's own schema field (a
// "value_proposition" is, by its very name, naturally result-oriented copy) — a generic "this is
// binding" instruction never told the model what an invented-result claim actually looks like or
// what it may say INSTEAD (the mechanism/process/content it teaches). This closes that gap by
// deriving concrete, per-category directives from the SAME constraint text the validator itself
// activates categories from — never a duplicate/drifting classification, and never invented ahead
// of what the brief actually prohibits: a brief with no result-prohibiting constraint gets no
// extra guidance at all (no new universal restriction is created).
const PROHIBITION_CATEGORY_GUIDANCE = {
  invented_result: 'Do not claim, promise, or imply a business RESULT this offer/plan will produce (more sales, more citas/appointments/leads, more clients, higher revenue/conversion/ticket) — describe only what the customer will DO, LEARN, or RECEIVE (the process, mechanism, content, or skill taught), never the outcome they will achieve as a result of it.',
  guarantee: 'Never guarantee a result or outcome, however phrased ("garantizado", "te garantizamos...").',
  invented_metric: 'Never invent or project performance metrics (CAC, CPA, CPL, ROAS, MER, LTV) — omit them entirely unless already supplied as a USER_PROVIDED_FACT.',
  invented_evidence: 'Never claim proven/validated/documented results, case studies, or before/after evidence that was not supplied as evidence.',
  testimonials: 'Never invent or imply a customer testimonial.',
  social_proof: 'Never invent social proof or case studies.',
  proof: 'Never claim "proof" that was not supplied as evidence.',
  urgency: 'Never invent urgency.',
  scarcity: 'Never invent scarcity or a limited-time framing.',
  deadline: 'Never invent a deadline.',
};
function constraintDerivedGuidance(canonicalConstraints) {
  if (!canonicalConstraints || canonicalConstraints.status !== 'USER_PROVIDED_FACT' || !canonicalConstraints.value) return [];
  const active = activeExplicitProhibitionCategories(canonicalConstraints.value);
  const lines = [...active].map(c => PROHIBITION_CATEGORY_GUIDANCE[c]).filter(Boolean);
  if (!lines.length) return [];
  return [
    'CONSTRAINT-DERIVED PROHIBITIONS (from the canonical constraints above — mandatory, apply to every field you write):',
    ...lines.map(l => `- ${l}`),
    '- You may still describe the mechanism/process/content being taught or delivered — only a claimed RESULT/outcome/guarantee/metric/testimonial/evidence in the categories above is restricted.',
  ];
}

function buildPrompt(input) {
  const spec = SPECS[input.specialist_type];
  const method = (input.selected_methods && input.selected_methods.primary_method_object) || null;
  const methodInfo = method ? {
    method_id: method.method_id, primary_jobs: method.primary_jobs, best_for: method.best_for,
    not_recommended_for: method.not_recommended_for, limitations: method.limitations, coverage: method.coverage,
  } : { method_id: input.selected_methods && input.selected_methods.primary_method };
  // [Brief Fidelity] canonical_brief_facts is the immutable fact-fidelity ground truth computed
  // once upstream (campaign_brief_facts.js) and passed unchanged into every node — see it here so
  // the model can honor it, not just so a downstream validator can catch it after the fact.
  const canonicalFacts = input.canonical_brief_facts || {};
  const canonicalConstraints = canonicalFacts.constraints || null;
  const system = [
    `You are ASTRA's ${input.specialist_type}, a marketing specialist that drafts a concrete, business-specific plan for ONE node of a campaign.`,
    `CANONICAL_BRIEF_FACTS (immutable ground truth for this business — see rules below): ${JSON.stringify(canonicalFacts)}`,
    `CANONICAL FACT RULES (mandatory, override anything else in this prompt if they conflict):`,
    `- Every field above with status USER_PROVIDED_FACT is immutable: never substitute, deny, degrade to UNKNOWN, or reinterpret it.`,
    `- A field with status UNKNOWN must remain UNKNOWN unless the supplied evidence authorizes a clearly labeled INFERENCE.`,
    `- Any new idea not contained in the facts or evidence above MUST begin explicitly with "PROPUESTA:". Never present a PROPUESTA as a fact.`,
    `- Any upstream content already labeled PROPUESTA is tainted as proposal. Any reuse, paraphrase, derivative, operationalization or downstream dependency of that idea MUST retain explicit PROPUESTA status. Never convert upstream PROPUESTA into an unmarked fact/decision.`,
    `- The canonical constraints below are mandatory and binding; they are not suggestions.`,
    `- "PROPUESTA:" labels an idea as a proposal — it never lifts a prohibition below; a prohibited claim marked PROPUESTA is still prohibited.`,
    ...constraintDerivedGuidance(canonicalConstraints),
    `HARD RULES (evidence-bounded):`,
    `- Use ONLY the supplied evidence, method metadata, task brief, canonical facts, and upstream outputs. Do NOT use outside knowledge.`,
    `- Tag every recommendation with support_class one of: ${SUPPORT_CLASSES.join(', ')}.`,
    `- DIRECTLY_SUPPORTED requires an evidence reference (cite E# / chunk). INFERENCE = reasoned from method/brief. ASSUMPTION = a stated gap needing USER_PROVIDED_FACTS.`,
    `- For anything requiring CURRENT platform/provider/market facts you do not have (e.g. ${(spec.current || []).join(', ') || 'current market/pricing/competitor data'}), do NOT invent it: put it in current_research_required and mark CURRENT_RESEARCH_REQUIRED.`,
    `- Never invent benchmark numbers, guarantees, provider/API behavior, or current-platform doctrine. Preserve the method's stated limitations.`,
    `- Be specific to the actual business (${input.task_brief.business_type}). Non-generic. Downstream-usable.`,
    `BREVITY (mandatory to avoid truncation): keep every string <= 24 words; each array <= 5 items; downstream_payload values short. Output compact minified JSON, no markdown.`,
    `Return STRICT JSON only with keys: findings (array of {claim, support_class, evidence_ref}), recommendations (array of {recommendation, support_class, basis}), decisions (array), assumptions (array of strings), conflicts (array), confidence (number 0..1), current_research_required (array of strings), downstream_payload (object with these fields: ${(spec.fields || []).join(', ')}).`,
  ].join('\n');
  const user = [
    `TASK_BRIEF: ${JSON.stringify(input.task_brief)}`,
    `SELECTED_METHOD: ${JSON.stringify(methodInfo)}`,
    `UPSTREAM_OUTPUTS (payloads): ${JSON.stringify((input.upstream_outputs || []).map(u => ({ node: u.work_unit_id, payload: u.downstream_payload })))}`.slice(0, 3000),
    `CONSTRAINTS: ${JSON.stringify(input.constraints || {})}`,
    // Additive — does not replace CONSTRAINTS above. The structured brief's own binding
    // restrictions ("Restricciones obligatorias:") live in canonical_brief_facts.constraints,
    // not in the generic task-level constraints object.
    `CANONICAL_CONSTRAINTS (from the user's brief — binding): ${JSON.stringify(canonicalConstraints)}`,
    `EVIDENCE (targeted, top5):\n${evidenceBlock(input.knowledge_evidence)}`,
  ].join('\n\n');
  return { system, user };
}

const OUT_SCHEMA = { required: ['findings', 'recommendations', 'decisions', 'assumptions', 'conflicts', 'confidence', 'current_research_required', 'downstream_payload'],
  arrays: ['findings', 'recommendations', 'decisions', 'assumptions', 'conflicts', 'current_research_required'] };

async function runLLMSpecialist(input, opts = {}) {
  const { system, user } = buildPrompt(input);
  const res = await llm.execute({ system, user, schema: OUT_SCHEMA, model: opts.model, max_tokens: opts.max_tokens, llm: opts.llm });
  // [ASTRA-10AB] usage_detail/finish_reason/llm_elapsed_ms are additive telemetry; carried through
  // unchanged on both branches so ASTRA-DIAG can report them even on terminal fail-closed failure.
  if (!res.ok) return { ok: false, fail_closed: true, error: res.error, attempts: res.attempts, retries: res.retries, usage: res.usage, usage_detail: res.usage_detail, finish_reason: res.finish_reason, llm_elapsed_ms: res.llm_elapsed_ms };
  const v = res.value;
  // enforce support_class validity + provenance (DIRECTLY_SUPPORTED must cite evidence)
  const evIds = new Set((input.knowledge_evidence || []).map(e => e.chunk_id));
  const findings = (v.findings || []).map(f => ({ claim: String(f.claim || ''), source_class: (f.support_class === 'DIRECTLY_SUPPORTED') ? 'INTERNAL_KNOWLEDGE' : 'INFERENCE', support_class: SUPPORT_CLASSES.includes(f.support_class) ? f.support_class : 'INFERENCE', evidence_ref: f.evidence_ref || null }));
  const recommendations = (v.recommendations || []).map(r => ({ recommendation: String(r.recommendation || ''), support_class: SUPPORT_CLASSES.includes(r.support_class) ? r.support_class : 'INFERENCE', basis: r.basis || null }));
  const output = {
    task_id: input.task_id, specialist_type: input.specialist_type, status: 'COMPLETE',
    findings, recommendations, decisions: v.decisions || [], assumptions: v.assumptions || [],
    evidence_used: (input.knowledge_evidence || []).map(e => e.chunk_id),
    method_used: (input.selected_methods && input.selected_methods.primary_method) || null,
    conflicts: v.conflicts || [], confidence: typeof v.confidence === 'number' ? Math.max(0, Math.min(0.7, v.confidence)) : 0.4,
    current_research_required: (v.current_research_required || []).map(x => (typeof x === 'string' ? { item: x, flag: 'CURRENT_RESEARCH_REQUIRED' } : x)),
    downstream_payload: v.downstream_payload || {},
    generation: 'LLM', usage: res.usage, retries: res.retries,
    // [ASTRA-10AB] Additive telemetry — new keys only; existing consumers reading only the
    // fields above (in particular usage.prompt/usage.completion for cost accounting) are unaffected.
    attempts: res.attempts, usage_detail: res.usage_detail, finish_reason: res.finish_reason, llm_elapsed_ms: res.llm_elapsed_ms,
  };
  for (const k of OUTPUT_KEYS) if (!(k in output)) output[k] = null;
  return { ok: true, output };
}

module.exports = { runLLMSpecialist, buildPrompt, SPECS, SUPPORT_CLASSES, OUT_SCHEMA };
