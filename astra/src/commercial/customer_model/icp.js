'use strict';
// [ASTRA-11G §N §O] IdealCustomerProfile — the ACCOUNT / organization fit, distinct from the
// human BuyerPersona. Revenue / employee count are represented ONLY when supplied/evidenced.
// UNKNOWN is valid everywhere. For B2C, ICP is NOT_APPLICABLE. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const ICP_SCHEMA_VERSION = 'ucdm-customer-model-1.0.0';
const MATURITY_LEVELS = Object.freeze(['LOW', 'DEVELOPING', 'MATURE', 'ADVANCED', 'UNKNOWN']);
const SEVERITY_LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'UNKNOWN']);

const FIELD = (value, source_class, evidence_refs = []) => value == null || value === 'UNKNOWN'
  ? { value: null, status: 'UNKNOWN' }
  : { value, status: 'KNOWN', source_class, evidence_refs };

// buildICP({ mode, businessInput, attributeEvidence, researchResult })
function buildICP({ mode = 'B2C', businessInput = {}, attributeEvidence = [], researchResult = null }) {
  if (mode !== 'B2B') {
    return deepFreeze({
      schema_version: ICP_SCHEMA_VERSION, kind: 'IdealCustomerProfile',
      status: 'NOT_APPLICABLE', mode,
      note: 'B2C context — the buying unit is an individual; ICP (account fit) is not applicable. See BuyerPersona.',
      icp_id: 'icp_' + sha256Hex(canonicalize({ status: 'NOT_APPLICABLE', mode })),
    });
  }
  const i = businessInput.icp_input || {};
  const ua = Object.fromEntries((attributeEvidence || []).filter(a => a.source_class === 'USER_PROVIDED' && a.status !== 'UNKNOWN').map(a => [a.attribute, a]));
  const ref = (a) => (a ? a.evidence_refs : []);

  const body = {
    schema_version: ICP_SCHEMA_VERSION, kind: 'IdealCustomerProfile', status: 'ACTIVE', mode: 'B2B',
    industry: FIELD(i.industry || (ua.industry && ua.industry.value), 'USER_PROVIDED', ref(ua.industry)),
    business_model: FIELD(i.business_model, 'USER_PROVIDED'),
    company_size: FIELD(i.company_size || (ua.company_size && ua.company_size.value), 'USER_PROVIDED', ref(ua.company_size)),
    revenue_range: FIELD(i.revenue_range, 'USER_PROVIDED'),   // only when supplied
    employees: FIELD(i.employees, 'USER_PROVIDED'),           // only when supplied
    geography: FIELD(i.geography || (ua.location && ua.location.value), 'USER_PROVIDED', ref(ua.location)),
    operational_maturity: FIELD(norm(i.operational_maturity, MATURITY_LEVELS), 'USER_PROVIDED'),
    marketing_maturity: FIELD(norm(i.marketing_maturity, MATURITY_LEVELS), 'USER_PROVIDED'),
    sales_maturity: FIELD(norm(i.sales_maturity, MATURITY_LEVELS), 'USER_PROVIDED'),
    technology_maturity: FIELD(norm(i.technology_maturity, MATURITY_LEVELS), 'USER_PROVIDED'),
    problem_severity: FIELD(norm(i.problem_severity, SEVERITY_LEVELS) || severityFromEvidence(attributeEvidence), i.problem_severity ? 'USER_PROVIDED' : 'COMPUTED', severityEvidence(attributeEvidence)),
    urgency: FIELD(i.urgency, 'USER_PROVIDED'),
    budget_fit: FIELD(i.budget_fit, 'USER_PROVIDED'),
    solution_fit: FIELD(i.solution_fit, 'USER_PROVIDED'),
    implementation_fit: FIELD(i.implementation_fit, 'USER_PROVIDED'),
    decision_complexity: FIELD(i.decision_complexity, 'USER_PROVIDED'),
    strategic_fit: FIELD(i.strategic_fit, 'USER_PROVIDED'),
    disqualifiers: Array.isArray(i.disqualifiers) ? i.disqualifiers.map(String) : [],
    evidence_refs: [...new Set((attributeEvidence || []).filter(a => a.source_class === 'USER_PROVIDED').flatMap(a => a.evidence_refs))].sort(),
    confidence: assess({ evidence_count: Object.keys(i).length, distinct_sources: 1, coverage: coverageRatio(i), data_quality: 0.6 }),
  };
  body.unknowns = Object.keys(body).filter(k => body[k] && body[k].status === 'UNKNOWN').sort();
  body.icp_id = 'icp_' + sha256Hex(canonicalize({ ...body, icp_id: undefined, confidence: body.confidence.content_hash }));
  return deepFreeze(body);
}

function norm(v, set) { if (v == null) return null; const up = String(v).toUpperCase(); return set.includes(up) ? up : null; }
function coverageRatio(i) { const keys = ['industry', 'company_size', 'geography', 'problem_severity', 'urgency', 'budget_fit', 'solution_fit', 'implementation_fit', 'strategic_fit']; return keys.filter(k => i[k] != null).length / keys.length; }
function severityFromEvidence(ae) {
  const painPatterns = (ae || []).filter(a => a.attribute === 'pain' && a.source_class === 'COMPUTED' && a.value && a.value.status === 'SUPPORTED');
  return painPatterns.length >= 2 ? 'HIGH' : painPatterns.length === 1 ? 'MODERATE' : null;
}
function severityEvidence(ae) { return [...new Set((ae || []).filter(a => a.attribute === 'pain').flatMap(a => a.evidence_refs))].sort(); }

function validateICP(icp) {
  const errors = [];
  if (icp.status === 'NOT_APPLICABLE') return { valid: true, errors };
  for (const k of ['revenue_range', 'employees']) if (icp[k] && icp[k].status === 'KNOWN' && icp[k].source_class !== 'USER_PROVIDED') errors.push(`ICP.${k} may only be KNOWN when USER_PROVIDED`);
  if (!('company_size' in icp)) errors.push('ICP missing company_size field (UNKNOWN is fine, the field is not)');
  return { valid: errors.length === 0, errors };
}

module.exports = { ICP_SCHEMA_VERSION, MATURITY_LEVELS, SEVERITY_LEVELS, buildICP, validateICP };
