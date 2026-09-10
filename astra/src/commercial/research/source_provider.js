'use strict';
// [ASTRA-11D] ResearchSourceProvider interface (spec section C).
// 11D does NOT invent a second ingestion system. A provider returns RAW provider-shaped
// payloads which are then handed to ASTRA-11C ingest(). If no live web connector exists
// (it does not, and none is authorized), only deterministic FIXTURE providers are usable.
// "Do not fake live research" -> a fixture provider MUST declare provider_kind:'FIXTURE'.
// No LLM, no web, no I/O.

// Interface (documentation): a ResearchSourceProvider is
//   { provider_id, provider_kind: 'FIXTURE' | 'LIVE', supports(plan) -> bool,
//     collect(plan, { referenceTime }) -> [ raw provider-shaped payload for ASTRA-11C ] }
// LIVE providers are NOT implemented in this gate and calling one throws.

function makeFixtureProvider({ provider_id, records }) {
  if (!provider_id) throw new Error('makeFixtureProvider: provider_id required');
  const rows = (records || []).map(r => Object.freeze({ ...r }));
  return Object.freeze({
    provider_id: String(provider_id),
    provider_kind: 'FIXTURE',
    supports: () => true,
    collect: (plan, { referenceTime } = {}) => {
      // Deterministic: return the frozen fixture rows, stamped with capture time = referenceTime.
      // The rows are provider-shaped (they carry provider_hint etc.) and go straight to ASTRA-11C.
      return rows.map(r => ({ ...r, captured_at: r.captured_at || referenceTime }));
    },
  });
}

function makeLiveProviderStub(provider_id) {
  return Object.freeze({
    provider_id: String(provider_id),
    provider_kind: 'LIVE',
    supports: () => false,
    collect: () => { throw new Error('[ASTRA-11D] LIVE research providers are not authorized in this gate — use a FIXTURE provider'); },
  });
}

module.exports = { makeFixtureProvider, makeLiveProviderStub };
