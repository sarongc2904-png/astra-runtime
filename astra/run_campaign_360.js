'use strict';
// ASTRA one-command CLI — runs MARKETING_CAMPAIGN_360 via the configured provider (OpenRouter | LM Studio).
// Usage:
//   node astra/run_campaign_360.js --input "Create a client acquisition campaign for a laser hair removal clinic."
//   node astra/run_campaign_360.js --input-file brief.txt [--json]
// Never prints API keys/secrets. Surfaces WAITING_FOR_INPUT / BLOCKED / FAILED honestly.
const fs = require('fs');
const rc = require('./src/runtime/runtime_config');
const providerFactory = require('./src/runtime/llm_provider');
const H = require('./src/workflows/marketing_campaign_360_hardened');

function parseArgs(argv) {
  const a = { json: false }; for (let i = 2; i < argv.length; i++) { const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k === '--input') a.input = argv[++i];
    else if (k === '--input-file') a.inputFile = argv[++i];
    else if (k === '--provider') a.provider = argv[++i];
    else if (k === '--health') a.health = true; }
  return a;
}

(async () => {
  const args = parseArgs(process.argv);
  const env = Object.assign({}, process.env); if (args.provider) env.ASTRA_LLM_PROVIDER = args.provider;
  const cfg = rc.load(env);
  const diag = rc.sanitized(cfg);

  // config validation (fail-closed, clear)
  const v = rc.validate(cfg);
  if (!v.valid) {
    const out = { status: 'CONFIG_INVALID', errors: v.errors, provider: cfg.provider, model: cfg.model, diagnostics: diag };
    console.log(args.json ? JSON.stringify(out, null, 2) : ('CONFIG_INVALID\n- ' + v.errors.join('\n- ')));
    process.exit(2);
  }

  let provider;
  try { provider = providerFactory.createProvider(cfg); }
  catch (e) { console.log(args.json ? JSON.stringify({ status: 'PROVIDER_ERROR', error: rc.redact(e.message, cfg), diagnostics: diag }, null, 2) : ('PROVIDER_ERROR: ' + rc.redact(e.message, cfg))); process.exit(2); }

  if (args.health) {
    const h = await provider.healthCheck();
    console.log(JSON.stringify({ health: h, diagnostics: diag }, null, 2)); process.exit(h.ok ? 0 : 1);
  }

  // resolve brief
  let input = args.input;
  if (!input && args.inputFile) { try { input = fs.readFileSync(args.inputFile, 'utf8').trim(); } catch (e) { console.log('INPUT_FILE_ERROR: ' + e.message); process.exit(2); } }
  if (!input) { console.log('USAGE: node astra/run_campaign_360.js --input "..." | --input-file brief.txt [--json] [--provider openrouter|lmstudio] [--health]'); process.exit(2); }

  let result;
  try {
    result = await H.run(input, { mode: 'llm', retrieve: true, llm: (s, u, o) => provider.runner(s, u, o) });
  } catch (e) {
    const out = { status: 'FAILED', error: rc.redact(e.message, cfg), provider: cfg.provider, model: cfg.model, diagnostics: diag };
    console.log(args.json ? JSON.stringify(out, null, 2) : ('FAILED: ' + rc.redact(e.message, cfg)));
    process.exit(1);
  }

  const status = result.workflow_state_status;
  const payload = {
    workflow_id: result.workflow_id, status,
    completed_nodes: (result.node_outputs || []).map(n => n.work_unit_id),
    selected_methods: Object.fromEntries(Object.entries(result.selected_methods_by_node || {}).map(([k, x]) => [k, x.primary_method])),
    provider: cfg.provider, model: cfg.model,
    final_synthesis: result.synthesis ? result.synthesis.deliverable : null,
    current_research_required: result.synthesis ? result.synthesis.deliverable['17_current_research_required'] : (result.required_inputs || []),
    limitations: result.synthesis ? result.synthesis.deliverable['16_known_limitations'] : [],
    usage: result.cost ? { model_calls: result.cost.model_calls, tokens: result.cost.tokens, by_tier: result.cost.by_tier } : null,
    reason: result.reason || null, required_inputs: result.required_inputs || null,
  };

  if (args.json) { console.log(JSON.stringify(payload, null, 2)); process.exit(status === 'COMPLETE' ? 0 : 1); }

  if (status === 'WAITING_FOR_INPUT') { console.log('WAITING_FOR_INPUT — ' + (result.reason || '') + '\nProvide: ' + (result.required_inputs || []).join(', ')); process.exit(1); }
  if (status !== 'COMPLETE') { console.log(status + ' — workflow did not complete. No plan produced.'); process.exit(1); }

  const d = payload.final_synthesis;
  console.log('=== ASTRA MARKETING_CAMPAIGN_360 (' + cfg.provider + ' / ' + cfg.model + ') ===');
  console.log('status: COMPLETE  nodes: ' + payload.completed_nodes.length + '/8 + synthesis');
  console.log('methods: ' + JSON.stringify(payload.selected_methods));
  for (const k of Object.keys(d)) { console.log('\n[' + k + ']'); console.log(typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k], null, 2)); }
  console.log('\n(usage: ' + JSON.stringify(payload.usage) + ')');
  process.exit(0);
})();
