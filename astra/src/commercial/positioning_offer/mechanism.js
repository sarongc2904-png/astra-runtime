'use strict';
// [ASTRA-11I §K] OfferMechanism — how value is delivered. Distinguishes a SUPPLIED/OBSERVED
// mechanism, an ANALYTICAL framing, and an UNSUPPORTED mechanism. ASTRA does NOT invent a
// proprietary process / named method. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const MECHANISM_STATUS = Object.freeze(['SUPPLIED_OBSERVED', 'ANALYTICAL_FRAMING', 'UNSUPPORTED', 'UNKNOWN']);
const PROPRIETARY_RE = /\b(m[eé]todo|method|sistema|framework|proceso patentad|nuestro secreto|f[oó]rmula (propia|exclusiva)|the \w+ method|3[- ]step system)\b/i;

function buildMechanism({ businessInput = {}, differentiation = [] }) {
  const supplied = businessInput.supplied_offer && businessInput.supplied_offer.mechanism;
  let status, statement, evidence_refs = [];
  if (supplied && typeof supplied === 'object' && supplied.statement) {
    status = 'SUPPLIED_OBSERVED'; statement = String(supplied.statement); evidence_refs = [...new Set(supplied.evidence_refs || [])].sort();
  } else if (supplied && typeof supplied === 'string') {
    status = 'SUPPLIED_OBSERVED'; statement = String(supplied);
  } else if ((businessInput.capabilities || []).length) {
    status = 'ANALYTICAL_FRAMING';
    statement = `value is delivered through: ${businessInput.capabilities.map(c => String(c.capability)).join('; ')}`;
    evidence_refs = [...new Set(businessInput.capabilities.flatMap(c => c.evidence_refs || []))].sort();
  } else { status = 'UNKNOWN'; statement = null; }

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferMechanism',
    status, statement, evidence_refs,
    names_proprietary_process: status === 'SUPPLIED_OBSERVED' && PROPRIETARY_RE.test(String(statement || '')),
    invented_process: false,
    note: status === 'ANALYTICAL_FRAMING' ? 'framing of supplied capabilities — NOT a named/proprietary method' : status === 'SUPPLIED_OBSERVED' ? 'mechanism supplied by the business' : 'no mechanism evidence',
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.mechanism_id = 'mm_' + sha256Hex(canonicalize({ ...body, mechanism_id: undefined }));
  return deepFreeze(body);
}

function validateMechanism(m) {
  const errors = [];
  if (!MECHANISM_STATUS.includes(m.status)) errors.push(`bad mechanism status "${m.status}"`);
  if (m.invented_process !== false) errors.push('mechanism must not be an invented process');
  if (m.status === 'ANALYTICAL_FRAMING' && PROPRIETARY_RE.test(String(m.statement || ''))) errors.push('an analytical mechanism framing must not name a proprietary method');
  if (m.status === 'SUPPLIED_OBSERVED' && !m.statement) errors.push('a supplied mechanism needs a statement');
  return { valid: errors.length === 0, errors };
}

module.exports = { MECHANISM_STATUS, buildMechanism, validateMechanism };
