'use strict';
// [ASTRA-11E §H] Observable competitor funnel components — from SUPPLIED observations only.
// NO crawling. A missing funnel observation stays UNKNOWN (never "they don't have it").
// Funnel *interpretation* (ordering / friction) is analytical. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');

const TOUCHPOINTS = Object.freeze(['ad', 'landing', 'lead_form', 'whatsapp_contact', 'call', 'booking', 'checkout', 'webinar', 'demo', 'consultation', 'trial']);
const COMMITMENT = Object.freeze(['NONE', 'CONTACT_DETAILS', 'CALL', 'PAYMENT', 'UNKNOWN']);

// deterministic CTA-text -> touchpoint / commitment mapping
const CTA_MAP = [
  [/agenda|reserva|booking|book/i, 'booking', 'CONTACT_DETAILS'],
  [/cotiza|cotización|cotizacion|quote/i, 'lead_form', 'CONTACT_DETAILS'],
  [/whatsapp|escríbenos|escribenos|contáct|contact/i, 'whatsapp_contact', 'CONTACT_DETAILS'],
  [/llama|call|teléfono|telefono/i, 'call', 'CALL'],
  [/compra|checkout|pagar|inscríbete|inscribete|empieza hoy/i, 'checkout', 'PAYMENT'],
  [/demo|prueba gratis|trial/i, 'trial', 'NONE'],
  [/webinar|masterclass/i, 'webinar', 'CONTACT_DETAILS'],
  [/consulta gratis|consultation|diagnóstico|diagnostico/i, 'consultation', 'CONTACT_DETAILS'],
];

// buildFunnelProfile({ profile, observations, messageObs, offerItems, pricingObs })
function buildFunnelProfile({ profile, observations = [], messageObs = [], pricingObs = [] }) {
  const ref = profile.competitor_ref;
  const steps = [];

  // ADVERTISEMENT / WEB_PAGE observation -> ad / landing touchpoint
  const mine = messageObs.filter(m => m.subject_ref === ref);
  if (mine.length) steps.push(mkStep('landing', null, 'NONE', mine.flatMap(m => m.evidence_refs), mine[0].source_ref, 'observed as a page/ad with messaging'));

  // CTA -> deeper touchpoint
  const ctas = mine.filter(m => m.message_field === 'cta').map(m => m.raw ? m.raw.verbatim_text : m.verbatim_text).filter(Boolean);
  for (const raw of mine.filter(m => m.message_field === 'cta')) {
    const text = raw.verbatim_text || (raw.raw && raw.raw.verbatim_text) || '';
    let tp = 'lead_form', commit = 'CONTACT_DETAILS';
    for (const [re, t, c] of CTA_MAP) if (re.test(nfcLF(text))) { tp = t; commit = c; break; }
    steps.push(mkStep(tp, text, commit, raw.evidence_refs, raw.source_ref, 'from observed CTA text'));
  }

  const price_visibility = pricingObs.some(p => p.subject_ref === ref) ? 'VISIBLE' : 'NOT_OBSERVED_IN_SAMPLE';

  const observedTouchpoints = [...new Set(steps.map(s => s.touchpoint))].sort();
  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    competitor_ref: ref,
    steps,
    observed_touchpoints: observedTouchpoints,
    // every touchpoint we did NOT see is UNKNOWN, not ABSENT
    touchpoint_status: Object.fromEntries(TOUCHPOINTS.map(t => [t, observedTouchpoints.includes(t) ? 'OBSERVED' : 'UNKNOWN'])),
    price_visibility,
    interpretation: { analytical: true, note: 'ordering/friction interpretation is analytical; only touchpoint presence is observed', produced_by: 'deterministic:ucdm/competitor' },
  };
  body.funnel_profile_id = 'cmfun_' + sha256Hex(canonicalize({ ...body, funnel_profile_id: undefined }));
  return deepFreeze(body);

  function mkStep(touchpoint, cta, required_commitment, evidence_refs, source_ref, note) {
    const s = { schema_version: 'ucdm-competitor-1.0.0', touchpoint, cta: cta || null, required_commitment, next_step: null, channel: 'UNKNOWN', friction: required_commitment === 'PAYMENT' ? 'HIGH' : required_commitment === 'NONE' ? 'LOW' : 'MEDIUM', evidence_refs: [...new Set(evidence_refs || [])].sort(), source_ref: source_ref || null, note };
    s.step_id = 'cmfs_' + sha256Hex(canonicalize({ ...s, step_id: undefined }));
    return deepFreeze(s);
  }
}

function validateFunnelProfile(f) {
  const errors = [];
  for (const [t, st] of Object.entries(f.touchpoint_status)) if (!['OBSERVED', 'UNKNOWN'].includes(st)) errors.push(`touchpoint ${t} status "${st}" — must be OBSERVED or UNKNOWN (never ABSENT)`);
  if (f.interpretation && f.interpretation.analytical !== true) errors.push('funnel interpretation must be marked analytical');
  return { valid: errors.length === 0, errors };
}

module.exports = { TOUCHPOINTS, COMMITMENT, buildFunnelProfile, validateFunnelProfile };
