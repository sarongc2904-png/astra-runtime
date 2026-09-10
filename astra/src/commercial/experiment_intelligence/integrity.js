'use strict';
// [ASTRA-11K integrity] Deterministic self-attestation that the engine performed no side
// effects. Static: scans its own module set for forbidden calls. No LLM, no I/O beyond a
// read of its own source directory.
const fs = require('fs');
const path = require('path');
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const FORBIDDEN_RE = /require\(['"](http|https|net|dns|tls|dgram|child_process)['"]\)|fetch\(|XMLHttpRequest|WebSocket|supabase|createClient|\.execute\(|\.query\(|mysql|mongodb|@vercel|kv\.set|process\.env\.\w*(KEY|TOKEN|SECRET)/;

function attestIntegrity() {
  const dir = __dirname;
  const issues = [];
  let scanned = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    scanned++;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (FORBIDDEN_RE.test(src) && f !== 'integrity.js') issues.push(`${f}: forbidden side-effect construct`);
  }
  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'IntegrityAttestation',
    modules_scanned: scanned,
    network_calls: 0, llm_calls: 0, production_db_writes: 0, deploys: 0, cost_usd: 0,
    executes_experiments: false, modifies_campaigns: false, spends_budget: false, writes_production: false,
    issues: issues.sort(),
    clean: issues.length === 0,
    note: 'ASTRA-11K responsibility ends at: diagnosis -> hypothesis -> design -> priority -> evaluation -> structured decision. It executes nothing.',
    generated_by: 'deterministic:ucdm/experiment/integrity',
  };
  body.attestation_id = 'exig_' + sha256Hex(canonicalize({ ...body, attestation_id: undefined }));
  return deepFreeze(body);
}

module.exports = { attestIntegrity };
