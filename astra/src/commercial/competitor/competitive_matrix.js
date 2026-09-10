'use strict';
// [ASTRA-11E §K] Deterministic CompetitiveMatrix. Rows = dimensions, columns = observed
// competitors. Cell status: OBSERVED | NOT_OBSERVED_IN_SAMPLE | UNKNOWN | CONFLICTED.
// NOT_OBSERVED_IN_SAMPLE is NEVER equated with ABSENT. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const CELL_STATUS = Object.freeze(['OBSERVED', 'NOT_OBSERVED_IN_SAMPLE', 'UNKNOWN', 'CONFLICTED']);
const ROWS = Object.freeze(['positioning', 'promise', 'price', 'offer', 'mechanism', 'guarantee', 'proof', 'cta', 'channel', 'customer_problem', 'creative_angle']);

// A dimension is "expressible from our observation set" if at least one competitor has it —
// only then can another competitor's blank be NOT_OBSERVED_IN_SAMPLE (rather than UNKNOWN).
function buildMatrix({ profiles, byCompetitor }) {
  // byCompetitor[ref] = { attributes[], positioning, offerProfile, messageProfile, proofProfile, funnelProfile, creativeProfile, conflictsForCompetitor[] }
  const cols = profiles.map(p => p.competitor_ref);
  const cellValue = (ref, row) => {
    const b = byCompetitor[ref] || {};
    const attrHas = (name) => (b.attributes || []).some(a => a.attribute === name && a.kind === 'OBSERVED');
    const evOf = (name) => (b.attributes || []).filter(a => a.attribute === name).flatMap(a => a.evidence_refs);
    switch (row) {
      case 'positioning': return b.positioning && Object.values(b.positioning.observed_elements).some(v => !v.status) ? { v: 'framed', ev: b.positioning.evidence_refs } : { v: null, ev: [] };
      case 'promise': return attrHas('promise') ? { v: 'yes', ev: evOf('promise') } : { v: null, ev: [] };
      case 'price': return attrHas('price') ? { v: 'published', ev: evOf('price') } : { v: null, ev: [] };
      case 'offer': return (b.offerProfile && b.offerProfile.offer_count > 0) ? { v: b.offerProfile.offer_count + ' surface(s)', ev: b.offerProfile.offers.flatMap(o => o.evidence_refs) } : { v: null, ev: [] };
      case 'mechanism': return attrHas('mechanism') ? { v: 'yes', ev: evOf('mechanism') } : { v: null, ev: [] };
      case 'guarantee': return attrHas('guarantee') ? { v: 'yes', ev: evOf('guarantee') } : { v: null, ev: [] };
      case 'proof': return (b.proofProfile && b.proofProfile.proof_count > 0) ? { v: b.proofProfile.proof_types_present.join('/'), ev: b.proofProfile.items.flatMap(i => i.evidence_refs) } : { v: null, ev: [] };
      case 'cta': return attrHas('cta') ? { v: 'yes', ev: evOf('cta') } : { v: null, ev: [] };
      case 'channel': return (b.creativeProfile && b.creativeProfile.platform_context[0] !== 'UNKNOWN') ? { v: b.creativeProfile.platform_context.join(','), ev: b.positioning ? b.positioning.evidence_refs : [] } : { v: null, ev: [] };
      case 'customer_problem': return attrHas('pain') ? { v: 'addressed', ev: evOf('pain') } : { v: null, ev: [] };
      case 'creative_angle': return (b.creativeProfile && b.creativeProfile.angles_present.some(a => a !== 'UNKNOWN')) ? { v: b.creativeProfile.angles_present.filter(a => a !== 'UNKNOWN').join('/'), ev: b.creativeProfile.items.flatMap(i => i.raw.evidence_refs) } : { v: null, ev: [] };
      default: return { v: null, ev: [] };
    }
  };

  const rows = ROWS.map(row => {
    const raw = cols.map(ref => ({ ref, ...cellValue(ref, row) }));
    const anyObserved = raw.some(c => c.v != null);
    const cells = {};
    for (const c of raw) {
      let status;
      if (c.v != null) status = 'OBSERVED';
      else status = anyObserved ? 'NOT_OBSERVED_IN_SAMPLE' : 'UNKNOWN';
      // conflict override
      if ((byCompetitor[c.ref] && (byCompetitor[c.ref].conflictRows || []).includes(row))) status = 'CONFLICTED';
      cells[c.ref] = { status, value: c.v, evidence_refs: [...new Set(c.ev)].sort() };
    }
    return { row, dimension_expressible: anyObserved, cells };
  });

  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    columns: cols,
    row_names: ROWS,
    rows,
    legend: { OBSERVED: 'seen in the sample', NOT_OBSERVED_IN_SAMPLE: 'not seen for this competitor but seen for a peer — NOT proof of absence', UNKNOWN: 'not seen for anyone / dimension not expressible from the sample', CONFLICTED: 'sources disagree' },
    generated_by: 'deterministic:ucdm/competitor',
  };
  body.matrix_id = 'cmmx_' + sha256Hex(canonicalize({ ...body, matrix_id: undefined }));
  return deepFreeze(body);
}

function validateMatrix(m) {
  const errors = [];
  for (const r of m.rows) for (const [ref, cell] of Object.entries(r.cells)) if (!CELL_STATUS.includes(cell.status)) errors.push(`cell ${r.row}/${ref} status "${cell.status}" invalid`);
  return { valid: errors.length === 0, errors };
}

module.exports = { CELL_STATUS, ROWS, buildMatrix, validateMatrix };
