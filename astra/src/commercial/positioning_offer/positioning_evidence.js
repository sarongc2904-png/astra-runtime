'use strict';
// [ASTRA-11I §A] Canonical PositioningEvidence. A thin, provenance-preserving projection over
// ASTRA-11D/E/F/G/H artifacts + explicit business input. It creates NO new evidence and NO
// parallel provenance system — every item points back at an existing evidence_ref. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { SOURCE_CLASSES } = require('../provenance/provenance');

const POSITIONING_OFFER_SCHEMA_VERSION = 'ucdm-positioning-offer-1.0.0';

const EVIDENCE_KINDS = Object.freeze([
  'MARKET_FACT', 'COMPETITOR_CLAIM', 'COMPETITOR_OFFER', 'COMPETITOR_PRICE', 'VOC_PATTERN',
  'BUYING_LANGUAGE', 'SEGMENT', 'PERSONA', 'ICP', 'JOURNEY_FRICTION', 'PROOF_REQUIREMENT',
  'ALTERNATIVE', 'JTBD', 'FORCE_OF_PROGRESS', 'BUSINESS_CAPABILITY', 'BUSINESS_CONSTRAINT',
]);
const EVIDENCE_SCOPE = Object.freeze(['MARKET', 'SAMPLE', 'SEGMENT', 'CUSTOMER', 'COMPETITOR', 'BUSINESS', 'UNKNOWN']);

function mk(x) {
  const source_class = SOURCE_CLASSES.includes(x.source_class) ? x.source_class : 'OBSERVED';
  const body = {
    schema_version: POSITIONING_OFFER_SCHEMA_VERSION, kind: 'PositioningEvidence',
    evidence_kind: EVIDENCE_KINDS.includes(x.evidence_kind) ? x.evidence_kind : 'MARKET_FACT',
    summary: String(x.summary || ''),
    detail: x.detail === undefined ? null : x.detail,
    source_class,
    scope: EVIDENCE_SCOPE.includes(x.scope) ? x.scope : 'UNKNOWN',
    segment_refs: [...new Set(x.segment_refs || [])].sort(),
    evidence_refs: [...new Set((x.evidence_refs || []).map(String))].sort(),
    origin_ref: x.origin_ref == null ? null : String(x.origin_ref),
    origin_module: String(x.origin_module || 'unknown'),
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.positioning_evidence_id = 'pe_' + sha256Hex(canonicalize({ ...body, positioning_evidence_id: undefined }));
  return deepFreeze(body);
}

// collectPositioningEvidence({ researchResult, competitorResult, vocResult, customerModel, journeyResult, businessInput })
function collectPositioningEvidence(x) {
  const { researchResult = null, competitorResult = null, vocResult = {}, customerModel = null, journeyResult = null, businessInput = {} } = x;
  const out = [];

  for (const f of ((researchResult && researchResult.facts) || [])) {
    out.push(mk({ evidence_kind: 'MARKET_FACT', summary: `${f.fact_type}`, detail: f.value, source_class: 'OBSERVED', scope: 'MARKET', evidence_refs: f.evidence_refs, origin_ref: f.fact_id, origin_module: 'research/market_fact' }));
  }
  for (const m of ((researchResult && researchResult.message_observations) || [])) {
    out.push(mk({ evidence_kind: 'COMPETITOR_CLAIM', summary: m.verbatim_text || m.text || m.message || "competitor message", detail: m, source_class: 'OBSERVED', scope: 'COMPETITOR', evidence_refs: m.evidence_refs || [], origin_ref: m.id || null, origin_module: 'research/message' }));
  }
  for (const o of ((researchResult && researchResult.offer_items) || [])) {
    out.push(mk({ evidence_kind: 'COMPETITOR_OFFER', summary: o.component || o.text || 'competitor offer', detail: o, source_class: 'OBSERVED', scope: 'COMPETITOR', evidence_refs: o.evidence_refs || [], origin_ref: o.id || null, origin_module: 'research/offer' }));
  }
  for (const p of ((researchResult && researchResult.pricing_observations) || [])) {
    out.push(mk({ evidence_kind: 'COMPETITOR_PRICE', summary: 'competitor price', detail: p, source_class: 'OBSERVED', scope: 'COMPETITOR', evidence_refs: p.evidence_refs || [], origin_ref: p.id || null, origin_module: 'research/pricing' }));
  }
  for (const p of ((competitorResult && competitorResult.report && competitorResult.profiles) || [])) {
    out.push(mk({ evidence_kind: 'COMPETITOR_CLAIM', summary: `competitor profile ${p.name || p.competitor_id}`, detail: null, source_class: 'OBSERVED', scope: 'COMPETITOR', evidence_refs: p.evidence_refs || [], origin_ref: p.competitor_id, origin_module: 'competitor/profile' }));
  }
  for (const pat of (vocResult.patterns || [])) {
    if (pat.status === 'INSUFFICIENT') continue;
    out.push(mk({ evidence_kind: 'VOC_PATTERN', summary: pat.pattern, detail: { aspect: pat.aspect, concept: pat.canonical_concept, status: pat.status }, source_class: 'COMPUTED', scope: 'SAMPLE', evidence_refs: (vocResult.observations || []).filter(o => pat.supporting_observations.includes(o.observation_id)).flatMap(o => o.evidence_refs), origin_ref: pat.pattern_id, origin_module: 'voc/pattern' }));
  }
  if (vocResult.buyingLanguage && vocResult.buyingLanguage.library) {
    for (const [aspect, section] of Object.entries(vocResult.buyingLanguage.library)) {
      if (section.status === 'UNKNOWN') continue;
      for (const ph of (section.top_phrases || [])) out.push(mk({ evidence_kind: 'BUYING_LANGUAGE', summary: ph.phrase, detail: { aspect, variants: ph.variants }, source_class: 'OBSERVED', scope: 'SAMPLE', evidence_refs: ph.evidence_refs || [], origin_ref: vocResult.buyingLanguage.library_id, origin_module: 'voc/buying_language' }));
    }
  }
  for (const s of ((customerModel && customerModel.segments) || [])) {
    out.push(mk({ evidence_kind: 'SEGMENT', summary: s.label, detail: { primary_concept: s.primary_concept, status: s.status }, source_class: 'COMPUTED', scope: 'SEGMENT', segment_refs: [s.segment_id], evidence_refs: s.supporting_evidence_refs, origin_ref: s.segment_id, origin_module: 'customer_model/segment' }));
  }
  for (const p of ((customerModel && customerModel.personas) || [])) {
    out.push(mk({ evidence_kind: 'PERSONA', summary: p.label, detail: { primary_problem: p.primary_problem }, source_class: 'COMPUTED', scope: 'SEGMENT', segment_refs: p.segment_refs, evidence_refs: p.evidence_refs, origin_ref: p.persona_id, origin_module: 'customer_model/persona' }));
  }
  if (customerModel && customerModel.icp && customerModel.icp.status === 'ACTIVE') {
    out.push(mk({ evidence_kind: 'ICP', summary: 'ICP', detail: { unknowns: customerModel.icp.unknowns }, source_class: 'USER_PROVIDED', scope: 'BUSINESS', evidence_refs: customerModel.icp.evidence_refs || [], origin_ref: customerModel.icp.icp_id, origin_module: 'customer_model/icp' }));
  }
  for (const fr of ((journeyResult && journeyResult.frictions) || [])) {
    out.push(mk({ evidence_kind: 'JOURNEY_FRICTION', summary: fr.category, detail: { stage: fr.stage, span: fr.verbatim_span }, source_class: 'OBSERVED', scope: 'CUSTOMER', evidence_refs: fr.evidence_refs, origin_ref: fr.friction_id, origin_module: 'journey/friction' }));
  }
  for (const pr of ((journeyResult && journeyResult.proofRequirements) || [])) {
    out.push(mk({ evidence_kind: 'PROOF_REQUIREMENT', summary: pr.proof_type, detail: { status: pr.status }, source_class: pr.status === 'OBSERVED_REQUIRED' ? 'OBSERVED' : 'COMPUTED', scope: 'CUSTOMER', evidence_refs: pr.evidence_refs, origin_ref: pr.proof_id, origin_module: 'journey/proof' }));
  }
  for (const a of ((journeyResult && journeyResult.alternatives) || [])) {
    out.push(mk({ evidence_kind: 'ALTERNATIVE', summary: a.alternative_type, detail: { span: a.verbatim_span }, source_class: 'OBSERVED', scope: 'CUSTOMER', evidence_refs: a.evidence_refs, origin_ref: a.alternative_id, origin_module: 'journey/alternative' }));
  }
  for (const j of ((journeyResult && journeyResult.jobs) || [])) {
    out.push(mk({ evidence_kind: 'JTBD', summary: j.job_kind, detail: { functional: j.functional_job, unknowns: j.unknowns }, source_class: 'COMPUTED', scope: 'SEGMENT', segment_refs: j.segment_refs, evidence_refs: j.evidence_refs, origin_ref: j.job_id, origin_module: 'journey/jtbd' }));
  }
  if (journeyResult && journeyResult.forces) {
    for (const f of journeyResult.forces.present_forces) out.push(mk({ evidence_kind: 'FORCE_OF_PROGRESS', summary: f, detail: journeyResult.forces.forces[f], source_class: 'OBSERVED', scope: 'SAMPLE', evidence_refs: journeyResult.forces.forces[f].evidence_refs || [], origin_ref: journeyResult.forces.forces_id, origin_module: 'journey/forces' }));
  }
  for (const c of (businessInput.capabilities || [])) {
    out.push(mk({ evidence_kind: 'BUSINESS_CAPABILITY', summary: String(c.capability), detail: c.description || null, source_class: 'USER_PROVIDED', scope: 'BUSINESS', evidence_refs: c.evidence_refs || [], origin_ref: null, origin_module: 'business_input/capability' }));
  }
  for (const c of (businessInput.constraints || [])) {
    out.push(mk({ evidence_kind: 'BUSINESS_CONSTRAINT', summary: String(c.type), detail: c.detail || null, source_class: 'USER_PROVIDED', scope: 'BUSINESS', evidence_refs: c.evidence_refs || [], origin_ref: null, origin_module: 'business_input/constraint' }));
  }
  return out;
}

function validatePositioningEvidence(e) {
  const errors = [];
  if (!EVIDENCE_KINDS.includes(e.evidence_kind)) errors.push(`bad evidence_kind "${e.evidence_kind}"`);
  if (!SOURCE_CLASSES.includes(e.source_class)) errors.push(`bad source_class "${e.source_class}"`);
  return { valid: errors.length === 0, errors };
}

module.exports = { POSITIONING_OFFER_SCHEMA_VERSION, EVIDENCE_KINDS, EVIDENCE_SCOPE, collectPositioningEvidence, validatePositioningEvidence, mkPositioningEvidence: mk };
