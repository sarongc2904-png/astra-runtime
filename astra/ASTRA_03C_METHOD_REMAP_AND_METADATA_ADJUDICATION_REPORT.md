# ASTRA-03C — Method remap and metadata adjudication

## Result

**PASS.** The expanded 1,380-row corpus was used in 25 bounded Strategy-F queries. Registry `mr-0.2-astra03` (17 methods: 8 partial / 9 discovered) became `mr-0.3-astra03c` (21 methods: 17 partial / 4 discovered). Every populated material field has evidence refs; no corpus, Agent V1, Supabase or specialist change occurred.

## Remap

Nine newly evidenced methods were promoted or added: Venta Elegante Sales Conversion, Growth/Digital Marketing, Propuesta Irresistible, CRO Máxima, Audience/ICP Definition, Velocity Funnel Method, MIDAS, Infoproduct A-Z, and Growth Marketing. The eight prior creative/copy methods remain evidence-backed.

Still `DISCOVERED` with confidence 0 and no evidence: `METHOD_VELOCITY` (brand/source umbrella, not one proven doctrine), `METHOD_META_ADS`, `METHOD_WHATSAPP_SALES`, and `METHOD_COURSE_DESIGN`.

Aliases: Funnel Design/Velocity Funnel Method merged; MIDAS and Growth Marketing kept separate; Velocity versus the evidenced Funnel Method remains ambiguous. Dependencies, compatibility and conflicts remain empty because no direct relationship claims were retrieved.

Confidence uses a deterministic weighted model: source quality, evidence count, specificity, agreement, field coverage, alias certainty and source diversity. Retrieval cosine is diagnostic only.

## Adjudicator and discrimination

Thirteen representative cases were run through the unchanged ASTRA-02 skeleton. Supported tasks produced task-relative primaries across funnel, offer, sales, creative, copy, infoproduct, CRO and growth; Meta Ads, WhatsApp and Course Design withheld a primary with `INSUFFICIENT_EVIDENCE`. Seven explicit cross-method distinctions are evidence-backed. No universal Velocity, Sales Acceleration or Digital Marketing winner exists.

The registry metadata is sufficient for meaningful differentiation across covered domains: `METHOD_ADJUDICATOR_METADATA_READY=TRUE`. Known implementation limitation: the current coarse scorer does not consume all rich `primary_jobs`/`best_for` semantics, so same-domain tie-breaking needs a later code gate; no scorer code was changed here.

## Coverage and ASTRA-04

Creative, copy, ICP, offer, funnels, sales conversion, infoproducts, CRO, positioning and pricing are supported. Meta Ads, WhatsApp sales and course creation remain NONE.

The canonical eight-node vertical slice keeps Ads and WhatsApp Conversion as required predecessors of Measurement and contains no explicit defer/stub allowance. Therefore Ads and WhatsApp are two unsupported required domains and `READY_FOR_ASTRA_04_VERTICAL_SLICE_360=FALSE`. Course creation remains unsupported but is not part of that first eight-node slice.

Exact next knowledge gate: `ASTRA_03D_TARGETED_GAP_INGESTION_META_ADS_WHATSAPP`, under a new authorization. It was not executed.

## Protection and tests

ASTRA-03C suite: 16/16 PASS. Current ASTRA suite: 38/39 PASS; the sole failure is the explicitly obsolete ASTRA-02 seed assertion that every registry row must remain DISCOVERED. Protected files/cache/corpus are unchanged; Supabase remains 1,380 rows, 1,380 valid embeddings and 8 sources; zero writes/schema/index changes; no specialists.
