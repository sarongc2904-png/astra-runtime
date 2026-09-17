# Meta Andromeda — Verified Knowledge Source (2026)

Status: VERIFIED_SOURCE_PACK
Last reviewed: 2026-09-16
Use: ASTRA NEXT Meta Ads / creative routing

## Source policy

This source separates documented Meta facts from ASTRA recommendations. Recommendations must never be presented as statements made by Meta.

## Official sources

1. Meta Engineering, 2024-12-02 — “Meta Andromeda: Supercharging Advantage+ automation with the next-gen personalized ads retrieval engine”
   https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/

2. Meta Newsroom LATAM, 2025-04-03 — “Usamos el poder de la IA para llegar a los clientes dondequiera que estén”
   https://about.fb.com/ltam/news/2025/04/usamos-el-poder-de-la-ia-para-llegar-a-los-clientes-dondequiera-que-esten/

3. Meta Newsroom LATAM, 2025-02 — “Maximiza el rendimiento de tu campaña con las nuevas funciones de Advantage+ AI y recomendaciones probadas empíricamente”
   https://about.fb.com/ltam/news/2025/02/maximiza-el-rendimiento-de-tu-campana-con-las-nuevas-funciones-de-advantage-ai-y-recomendaciones-probadas-empiricamente/

4. Meta Engineering, 2026-04-02 — “KernelEvolve: How Meta’s Ranking Engineer Agent Optimizes AI Infrastructure”
   https://engineering.fb.com/2026/04/02/developer-tools/kernelevolve-how-metas-ranking-engineer-agent-optimizes-ai-infrastructure/

## Documented facts

### AND-F01 — Andromeda is an ads retrieval system
Classification: EVIDENCE

Meta describes Andromeda as a proprietary personalized ads retrieval engine. Retrieval is the first stage of Meta’s multi-stage ads recommendation system, reducing a very large candidate pool to a much smaller set that later ranking models evaluate.

### AND-F02 — It is designed for large creative/candidate volumes
Classification: EVIDENCE

Meta explicitly links the retrieval challenge to the growth of eligible ads produced by Advantage+ automation and generative-AI creative tools. Andromeda uses hierarchical indexing and higher-capacity neural retrieval to handle this expansion efficiently.

### AND-F03 — Personalization occurs in retrieval, not only final ranking
Classification: EVIDENCE

Andromeda models higher-order relationships between people and ads in the retrieval stage, allowing more personalized candidate selection before downstream ranking.

### AND-F04 — Advantage+ increases automation and eligible options
Classification: EVIDENCE

Meta describes Advantage+ as automating areas such as audience creation/targeting, budget allocation, placements and related optimization. Meta’s public materials present Andromeda and Advantage+ as complementary parts of a more automated ads-delivery stack.

### AND-F05 — Meta reported system-level performance improvements
Classification: EVIDENCE

Meta reported improvements in retrieval recall and ad quality for selected segments following Andromeda deployment. These are Meta system-level measurements and must not be converted into a guaranteed uplift for an individual advertiser.

### AND-F06 — Andromeda remains part of Meta’s evolving ads infrastructure
Classification: EVIDENCE

Meta continued publishing work related to Andromeda model/inference optimization in 2026. Treat implementation details and reported infrastructure gains as platform facts, not direct advertiser benchmarks.

## ASTRA derived recommendations

### AND-R01 — Creative diversity should be strategically meaningful
Classification: RECOMMENDATION
Basis: AND-F02 + AND-F03

When producing variants, prefer materially distinct concepts, hooks, visual mechanisms or proof structures rather than superficial color/text swaps. The rationale is to provide genuinely different eligible creative signals for a personalized retrieval system. This is an ASTRA operational recommendation, not a documented rule from Meta that “more creatives always wins.”

### AND-R02 — Do not over-segment audiences by habit
Classification: RECOMMENDATION
Basis: AND-F03 + AND-F04

When account constraints allow, evaluate broader/automated delivery rather than assuming many manually fragmented audiences are inherently superior. Decide by downstream business economics and lead quality, not ideology.

### AND-R03 — Quality remains more important than raw creative quantity
Classification: RECOMMENDATION
Basis: AND-F02

Do not interpret Andromeda as permission to generate low-quality AI variations at scale. Creative volume is useful only when variants preserve brand quality, clarity, distinct strategic hypotheses and measurable purpose.

### AND-R04 — Build creative systems, not isolated images
Classification: RECOMMENDATION
Basis: AND-F02 + AND-F03

For Meta campaigns, create a coherent creative system containing multiple strategic routes: problem/insight, outcome, proof, objection, mechanism, offer, authority or demonstration when appropriate. Each execution should have one dominant idea.

### AND-R05 — Evaluate by downstream outcomes
Classification: RECOMMENDATION
Basis: existing ASTRA Meta 2026 knowledge + Andromeda personalization context

Do not declare a creative winner solely by CPM, CTR or CPC. Prefer qualified lead, appointment, sale, CAC and revenue signals when measurement allows.

## Prohibited extrapolations

ASTRA must not claim any of the following without new verified evidence:

- that a fixed number of creatives is required by Andromeda;
- that Andromeda guarantees lower CPA or higher ROAS for every account;
- that manual targeting is obsolete in every situation;
- that AI-generated creative is intrinsically favored over human-designed creative;
- that superficial creative variations improve retrieval merely because they increase count;
- that Meta exposes an advertiser control called “Andromeda” in Ads Manager.

## Creative-quality rule

For a final visual creative, Andromeda evidence is **not sufficient by itself**. ASTRA must combine Meta delivery evidence with specialist graphic-design and advertising/copy evidence. The design decision must therefore route to the design books as well as this source.
