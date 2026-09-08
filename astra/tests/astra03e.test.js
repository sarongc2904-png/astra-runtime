'use strict';
// ASTRA-03E deterministic offline tests. No live API, no scorer-semantics change.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const reg = require('../src/methods/registry_loader').load();
const FMR = path.join(__dirname, '..', 'final_method_readiness');
const R = p => JSON.parse(fs.readFileSync(path.join(FMR, p), 'utf8'));
let pass = 0, fail = 0; const fails = [];
function t(n, fn) { try { fn(); pass++; console.log('PASS', n); } catch (e) { fail++; fails.push(n + ' :: ' + e.message); console.log('FAIL', n, '::', e.message); } }
const by = id => reg.methods.find(m => m.method_id === id);

t('registry schema valid', () => { const v = R('final_registry_validation.json'); assert(v.valid && v.unique_ids && v.schema_key_set_consistent); });
t('registry version bumped to 03e', () => assert.strictEqual(reg.version, 'mr-0.4-astra03e'));
t('METHOD_META_ADS promoted with evidence', () => { const m = by('METHOD_META_ADS'); assert(m.mapping_status === 'PARTIALLY_MAPPED' && m.evidence_refs.length > 0 && m.source); });
t('META_ADS evidence refs valid (chunk+source)', () => { const m = by('METHOD_META_ADS'); assert(m.evidence_refs.every(r => r.chunk_id && (r.source_id || r.source_pdf_name))); });
t('META_ADS keeps MODERATE limitation (not authoritative current-platform)', () => { const m = by('METHOD_META_ADS'); assert(m.limitations.join(' ').includes('coverage=MODERATE') && m.not_recommended_for.join(' ').match(/CAPI|Advantage|attribution/)); });
t('METHOD_WHATSAPP_SALES promoted with evidence', () => { const m = by('METHOD_WHATSAPP_SALES'); assert(m.mapping_status === 'PARTIALLY_MAPPED' && m.evidence_refs.length > 0 && m.source); });
t('WHATSAPP keeps MODERATE + authority limits', () => { const m = by('METHOD_WHATSAPP_SALES'); assert(m.limitations.join(' ').includes('coverage=MODERATE') && m.not_recommended_for.join(' ').match(/provider-independent|API/)); });
t('confidence bounds 0..1 and conservative (<=0.6) for remaps', () => { assert(by('METHOD_META_ADS').confidence <= 0.6 && by('METHOD_WHATSAPP_SALES').confidence <= 0.6); });
t('VELOCITY stays DISCOVERED (not forced)', () => { const m = by('METHOD_VELOCITY'); assert(m.mapping_status === 'DISCOVERED' && m.evidence_refs.length === 0); });
t('COURSE_DESIGN stays DISCOVERED (unsupported)', () => { const m = by('METHOD_COURSE_DESIGN'); assert(m.mapping_status === 'DISCOVERED' && m.evidence_refs.length === 0); });
t('no method flagged universally best', () => assert(reg.methods.every(m => !('is_best' in m) && !('universal_best' in m))));
t('final adjudicator: Velocity never primary', () => assert.strictEqual(R('adjudicator_final_results.json').analysis.velocity_ever_primary, false));
t('final adjudicator: Course Design never primary', () => assert.strictEqual(R('adjudicator_final_results.json').analysis.course_design_ever_primary, false));
t('final adjudicator: >=8 distinct primaries (discrimination)', () => assert(R('adjudicator_final_results.json').analysis.distinct_primaries >= 8));
t('final adjudicator: no non-evidence-backed primary', () => assert.strictEqual(R('adjudicator_final_results.json').analysis.any_primary_not_evidence_backed, false));
t('final adjudicator: META_ADS available for ads task', () => assert.strictEqual(R('adjudicator_final_results.json').analysis.meta_ads_available_for_ads, true));
t('final adjudicator: WHATSAPP available for conversion task', () => assert.strictEqual(R('adjudicator_final_results.json').analysis.whatsapp_available_for_conversion, true));
t('final adjudicator: COURSE domain has no evidence-backed method', () => assert.strictEqual(R('adjudicator_final_results.json').analysis.course_domain_state, 'no_evidence_backed_course_method'));
t('scorer limitation classified NON_BLOCKING (semantics unchanged)', () => { const s = R('scorer_limitation_adjudication.json'); assert(s.classification === 'NON_BLOCKING_KNOWN_LIMITATION' && s.scorer_semantics_changed === false); });
t('astra04 nodes: 0 unsupported', () => assert.strictEqual(R('astra04_node_readiness.json').unsupported_count, 0));
t('astra04 nodes: ads+whatsapp partially supported', () => { const n = R('astra04_node_readiness.json').nodes; assert(n.ads.status === 'PARTIALLY_SUPPORTED' && n.whatsapp_conversion.status === 'PARTIALLY_SUPPORTED'); });
t('readiness: metadata ready + ASTRA-04 ready + 0 blocking domains', () => { const d = R('final_readiness_decision.json'); assert(d.METHOD_ADJUDICATOR_METADATA_READY && d.READY_FOR_ASTRA_04_VERTICAL_SLICE_360 && d.blocking_domains === 0); });
t('no specialist modules exist under astra/specialists', () => { const p = path.join(__dirname, '..', 'specialists'); assert(!fs.existsSync(p) || fs.readdirSync(p).filter(f => f.endsWith('.js')).length === 0); });

console.log(`\nASTRA03E_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log(fails.join('\n')); process.exit(1); }
