'use strict';
// ASTRA_CAMPAIGN360_MEASUREMENT_DERIVATION_AND_PROPOSAL_PROVENANCE_HARDENING_2026_09_13 — Part I.
// >=100 persisted adversarial cases across every category the authorization message lists:
// measurement derived vocabulary, generic anchor collisions, single-anchor overlap, multi-anchor
// overlap, proposal-specific phrases, diagnostic triggers, funnel metrics, conversion metrics,
// measurement cadence, primary outcome, process sequence, negative/rejected proposals, PROPUESTA
// already labeled, UNKNOWN/CURRENT_RESEARCH_REQUIRED, arrays, nested objects, Spanish, English,
// mixed ES/EN. Data-driven: each row is one case, run through a shared checker.
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
const EXPL = 'EXPLICIT_PROHIBITION';

function up(node, field, clause) { return { work_unit_id: node, downstream_payload: { [field]: clause } }; }
function propagationHits(nodeId, downstreamPayload, upstreamOutputs) {
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: downstreamPayload }, { nodeId, upstream_outputs: upstreamOutputs }).violations.filter(v => v.type === PROP);
}
function inventedResultHits(field, text, nodeId = 'measurement') {
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [field]: text } }, { nodeId, upstream_outputs: [] }).violations.filter(v => v.type === EXPL && v.category === 'invented_result');
}

// Each row: { cat, name, run(): violations[], expect: 'PASS'|'DETECT' }
const rows = [];
function propCase(cat, name, nodeId, downstreamPayload, upstreamOutputs, expect) {
  rows.push({ cat, name, run: () => propagationHits(nodeId, downstreamPayload, upstreamOutputs), expect });
}
function resultCase(cat, name, field, text, expect) {
  rows.push({ cat, name, run: () => inventedResultHits(field, text), expect });
}

// ===== 1. measurement derived vocabulary (PASS) =====
propCase('measurement-derived-vocab', '1a diagnostic_metrics tiempo de respuesta', 'measurement', { diagnostic_metrics: 'tiempo de respuesta promedio' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: reducir tiempo de espera del cliente')], 'PASS');
propCase('measurement-derived-vocab', '1b optimization_triggers calificacion', 'measurement', { optimization_triggers: 'baja calificacion detectada' }, [up('offer', 'offer_structure', 'PROPUESTA: mejorar calificacion del equipo interno')], 'PASS');
propCase('measurement-derived-vocab', '1c conversion_metrics enlace', 'measurement', { conversion_metrics: 'clics en el enlace de confirmacion' }, [up('offer', 'offer_structure', 'PROPUESTA: compartir enlace de pago seguro')], 'PASS');
propCase('measurement-derived-vocab', '1d funnel_metrics envio', 'measurement', { funnel_metrics: 'envio de mensajes de seguimiento' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: automatizar envio de correos')], 'PASS');
propCase('measurement-derived-vocab', '1e measurement_cadence medicion', 'measurement', { measurement_cadence: 'medicion inicial y luego semanal' }, [up('offer', 'offer_structure', 'PROPUESTA: revisar medicion trimestral')], 'PASS');
propCase('measurement-derived-vocab', '1f optimization_triggers post', 'measurement', { optimization_triggers: 'post sin respuesta en 48h' }, [up('creative_strategy', 'proof', 'PROPUESTA: publicar post promocional')], 'PASS');
propCase('measurement-derived-vocab', '1g diagnostic_metrics recordatorio timing', 'measurement', { diagnostic_metrics: 'medir tiempo post-recordatorio' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: enviar recordatorio 24h')], 'PASS');

// ===== 2. generic anchor collisions (PASS) =====
propCase('generic-anchor-collision', '2a no marker upstream at all', 'measurement', { diagnostic_metrics: 'tiempo de respuesta' }, [up('whatsapp_conversion', 'follow_up', 'Se recomienda reducir tiempo de espera')], 'PASS');
propCase('generic-anchor-collision', '2b no marker, seguimiento', 'measurement', { optimization_triggers: 'seguimiento constante' }, [up('whatsapp_conversion', 'follow_up', 'El equipo hace seguimiento cercano')], 'PASS');
propCase('generic-anchor-collision', '2c canonical word "consulta" excluded', 'measurement', { funnel_metrics: 'numero de consultas recibidas' }, [up('funnel', 'stages', 'PROPUESTA: registrar cada consulta recibida')], 'PASS');
propCase('generic-anchor-collision', '2d canonical mechanism endpoint "cita" excluded', 'measurement', { primary_outcome: 'seguimiento de citas agendadas' }, [up('whatsapp_conversion', 'appointment_closing', 'PROPUESTA: confirmar cada cita agendada')], 'PASS');
propCase('generic-anchor-collision', '2e bare glue word "nuevo" never anchors', 'measurement', { optimization_triggers: 'nuevo mensaje recibido' }, [up('creative_strategy', 'proof', 'PROPUESTA: nuevo')], 'PASS');
propCase('generic-anchor-collision', '2f unrelated text, zero overlap', 'measurement', { diagnostic_metrics: 'aplicar el mismo criterio de siempre' }, [up('offer', 'offer_structure', 'PROPUESTA: usar un enfoque distinto')], 'PASS');

// ===== 3. single-anchor overlap, distinctive word (DETECT) =====
propCase('single-anchor-distinctive', '3a auditoria', 'measurement', { optimization_triggers: 'activar auditoria' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita')], 'DETECT');
propCase('single-anchor-distinctive', '3b consultoria', 'measurement', { diagnostic_metrics: 'ofrecer consultoria' }, [up('offer', 'offer_structure', 'PROPUESTA: vender consultoria premium')], 'DETECT');
propCase('single-anchor-distinctive', '3c propietaria', 'measurement', { conversion_metrics: 'confirmar propietaria' }, [up('icp', 'qualification_signals', 'PROPUESTA: verificar si es propietaria del salon')], 'DETECT');
propCase('single-anchor-distinctive', '3d descuento', 'measurement', { funnel_metrics: 'aplicar descuento' }, [up('offer', 'offer_structure', 'PROPUESTA: dar descuento especial')], 'DETECT');
propCase('single-anchor-distinctive', '3e garantia', 'measurement', { measurement_cadence: 'mencionar garantia' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer garantia extendida')], 'DETECT');
propCase('single-anchor-distinctive', '3f webinar', 'measurement', { primary_outcome: 'programar webinar' }, [up('creative_strategy', 'proof', 'PROPUESTA: lanzar webinar exclusivo')], 'DETECT');

// ===== 4. multi-anchor overlap (DETECT) =====
propCase('multi-anchor-overlap', '4a auditoria premium', 'measurement', { optimization_triggers: 'activar auditoria premium' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium gratuita')], 'DETECT');
propCase('multi-anchor-overlap', '4b consultoria exprés', 'measurement', { diagnostic_metrics: 'ofrecer consultoria exprés' }, [up('offer', 'offer_structure', 'PROPUESTA: vender consultoria exprés adicional')], 'DETECT');
propCase('multi-anchor-overlap', '4c descuento especial', 'measurement', { conversion_metrics: 'descuento especial disponible' }, [up('offer', 'offer_structure', 'PROPUESTA: dar descuento especial limitado')], 'DETECT');
propCase('multi-anchor-overlap', '4d plan premium', 'measurement', { funnel_metrics: 'activar plan premium mensual' }, [up('offer', 'offer_structure', 'PROPUESTA: lanzar plan premium mensual')], 'DETECT');

// ===== 5. proposal-specific phrases verbatim (DETECT) =====
propCase('proposal-specific-phrase', '5a ofrecer descuento del 20%', 'measurement', { optimization_triggers: 'ofrecer descuento del 20%' }, [up('whatsapp_conversion', 'recovery', 'PROPUESTA: ofrecer descuento del 20%')], 'DETECT');
propCase('proposal-specific-phrase', '5b activar plan premium mensual verbatim', 'measurement', { diagnostic_metrics: 'activar plan premium mensual' }, [up('offer', 'offer_structure', 'PROPUESTA: activar plan premium mensual')], 'DETECT');
propCase('proposal-specific-phrase', '5c enviar bono adicional verbatim', 'measurement', { funnel_metrics: 'enviar bono adicional' }, [up('offer', 'offer_structure', 'PROPUESTA: enviar bono adicional')], 'DETECT');

// ===== 6. diagnostic triggers (EXPLICIT_PROHIBITION invented_result, distinct from propagation) =====
resultCase('diagnostic-triggers', '6a baja calificacion de leads PASS', 'optimization_triggers', 'baja calificación de leads', 'PASS');
resultCase('diagnostic-triggers', '6b bajo tiempo de respuesta PASS', 'diagnostic_metrics', 'bajo tiempo de respuesta', 'PASS');
resultCase('diagnostic-triggers', '6c alta tasa de abandono PASS', 'optimization_triggers', 'alta tasa de abandono', 'PASS');
resultCase('diagnostic-triggers', '6d baja respuesta inicial PASS', 'optimization_triggers', 'baja respuesta inicial', 'PASS');
resultCase('diagnostic-triggers', '6e Sube tus ventas 20% DETECT', 'optimization_triggers', 'Sube tus ventas 20%', 'DETECT');
resultCase('diagnostic-triggers', '6f Consigue mas citas ya DETECT', 'optimization_triggers', 'Vas a conseguir más citas', 'DETECT');
resultCase('diagnostic-triggers', '6g Triplica tus leads DETECT', 'optimization_triggers', 'Triplica tus leads', 'DETECT');
resultCase('diagnostic-triggers', '6h baja tasa inicial detectada PASS (diagnostic_metrics)', 'diagnostic_metrics', 'baja tasa inicial detectada', 'PASS');

// ===== 7. funnel metrics (PROCESS_SEQUENCE role) =====
propCase('funnel-metrics', '7a derived process vocab PASS', 'measurement', { funnel_metrics: 'consultas generadas y conversaciones iniciadas' }, [up('funnel', 'stages', 'PROPUESTA: Meta Ads genera consultas; WhatsApp gestiona la conversación')], 'PASS');
propCase('funnel-metrics', '7b genuine proposal reused DETECT', 'measurement', { funnel_metrics: 'seguimiento de bono exclusivo' }, [up('offer', 'offer_structure', 'PROPUESTA: agregar bono exclusivo al cierre')], 'DETECT');
propCase('funnel-metrics', '7c chats iniciados PASS', 'measurement', { funnel_metrics: 'chats iniciados por WhatsApp' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: dar seguimiento a cada chat iniciado')], 'PASS');
propCase('funnel-metrics', '7d landing visits PASS (no upstream proposal marker at all)', 'measurement', { funnel_metrics: 'visitas a la landing page' }, [up('ads', 'campaign_objective', 'Se recomienda dirigir trafico a la landing page')], 'PASS');
propCase('funnel-metrics', '7d-bis "landing" IS distinctive and DOES detect when genuinely marked+reused', 'measurement', { funnel_metrics: 'visitas a la landing page' }, [up('ads', 'campaign_objective', 'PROPUESTA: dirigir trafico a la landing page')], 'DETECT');

// ===== 8. conversion metrics (MEASUREMENT role) =====
propCase('conversion-metrics', '8a tasa cita confirmada PASS (no upstream proposal marker)', 'measurement', { conversion_metrics: 'tasa cita confirmada' }, [up('funnel', 'stages', 'Priorizar cita confirmada como meta del funnel')], 'PASS');
propCase('conversion-metrics', '8b genuine proposal reused DETECT', 'measurement', { conversion_metrics: 'seguimiento de auditoria exprés' }, [up('offer', 'offer_structure', 'PROPUESTA: vender auditoria exprés adicional')], 'DETECT');
propCase('conversion-metrics', '8c solicitar consulta por whatsapp PASS', 'measurement', { conversion_metrics: 'solicitudes de consulta por WhatsApp' }, [up('funnel', 'conversion_intent', 'PROPUESTA: impulsar solicitar consulta por WhatsApp')], 'PASS');

// ===== 9. measurement cadence =====
propCase('measurement-cadence', '9a weekly cadence derived PASS', 'measurement', { measurement_cadence: 'revision semanal de resultados de campaña' }, [up('offer', 'offer_structure', 'PROPUESTA: revisar el precio cada trimestre')], 'PASS');
propCase('measurement-cadence', '9b genuine proposal reused DETECT', 'measurement', { measurement_cadence: 'revisar auditoria exprés cada semana' }, [up('offer', 'offer_structure', 'PROPUESTA: vender auditoria exprés adicional')], 'DETECT');
propCase('measurement-cadence', '9c daily cadence derived PASS', 'measurement', { measurement_cadence: 'medicion diaria durante el primer mes' }, [up('ads', 'measurement', 'PROPUESTA: medir consultas generadas diariamente')], 'PASS');

// ===== 10. primary outcome (strict) =====
resultCase('primary-outcome', '10a compras completadas PASS', 'primary_outcome', 'compras completadas del minicurso', 'PASS');
propCase('primary-outcome', '10b genuine propagated tactic DETECT', 'measurement', { primary_outcome: 'activar consultoria premium' }, [up('offer', 'offer_structure', 'PROPUESTA: vender consultoria premium')], 'DETECT');
resultCase('primary-outcome', '10c venta del minicurso PASS', 'primary_outcome', 'venta del minicurso completada', 'PASS');

// ===== 11. process sequence (funnel.stages) =====
propCase('process-sequence', '11a legitimate stage description PASS', 'funnel', { stages: 'Meta Ads genera consultas; WhatsApp gestiona la conversación; compra del minicurso' }, [up('offer', 'offer_structure', 'PROPUESTA: Minicurso grabado 400 MXN venta directa; upsell consultoría cita')], 'PASS');
propCase('process-sequence', '11b genuine unlabeled proposal in stages DETECT', 'funnel', { stages: 'Upsell consultoría cita' }, [up('offer', 'offer_structure', 'PROPUESTA: upsell consultoría cita')], 'DETECT');

// ===== 12. negative/rejected proposals (PASS — rejected, not adopted) =====
propCase('negative-rejected', '12a no incluir consultoria PASS', 'measurement', { optimization_triggers: 'No incluir consultoria en esta fase' }, [up('offer', 'offer_structure', 'PROPUESTA: vender consultoria premium')], 'PASS');
propCase('negative-rejected', '12b rechazamos auditoria PASS', 'measurement', { diagnostic_metrics: 'Rechazamos auditoria por ahora' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita')], 'PASS');
propCase('negative-rejected', '12c descartamos descuento PASS', 'measurement', { funnel_metrics: 'Descartamos descuento adicional' }, [up('whatsapp_conversion', 'recovery', 'PROPUESTA: ofrecer descuento del 20%')], 'PASS');
propCase('negative-rejected', '12d rejection does not forgive a LATER affirmative clause DETECT', 'measurement', { optimization_triggers: 'No incluir consultoria. Ofrecer consultoria premium.' }, [up('offer', 'offer_structure', 'PROPUESTA: vender consultoria premium')], 'DETECT');

// ===== 13. PROPUESTA already labeled downstream (PASS — correctly marked) =====
propCase('already-labeled', '13a downstream already marked PASS', 'measurement', { optimization_triggers: 'PROPUESTA: activar auditoria premium' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'PASS');
propCase('already-labeled', '13b marker mid-sentence still escapes PASS', 'measurement', { diagnostic_metrics: 'Seguimiento estandar. PROPUESTA: ofrecer consultoria premium adicional.' }, [up('offer', 'offer_structure', 'PROPUESTA: vender consultoria premium')], 'PASS');
propCase('already-labeled', '13c later unmarked sentence still DETECTs', 'measurement', { conversion_metrics: 'PROPUESTA: ofrecer consultoria. Activar consultoria para todos.' }, [up('offer', 'offer_structure', 'PROPUESTA: vender consultoria premium')], 'DETECT');

// ===== 14. UNKNOWN / CURRENT_RESEARCH_REQUIRED (PASS — excluded from anchor extraction) =====
propCase('unknown-status', '14a upstream leaf marked UNKNOWN status excluded', 'measurement', { optimization_triggers: 'activar auditoria premium' }, [{ work_unit_id: 'offer', downstream_payload: { offer_structure: { status: 'UNKNOWN', value: 'PROPUESTA: ofrecer auditoria premium' } } }], 'PASS');
propCase('unknown-status', '14b upstream leaf marked CURRENT_RESEARCH_REQUIRED excluded', 'measurement', { diagnostic_metrics: 'ofrecer consultoria premium' }, [{ work_unit_id: 'offer', downstream_payload: { offer_structure: { support_class: 'CURRENT_RESEARCH_REQUIRED', value: 'PROPUESTA: vender consultoria premium' } } }], 'PASS');

// ===== 15. arrays (leaf isolation) =====
propCase('arrays', '15a array element with genuine proposal DETECTs at its own leaf', 'measurement', { diagnostic_metrics: ['seguimiento estandar', 'activar auditoria premium', 'reporte mensual'] }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'DETECT');
propCase('arrays', '15b array elements with only derived vocab PASS', 'measurement', { funnel_metrics: ['tiempo de respuesta', 'envio de mensajes', 'tasa de conversion'] }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: reducir tiempo de espera y automatizar envio')], 'PASS');
propCase('arrays', '15c a distinct anchor in one array item does not leak into a sibling item', 'measurement', { optimization_triggers: ['activar auditoria premium', 'seguimiento estandar sin relacion'] }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'DETECT');

// ===== 16. nested objects (leaf isolation) =====
propCase('nested-objects', '16a nested leaf with genuine proposal DETECTs', 'measurement', { diagnostic_metrics: { primary: 'reporte estandar', secondary: 'activar auditoria premium' } }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium')], 'DETECT');
propCase('nested-objects', '16b nested leaves with only derived vocab PASS', 'measurement', { measurement_cadence: { weekly: 'medicion semanal', monthly: 'tiempo de respuesta mensual' } }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: reducir tiempo de espera')], 'PASS');

// ===== 17. Spanish (pure ES edge cases) =====
propCase('spanish', '17a accented word matches accent-insensitively DETECT', 'measurement', { optimization_triggers: 'activar auditoría' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria gratuita')], 'DETECT');
resultCase('spanish', '17b invented_result Spanish claim DETECT', 'optimization_triggers', 'Vas a conseguir más ventas', 'DETECT');
propCase('spanish', '17c pure derived Spanish vocab PASS', 'measurement', { diagnostic_metrics: 'seguimiento y calificación inicial' }, [up('icp', 'qualification_signals', 'PROPUESTA: mejorar calificación del equipo')], 'PASS');

// ===== 18. English =====
propCase('english', '18a English distinctive word reused DETECT', 'measurement', { optimization_triggers: 'activate premium audit' }, [up('offer', 'offer_structure', 'PROPUESTA: offer a premium audit for free')], 'DETECT');
resultCase('english', '18b English invented_result claim DETECT', 'optimization_triggers', 'We will increase your sales 30%', 'DETECT');
propCase('english', '18c English generic measurement vocab PASS', 'measurement', { diagnostic_metrics: 'initial response time tracking' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: send an initial reminder within 24h')], 'PASS');

// ===== 19. mixed ES/EN =====
propCase('mixed-language', '19a Spanish proposal, English downstream reuse DETECT', 'measurement', { conversion_metrics: 'activate the auditoria premium' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria premium gratuita')], 'DETECT');
propCase('mixed-language', '19b English proposal, Spanish downstream reuse DETECT', 'measurement', { funnel_metrics: 'activar el premium audit' }, [up('offer', 'offer_structure', 'PROPUESTA: offer a premium audit today')], 'DETECT');
propCase('mixed-language', '19c mixed-language generic vocab PASS', 'measurement', { measurement_cadence: 'weekly medicion inicial' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: send a reminder tiempo inicial')], 'PASS');

// Pad each category up to the target row count with additional bounded variants so the persisted
// matrix comfortably exceeds 100 cases while staying grounded in the same worked patterns.
propCase('measurement-derived-vocab', '1h optimization_triggers respuesta', 'measurement', { optimization_triggers: 'respuesta general del publico' }, [up('creative_strategy', 'proof', 'PROPUESTA: mejorar respuesta creativa del anuncio')], 'PASS');
propCase('generic-anchor-collision', '2g bare glue word "confirmar" never anchors', 'measurement', { conversion_metrics: 'confirmar recepcion del mensaje' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: confirmar')], 'PASS');
propCase('single-anchor-distinctive', '3g bono', 'measurement', { measurement_cadence: 'entregar bono' }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial')], 'DETECT');
propCase('multi-anchor-overlap', '4e bono especial', 'measurement', { measurement_cadence: 'entregar bono especial' }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial limitado')], 'DETECT');
propCase('proposal-specific-phrase', '5d confirmar cita bonificada verbatim', 'measurement', { conversion_metrics: 'confirmar cita bonificada' }, [up('whatsapp_conversion', 'appointment_closing', 'PROPUESTA: confirmar cita bonificada')], 'DETECT');
resultCase('diagnostic-triggers', '6i baja tasa de apertura PASS', 'optimization_triggers', 'baja tasa de apertura', 'PASS');
propCase('funnel-metrics', '7e genuine proposal via array DETECT', 'measurement', { funnel_metrics: ['tasa de conversion', 'bono especial activado'] }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial')], 'DETECT');
propCase('conversion-metrics', '8d landing visits derived PASS (no upstream proposal marker)', 'measurement', { conversion_metrics: 'tasa de conversion en landing' }, [up('ads', 'campaign_objective', 'Se busca optimizar trafico hacia landing')], 'PASS');
propCase('measurement-cadence', '9d bono cadence DETECT', 'measurement', { measurement_cadence: 'revisar bono especial cada mes' }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial')], 'DETECT');
resultCase('primary-outcome', '10d venta directa PASS', 'primary_outcome', 'venta directa confirmada', 'PASS');
propCase('negative-rejected', '12e no incluir bono PASS (recognized rejection verb)', 'measurement', { measurement_cadence: 'No incluir bono por ahora' }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial')], 'PASS');
propCase('already-labeled', '13d array leaf already marked PASS', 'measurement', { diagnostic_metrics: ['reporte estandar', 'PROPUESTA: activar bono especial'] }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial')], 'PASS');
propCase('arrays', '15d nested array PASS when no distinctive overlap', 'measurement', { funnel_metrics: ['tiempo de respuesta', 'medicion semanal'] }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial')], 'PASS');
propCase('nested-objects', '16c deeply nested genuine proposal DETECTs', 'measurement', { diagnostic_metrics: { region: { mx: 'activar bono especial' } } }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial')], 'DETECT');
propCase('spanish', '17d Spanish rejection escape PASS', 'measurement', { optimization_triggers: 'no usar bono especial' }, [up('offer', 'offer_structure', 'PROPUESTA: incluir bono especial')], 'PASS');
propCase('english', '18d English rejection escape PASS', 'measurement', { optimization_triggers: 'do not use the special bonus' }, [up('offer', 'offer_structure', 'PROPUESTA: incluir special bonus')], 'PASS');
propCase('mixed-language', '19d mixed rejection escape PASS', 'measurement', { optimization_triggers: 'no incluir el special bonus' }, [up('offer', 'offer_structure', 'PROPUESTA: incluir special bonus adicional')], 'PASS');

// Additional cases to comfortably clear the >=100 persisted-case requirement, filling out
// under-represented categories with fresh, non-duplicate patterns.
propCase('measurement-derived-vocab', '1i measurement_cadence English "tracking cycle"', 'measurement', { measurement_cadence: 'weekly tracking cycle' }, [up('offer', 'offer_structure', 'PROPUESTA: revisar el precio cada ciclo')], 'PASS');
propCase('generic-anchor-collision', '2h generic word reused across two DIFFERENT unrelated upstream nodes, neither marked', 'measurement', { diagnostic_metrics: 'seguimiento y calificacion' }, [up('icp', 'pains', 'Baja calificacion percibida'), up('offer', 'offer_structure', 'Seguimiento post-venta incluido')], 'PASS');
propCase('single-anchor-distinctive', '3h "bonificacion"', 'measurement', { conversion_metrics: 'aplicar bonificacion' }, [up('offer', 'offer_structure', 'PROPUESTA: dar bonificacion adicional')], 'DETECT');
propCase('multi-anchor-overlap', '4f "auditoria exprés" cross-field', 'measurement', { measurement_cadence: 'revisar auditoria exprés' }, [up('offer', 'offer_structure', 'PROPUESTA: ofrecer auditoria exprés gratuita')], 'DETECT');
propCase('proposal-specific-phrase', '5e "activar bono doble" verbatim', 'measurement', { optimization_triggers: 'activar bono doble' }, [up('offer', 'offer_structure', 'PROPUESTA: activar bono doble')], 'DETECT');
resultCase('diagnostic-triggers', '6j "bajo volumen de citas" PASS (diagnostic_metrics, no outcome-term adjacency)', 'diagnostic_metrics', 'bajo volumen de citas', 'PASS');
propCase('funnel-metrics', '7f English derived vocab "initial tracking" PASS', 'measurement', { funnel_metrics: 'initial tracking of leads' }, [up('whatsapp_conversion', 'follow_up', 'PROPUESTA: send initial reminder')], 'PASS');
propCase('conversion-metrics', '8e mixed-language derived vocab PASS', 'measurement', { conversion_metrics: 'tasa de response inicial' }, [up('icp', 'qualification_signals', 'PROPUESTA: mejorar calificacion del lead')], 'PASS');
propCase('measurement-cadence', '9e English genuine proposal DETECT', 'measurement', { measurement_cadence: 'review the premium audit monthly' }, [up('offer', 'offer_structure', 'PROPUESTA: offer a premium audit for free')], 'DETECT');
resultCase('primary-outcome', '10e "minicurso vendido" PASS', 'primary_outcome', 'minicurso vendido exitosamente', 'PASS');
propCase('process-sequence', '11c English process description PASS', 'funnel', { stages: 'Meta Ads generates inquiries; WhatsApp manages the conversation; course purchase' }, [up('offer', 'offer_structure', 'PROPUESTA: recorded minicourse 400 MXN direct sale; upsell consulting appointment')], 'PASS');
propCase('unknown-status', '14c array of upstream leaves, one UNKNOWN one real — only the real one anchors', 'measurement', { optimization_triggers: 'activar auditoria premium' }, [{ work_unit_id: 'offer', downstream_payload: { offer_structure: [{ status: 'UNKNOWN', value: 'PROPUESTA: descuento secreto' }, 'PROPUESTA: ofrecer auditoria premium'] } }], 'DETECT');

const tests = [];
for (const row of rows) {
  tests.push({ name: `[${row.cat}] ${row.name}`, fn: () => {
    const v = row.run();
    if (row.expect === 'PASS') assert.deepStrictEqual(v, [], `expected no violations, got ${JSON.stringify(v)}`);
    else assert(v.length >= 1, 'expected at least one violation, got none');
  } });
}

(async () => {
  let pass = 0, fail = 0;
  const byCategory = {};
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); }
    catch (e) { fail++; console.log('FAIL', name, e.message); }
  }
  console.log(`ADVERSARIAL_MATRIX total_cases=${tests.length}`);
  console.log(`PROPOSAL_PROVENANCE_ADVERSARIAL_MATRIX_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
