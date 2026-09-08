# Method routing summary

Method selection is task-relative and evidence-gated. ASTRA does not treat any framework as universally best and does not select solely by retrieval score.

The campaign workflow routes the required nodes for market context, ICP, offer, funnel, creative strategy, ads, WhatsApp conversion, and measurement. Ads is bound to the evidence-backed `METHOD_META_ADS`; WhatsApp conversion is bound to `METHOD_WHATSAPP_SALES`. Their known coverage remains moderate, so current platform, API, attribution, provider, and UI claims are surfaced as `CURRENT_RESEARCH_REQUIRED` instead of being invented.

Methods without sufficient evidence remain unavailable as primary choices. Conflicts and missing evidence fail closed. The GPT front end must preserve the runtime's selected methods, limitations, and support classes exactly; it must not reroute or promote a method on its own.
