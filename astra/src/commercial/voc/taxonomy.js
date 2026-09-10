'use strict';
// [ASTRA-11F §C §H §I §J §K §L] Controlled, versioned Voice-of-Customer taxonomies +
// deterministic surface-form matchers. NO free-form canonical labels — an LLM never
// generates a canonical label here. Spanish-first (the ASTRA fixtures are es).
// Regex note: `\b` is ASCII-only in JS, so accented Spanish words use explicit
// (?:^|[\s,.;:¡!¿?"'()]) style boundaries instead. No LLM, no web, no I/O.

const ASPECT_TAXONOMY_VERSION = 'voc-aspect-v1';
const CONCEPT_MAP_VERSION = 'voc-concept-v1';
const QUESTION_TAXONOMY_VERSION = 'voc-question-v1';

const VOC_ASPECTS = Object.freeze([
  'PAIN', 'DESIRE', 'FEAR', 'OBJECTION', 'TRIGGER', 'ALTERNATIVE', 'DECISION_CRITERION',
  'REASON_TO_BUY', 'REASON_NOT_TO_BUY', 'EXPECTATION', 'COMPLAINT', 'FRUSTRATION', 'BARRIER',
  'OUTCOME', 'BENEFIT', 'RISK', 'QUESTION', 'UNCERTAINTY', 'UNKNOWN',
]);
const DECISION_CRITERIA = Object.freeze([
  'price', 'speed', 'quality', 'trust', 'proof', 'location', 'convenience', 'financing',
  'guarantee', 'technology', 'expertise', 'personalization', 'availability', 'support', 'reputation', 'UNKNOWN',
]);
const QUESTION_TYPES = Object.freeze([
  'price_question', 'duration_question', 'process_question', 'risk_question', 'result_question',
  'eligibility_question', 'availability_question', 'financing_question', 'guarantee_question',
  'comparison_question', 'trust_question', 'UNKNOWN',
]);
const ALTERNATIVE_TYPES = Object.freeze([
  'competitor', 'diy', 'do_nothing', 'wait', 'cheaper_option', 'different_category',
  'existing_provider', 'referral', 'manual_process', 'UNKNOWN',
]);
const TRIGGER_TYPES = Object.freeze([
  'pain_worsened', 'deadline', 'life_event', 'business_slowdown', 'failed_previous_solution',
  'recommendation', 'promotion', 'new_budget', 'new_responsibility', 'seasonality', 'urgent_need', 'UNKNOWN',
]);
const CANONICAL_CONCEPTS = Object.freeze([
  'PRICE_CONCERN', 'PRICE_ACCEPTANCE', 'PAIN_FEAR', 'PAIN_EXPERIENCED', 'SPEED_NEED', 'SLOW_SERVICE',
  'TRUST_CONCERN', 'RESULTS_DESIRED', 'RESULTS_UNCERTAINTY', 'PROCESS_UNCLEAR', 'FINANCING_DEMAND',
  'GUARANTEE_DEMAND', 'RESPONSIVENESS_COMPLAINT', 'QUALITY_PRAISE', 'CONVENIENCE_VALUE', 'UNKNOWN_CONCEPT',
]);

// concept detectors. `negatable:true` -> a leading negation cue flips the meaning.
const KEYWORD_RULES = Object.freeze([
  { re: /(muy caro|está caro|esta caro|demasiado caro|carísimo|carisimo|precio alto|es caro|me pareció caro|me parecio caro|pareció caro|parecio caro|se me hace caro|está costoso|esta costoso|caro para lo)/i, aspect: 'OBJECTION', concept: 'PRICE_CONCERN', polarity: 'NEGATIVE', criterion: 'price', negatable: true, flip: { aspect: 'REASON_TO_BUY', concept: 'PRICE_ACCEPTANCE', polarity: 'POSITIVE' } },
  { re: /(buen precio|precio justo|vale la pena|vale lo que cuesta|excelente valor|buen valor|es razonable|muy accesible|precio accesible|precio econ[oó]mico)/i, aspect: 'REASON_TO_BUY', concept: 'PRICE_ACCEPTANCE', polarity: 'POSITIVE', criterion: 'price' },
  { re: /(me da miedo|tengo miedo|me asusta|me daba miedo|nervios|ansiedad|me preocupa que|me preocupaba que)/i, aspect: 'FEAR', concept: 'PAIN_FEAR', polarity: 'NEGATIVE' },
  { re: /(pens[eé] que doler[ií]a|cre[ií] que doler[ií]a|iba a doler|dol[oó]|doler|doler[ií]a|que duela|molest[oó]|molestias)/i, aspect: 'FEAR', concept: 'PAIN_FEAR', polarity: 'NEGATIVE', negatable: true, flip: { aspect: 'OUTCOME', concept: 'PAIN_EXPERIENCED', polarity: 'POSITIVE' } },
  { re: /(no doli[oó]|no me doli[oó]|sin dolor|nada de dolor|no sent[ií] dolor|indoloro)/i, aspect: 'OUTCOME', concept: 'PAIN_EXPERIENCED', polarity: 'POSITIVE' },
  { re: /(r[aá]pido|el mismo d[ií]a|de inmediato|cuanto antes|lo necesito ya|urgente que)/i, aspect: 'DESIRE', concept: 'SPEED_NEED', polarity: 'POSITIVE', criterion: 'speed' },
  { re: /(lento|tardaron|tard[oó]|demoraron|se tardan|mucho tiempo|d[ií]as en responder|nunca (me )?respondieron|no (me )?respondieron|no contestan|no contestaron|no me contestaron)/i, aspect: 'COMPLAINT', concept: 'RESPONSIVENESS_COMPLAINT', polarity: 'NEGATIVE', criterion: 'speed' },
  { re: /(no me generan confianza|no me da confianza|desconfi|no me f[ií]o|dudoso|parece estafa|malas rese[ñn]as)/i, aspect: 'DECISION_CRITERION', concept: 'TRUST_CONCERN', polarity: 'NEGATIVE', criterion: 'trust' },
  { re: /(quiero resultados|que funcione|que sirva|busco resultados|resultados reales)/i, aspect: 'DESIRE', concept: 'RESULTS_DESIRED', polarity: 'POSITIVE', criterion: 'proof' },
  { re: /(no s[eé] si funciona|no estoy segur|dudo que funcione|incertidumbre|no me convence del todo)/i, aspect: 'UNCERTAINTY', concept: 'RESULTS_UNCERTAINTY', polarity: 'NEGATIVE' },
  { re: /(no entend[ií]|no me qued[oó] claro|proceso poco claro|confuso el proceso|no s[eé] c[oó]mo es el proceso)/i, aspect: 'BARRIER', concept: 'PROCESS_UNCLEAR', polarity: 'NEGATIVE' },
  { re: /(meses sin intereses|financiamiento|a plazos|pagar en partes|dan cr[eé]dito|msi\b)/i, aspect: 'DECISION_CRITERION', concept: 'FINANCING_DEMAND', polarity: 'NEUTRAL', criterion: 'financing' },
  { re: /(garant[ií]a|si no funciona me devuelven|reembolso|pol[ií]tica de devoluci[oó]n)/i, aspect: 'DECISION_CRITERION', concept: 'GUARANTEE_DEMAND', polarity: 'NEUTRAL', criterion: 'guarantee' },
  { re: /(me gust[oó]|excelente|muy bueno|buen[ií]simo|me encant[oó]|lo recomiendo|muy recomendable|qued[eé] feliz|qued[eé] contento|super bien)/i, aspect: 'BENEFIT', concept: 'QUALITY_PRAISE', polarity: 'POSITIVE', criterion: 'quality' },
  { re: /(muy cerca|est[aá] cerca|buena ubicaci[oó]n|a domicilio|en l[ií]nea|sin salir de casa|muy c[oó]modo)/i, aspect: 'DECISION_CRITERION', concept: 'CONVENIENCE_VALUE', polarity: 'POSITIVE', criterion: 'convenience' },
]);

// negation cue at (roughly) the start of a clause, or immediately before the keyword.
const NEGATION_RE = /(?:^|[\s,;:])(no|nunca|jam[aá]s|tampoco|ni)\b/i;
const PRIOR_RE = /(pens[eé] que|cre[ií] que|esperaba que|ten[ií]a miedo de que|me preocupaba que|antes (pensaba|cre[ií]a)|al principio)/i;
const INTENSITY_RE = /\b(muy|extremadamente|s[uú]per|demasiado|bastante|un poco|algo|ligeramente)\b/i;
const INTENSITY_MAP = { muy: 'HIGH', extremadamente: 'HIGH', 'súper': 'HIGH', 'super': 'HIGH', demasiado: 'HIGH', bastante: 'MEDIUM', 'un poco': 'LOW', algo: 'LOW', ligeramente: 'LOW' };

const QUESTION_RULES = Object.freeze([
  { re: /(cu[aá]nto (cuesta|vale|sale)|qu[eé] precio|precio\?)/i, type: 'price_question' },
  { re: /(cu[aá]nto (dura|tarda|tiempo)|cu[aá]ntas sesiones|duraci[oó]n\?)/i, type: 'duration_question' },
  { re: /(c[oó]mo (es|funciona|se hace)|en qu[eé] consiste|qu[eé] proceso)/i, type: 'process_question' },
  { re: /(es peligroso|hay alg[uú]n riesgo|es seguro|duele\?|efectos secundarios)/i, type: 'risk_question' },
  { re: /(de verdad funciona|s[ií] sirve|qu[eé] resultados|se ven resultados)/i, type: 'result_question' },
  { re: /(soy candidat|aplica para m[ií]|sirve para m[ií]|puedo hacerme)/i, type: 'eligibility_question' },
  { re: /(tienen (cita|disponibilidad|lugar)|para cu[aá]ndo hay|qu[eé] horario)/i, type: 'availability_question' },
  { re: /(meses sin intereses\?|financian\?|puedo pagar a plazos|dan cr[eé]dito\?)/i, type: 'financing_question' },
  { re: /(tienen garant[ií]a|si no funciona me devuelven)/i, type: 'guarantee_question' },
  { re: /(mejor que|en qu[eé] se diferencian|por qu[eé] ustedes y no)/i, type: 'comparison_question' },
  { re: /(son de confiar|tienen rese[ñn]as|referencias\?)/i, type: 'trust_question' },
]);

const ALTERNATIVE_RULES = Object.freeze([
  { re: /(otra cl[ií]nica|otro proveedor|con la competencia|vi otra opci[oó]n|en otro lado|otro lugar m[aá]s barato)/i, type: 'competitor' },
  { re: /(hacerlo yo mismo|por mi cuenta|remedio casero|yo sol[oa])/i, type: 'diy' },
  { re: /(no hacer nada|dejarlo as[ií]|as[ií] est[aá] bien|mejor no)/i, type: 'do_nothing' },
  { re: /(voy a esperar|m[aá]s adelante|el pr[oó]ximo a[ñn]o|luego lo hago)/i, type: 'wait' },
  { re: /(algo m[aá]s barato|una opci[oó]n m[aá]s econ[oó]mica|lo m[aá]s barato)/i, type: 'cheaper_option' },
  { re: /(mi dentista de siempre|con quien ya voy|mi proveedor actual)/i, type: 'existing_provider' },
  { re: /(me recomend[oó] un|por recomendaci[oó]n de|un conocido me dijo)/i, type: 'referral' },
]);

const TRIGGER_RULES = Object.freeze([
  { re: /(empeor[oó]|se puso peor|ya no aguant|cada vez peor|el dolor aument)/i, type: 'pain_worsened' },
  { re: /(antes de (la boda|el evento|diciembre|fin de a[ñn]o)|fecha l[ií]mite|tengo hasta)/i, type: 'deadline' },
  { re: /(me caso|mi boda|nuevo trabajo|me voy a mudar|graduaci[oó]n)/i, type: 'life_event' },
  { re: /(bajaron las ventas|el negocio est[aá] lento|tengo menos clientes)/i, type: 'business_slowdown' },
  { re: /(prob[eé] otra cosa y no funcion[oó]|ya intent[eé] (otra cosa|antes)|no me sirvi[oó] lo anterior)/i, type: 'failed_previous_solution' },
  { re: /(me recomend|un amigo me dijo|me lo recomendaron|por recomendaci[oó]n)/i, type: 'recommendation' },
  { re: /(vi (una|la) promoci[oó]n|estaba en oferta|precio de lanzamiento|hab[ií]a descuento)/i, type: 'promotion' },
  { re: /(ya tengo el presupuesto|me aprobaron el|junt[eé] el dinero)/i, type: 'new_budget' },
  { re: /(en (verano|temporada)|antes del fr[ií]o|en vacaciones)/i, type: 'seasonality' },
  { re: /(urge|lo necesito ya|es urgente|no puede esperar)/i, type: 'urgent_need' },
]);

module.exports = {
  ASPECT_TAXONOMY_VERSION, CONCEPT_MAP_VERSION, QUESTION_TAXONOMY_VERSION,
  VOC_ASPECTS, DECISION_CRITERIA, QUESTION_TYPES, ALTERNATIVE_TYPES, TRIGGER_TYPES, CANONICAL_CONCEPTS,
  KEYWORD_RULES, NEGATION_RE, PRIOR_RE, INTENSITY_RE, INTENSITY_MAP,
  QUESTION_RULES, ALTERNATIVE_RULES, TRIGGER_RULES,
};
