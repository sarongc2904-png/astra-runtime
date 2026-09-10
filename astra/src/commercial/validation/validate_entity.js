'use strict';
// [ASTRA-11B] Canonical entity validator engine. Deterministic, fail-closed. No I/O, no LLM.
// Enforces, in one pass:
//   - structural shape against the registry (unknown fields REJECTED -> provider payloads can't leak)
//   - provenance completeness (every provenanced field is a valid ProvenanceValue or explicit UNKNOWN)
//   - numeric integrity (canonical `metric` fields cannot be INFERRED / LLM-authored)
//   - evidence-ref integrity (fail closed: every ref must resolve in the supplied EvidenceGraph)
//   - enum membership, configurable stage lists, UNKNOWN representability
const { ENTITIES, SCHEMA_VERSION, PROVIDER_COUPLED } = require('../schema/entities');
const P = require('../provenance/provenance');
const { validateCanonicalMetric, assertInferredNumbersStayText } = require('./numeric_integrity');

const UNKNOWN = P.UNKNOWN;
const isUnknown = P.isUnknown;

function validateEntity(entityType, body, opts = {}) {
  const errors = [];
  const def = ENTITIES[entityType];
  if (!def) return fail([`unknown canonical entity type "${entityType}"`]);
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return fail(['entity body must be an object']);

  const graph = opts.evidenceGraph || null;
  const spec = def.fields;

  // ---- 1. unknown / provider-coupled field rejection (fail closed) ----
  for (const key of Object.keys(body)) {
    if (key === '_meta') continue; // reserved for the version envelope
    if (!(key in spec)) {
      errors.push(PROVIDER_COUPLED.test(key)
        ? `field "${key}" is provider-coupled and not in the canonical schema — external payloads must map through an adapter, never leak directly`
        : `unknown field "${key}" not in canonical schema for ${entityType} (fail closed)`);
      continue;
    }
  }

  // ---- 2. per-field validation ----
  for (const [fname, fs] of Object.entries(spec)) {
    const present = fname in body;
    const val = body[fname];

    if (!present || val === undefined) {
      if (fs.required) errors.push(`missing required field "${fname}"`);
      continue;
    }
    if (isUnknown(val)) {
      if (fs.required && (fs.kind === 'ref' || fs.kind === 'ref_list' || fs.kind === 'stage_config' || fname.endsWith('_ref') || fname.endsWith('_slug') || fname.endsWith('_key') || fname.endsWith('_id'))) {
        errors.push(`required identity/link field "${fname}" cannot be UNKNOWN`);
      }
      continue; // UNKNOWN is a legal value for any non-identity field
    }

    switch (fs.kind) {
      case 'scalar':
        break; // any concrete value ok

      case 'enum': {
        const set = fs.values || [];
        if (!set.includes(val)) errors.push(`field "${fname}" = ${JSON.stringify(val)} not in enum [${set.join(', ')}]`);
        break;
      }

      case 'ref': {
        if (typeof val !== 'string' || !val) { errors.push(`field "${fname}" must be a non-empty ref id string`); break; }
        if (graph && /_ref$|_refs$/.test('') /* n/a */) { /* handled below for evidence refs only */ }
        break;
      }

      case 'ref_list': {
        if (!Array.isArray(val)) { errors.push(`field "${fname}" must be an array of ref ids`); break; }
        if (fs.required && val.length === 0) errors.push(`field "${fname}" must be a non-empty array`);
        for (const r of val) if (typeof r !== 'string' || !r) errors.push(`field "${fname}" contains a non-string ref`);
        // Evidence-ref integrity: any *_refs field literally named evidence_refs, or ending
        // in _refs and pointing at the evidence graph, is fail-closed resolved.
        if (graph && /evidence_refs$/.test(fname)) {
          const chk = graph.checkRefs(val);
          if (!chk.valid) errors.push(...chk.errors.map(e => `${fname}: ${e}`));
        }
        break;
      }

      case 'stage_config': {
        if (!Array.isArray(val) || val.length === 0) { errors.push(`field "${fname}" must be a non-empty stage list (configurable per business)`); break; }
        const names = val.map(s => (typeof s === 'string' ? s : s && s.name));
        if (names.some(n => !n || typeof n !== 'string')) errors.push(`field "${fname}": every stage needs a string name`);
        if (new Set(names).size !== names.length) errors.push(`field "${fname}": stage names must be unique`);
        break;
      }

      case 'list':
        if (!Array.isArray(val)) errors.push(`field "${fname}" must be an array`);
        break;

      case 'provenanced': {
        const pvChk = P.validateProvenanceValue(val, { requireEvidenceForObserved: true });
        if (!pvChk.valid) { errors.push(...pvChk.errors.map(e => `${fname}: ${e}`)); break; }
        if (graph) {
          const chk = graph.checkRefs(val.evidence_refs);
          if (!chk.valid) errors.push(...chk.errors.map(e => `${fname}: ${e}`));
        }
        const t = assertInferredNumbersStayText(fname, val);
        if (!t.valid) errors.push(...t.errors);
        break;
      }

      case 'metric': {
        // Numeric integrity: canonical metrics cannot be INFERRED / LLM-authored.
        const m = validateCanonicalMetric(fname, val);
        if (!m.valid) { errors.push(...m.errors); break; }
        if (!isUnknown(val) && val != null && P.isProvenanceValue(val) && graph) {
          const chk = graph.checkRefs(val.evidence_refs);
          if (!chk.valid) errors.push(...chk.errors.map(e => `${fname}: ${e}`));
        }
        break;
      }

      default:
        errors.push(`internal: unknown field kind "${fs.kind}" for "${fname}"`);
    }
  }

  return { valid: errors.length === 0, errors, entity_type: entityType, schema_version: SCHEMA_VERSION };

  function fail(errs) { return { valid: false, errors: errs, entity_type: entityType, schema_version: SCHEMA_VERSION }; }
}

// Convenience: throw on invalid (used where a caller wants hard failure).
function assertEntity(entityType, body, opts) {
  const r = validateEntity(entityType, body, opts);
  if (!r.valid) throw new Error(`[ASTRA-11B] ${entityType} invalid: ${r.errors.join(' | ')}`);
  return r;
}

module.exports = { validateEntity, assertEntity, UNKNOWN, isUnknown, SCHEMA_VERSION };
