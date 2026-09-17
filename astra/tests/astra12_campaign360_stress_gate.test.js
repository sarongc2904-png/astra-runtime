'use strict';
// ASTRA-12 Campaign360 stress gate.
// Offline/deterministic: no OpenAI/OpenRouter/web calls and no production side effects.
// Purpose: prove broad brief-shape robustness before any paid live soak run.
const assert = require('assert');
const H = require('../src/workflows/marketing_campaign_360_hardened');

function mockAdapter() {
  return {
    retrieve(q) {
      const hits = Array.from({ length: 5 }, (_, i) => ({
        chunk_id: 'stress_' + i,
        source_id: 'SRC_STRESS',
        source_pdf_name: 'StressFixture.pdf',
        text: 'deterministic evidence for ' + q,
        cosine: 0.61 - i * 0.01,
        source_class: 'INTERNAL_KNOWLEDGE',
      }));
      return {
        evidenceText: hits.map(h => h.text).join('\n'),
        hits,
        corpus: 'kb_chunks_v2',
        pipeline: 'Strategy-F',
        read_only: true,
      };
    },
  };
}

const CASES = [
  ['beauty_crm', 'CRM con IA para estéticas en México. Precio $1,397 MXN/mes. Demo 3 días. Objetivo: conseguir clientes por WhatsApp. Agenda Google Calendar.'],
  ['dental', 'Clínica dental en México. Objetivo: agendar valoraciones por WhatsApp. Presupuesto $500 MXN diarios. Sin promesas garantizadas.'],
  ['restaurant', 'Restaurante familiar en Tuxtla. Objetivo: aumentar reservaciones y pedidos por WhatsApp. Presupuesto por definir.'],
  ['automotive', 'Distribuidor automotriz en México. Objetivo: generar prospectos con intención real para cotización por WhatsApp.'],
  ['real_estate', 'Asesoría inmobiliaria en México. Objetivo: captar compradores de vivienda y calificar prospectos por WhatsApp.'],
  ['infoproduct', 'Mini curso de marketing para estéticas. Precio $400 MXN. Objetivo: vender por WhatsApp en México.'],
  ['saas_b2b', 'SaaS B2B para pequeñas empresas. Objetivo: demos calificadas. Canal principal WhatsApp.'],
  ['nails', 'Salón de uñas en México. Objetivo: llenar agenda sin prometer resultados. Reservas por WhatsApp.'],
  ['laser', 'Centro de depilación láser. Objetivo: generar citas de valoración vía WhatsApp.'],
  ['facials', 'Clínica de tratamientos faciales. Objetivo: captar prospectos y agendar consultas.'],
  ['spa', 'Spa urbano. Objetivo: vender paquetes y agendar citas por WhatsApp.'],
  ['barbershop', 'Barbería premium. Objetivo: incrementar reservas y recurrencia.'],
  ['hotel', 'Hotel de carretera en Chiapas. Objetivo: reservas directas por WhatsApp.'],
  ['buffet', 'Restaurante buffet de fin de semana. Objetivo: atraer familias locales.'],
  ['ecommerce', 'Tienda ecommerce de accesorios. Objetivo: ventas directas y recuperación por WhatsApp.'],
  ['accounting', 'Despacho contable en México. Objetivo: conseguir citas con dueños de pequeños negocios.'],
  ['legal', 'Despacho jurídico. Objetivo: solicitudes de consulta, sin prometer resultados legales.'],
  ['architect', 'Estudio de arquitectura. Objetivo: leads para proyectos residenciales.'],
  ['construction', 'Empresa de construcción. Objetivo: cotizaciones de remodelación por WhatsApp.'],
  ['gym', 'Gimnasio local. Objetivo: pruebas y membresías nuevas.'],
  ['nutrition', 'Consulta de nutrición. Objetivo: agendar consultas, sin claims médicos garantizados.'],
  ['physio', 'Centro de fisioterapia. Objetivo: valoraciones por WhatsApp, sin promesas clínicas.'],
  ['school', 'Academia de inglés. Objetivo: inscripciones y clases muestra.'],
  ['daycare', 'Guardería privada. Objetivo: visitas informativas con padres interesados.'],
  ['photography', 'Fotógrafo de bodas. Objetivo: cotizaciones y citas por WhatsApp.'],
  ['wedding_venue', 'Salón de eventos. Objetivo: visitas y cotizaciones para bodas y XV años.'],
  ['travel', 'Agencia de viajes. Objetivo: solicitudes de cotización por WhatsApp.'],
  ['insurance', 'Asesor de seguros. Objetivo: citas de diagnóstico; sin promesas de ahorro garantizado.'],
  ['mortgage', 'Broker hipotecario. Objetivo: leads calificados; no garantizar aprobación.'],
  ['solar', 'Instalador de paneles solares. Objetivo: cotizaciones residenciales.'],
  ['hvac', 'Servicio de aire acondicionado. Objetivo: solicitudes de servicio y mantenimiento.'],
  ['plumbing', 'Plomería residencial. Objetivo: solicitudes de servicio por WhatsApp.'],
  ['cleaning', 'Servicio de limpieza. Objetivo: cotizaciones recurrentes para hogares y oficinas.'],
  ['pest_control', 'Control de plagas. Objetivo: inspecciones y cotizaciones.'],
  ['pet_grooming', 'Estética canina. Objetivo: citas y paquetes recurrentes.'],
  ['veterinary', 'Clínica veterinaria. Objetivo: citas generales; sin claims médicos garantizados.'],
  ['bakery', 'Pastelería personalizada. Objetivo: pedidos para eventos por WhatsApp.'],
  ['catering', 'Catering corporativo. Objetivo: cotizaciones para eventos empresariales.'],
  ['printing', 'Imprenta local. Objetivo: cotizaciones B2B y pedidos recurrentes.'],
  ['digital_cards', 'Tarjetas digitales para asesores inmobiliarios. Precio $299 MXN. Objetivo: demos y ventas por WhatsApp.'],
  ['agency', 'Agencia de marketing para negocios locales. Objetivo: auditorías y llamadas de diagnóstico.'],
  ['crm_alt_price', 'CRM de seguimiento para salones. Precio $999 MXN/mes. Objetivo: demos calificadas.'],
  ['crm_no_budget', 'CRM con bot de WhatsApp para estéticas. Precio definido; presupuesto publicitario aún por definir.'],
  ['national_geo', 'Software para belleza en México. Campaña nacional inicialmente; optimizar por datos reales.'],
  ['strict_provenance', 'CRM con IA. Investigar competencia solo como evidencia externa. No convertir testimonios de terceros en claims propios.'],
  ['no_guarantees', 'Servicio B2B. No garantizar ventas, ingresos, citas ni ROAS. Toda nueva táctica debe marcarse como propuesta.'],
  ['long_cycle', 'Consultoría empresarial B2B. Ciclo de venta largo. Objetivo: reuniones con decisores y seguimiento multietapa.'],
  ['local_low_budget', 'Negocio local en México. Presupuesto inicial $150 MXN diarios. Objetivo: conversaciones calificadas por WhatsApp.'],
  ['high_ticket', 'Servicio premium de $30,000 MXN. Objetivo: solicitudes de diagnóstico, no venta impulsiva.'],
  ['multi_location', 'Cadena de 5 salones de belleza. Objetivo: generar citas y separar seguimiento por sucursal vía WhatsApp.'],
];

(async () => {
  const started = Date.now();
  const results = [];
  for (const [id, brief] of CASES) {
    const t0 = Date.now();
    let r;
    try {
      r = await H.run(brief, { adapter: mockAdapter(), mode: 'deterministic', retrieve: true });
    } catch (err) {
      results.push({ id, status: 'EXCEPTION', error: err.message, elapsed_ms: Date.now() - t0 });
      continue;
    }
    results.push({
      id,
      status: r.workflow_state_status,
      reason: r.reason || null,
      required_inputs: Array.isArray(r.required_inputs) ? r.required_inputs : [],
      brief_fidelity_violations: Array.isArray(r.brief_fidelity_violations) ? r.brief_fidelity_violations : [],
      nodes: (r.node_outputs || []).map(x => x.work_unit_id),
      synthesis: !!(r.synthesis && r.synthesis.deliverable),
      elapsed_ms: Date.now() - t0,
    });
  }

  const exceptions = results.filter(x => x.status === 'EXCEPTION');
  const nonTerminal = results.filter(x => !['COMPLETE','FAILED','BLOCKED','WAITING_FOR_INPUT'].includes(x.status));
  const incompleteComplete = results.filter(x => x.status === 'COMPLETE' && (x.nodes.length !== 8 || !x.synthesis));
  const complete = results.filter(x => x.status === 'COMPLETE');
  const controlledNonComplete = results.filter(x => ['FAILED','BLOCKED','WAITING_FOR_INPUT'].includes(x.status));
  const undiagnosed = controlledNonComplete.filter(x => {
    const hasReason = typeof x.reason === 'string' && x.reason.length > 0;
    const hasInputs = Array.isArray(x.required_inputs) && x.required_inputs.length > 0;
    const hasViolations = Array.isArray(x.brief_fidelity_violations) && x.brief_fidelity_violations.length > 0;
    return !(hasReason || hasInputs || hasViolations);
  });

  assert.equal(CASES.length, 50, 'stress corpus must remain exactly 50 cases');
  assert.equal(exceptions.length, 0, 'no case may throw an uncaught exception: ' + JSON.stringify(exceptions));
  assert.equal(nonTerminal.length, 0, 'every case must end in a terminal workflow state: ' + JSON.stringify(nonTerminal));
  assert.equal(incompleteComplete.length, 0, 'COMPLETE requires 8 specialist nodes + final synthesis: ' + JSON.stringify(incompleteComplete));
  assert.equal(undiagnosed.length, 0, 'every non-COMPLETE terminal outcome must include actionable diagnostics: ' + JSON.stringify(undiagnosed));

  console.log(JSON.stringify({
    gate: 'ASTRA12_CAMPAIGN360_ROBUSTNESS_GATE',
    status: 'PASS',
    cases: CASES.length,
    complete: complete.length,
    controlled_non_complete: controlledNonComplete.length,
    exceptions: exceptions.length,
    non_terminal: nonTerminal.length,
    undiagnosed: undiagnosed.length,
    completion_rate: complete.length / CASES.length,
    non_complete_cases: controlledNonComplete.map(x => ({
      id: x.id,
      status: x.status,
      reason: x.reason,
      required_inputs: x.required_inputs,
      violation_count: x.brief_fidelity_violations.length,
    })),
    elapsed_ms: Date.now() - started,
  }));
})().catch(err => {
  console.error('ASTRA12_CAMPAIGN360_STRESS_GATE FAIL', err.stack || err.message);
  process.exit(1);
});
