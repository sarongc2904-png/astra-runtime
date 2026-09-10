'use strict';
// [ASTRA-11C] Privacy / sensitive-data BOUNDARY (spec section L).
// This is a CONTRACT + deterministic hooks for later use — NOT a full privacy system.
// It classifies fields that may carry PII and provides a deterministic, shape-preserving
// redaction transform. Nothing is redacted automatically; a caller supplies a plan.
// No LLM, no web, no I/O.
const { sha256Hex, canonicalize } = require('../validation/canonical');

const SENSITIVE_CLASSES = Object.freeze(['EMAIL', 'PHONE', 'NAME', 'ADDRESS', 'ACCOUNT_IDENTIFIER', 'FREE_FORM_PERSONAL']);

// Deterministic detectors for the machine-detectable classes. NAME / ADDRESS /
// FREE_FORM_PERSONAL are NOT reliably detectable by regex — they are declared by the
// adapter/schema via `markedFields`, never guessed here.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?<!\w)\+?\d[\d ().-]{6,}\d(?!\w)/g;
const ACCOUNT_RE = /\b(acct|account|customer|cus|user|member)[_-]?\d{4,}\b/gi;

// classifyValue(value) -> [{class, match}] for detectable classes only.
function classifyValue(value) {
  if (typeof value !== 'string') return [];
  const hits = [];
  for (const m of value.match(EMAIL_RE) || []) hits.push({ class: 'EMAIL', match: m });
  for (const m of value.match(PHONE_RE) || []) hits.push({ class: 'PHONE', match: m });
  for (const m of value.match(ACCOUNT_RE) || []) hits.push({ class: 'ACCOUNT_IDENTIFIER', match: m });
  return hits;
}

// Deterministic, shape-preserving mask. Same input -> same masked output.
function maskValue(value, klass) {
  const s = String(value);
  switch (klass) {
    case 'EMAIL': return s.replace(EMAIL_RE, (m) => {
      const [u, d] = m.split('@'); const dot = d.lastIndexOf('.');
      return `${u[0] || 'x'}***@***${dot >= 0 ? d.slice(dot) : ''}`;
    });
    case 'PHONE': return s.replace(PHONE_RE, (m) => `***${m.replace(/\D/g, '').slice(-2)}`);
    case 'ACCOUNT_IDENTIFIER': return s.replace(ACCOUNT_RE, (m) => `${m.replace(/\d/g, '').replace(/[_-]$/, '')}_***`);
    case 'NAME': return '[NAME_REDACTED]';
    case 'ADDRESS': return '[ADDRESS_REDACTED]';
    case 'FREE_FORM_PERSONAL': return `[REDACTED:${sha256Hex(s).slice(0, 8)}]`;
    default: return s;
  }
}

// buildRedactionPlan(obj, { markedFields }) -> a plan naming every field path + class to redact.
// `markedFields` is a map of dotted-path -> SENSITIVE_CLASS declared by the caller/adapter.
function buildRedactionPlan(obj, { markedFields = {} } = {}) {
  const plan = [];
  const walk = (node, path) => {
    if (node == null) return;
    if (typeof node === 'string') {
      if (markedFields[path]) plan.push({ path, class: markedFields[path], mode: 'MARKED' });
      for (const h of classifyValue(node)) plan.push({ path, class: h.class, mode: 'DETECTED', match: h.match });
      return;
    }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (typeof node === 'object') { for (const k of Object.keys(node)) walk(node[k], path === '$' ? `$.${k}` : `${path}.${k}`); }
  };
  walk(obj, '$');
  return { plan, plan_hash: 'rdp_' + sha256Hex(canonicalize(plan)) };
}

// applyRedaction(obj, plan) -> { redacted, manifest }. Pure; returns a new object.
function applyRedaction(obj, plan) {
  const clone = JSON.parse(JSON.stringify(obj));
  const manifest = [];
  for (const step of plan) {
    const segs = step.path.replace(/^\$\.?/, '').split(/\.|\[|\]/).filter(Boolean);
    let ref = clone;
    for (let i = 0; i < segs.length - 1; i++) ref = ref && ref[isNaN(segs[i]) ? segs[i] : Number(segs[i])];
    if (ref == null) continue;
    const last = segs[segs.length - 1];
    const key = isNaN(last) ? last : Number(last);
    if (typeof ref[key] === 'string') { ref[key] = maskValue(ref[key], step.class); manifest.push({ path: step.path, class: step.class }); }
  }
  return { redacted: clone, manifest, manifest_hash: 'rdm_' + sha256Hex(canonicalize(manifest)) };
}

module.exports = { SENSITIVE_CLASSES, classifyValue, maskValue, buildRedactionPlan, applyRedaction };
