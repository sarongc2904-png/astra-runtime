'use strict';
// [ASTRA-11G §G §H] Canonical BuyerPersona + deterministic narrative rendering.
// Every field is evidence-backed or UNKNOWN. NO plausible-but-unsupported filler
// (no age / name / family / income / lifestyle unless explicitly supplied). Persona
// quality = decision usefulness + evidence fidelity, NOT vividness. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');
const { classifyAwareness } = require('./awareness');
const { classifyUrgency } = require('./urgency');
const { classifyBudgetSignal } = require('./budget_signal');
const AE = require('./attribute_evidence');

const PERSONA_SCHEMA_VERSION = 'ucdm-customer-model-1.0.0';
const UNKNOWN = { status: 'UNKNOWN' };

const FUNCTIONAL_PAIN_CONCEPTS = ['SLOW_SERVICE', 'RESPONSIVENESS_COMPLAINT', 'PROCESS_UNCLEAR', 'PAIN_EXPERIENCED'];
const EMOTIONAL_PAIN_CONCEPTS = ['PAIN_FEAR', 'RESULTS_UNCERTAINTY', 'TRUST_CONCERN'];
const DESIRE_CONCEPTS = ['RESULTS_DESIRED', 'SPEED_NEED', 'CONVENIENCE_VALUE'];
const PROOF_CONCEPTS = ['GUARANTEE_DEMAND', 'RESULTS_UNCERTAINTY', 'TRUST_CONCERN'];
const FRICTION_CONCEPTS = ['PROCESS_UNCLEAR', 'RESPONSIVENESS_COMPLAINT', 'SLOW_SERVICE'];

function conceptList(obs, concepts, aspects) {
  const rows = obs.filter(o => o.status === 'OBSERVED' && (concepts ? concepts.includes(o.normalized_concept) : aspects.includes(o.aspect)));
  if (rows.length === 0) return UNKNOWN;
  const byConcept = {};
  for (const o of rows) (byConcept[o.normalized_concept] = byConcept[o.normalized_concept] || { concept: o.normalized_concept, evidence_refs: new Set(), observation_count: 0 });
  for (const o of rows) { byConcept[o.normalized_concept].observation_count++; for (const er of o.evidence_refs) byConcept[o.normalized_concept].evidence_refs.add(er); }
  return Object.values(byConcept).map(x => ({ concept: x.concept, observation_count: x.observation_count, evidence_refs: [...x.evidence_refs].sort() }))
    .sort((a, b) => b.observation_count - a.observation_count || (a.concept < b.concept ? -1 : 1));
}

// buildBuyerPersona({ segment, observations, vocResult, businessInput })
//   observations: the OBSERVED Voc observations attributed to this segment's members
//     (or sample-wide for a HYPOTHESIS segment).
function buildBuyerPersona({ segment, observations = [], vocResult = {}, businessInput = {} }) {
  const obs = observations.filter(o => o.status === 'OBSERVED');
  const evAll = [...new Set(obs.flatMap(o => o.evidence_refs))].sort();

  const awareness = classifyAwareness(obs, { alternatives: vocResult.alternatives || [], questions: vocResult.questions || [] });
  const urgency = classifyUrgency({ triggers: vocResult.triggers || [], observations: obs });
  const budget = classifyBudgetSignal({ observations: obs });

  const questions = (vocResult.questions || []).filter(q => obs.some(o => o.source_ref === q.source_ref));
  const triggers = [...new Set((vocResult.triggers || []).filter(t => obs.some(o => o.source_ref === t.source_ref)).map(t => t.trigger_type))].sort();
  const alternatives = [...new Set((vocResult.alternatives || []).filter(a => obs.some(o => o.source_ref === a.source_ref)).map(a => a.alternative_type))].sort();
  const criteria = [...new Set((vocResult.criteria || []).filter(c => obs.some(o => o.source_ref === c.source_ref)).map(c => c.criterion))].sort();

  // buying-language refs: exact VoC phrases only, by aspect, from ASTRA-11F library.
  const bl = vocResult.buyingLanguage || null;
  const buying_language_refs = bl ? buildBuyingLanguageRefs(bl, obs) : UNKNOWN;

  // explicit (USER_PROVIDED) attributes — the ONLY route for otherwise-prohibited fields
  const explicit = {};
  for (const ex of (businessInput.explicit_attributes || [])) explicit[String(ex.attribute)] = { value: ex.value, source_class: 'USER_PROVIDED', evidence_refs: ex.evidence_refs || [] };

  const persona = {
    schema_version: PERSONA_SCHEMA_VERSION,
    kind: 'BuyerPersona',
    segment_refs: [segment.segment_id],
    label: segment.label,
    current_situation: pickConcept(obs, ['PAIN_EXPERIENCED', 'SLOW_SERVICE', 'RESPONSIVENESS_COMPLAINT', 'PROCESS_UNCLEAR']) || UNKNOWN,
    desired_situation: pickConcept(obs, DESIRE_CONCEPTS) || UNKNOWN,
    primary_problem: segment.primary_dimension === 'problem'
      ? { concept: segment.primary_concept, evidence_refs: segment.supporting_evidence_refs }
      : (pickConcept(obs, ['PAIN_EXPERIENCED', 'PAIN_FEAR', 'SLOW_SERVICE']) || UNKNOWN),
    secondary_problems: conceptList(obs, null, ['PAIN', 'OBJECTION', 'BARRIER', 'COMPLAINT', 'FRUSTRATION']),
    functional_pains: conceptList(obs, FUNCTIONAL_PAIN_CONCEPTS),
    emotional_pains: conceptList(obs, EMOTIONAL_PAIN_CONCEPTS),
    desired_outcomes: conceptList(obs, null, ['DESIRE', 'OUTCOME', 'EXPECTATION', 'BENEFIT']),
    fears: conceptList(obs, null, ['FEAR', 'RISK', 'UNCERTAINTY']),
    objections: conceptList(obs, null, ['OBJECTION', 'REASON_NOT_TO_BUY']),
    triggers: triggers.length ? triggers : UNKNOWN,
    alternatives: alternatives.length ? alternatives : UNKNOWN,
    decision_criteria: criteria.length ? criteria : UNKNOWN,
    reasons_to_buy: conceptList(obs, null, ['REASON_TO_BUY', 'BENEFIT']),
    reasons_not_to_buy: conceptList(obs, null, ['REASON_NOT_TO_BUY', 'OBJECTION']),
    awareness: { stage: awareness.stage, basis: awareness.basis, evidence_refs: awareness.evidence_refs },
    urgency: { level: urgency.level, basis: urgency.basis, evidence_refs: urgency.evidence_refs },
    budget_signal: { signal: budget.signal, basis: budget.basis, evidence_refs: budget.evidence_refs },
    channels: explicit.channel ? { value: explicit.channel.value, source_class: 'USER_PROVIDED' } : UNKNOWN,
    questions: questions.length ? questions.map(q => ({ verbatim_question: q.verbatim_question, question_type: q.question_type, evidence_refs: q.evidence_refs })) : UNKNOWN,
    buying_language_refs,
    proof_needed: obs.some(o => PROOF_CONCEPTS.includes(o.normalized_concept))
      ? { needed: true, concepts: [...new Set(obs.filter(o => PROOF_CONCEPTS.includes(o.normalized_concept)).map(o => o.normalized_concept))].sort(), evidence_refs: [...new Set(obs.filter(o => PROOF_CONCEPTS.includes(o.normalized_concept)).flatMap(o => o.evidence_refs))].sort() }
      : UNKNOWN,
    friction: obs.some(o => FRICTION_CONCEPTS.includes(o.normalized_concept))
      ? { concepts: [...new Set(obs.filter(o => FRICTION_CONCEPTS.includes(o.normalized_concept)).map(o => o.normalized_concept))].sort(), evidence_refs: [...new Set(obs.filter(o => FRICTION_CONCEPTS.includes(o.normalized_concept)).flatMap(o => o.evidence_refs))].sort() }
      : UNKNOWN,
    explicit_attributes: explicit,
    evidence_refs: evAll,
    scope: segment.scope,
    confidence: assess({ evidence_count: evAll.length, distinct_sources: segment.observed_sample.unique_source_count, coverage: 0.5, agree_count: obs.length, conflict_count: segment.contradiction_status === 'POLARIZED' ? 1 : 0, newest_evidence_age_days: 90 }),
  };

  // coverage + unknowns
  const unknowns = [];
  for (const k of ['current_situation', 'desired_situation', 'primary_problem', 'triggers', 'alternatives', 'decision_criteria', 'channels', 'questions', 'buying_language_refs', 'proof_needed', 'friction']) {
    if (persona[k] && persona[k].status === 'UNKNOWN') unknowns.push(k);
  }
  for (const k of ['secondary_problems', 'functional_pains', 'emotional_pains', 'desired_outcomes', 'fears', 'objections', 'reasons_to_buy', 'reasons_not_to_buy']) {
    if (persona[k] && persona[k].status === 'UNKNOWN') unknowns.push(k);
  }
  for (const d of AE.PROHIBITED_INFERENCE_ATTRIBUTES) if (!explicit[d]) unknowns.push(d);
  persona.unknowns = [...new Set(unknowns)].sort();
  persona.coverage = {
    fields_total: 19,
    fields_known: 19 - persona.unknowns.filter(u => !AE.PROHIBITED_INFERENCE_ATTRIBUTES.includes(u)).length,
    demographic_fields: 'UNKNOWN by policy unless explicitly supplied',
    note: 'missing evidence is represented as UNKNOWN — never filled with plausible fiction',
  };
  persona.persona_id = 'per_' + sha256Hex(canonicalize({ ...persona, persona_id: undefined, confidence: persona.confidence.content_hash }));
  return deepFreeze(persona);
}

function pickConcept(obs, concepts) {
  const rows = obs.filter(o => o.status === 'OBSERVED' && concepts.includes(o.normalized_concept));
  if (rows.length === 0) return null;
  const top = rows.sort((a, b) => (a.normalized_concept < b.normalized_concept ? -1 : 1))[0];
  return { concept: top.normalized_concept, evidence_refs: [...new Set(rows.flatMap(o => o.evidence_refs))].sort() };
}

function buildBuyingLanguageRefs(bl, obs) {
  const wanted = new Set(obs.flatMap(o => o.evidence_refs));
  const byAspect = {};
  for (const [aspect, section] of Object.entries(bl.library || {})) {
    if (section.status === 'UNKNOWN') continue;
    const phrases = (section.top_phrases || []).filter(p => (p.evidence_refs || []).some(er => wanted.has(er)))
      .map(p => ({ phrase: p.phrase, variants: p.variants || [], evidence_refs: p.evidence_refs || [] }));
    if (phrases.length) byAspect[aspect] = phrases;
  }
  return Object.keys(byAspect).length ? { library_id: bl.library_id, contains_generated_copy: false, by_aspect: byAspect } : UNKNOWN;
}

// §H — deterministic narrative. ONLY canonical field values are interpolated; the function
// is pure so validateNarrative can recompute and assert byte-equality (no new facts).
function renderNarrative(persona) {
  const L = [];
  const cs = fmt(persona.current_situation), ds = fmt(persona.desired_situation), pp = fmt(persona.primary_problem);
  L.push(`Segment: ${persona.label}.`);
  L.push(`Current situation: ${cs}. Desired situation: ${ds}.`);
  L.push(`Primary problem: ${pp}.`);
  L.push(`Functional pains: ${listFmt(persona.functional_pains)}. Emotional pains: ${listFmt(persona.emotional_pains)}.`);
  L.push(`Desired outcomes: ${listFmt(persona.desired_outcomes)}. Fears: ${listFmt(persona.fears)}. Objections: ${listFmt(persona.objections)}.`);
  L.push(`Triggers: ${arrFmt(persona.triggers)}. Alternatives considered: ${arrFmt(persona.alternatives)}. Decision criteria: ${arrFmt(persona.decision_criteria)}.`);
  L.push(`Awareness: ${persona.awareness.stage} (${persona.awareness.basis}). Urgency: ${persona.urgency.level} (${persona.urgency.basis}). Budget signal: ${persona.budget_signal.signal} (${persona.budget_signal.basis}).`);
  L.push(`Proof needed: ${persona.proof_needed.status === 'UNKNOWN' ? 'UNKNOWN' : persona.proof_needed.concepts.join(', ')}. Friction: ${persona.friction.status === 'UNKNOWN' ? 'UNKNOWN' : persona.friction.concepts.join(', ')}.`);
  L.push(`Unknown / not evidenced: ${persona.unknowns.join(', ') || 'none'}.`);
  L.push('This persona is an analytical rendering of evidenced fields only. No demographic, psychographic, or lifestyle detail is asserted unless explicitly supplied.');
  return deepFreeze({
    schema_version: PERSONA_SCHEMA_VERSION, kind: 'PersonaNarrative', persona_ref: persona.persona_id,
    text: L.join('\n'), is_analytical: true, adds_no_new_facts: true,
    generated_by: 'deterministic:ucdm/customer_model/narrative',
  });
}
function fmt(f) { return !f || f.status === 'UNKNOWN' ? 'UNKNOWN' : (f.concept || 'UNKNOWN'); }
function listFmt(f) { return !f || f.status === 'UNKNOWN' ? 'UNKNOWN' : f.map(x => x.concept).join(', '); }
function arrFmt(f) { return !f || f.status === 'UNKNOWN' ? 'UNKNOWN' : (Array.isArray(f) ? f.join(', ') : 'UNKNOWN'); }

// validateNarrative — the narrative must be exactly what renderNarrative produces for this
// persona (no injected facts) and must not contain demographic filler.
function validateNarrative(narrative, persona) {
  const errors = [];
  const expected = renderNarrative(persona).text;
  if (narrative.text !== expected) errors.push('narrative text diverges from the deterministic rendering of canonical fields (possible injected fact)');
  if (AE.PROHIBITED_RE.test(narrative.text.replace(/Unknown \/ not evidenced:.*/s, ''))) errors.push('narrative contains demographic/psychographic filler');
  if (narrative.adds_no_new_facts !== true) errors.push('narrative must assert adds_no_new_facts');
  return { valid: errors.length === 0, errors };
}

function validatePersona(p, evidenceRefSet = null) {
  const errors = [];
  if (p.segment_refs.length === 0) errors.push('persona must reference at least one segment');
  for (const k of ['primary_problem', 'functional_pains', 'emotional_pains', 'fears', 'objections', 'desired_outcomes']) {
    const f = p[k];
    if (f && f.status !== 'UNKNOWN') {
      const rows = Array.isArray(f) ? f : [f];
      for (const r of rows) if (!r.evidence_refs || r.evidence_refs.length === 0) errors.push(`persona.${k} present without evidence_refs`);
    }
  }
  if (p.buying_language_refs && p.buying_language_refs.status !== 'UNKNOWN' && p.buying_language_refs.contains_generated_copy !== false) errors.push('persona buying language must not contain generated copy');
  if (evidenceRefSet) for (const er of p.evidence_refs) if (!evidenceRefSet.has(er)) errors.push(`persona dangling evidence_ref ${er}`);
  // demographic fields may only appear under explicit_attributes
  for (const d of AE.PROHIBITED_INFERENCE_ATTRIBUTES) if (d in p && !(d in (p.explicit_attributes || {}))) errors.push(`persona must not carry a derived "${d}" field`);
  return { valid: errors.length === 0, errors };
}

module.exports = { PERSONA_SCHEMA_VERSION, buildBuyerPersona, renderNarrative, validateNarrative, validatePersona };
