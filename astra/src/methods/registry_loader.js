'use strict';
// METHOD_REGISTRY loader/validator. Read-mostly. Does NOT invent method content.
const fs = require('fs');
const path = require('path');

const ENTRY_FIELDS = ['method_id', 'method_name', 'source', 'source_type', 'domain', 'subdomain',
  'primary_jobs', 'business_stage', 'funnel_stage', 'best_for', 'not_recommended_for', 'required_inputs',
  'expected_outputs', 'strengths', 'limitations', 'dependencies', 'compatible_methods', 'conflicting_methods',
  'evidence_refs', 'confidence', 'version', 'mapping_status'];
const MAPPING_STATUS = ['DISCOVERED', 'PARTIALLY_MAPPED', 'UNMAPPED'];
const DEFAULT_PATH = path.join(__dirname, '..', '..', 'methods', 'registry.json');

function validateEntry(e) {
  const errors = [];
  if (!e || typeof e !== 'object') return { valid: false, errors: ['entry not an object'] };
  for (const f of ENTRY_FIELDS) if (!(f in e)) errors.push(`missing field: ${f}`);
  if (e.mapping_status && !MAPPING_STATUS.includes(e.mapping_status)) errors.push(`invalid mapping_status: ${e.mapping_status}`);
  if (typeof e.method_id !== 'string' || !/^METHOD_[A-Z0-9_]+$/.test(e.method_id || '')) errors.push('method_id must match METHOD_[A-Z0-9_]+');
  if (e.confidence != null && (typeof e.confidence !== 'number' || e.confidence < 0 || e.confidence > 1)) errors.push('confidence must be 0..1');
  return { valid: errors.length === 0, errors };
}

function load(registryPath = DEFAULT_PATH) {
  const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const methods = raw.methods || [];
  const seen = new Set();
  const valid = [], invalid = [];
  for (const m of methods) {
    const v = validateEntry(m);
    if (!v.valid) { invalid.push({ method_id: m && m.method_id, errors: v.errors }); continue; }
    if (seen.has(m.method_id)) { invalid.push({ method_id: m.method_id, errors: ['duplicate method_id'] }); continue; }
    seen.add(m.method_id); valid.push(m);
  }
  return {
    version: raw.version, count: valid.length, methods: valid, invalid,
    getCandidates({ domain, funnel_stage, business_stage } = {}) {
      return valid.filter(m => {
        if (domain && m.domain !== domain) return false;
        if (funnel_stage && m.funnel_stage.length && !m.funnel_stage.includes(funnel_stage)) return false;
        if (business_stage && m.business_stage.length && !m.business_stage.includes(business_stage)) return false;
        return true;
      });
    },
    byId(id) { return valid.find(m => m.method_id === id) || null; },
  };
}

module.exports = { load, validateEntry, ENTRY_FIELDS, MAPPING_STATUS, DEFAULT_PATH };
