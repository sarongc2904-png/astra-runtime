'use strict';
// Handoff runtime support — keep astra/CURRENT_TASK.md and astra/HANDOFF_LATEST.md consistent.
// Minimal helpers; the canonical protocol is in astra/CLAUDE_CODE_CODEX_HANDOFF_PROTOCOL.md.
const fs = require('fs');
const path = require('path');

const ASTRA_DIR = path.join(__dirname, '..', '..');
const CURRENT_TASK = path.join(ASTRA_DIR, 'CURRENT_TASK.md');
const HANDOFF_LATEST = path.join(ASTRA_DIR, 'HANDOFF_LATEST.md');

const REQUIRED_CURRENT_TASK_SECTIONS = ['Task id', 'Objective', 'Authorized scope', 'Completed work',
  'Files changed', 'Files inspected', 'Decisions made', 'Tests run', 'Tests pending', 'Blockers',
  'EXACT next step', 'Prohibited actions', 'Git diff summary', 'Runtime state', 'Unresolved questions'];
const REQUIRED_HANDOFF_SECTIONS = ['Where we are', 'Objective & authorized scope', 'How to resume in one step',
  'Runtime / env to reproduce', 'Prohibitions'];

function checkComplete(filePath, requiredSections) {
  if (!fs.existsSync(filePath)) return { complete: false, missing: ['file does not exist'], path: filePath };
  const text = fs.readFileSync(filePath, 'utf8');
  const missing = requiredSections.filter(s => !text.includes(s));
  return { complete: missing.length === 0, missing, path: filePath, bytes: text.length };
}

function verifyHandoffOperational() {
  const ct = checkComplete(CURRENT_TASK, REQUIRED_CURRENT_TASK_SECTIONS);
  const hl = checkComplete(HANDOFF_LATEST, REQUIRED_HANDOFF_SECTIONS);
  return { operational: ct.complete && hl.complete, current_task: ct, handoff_latest: hl };
}

// append a timestamped line under a section-like anchor (non-destructive nudge for automation)
function appendNote(filePath, note) {
  const stamp = `\n<!-- ${new Date().toISOString()} --> ${note}\n`;
  fs.appendFileSync(filePath, stamp);
}

module.exports = { CURRENT_TASK, HANDOFF_LATEST, REQUIRED_CURRENT_TASK_SECTIONS, REQUIRED_HANDOFF_SECTIONS, checkComplete, verifyHandoffOperational, appendNote };
