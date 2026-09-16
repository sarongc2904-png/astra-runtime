#!/usr/bin/env node
const fs = require('fs');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: node adjudicate_campaign360.js <result.json>');
  process.exit(2);
}

const result = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const normalize = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

// Accept all claim-body aliases observed across real Campaign360 runs.
const claimText = (item) => item?.text || item?.claim || item?.assertion || item?.statement || '';

const collectClaims = (obj) => {
  const claims = [];
  for (const [section, value] of Object.entries(obj || {})) {
    if (!Array.isArray(value) || section === 'evidence_used') continue;
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (!item || typeof item !== 'object') continue;
      const text = claimText(item);
      const classification = String(item.classification || item.type || '').toUpperCase();
      if (!text || !classification) continue;
      claims.push({
        section,
        index: i,
        text,
        classification,
        evidence_ids: Array.isArray(item.evidence_ids) ? item.evidence_ids.filter(Boolean).map(String) : [],
      });
    }
  }
  return claims;
};

const evidenceUsed = Array.isArray(result.evidence_used) ? result.evidence_used : [];
const evidenceIds = evidenceUsed
  .map(item => String(item?.evidence_id || '').trim())
  .filter(Boolean);
const evidenceIdSet = new Set(evidenceIds);
const duplicateEvidenceIds = evidenceIds.filter((id, index) => evidenceIds.indexOf(id) !== index);

const canonicalText = normalize(
  Array.isArray(result.canonical_brief)
    ? result.canonical_brief.map(x => claimText(x)).join(' | ')
    : JSON.stringify(result.canonical_brief || {})
);

const checks = [
  {
    key: 'business',
    pass: canonicalText.includes('infoproduct') && canonicalText.includes('estetica'),
    expected: 'infoproduct for estéticas',
  },
  {
    key: 'product',
    pass: canonicalText.includes('metodo 360') && canonicalText.includes('mini curso'),
    expected: 'mini curso Método 360',
  },
  {
    key: 'price',
    pass: canonicalText.includes('400 mxn'),
    expected: '400 MXN',
  },
  {
    key: 'market',
    pass: canonicalText.includes('mexico'),
    expected: 'México',
  },
  {
    key: 'objective',
    pass: canonicalText.includes('vender') && canonicalText.includes('mini curso'),
    expected: 'sell the mini course',
  },
  {
    key: 'conversion_channel',
    pass: canonicalText.includes('whatsapp'),
    expected: 'WhatsApp',
  },
  {
    key: 'core_proposition',
    pass: canonicalText.includes('estetica') && canonicalText.includes('agenda') && canonicalText.includes('cita'),
    expected: 'teach estéticas how to fill their appointment agenda',
  },
];

const fidelityPass = checks.filter(x => x.pass).length;
const briefFidelityPct = Number(((fidelityPass / checks.length) * 100).toFixed(2));

const claims = collectClaims(result);

const canonicalSupportPatterns = [
  ['infoproduct', 'estetica'],
  ['mini curso', 'metodo 360'],
  ['400 mxn'],
  ['mexico'],
  ['whatsapp'],
  ['vender', 'mini curso'],
  ['agenda', 'cita'],
  ['audiencia', 'estetica'],
  ['mercado', 'mexico'],
  ['precio', '400 mxn'],
  ['producto', 'metodo 360'],
];

const isCanonicalSupported = (text) => {
  const n = normalize(text);
  return canonicalSupportPatterns.some(parts => parts.every(p => n.includes(p)));
};

const evidenceResolution = (ids) => {
  const resolved = ids.filter(id => evidenceIdSet.has(id));
  const unresolved = ids.filter(id => !evidenceIdSet.has(id));
  return { resolved, unresolved, allResolve: ids.length > 0 && unresolved.length === 0 };
};

const unsupportedClaims = [];
const groundedClaims = [];
const qualifiedClaims = [];
let groundable = 0;
let grounded = 0;

for (const claim of claims) {
  const c = claim.classification;
  const ev = evidenceResolution(claim.evidence_ids);
  if (c === 'FACT') {
    groundable++;
    const canonical = isCanonicalSupported(claim.text);
    const supported = canonical || ev.allResolve;
    if (supported) {
      grounded++;
      groundedClaims.push({
        ...claim,
        support: canonical ? 'canonical_brief' : 'resolved_evidence_ids',
        resolved_evidence_ids: ev.resolved,
      });
    } else {
      unsupportedClaims.push({
        ...claim,
        reason: claim.evidence_ids.length > 0
          ? `FACT has unresolved evidence_ids: ${ev.unresolved.join(',')}`
          : 'FACT without canonical-brief match or resolved evidence_ids',
      });
    }
  } else if (c === 'EVIDENCE') {
    groundable++;
    if (ev.allResolve) {
      grounded++;
      groundedClaims.push({ ...claim, support: 'resolved_evidence_ids', resolved_evidence_ids: ev.resolved });
    } else {
      unsupportedClaims.push({
        ...claim,
        reason: claim.evidence_ids.length === 0
          ? 'EVIDENCE without evidence_ids'
          : `EVIDENCE has unresolved evidence_ids: ${ev.unresolved.join(',')}`,
      });
    }
  } else if (['INFERENCE', 'RECOMMENDATION', 'UNKNOWN'].includes(c)) {
    qualifiedClaims.push(claim);
  } else {
    unsupportedClaims.push({ ...claim, reason: `unrecognized classification ${c}` });
  }
}

const knowledgeGroundingPct = groundable === 0 ? 0 : Number(((grounded / groundable) * 100).toFixed(2));

const factTexts = claims.filter(c => c.classification === 'FACT').map(c => normalize(c.text));
let crossNodeContradictions = 0;
const contradictoryFactChecks = [
  { key: 'price', conflict: t => /\b\d+[\d,.]*\s*mxn\b/.test(t) && !t.includes('400 mxn') },
  { key: 'channel', conflict: t => t.includes('canal de conversion') && !t.includes('whatsapp') },
  { key: 'market', conflict: t => t.includes('mercado') && /estados unidos|usa|eeuu|colombia|argentina|espana/.test(t) },
];
for (const rule of contradictoryFactChecks) {
  if (factTexts.some(rule.conflict)) crossNodeContradictions++;
}

const criticalHallucinations = unsupportedClaims.filter(c => c.classification === 'FACT' || c.classification === 'EVIDENCE').length;

const evidenceRegistryValid = evidenceUsed.length > 0 && duplicateEvidenceIds.length === 0;

const out = {
  metric_version: 'ASTRA_NEXT_CLAIM_ADJUDICATOR_V1_3',
  brief_fidelity_pct: briefFidelityPct,
  brief_checks: checks,
  critical_hallucinations: criticalHallucinations,
  knowledge_grounding_pct: knowledgeGroundingPct,
  cross_node_contradictions: crossNodeContradictions,
  evidence_registry: {
    evidence_used_count: evidenceUsed.length,
    unique_evidence_ids: evidenceIdSet.size,
    duplicate_evidence_ids: [...new Set(duplicateEvidenceIds)],
    valid: evidenceRegistryValid,
  },
  claim_counts: {
    total_classified_claims: claims.length,
    groundable_fact_or_evidence_claims: groundable,
    grounded_fact_or_evidence_claims: grounded,
    qualified_inference_recommendation_unknown_claims: qualifiedClaims.length,
    unsupported_claims: unsupportedClaims.length,
  },
  unsupported_claims: unsupportedClaims,
  gate: {
    brief_fidelity_pass: briefFidelityPct === 100,
    hallucination_pass: criticalHallucinations === 0,
    grounding_pass: knowledgeGroundingPct >= 90,
    contradiction_pass: crossNodeContradictions === 0,
    evidence_registry_pass: evidenceRegistryValid,
  },
};

out.status = Object.values(out.gate).every(Boolean) ? 'PASS' : 'FAIL';
process.stdout.write(JSON.stringify(out, null, 2));
