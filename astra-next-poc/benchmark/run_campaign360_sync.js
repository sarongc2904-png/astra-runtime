#!/usr/bin/env node
const fs = require('fs');

const workspaceSlug = process.argv[2] || 'astra-next';
const promptPath = process.argv[3];
const outputPath = process.argv[4];
if (!promptPath || !outputPath) {
  console.error('usage: node run_campaign360_sync.js <workspace-slug> <prompt-file> <output-file>');
  process.exit(2);
}

const message = fs.readFileSync(promptPath, 'utf8').trim();
if (!message) {
  console.error('benchmark prompt is empty');
  process.exit(2);
}

async function main() {
  process.chdir('/app/server');
  const { Workspace } = require('/app/server/models/workspace');
  const { ApiChatHandler } = require('/app/server/utils/chats/apiChatHandler');

  const workspace = await Workspace.get({ slug: workspaceSlug });
  if (!workspace) throw new Error(`workspace not found: ${workspaceSlug}`);

  const startedAt = Date.now();
  const result = await ApiChatHandler.chatSync({
    workspace,
    message,
    mode: 'chat',
    user: null,
    thread: null,
    sessionId: 'astra-next-05-metodo360-control-v1-sync',
    attachments: [],
    reset: true,
  });
  const durationMs = Date.now() - startedAt;

  fs.writeFileSync(outputPath, JSON.stringify({ duration_ms: durationMs, result }, null, 2));
  console.log(`[ASTRA_NEXT_SYNC_RUNNER] completed duration_ms=${durationMs} output=${outputPath}`);
}

main().catch((error) => {
  console.error(`[ASTRA_NEXT_SYNC_RUNNER_ERROR] ${error?.stack || error?.message || error}`);
  process.exit(1);
});
