'use strict';
// [ASTRA-11M §18] DecisionBoundary. Every decision output carries this. ASTRA-11M is
// analytical only. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

function decisionBoundary() {
  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'DecisionBoundary',
    triggers_action: false,
    analytical_only: true,
    no_external_writes: true,
    no_campaign_modification: true,
    no_budget_change: true,
    no_production_execution: true,
    no_deployment: true,
    no_integration: true,
    no_crm: true, no_meta: true, no_google_ads: true,
    no_supabase: true, no_embeddings: true, no_vector_db: true,
    no_production_routing: true, no_astra_11n: true,
    generated_by: 'deterministic:ucdm/decision_orchestrator/boundary',
  };
  body.boundary_id = 'dbd_' + sha256Hex(canonicalize({ ...body, boundary_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateBoundary(b) {
  const errors = [];
  for (const k of ['triggers_action']) if (b[k] !== false) errors.push(`${k} must be false`);
  for (const k of ['analytical_only', 'no_external_writes', 'no_campaign_modification', 'no_budget_change',
    'no_production_execution', 'no_deployment', 'no_integration', 'no_production_routing', 'no_astra_11n']) {
    if (b[k] !== true) errors.push(`${k} must be true`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { decisionBoundary, validateBoundary };
