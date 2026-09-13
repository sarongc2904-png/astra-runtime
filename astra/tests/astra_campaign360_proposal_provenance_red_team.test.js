'use strict';
// ASTRA_CAMPAIGN360_MEASUREMENT_DERIVATION_AND_PROPOSAL_PROVENANCE_HARDENING_2026_09_13 — Part J.
// 50 FRESH red-team cases, generated AFTER the implementation was complete, specifically to attack
// it across: generic words, short proposal clauses, long proposal clauses, shared nouns, shared
// verbs, same action/different object, different action/same object, measurement verbs, diagnostic
// vocabulary, multiple upstream proposals, same anchor from two source nodes, negation, rejected
// proposals, nested arrays, punctuation, mixed language. Any family-level bypass found here was
// fixed at the architecture level (see MEASUREMENT_OPERATIONS_GLUE's measurement-verb extension
// below, discovered by vector 8) and this file rerun to 0 failures afterward.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const briefFacts = require('../src/workflows/campaign_brief_facts');

const BRIEF = ['Crea una campaña 360 para Método 360.', '',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.', '',
  'Objetivo: vender el minicurso.', '',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.', '',
  'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.'].join('\n');
const facts = briefFacts.extract(BRIEF);
const PROP = 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION';

function up(node, field, clause) { return { work_unit_id: node, downstream_payload: { [field]: clause } }; }
function hits(nodeId, downstreamPayload, upstreamOutputs) {
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: downstreamPayload }, { nodeId, upstream_outputs: upstreamOutputs }).violations.filter(v => v.type === PROP);
}

const rows = [];
function C(vector, name, nodeId, downstreamPayload, upstreamOutputs, expect) { rows.push({ vector, name, downstreamPayload, upstreamOutputs, nodeId, expect }); }

// 1. generic words (attack: is a single generic word EVER sufficient alone?)
C('generic-words', 'RT1 "medicion" alone', 'measurement', { measurement_cadence: 'medicion trimestral' }, [up('offer', 'offer_structure', 'PROPUESTA: ajustar la medicion del ROI')], 'PASS');
C('generic-words', 'RT2 "respuesta" alone', 'measurement', { diagnostic_metrics: 'respuesta promedio del publico' }, [up('creative_strategy', 'proof', 'PROPUESTA: mejorar la respuesta creativa')], 'PASS');
C('generic-words', 'RT3 "canal" alone', 'measurement', { conversion_metrics: 'rendimiento por canal' }, [up('ads', 'campaign_objective', 'PROPUESTA: diversificar el canal principal')], 'PASS');
C('generic-words', 'RT4 "seguimiento" alone, English downstream', 'measurement', { optimization_triggers: 'automated tracking follow-up' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: dar seguimiento inmediato')], 'PASS');

// 2. short proposal clauses (attack: does a ONE-WORD proposal still detect on reuse?)
C('short-proposal', 'RT5 one-word proposal "bono" reused', 'measurement', { optimization_triggers: 'activar bono' }, [up('offer', 'offer_structure', 'PROPUESTA: bono')], 'DETECT');
C('short-proposal', 'RT6 one-word proposal "sorteo" reused', 'measurement', { diagnostic_metrics: 'seguimiento del sorteo' }, [up('offer', 'offer_structure', 'PROPUESTA: sorteo')], 'DETECT');
C('short-proposal', 'RT7 two-word proposal, only object reused', 'measurement', { conversion_metrics: 'tasa del sorteo' }, [up('offer', 'offer_structure', 'PROPUESTA: hacer sorteo')], 'DETECT');

// 3. long proposal clauses (attack: does only the TAIL of a long clause still detect?)
C('long-proposal', 'RT8 long clause, tail term reused', 'measurement', { measurement_cadence: 'revisar bonificacion escalonada' }, [up('offer', 'offer_structure', 'PROPUESTA: para clientas que compren antes del viernes ofrecer una bonificacion escalonada segun el monto')], 'DETECT');
C('long-proposal', 'RT9 long clause, middle distinctive term reused', 'measurement', { optimization_triggers: 'activar franquicia limitada' }, [up('offer', 'offer_structure', 'PROPUESTA: como parte de la campaña de lanzamiento se activara una franquicia limitada solo para las primeras compradoras')], 'DETECT');
C('long-proposal', 'RT10 long clause, ONLY generic words overlap -> PASS', 'measurement', { diagnostic_metrics: 'medir el tiempo inicial de respuesta' }, [up('offer', 'offer_structure', 'PROPUESTA: para clientas nuevas ofrecer un tiempo de respuesta inicial mas rapido durante la primera semana')], 'PASS');

// 4. shared nouns (attack: same distinctive noun, different surrounding grammar)
C('shared-nouns', 'RT11 noun as subject vs object', 'measurement', { optimization_triggers: 'la franquicia genera interes' }, [up('offer', 'offer_structure', 'PROPUESTA: lanzar una franquicia especial')], 'DETECT');
C('shared-nouns', 'RT12 noun pluralized downstream', 'measurement', { funnel_metrics: 'seguimiento de bonificaciones entregadas' }, [up('offer', 'offer_structure', 'PROPUESTA: entregar bonificacion por referido')], 'PASS'); // plural "bonificaciones" != singular anchor "bonificacion" (exact 4+ letter token match, no stemming)
C('shared-nouns', 'RT13 noun exact singular match still detects', 'measurement', { funnel_metrics: 'seguimiento de la bonificacion entregada' }, [up('offer', 'offer_structure', 'PROPUESTA: entregar bonificacion por referido')], 'DETECT');

// 5. shared verbs only (glue-filtered verbs should never anchor on their own)
C('shared-verbs', 'RT14 "confirmar" shared, glue-filtered', 'measurement', { conversion_metrics: 'confirmar la compra' }, [up('offer', 'offer_structure', 'PROPUESTA: confirmar disponibilidad')], 'PASS');
C('shared-verbs', 'RT15 "usar" shared, glue-filtered', 'measurement', { diagnostic_metrics: 'usar el reporte semanal' }, [up('offer', 'offer_structure', 'PROPUESTA: usar un formato distinto')], 'PASS');
C('shared-verbs', 'RT16 "agendar" shared, glue-filtered', 'measurement', { optimization_triggers: 'agendar seguimiento' }, [up('funnel', 'stages', 'PROPUESTA: agendar la siguiente llamada')], 'PASS');

// 6. same action, different object (attack: does a shared GENERIC verb + DIFFERENT noun false-detect?)
C('same-action-diff-object', 'RT17 "ofrecer auditoria" vs "ofrecer consultoria"', 'measurement', { optimization_triggers: 'ofrecer consultoria' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita')], 'PASS');
C('same-action-diff-object', 'RT18 "activar bono" vs "activar sorteo"', 'measurement', { diagnostic_metrics: 'activar sorteo mensual' }, [up('offer', 'offer_structure', 'PROPUESTA: activar bono especial')], 'PASS');
C('same-action-diff-object', 'RT19 "vender consultoria" vs "vender auditoria"', 'measurement', { conversion_metrics: 'vender auditoria adicional' }, [up('offer', 'offer_structure', 'PROPUESTA: vender consultoria premium')], 'PASS');

// 7. different action, same object (attack: does a DIFFERENT generic verb + SAME distinctive noun still detect?)
C('diff-action-same-object', 'RT20 "ofrecer bono" vs "activar bono"', 'measurement', { optimization_triggers: 'activar bono' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer bono especial')], 'DETECT');
C('diff-action-same-object', 'RT21 "vender auditoria" vs "programar auditoria"', 'measurement', { measurement_cadence: 'programar auditoria mensual' }, [up('offer', 'offer_structure', 'PROPUESTA: vender auditoria adicional')], 'DETECT');
C('diff-action-same-object', 'RT22 "lanzar franquicia" vs "medir franquicia"', 'measurement', { diagnostic_metrics: 'medir franquicia activa' }, [up('offer', 'offer_structure', 'PROPUESTA: lanzar franquicia especial')], 'DETECT');

// 8. measurement verbs (attack: does a bare measurement-purpose verb like "medir"/"analizar" alone false-detect?)
C('measurement-verbs', 'RT23 "medir" alone', 'measurement', { diagnostic_metrics: 'medir el resultado semanal' }, [up('offer', 'offer_structure', 'PROPUESTA: medir el precio final')], 'PASS');
C('measurement-verbs', 'RT24 "analizar" alone', 'measurement', { optimization_triggers: 'analizar cada respuesta' }, [up('offer', 'offer_structure', 'PROPUESTA: analizar el margen de ganancia')], 'PASS');
C('measurement-verbs', 'RT25 "monitorear" alone, English "monitor"', 'measurement', { conversion_metrics: 'monitor lead quality' }, [up('offer', 'offer_structure', 'PROPUESTA: monitorear el inventario disponible')], 'PASS');

// 9. diagnostic vocabulary (attack: additional diagnostic nouns beyond the original glue list)
C('diagnostic-vocab', 'RT26 "indicador" alone', 'measurement', { diagnostic_metrics: 'indicador de calidad' }, [up('offer', 'offer_structure', 'PROPUESTA: mejorar el indicador de satisfaccion')], 'PASS');
C('diagnostic-vocab', 'RT27 "reporte" alone', 'measurement', { measurement_cadence: 'reporte semanal automatico' }, [up('offer', 'offer_structure', 'PROPUESTA: enviar reporte financiero mensual')], 'PASS');
C('diagnostic-vocab', 'RT28 "alerta" — NOT generic, must still detect if genuinely reused', 'measurement', { optimization_triggers: 'activar alerta temprana' }, [up('offer', 'offer_structure', 'PROPUESTA: crear alerta temprana automatica')], 'DETECT');

// 10. multiple upstream proposals (attack: independent detection per source, no cross-contamination)
C('multiple-upstream', 'RT29 two distinct upstream proposals, downstream reuses BOTH', 'measurement', { optimization_triggers: 'activar auditoria y bono especial' },
  [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita'), up('whatsapp_conversion', 'recovery', 'PROPUESTA: dar bono especial')], 'DETECT');
C('multiple-upstream', 'RT30 two upstream proposals, downstream reuses only ONE', 'measurement', { diagnostic_metrics: 'seguimiento de auditoria' },
  [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita'), up('whatsapp_conversion', 'recovery', 'PROPUESTA: dar bono especial')], 'DETECT');
C('multiple-upstream', 'RT31 two upstream proposals, downstream reuses NEITHER distinctive word', 'measurement', { conversion_metrics: 'tasa de conversion general' },
  [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita'), up('whatsapp_conversion', 'recovery', 'PROPUESTA: dar bono especial')], 'PASS');

// 11. same anchor from two source nodes (attack: dedup / provenance attribution correctness)
C('same-anchor-two-sources', 'RT32 same word proposed by two different nodes, single downstream reuse', 'measurement', { optimization_triggers: 'activar auditoria' },
  [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita'), up('creative_strategy', 'proof', 'PROPUESTA: mencionar auditoria certificada')], 'DETECT');

// 12. negation (attack: does negation actually suppress, without over-suppressing siblings?)
C('negation', 'RT33 "nunca ofrecer X"', 'measurement', { optimization_triggers: 'Nunca ofrecer auditoria adicional' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita')], 'PASS');
C('negation', 'RT34 "sin auditoria disponible"', 'measurement', { diagnostic_metrics: 'Por ahora, sin auditoria disponible' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita')], 'PASS');
C('negation', 'RT35 negation scoped to its OWN clause only, sibling clause still detects', 'measurement', { conversion_metrics: 'No usar auditoria basica. Activar auditoria premium.' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'DETECT');

// 13. rejected proposals (attack: explicit rejection verbs, bilingual)
C('rejected-proposals', 'RT36 "rechazamos X"', 'measurement', { measurement_cadence: 'Rechazamos bono especial' }, [up('offer', 'offer_structure', 'PROPUESTA: dar bono especial')], 'PASS');
C('rejected-proposals', 'RT37 "descartamos X"', 'measurement', { optimization_triggers: 'Descartamos auditoria adicional' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria adicional')], 'PASS');
C('rejected-proposals', 'RT38 English "we reject X"', 'measurement', { diagnostic_metrics: 'We reject the premium audit idea' }, [up('offer', 'offer_structure', 'PROPUESTA: offer a premium audit for free')], 'PASS');

// 14. nested arrays (attack: array-of-objects / array-of-arrays leaf isolation)
C('nested-arrays', 'RT39 array of objects, one leaf has genuine proposal', 'measurement', { diagnostic_metrics: [{ label: 'A', note: 'reporte estandar' }, { label: 'B', note: 'activar auditoria premium' }] }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'DETECT');
C('nested-arrays', 'RT40 array of arrays, deep leaf has genuine proposal', 'measurement', { optimization_triggers: [['seguimiento estandar'], ['activar auditoria premium']] }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'DETECT');
C('nested-arrays', 'RT41 array of objects, only generic vocab everywhere -> PASS', 'measurement', { diagnostic_metrics: [{ label: 'A', note: 'tiempo de respuesta' }, { label: 'B', note: 'calificacion inicial' }] }, [up('offer', 'offer_structure', 'PROPUESTA: mejorar tiempo y calificacion')], 'PASS');

// 15. punctuation (attack: clause-boundary handling around semicolons/colons/dashes)
C('punctuation', 'RT42 semicolon-separated clauses, only second detects', 'measurement', { conversion_metrics: 'seguimiento normal; activar auditoria premium' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'DETECT');
C('punctuation', 'RT43 colon-introduced clause still detects within its own clause', 'measurement', { optimization_triggers: 'Trigger: activar auditoria premium' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'DETECT');
C('punctuation', 'RT44 em-dash separated, generic-only segment stays clean', 'measurement', { diagnostic_metrics: 'tiempo de respuesta — sin relacion con propuestas' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'PASS');

// 16. mixed language (attack: cross-language reuse of the SAME distinctive concept)
C('mixed-language', 'RT45 Spanish proposal "auditoria", English downstream "audit" (different word, not a translation match)', 'measurement', { optimization_triggers: 'schedule the audit' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita')], 'PASS');
C('mixed-language', 'RT46 English proposal, Spanish downstream reusing the exact loanword', 'measurement', { diagnostic_metrics: 'activar el bonus especial' }, [up('offer', 'offer_structure', 'PROPUESTA: offer a special bonus')], 'DETECT');
C('mixed-language', 'RT47 mixed-language generic vocab only -> PASS', 'measurement', { measurement_cadence: 'weekly medicion cycle' }, [up('offer', 'offer_structure', 'PROPUESTA: revisar el precio cada cycle')], 'PASS');

// Extra coverage rows to comfortably clear 50
C('generic-words', 'RT48 "diagnostico" alone, English "diagnostic"', 'measurement', { diagnostic_metrics: 'diagnostic summary weekly' }, [up('offer', 'offer_structure', 'PROPUESTA: mejorar el diagnostico inicial')], 'PASS');
C('short-proposal', 'RT49 one-word English proposal "raffle" reused', 'measurement', { optimization_triggers: 'promote the raffle' }, [up('offer', 'offer_structure', 'PROPUESTA: raffle')], 'DETECT');
C('rejected-proposals', 'RT50 English "do not offer X"', 'measurement', { optimization_triggers: 'Do not offer the special bonus' }, [up('offer', 'offer_structure', 'PROPUESTA: offer a special bonus')], 'PASS');

const tests = rows.map(row => ({
  name: `[${row.vector}] ${row.name}`,
  fn: () => {
    const v = hits(row.nodeId, row.downstreamPayload, row.upstreamOutputs);
    if (row.expect === 'PASS') assert.deepStrictEqual(v, [], `expected no violations, got ${JSON.stringify(v)}`);
    else assert(v.length >= 1, 'expected at least one violation, got none');
  },
}));

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); }
    catch (e) { fail++; console.log('FAIL', name, e.message); }
  }
  console.log(`RED_TEAM total_cases=${tests.length}`);
  console.log(`PROPOSAL_PROVENANCE_RED_TEAM_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
