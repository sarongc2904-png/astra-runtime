'use strict';

// ASTRA-12 deterministic provenance gate.
// Research-enabled Campaign360 must actually USE source-verified web evidence in the
// market/ICP/offer decisions; merely running a web search is not enough.

const REQUIRED_GROUNDED_NODES = ['market_context', 'icp', 'offer'];
const PROPOSAL_MARKER = /\b(?:PROPUESTA|PROPOSAL|HIP[ÓO]TESIS|HYPOTHESIS)\s*:/i;

function textOnly(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textOnly).join(' ');
  if (typeof value === 'object') return Object.values(value).map(textOnly).join(' ');
  return String(value);
}

function webIds(pack) {
  return new Set((pack && Array.isArray(pack.evidence) ? pack.evidence : [])
    .map(e => String(e && (e.chunk_id || e.evidence_id) || '').toUpperCase())
    .filter(x => /^WEB_\d+$/.test(x)));
}

function nodeById(result, id) {
  return (result && Array.isArray(result.node_outputs) ? result.node_outputs : [])
    .find(n => n && n.work_unit_id === id) || null;
}

function externalRefsForNode(node, allowedIds) {
  const refs = new Set();
  if (!node || !node.output) return refs;
  for (const finding of Array.isArray(node.output.findings) ? node.output.findings : []) {
    const direct = String(finding.external_evidence_ref || finding.evidence_ref || '').toUpperCase();
    if (allowedIds.has(direct)) refs.add(direct);
    if (finding.source_class === 'EXTERNAL_RESEARCH' && finding.external_evidence_ref) {
      const id = String(finding.external_evidence_ref).toUpperCase();
      if (allowedIds.has(id)) refs.add(id);
    }
  }
  return refs;
}

function validateOfferProposal(node) {
  if (!node || !node.output) return [{
    type: 'RESEARCH_GROUNDED_OFFER_MISSING', node: 'offer', field_key: 'offer',
    detail: 'offer node is missing',
  }];
  const payload = node.output.downstream_payload || {};
  const violations = [];
  const valueStack = textOnly(payload.value_stack).trim();
  if (!valueStack) violations.push({
    type: 'VALUE_STACK_MISSING', node: 'offer', field_key: 'value_stack',
    detail: 'research-grounded offer must include value_stack',
  });
  const proposalText = [payload.value_proposition, payload.offer_structure, payload.mechanism,
    payload.risk_reduction, payload.value_stack].map(textOnly).join(' ');
  if (!PROPOSAL_MARKER.test(proposalText)) violations.push({
    type: 'OFFER_PROPOSAL_MARKER_MISSING', node: 'offer', field_key: 'downstream_payload',
    detail: 'new offer/value-stack strategy must be explicitly labeled PROPUESTA',
  });
  return violations;
}

function validate(result, pack) {
  const allowed = webIds(pack);
  const violations = [];
  const grounding = {};
  if (allowed.size < 3) violations.push({
    type: 'INSUFFICIENT_EXTERNAL_EVIDENCE', node: null, field_key: 'web_research',
    detail: `expected at least 3 source-verified WEB evidence items, received ${allowed.size}`,
  });

  for (const id of REQUIRED_GROUNDED_NODES) {
    const node = nodeById(result, id);
    const refs = externalRefsForNode(node, allowed);
    grounding[id] = { external_evidence_refs: [...refs], external_evidence_count: refs.size };
    if (!node) {
      violations.push({ type: 'REQUIRED_RESEARCH_NODE_MISSING', node: id, field_key: null, detail: `${id} did not complete` });
      continue;
    }
    if (!refs.size) violations.push({
      type: 'EXTERNAL_RESEARCH_NOT_CITED', node: id, field_key: 'findings',
      detail: `${id} must cite at least one source-verified WEB_n finding`,
    });
  }
  violations.push(...validateOfferProposal(nodeById(result, 'offer')));
  return { violations, grounding };
}

module.exports = {
  validate,
  REQUIRED_GROUNDED_NODES,
  textOnly,
  webIds,
  externalRefsForNode,
  validateOfferProposal,
};
