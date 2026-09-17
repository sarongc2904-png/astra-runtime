'use strict';
const crypto = require('crypto');
const router = require('./astra_tool_router');

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_JOBS = 500;
const jobs = new Map();

function nowIso() { return new Date().toISOString(); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function prune(ttlMs = DEFAULT_TTL_MS, maxJobs = DEFAULT_MAX_JOBS) {
  const cutoff = Date.now() - ttlMs;
  for (const [id, job] of jobs) {
    if (Date.parse(job.updated_at || job.created_at) < cutoff) jobs.delete(id);
  }
  if (jobs.size <= maxJobs) return;
  const ordered = [...jobs.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (let i = 0; i < ordered.length && jobs.size > maxJobs; i += 1) jobs.delete(ordered[i].job_id);
}
function publicJob(job, includeResult = false) {
  const out = {
    job_id: job.job_id, status: job.status, created_at: job.created_at,
    started_at: job.started_at || null, completed_at: job.completed_at || null,
    updated_at: job.updated_at, triggers_action: false,
  };
  if (job.error) out.error = clone(job.error);
  if (job.reason) out.reason = job.reason;
  if (job.failed_node) out.failed_node = job.failed_node;
  if (Array.isArray(job.brief_fidelity_violations) && job.brief_fidelity_violations.length) out.brief_fidelity_violations = clone(job.brief_fidelity_violations);
  if (job.canonical_brief_facts) out.canonical_brief_facts = clone(job.canonical_brief_facts);
  if (Array.isArray(job.completed_nodes)) out.completed_nodes = clone(job.completed_nodes);
  if (job.usage) out.usage = clone(job.usage);
  if (includeResult && job.result) out.result = clone(job.result);
  return out;
}
function start(body, options = {}, env = process.env, headers = {}) {
  prune(options.asyncJobTtlMs, options.asyncMaxJobs);
  const errors = router.validate('runAstraCampaign360', body);
  if (errors.length) return { statusCode: errors.some(x => /exceeds/.test(x)) ? 422 : 400, body: { status: 'FAILED', error: { code: 'INVALID_INPUT', message: 'Request validation failed', details: errors }, triggers_action: false } };
  const jobId = crypto.randomUUID(); const created = nowIso();
  const job = { job_id: jobId, status: 'QUEUED', created_at: created, updated_at: created, request: clone(body), result: null, error: null };
  jobs.set(jobId, job);
  Promise.resolve().then(async () => {
    job.status = 'RUNNING'; job.started_at = nowIso(); job.updated_at = job.started_at;
    try {
      const routed = await router.route({ tool: 'runAstraCampaign360', body: job.request, headers }, options, env);
      job.result = clone(routed);
      const resultBody = routed.body || {};
      const failed = routed.statusCode >= 400 || resultBody.status === 'FAILED';
      job.status = failed ? 'FAILED' : 'COMPLETE';
      if (failed) {
        const reason = typeof resultBody.reason === 'string' && resultBody.reason ? resultBody.reason : null;
        const violations = Array.isArray(resultBody.brief_fidelity_violations) ? resultBody.brief_fidelity_violations : [];
        const firstViolation = violations.find(v => v && typeof v === 'object') || null;
        const errorCode = resultBody.error?.code || reason || 'CAMPAIGN_FAILED';
        const errorMessage = resultBody.error?.message || (reason ? `Campaign 360 failed: ${reason}` : 'Campaign 360 failed');
        job.error = { code: errorCode, message: errorMessage };
        if (resultBody.error?.details != null) job.error.details = clone(resultBody.error.details);
        if (reason) job.reason = reason;
        if (violations.length) job.brief_fidelity_violations = clone(violations);
        if (resultBody.canonical_brief_facts) job.canonical_brief_facts = clone(resultBody.canonical_brief_facts);
        if (Array.isArray(resultBody.completed_nodes)) job.completed_nodes = clone(resultBody.completed_nodes);
        if (resultBody.usage) job.usage = clone(resultBody.usage);
        if (firstViolation && typeof firstViolation.node === 'string' && firstViolation.node) job.failed_node = firstViolation.node;
      }
    } catch (err) {
      job.status = 'FAILED';
      job.error = { code: err?.code || 'RUNTIME_FAILURE', message: String(err?.message || 'Campaign 360 async execution failed') };
    }
    job.completed_at = nowIso(); job.updated_at = job.completed_at;
  });
  return { statusCode: 202, body: publicJob(job, false) };
}
function lookup(jobId, includeResult, options = {}) {
  prune(options.asyncJobTtlMs, options.asyncMaxJobs);
  if (!jobId || typeof jobId !== 'string') return { statusCode: 400, body: { status: 'FAILED', error: { code: 'INVALID_INPUT', message: 'job_id is required' }, triggers_action: false } };
  const job = jobs.get(jobId);
  if (!job) return { statusCode: 404, body: { status: 'FAILED', error: { code: 'JOB_NOT_FOUND', message: 'Campaign 360 job not found or expired' }, triggers_action: false } };
  if (includeResult && (job.status === 'QUEUED' || job.status === 'RUNNING')) return { statusCode: 202, body: publicJob(job, false) };
  return { statusCode: 200, body: publicJob(job, includeResult) };
}
function status(jobId, options = {}) { return lookup(jobId, false, options); }
function result(jobId, options = {}) { return lookup(jobId, true, options); }
function resetForTests() { jobs.clear(); }
module.exports = { start, status, result, publicJob, prune, resetForTests, DEFAULT_TTL_MS, DEFAULT_MAX_JOBS };
