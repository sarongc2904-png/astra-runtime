'use strict';
// [ASTRA-11B] Unified Commercial Data Model — public surface.
// DESIGN + SCHEMA + OFFLINE DETERMINISTIC VALIDATION ONLY.
// This module wires up NO runtime, NO LLM node, NO production integration, NO Supabase.
// It is a provider-neutral contract library consumed later by ASTRA-11C+ under new authorization.
module.exports = {
  canonical: require('./validation/canonical'),
  provenance: require('./provenance/provenance'),
  EvidenceGraph: require('./provenance/evidence_graph').EvidenceGraph,
  EvidenceError: require('./provenance/evidence_graph').EvidenceError,
  entities: require('./schema/entities'),
  versioning: require('./schema/versioning'),
  experimentLifecycle: require('./schema/experiment_lifecycle'),
  validateEntity: require('./validation/validate_entity').validateEntity,
  assertEntity: require('./validation/validate_entity').assertEntity,
  numericIntegrity: require('./validation/numeric_integrity'),
  confidence: require('./validation/confidence'),
  funnelMath: require('./validation/funnel_math'),
  recommendation: require('./validation/recommendation'),
  SCHEMA_VERSION: require('./schema/entities').SCHEMA_VERSION,
};
