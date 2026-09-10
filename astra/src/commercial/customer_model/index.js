'use strict';
// [ASTRA-11G] Buyer Persona + ICP + Segmentation Engine — public surface.
// DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING. No LLM.
// No ASTRA-11G output may feed production routing or autonomous action.
module.exports = {
  attributeEvidence: require('./attribute_evidence'),
  segmentTaxonomy: require('./segment_taxonomy'),
  segmentCandidate: require('./segment_candidate'),
  segmentMembership: require('./segment_membership'),
  segmentMetrics: require('./segment_metrics'),
  buyerPersona: require('./buyer_persona'),
  personaEvidence: require('./persona_evidence'),
  awareness: require('./awareness'),
  urgency: require('./urgency'),
  budgetSignal: require('./budget_signal'),
  icp: require('./icp'),
  buyingRoles: require('./buying_roles'),
  icpFit: require('./icp_fit'),
  attractiveness: require('./attractiveness'),
  priority: require('./priority'),
  disqualification: require('./disqualification'),
  conflicts: require('./conflicts'),
  mergeSplit: require('./merge_split'),
  coverage: require('./coverage'),
  completion: require('./completion'),
  report: require('./report'),
  engine: require('./engine'),
  CUSTOMER_MODEL_SCHEMA_VERSION: require('./attribute_evidence').CUSTOMER_MODEL_SCHEMA_VERSION,
  UCDM_SCHEMA_VERSION: require('../schema/entities').SCHEMA_VERSION,
  VOC_SCHEMA_VERSION: require('../voc/utterance').VOC_SCHEMA_VERSION,
  RESEARCH_SCHEMA_VERSION: require('../research/request').RESEARCH_SCHEMA_VERSION,
  COMPETITOR_SCHEMA_VERSION: require('../competitor/competitor_profile').COMPETITOR_SCHEMA_VERSION,
};
