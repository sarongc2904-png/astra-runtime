"""Build evidence-adjudicated ASTRA-08A artifacts from bounded Strategy-F results."""
from __future__ import annotations

import collections
import datetime as dt
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "design_knowledge_audit"


def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def read(name): return json.loads((OUT / name).read_text(encoding="utf-8"))
def write(name, value): (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# Human evidence adjudication after reading the 75 query trails. Counts are
# distinct directly relevant chunks, not raw term matches or retrieved slots.
DECISIONS = {
"01": ("MODERATE",4,"MEDIUM","HIGH",.82,["36729f6e1025c593244a725893242842fedc0c44bae6e61c4edc1b9b5538669b","6eff2196fcc2dc19f1d6e02b99d0fd201d57eb83977b4662a98f6617bc68b728","8af84d90bd99bb640b1696ff368638c961c5d4c41dd86f030cc62c8d586d093a"],"Actionable advertising-layout composition exists, but not a broad composition curriculum."),
"02": ("STRONG",6,"HIGH","HIGH",.93,["c36b3a4c5a80c45251ced20b8364b0963ea6bbad86ab31f5b5fdff64f8cf25c0","581b51a780e9398b8593a293859174544974ac507fe8b608c11a688e3d7bdbc9","52f3d1f825e81e53630b33882602e5095b3d70e145b77df562bf54cebbaf6637"],"Direct hierarchy purpose, element sizing, reading order, and layout examples."),
"03": ("STRONG",7,"HIGH","HIGH",.94,["6eff2196fcc2dc19f1d6e02b99d0fd201d57eb83977b4662a98f6617bc68b728","36729f6e1025c593244a725893242842fedc0c44bae6e61c4edc1b9b5538669b","55c59a77d2d03f01f62c3f5ea6c2a75f81a5689777d26a188999ba3c8a4f1f1d"],"Multiple directly actionable layout rules and advertising examples."),
"04": ("WEAK",2,"LOW","MEDIUM",.78,["55c59a77d2d03f01f62c3f5ea6c2a75f81a5689777d26a188999ba3c8a4f1f1d","6eff2196fcc2dc19f1d6e02b99d0fd201d57eb83977b4662a98f6617bc68b728"],"The source explicitly says effective grid use cannot be learned from its brief treatment."),
"05": ("MODERATE",5,"MEDIUM","MEDIUM",.85,["5c5e7fc0a102dd5b5d9237204fd02bf237169b0565906c869f6f91c4cc015258","c5d1db180c8b7af276420c4ab215b04ccbc3ba9343fb3903186aca7aefcc21f6","d17a8e4d6d9c9f63f9e9b231fb7f125af7ecc4c08a372dddc37119fbf756bde4"],"Kerning, letterspacing, lettering tone, consistency, and legibility are useful but incomplete."),
"06": ("STRONG",5,"HIGH","HIGH",.91,["efaa890af0694d82dcebc805d814298fe36cbb2e303c5394f00c51b04692e3ff","d17a8e4d6d9c9f63f9e9b231fb7f125af7ecc4c08a372dddc37119fbf756bde4"],"Direct palette selection, tonal contrast, brand fit, and production guidance."),
"07": ("STRONG",5,"HIGH","HIGH",.91,["b4d6fa875a8b42b8766e485525bea2cdbdd4c57d8ca5cbfe7100a3c5f9ecb25a","b3425e71b3cc82a4955361c7ca36e19fa5fbfb3849ed6fb09211a468d0901dfe"],"Direct tonal contrast and emphasis/readability consequences."),
"08": ("WEAK",1,"LOW","LOW",.77,["36729f6e1025c593244a725893242842fedc0c44bae6e61c4edc1b9b5538669b"],"Retrieved balance language is mostly campaign consistency, not visual-balance method."),
"09": ("NONE",0,"NONE","NONE",.94,[],"No meaningful visual-rhythm methodology was retrieved; movement term matches were unrelated."),
"10": ("STRONG",4,"HIGH","HIGH",.91,["8bb7d4f81d7b56db7a6b6c5000955c692b3ce176aa70abf50288cc3451e24b26","c36b3a4c5a80c45251ced20b8364b0963ea6bbad86ab31f5b5fdff64f8cf25c0"],"Direct good/bad white-space guidance and layout implications."),
"11": ("STRONG",6,"HIGH","HIGH",.93,["15909616f266c244761cc6e549ff96e6c4ddf1ef7967248b176e0074a90acfd6","3b7f35d96e7f0ac2451ede56e3c6428c367f3c76d1a543b0682defc50401a63f"],"Direct brand consistency, attributes, look/feel/tone, and integrated communication."),
"12": ("MODERATE",5,"MEDIUM","HIGH",.86,["581b51a780e9398b8593a293859174544974ac507fe8b608c11a688e3d7bdbc9","28f3c1504c27039db63017583eb5fee509626d106d4d2d30901bc2ee8d830f87","15909616f266c244761cc6e549ff96e6c4ddf1ef7967248b176e0074a90acfd6"],"Useful logo/identity consistency and campaign use; not a complete identity-system method."),
"13": ("STRONG",7,"HIGH","HIGH",.94,["1eb5305d6b3c0d5116271a83ce21b8e40f32712782b1bb1d88a359d6519c1fc7","04b185dec9449480112a776432b75f009d7b1aafe8b4776a9e6abac7dcbe03d4","94b3cd78eed496e6fa1eeca33e31d8b6a0534a222900163753ed48209cced6d5"],"Direct art-direction decisions, visual references, hierarchy, and execution craft."),
"14": ("STRONG",8,"HIGH","HIGH",.96,["bb83873561faa0a4d5168dabf43d42756e38c7a14b3b7325b8435469b92a08d5","336bc6373d6d415dd4be499de6379c41b32c388370bb7401576fd4c4dd3f9a4e","e3f65065c1019c9a975da3f20e9b89371492f7f750925aa8650ee0ecc283953e"],"Deep concept/idea development sequence with numerous advertising examples."),
"15": ("STRONG",6,"HIGH","HIGH",.97,["49c9cf2173ca1c75094508df6ea6a3c68f9fa479f3a26196e8421a02f730080b","a0b35c68c569a9501a9ece7fc9e4149b09e1f5183773ffc627db95312b30452a","f6bfdc9bfc920b98f8d6ac4e3f89a45025e0d0e694e0b9f87b1ded8ffeaf3a28"],"Explicit definition, aliases, one-message discipline, and exceptions."),
"16": ("STRONG",6,"HIGH","HIGH",.96,["655e6bb3d7c7630589919365c907c72ab428f2824e22ed4e8b1512fd7a4439b1","b7bc0f7453ac4f92041cb038211b4efee23ce3554c98d250be755344d6db6082","67ca03cf0a07bed32130c9725679b91b20a2ce2796a2866528b49084a8ffa86a"],"Dedicated visual-verbal relationship guidance and failure modes."),
"17": ("STRONG",5,"HIGH","HIGH",.93,["bfec8bd9d4d6adc9832b7fe324df17cc1e5da270c0de52c67e991b2925c990b2","f09537463e8e442a98d626a2d4a347a74958b723c015936817bacf148c9b1e58"],"Direct visual-metaphor and analogy examples with communication rationale."),
"18": ("STRONG",7,"HIGH","HIGH",.94,["86de79124e81abd1690e92e213490e34a7d357526e48788f64f2d1c3a5d5a4aa","fc7602ec3e0ca9084f3aa295ce72cc6d5afb0a25bd1d02e903b6f8edb834cda9","b7bc0f7453ac4f92041cb038211b4efee23ce3554c98d250be755344d6db6082"],"Direct headline/visual interplay, headline forms, and body-copy flow."),
"19": ("STRONG",5,"HIGH","HIGH",.92,["828a04d0ed3761892beddace5728bcc257e32089a590b10ccf4fcd3c6d791da4","94b3cd78eed496e6fa1eeca33e31d8b6a0534a222900163753ed48209cced6d5","df68c423ae8d66da832246b61cfa71fbf27c1853eff9b68a4cb2306642d371d0"],"Direct photography-versus-illustration and tonal/execution decisions."),
"20": ("WEAK",2,"LOW","LOW",.82,["52f3d1f825e81e53630b33882602e5095b3d70e145b77df562bf54cebbaf6637","55c59a77d2d03f01f62c3f5ea6c2a75f81a5689777d26a188999ba3c8a4f1f1d"],"Print-layout fragments transfer partially, but editorial design is not taught as a domain."),
"21": ("STRONG",7,"HIGH","HIGH",.95,["d105e4804493d1f61fbad7d3b2439118a42ff9f06a0999cfdb459cbfdc902719","20551d15d72fa20b5c5734d43abcc0edee5209f125efde1a40035ee5dfe0a53c","94b3cd78eed496e6fa1eeca33e31d8b6a0534a222900163753ed48209cced6d5"],"Dedicated print-ad formats, concept, layout, and final execution."),
"22": ("MODERATE",5,"MEDIUM","MEDIUM",.86,["bce0284f84e69a7ad1b8085278d054656d10bf1cb449662328d78f0975e9349b","9d34d3fe505fce777205647aca602017f91bd48e8072792fab63383bd4c9dd2e","357f2b09fd98fdaade52316ea0b09b87ed4c8e31abc7beff65104e8fda7927c0"],"Useful digital/interactive principles, but limited current-format and performance depth."),
"23": ("WEAK",1,"LOW","LOW",.84,["4bf3382b1939604260ce556753381ee2f025472aeb1a8c4da50c351a8f38ad55"],"General creative effectiveness exists; no performance-creative testing/iteration method."),
"24": ("MODERATE",5,"MEDIUM","MEDIUM",.87,["09ac04c5370d16507f7d8b3d0ea6a198cc512ab73cca05bf888e1452d24ed954","32bf7d28df8008cbb1edfb93836081b96bb0979c91e86bfec5b4cc911352b3e2","9a9e15791814b2e6e4109475975a09cbdf0102d01d76d65fec888df967255243"],"Social principles and one Meta source are useful, but craft/currentness/testing depth is limited."),
"25": ("NONE",0,"NONE","NONE",.96,[],"Mobile is mentioned as a medium; no mobile-first creative methodology retrieved."),
"26": ("NONE",0,"NONE","NONE",.96,[],"Scroll/attention term matches concern analytics or unrelated wording, not scroll-stopping craft."),
"27": ("MODERATE",4,"MEDIUM","HIGH",.88,["32a13e2ea2958a85df2d7726e8e00c0b7f5d436393dc54d2e84b4848c9dfd27c","c36b3a4c5a80c45251ced20b8364b0963ea6bbad86ab31f5b5fdff64f8cf25c0","602bb9e430a911a756424d9f756a395ebb428540627e9e5ca8504c672470e5e6"],"Direct CTA placement and hierarchy plus a second funnel source; limited ad-format breadth."),
"28": ("MODERATE",4,"MEDIUM","HIGH",.87,["b3425e71b3cc82a4955361c7ca36e19fa5fbfb3849ed6fb09211a468d0901dfe","6eff2196fcc2dc19f1d6e02b99d0fd201d57eb83977b4662a98f6617bc68b728","c36b3a4c5a80c45251ced20b8364b0963ea6bbad86ab31f5b5fdff64f8cf25c0"],"Actionable element-count, organization, hierarchy, and clarity principles."),
"29": ("MODERATE",4,"MEDIUM","HIGH",.88,["b4d6fa875a8b42b8766e485525bea2cdbdd4c57d8ca5cbfe7100a3c5f9ecb25a","5c5e7fc0a102dd5b5d9237204fd02bf237169b0565906c869f6f91c4cc015258","d17a8e4d6d9c9f63f9e9b231fb7f125af7ecc4c08a372dddc37119fbf756bde4"],"Useful tonal contrast, type spacing, and contextual type choices; not a full accessibility method."),
"30": ("STRONG",4,"HIGH","HIGH",.90,["4bf3382b1939604260ce556753381ee2f025472aeb1a8c4da50c351a8f38ad55","99add5411acf729346b41eadf03a2ccddd48b18c0d6b91c25d2e6a3a382915b1"],"Explicit effectiveness failure modes and response criteria support bounded critique."),
}


def main():
    evidence = read("design_evidence_map.json")
    inventory = read("source_inventory.json")
    source_by_id = {s["source_id"]: s for s in inventory["sources"]}
    coverage = []
    domain_by_id = {}
    for domain in evidence["domains"]:
        did = domain["domain_id"]; domain_by_id[did] = domain
        cls, direct, depth, action, confidence, reps, rationale = DECISIONS[did]
        unique = {}
        for query in domain["queries"]:
            for hit in query["top5"]: unique.setdefault(hit["chunk_id"], hit)
        missing = [x for x in reps if x not in unique]
        if missing: raise RuntimeError(f"representative evidence not retrieved for {did}: {missing}")
        source_ids = sorted({h["source_id"] for h in unique.values()})
        representative = [{k: unique[cid].get(k) for k in ("chunk_id","source_id","source_title","pdf_page_refs","representative_excerpt")} for cid in reps]
        limitations = [rationale, "Evidence is concentrated in one advertising book."]
        if did in {"22","23","24","25","26"}: limitations.append("Current platform/form-factor behavior is incomplete or absent.")
        item = {
            "domain_id": did, "domain_name": domain["domain_name"], "queries": [x["query"] for x in domain["queries"]],
            "retrieved_chunk_ids": list(unique), "source_ids": source_ids,
            "source_titles": [source_by_id[x]["source_title"] for x in source_ids],
            "direct_evidence_count": direct, "representative_evidence": representative,
            "methodological_depth": depth, "actionability_for_creative_director": action,
            "source_diversity": len(source_ids), "coverage_class": cls, "confidence": confidence,
            "limitations": limitations,
        }
        coverage.append(item)
    counts = collections.Counter(x["coverage_class"] for x in coverage)
    write("design_domain_coverage.json", {
        "generated_at": now(), "classification_criteria": {
            "STRONG": "At least 4 distinct directly relevant chunks across at least 2 query formulations, HIGH depth/actionability, and either multiple sources or deep independent passages/examples from one source.",
            "MODERATE": "At least 2 directly useful chunks and actionable guidance, but incomplete depth, diversity, currentness, or domain breadth.",
            "WEAK": "Only 1-2 sparse or partially transferable direct passages; insufficient alone for robust specialist behavior.",
            "NONE": "No meaningful directly relevant evidence; lexical/semantic term collisions are rejected.",
        }, "domain_count": len(coverage), "counts": dict(counts), "domains": coverage,
    })

    direct_domains = {x["domain_id"] for x in coverage if x["coverage_class"] in ("STRONG", "MODERATE")}
    partial_domains = {x["domain_id"] for x in coverage if x["coverage_class"] == "WEAK"}
    secondary = {("SRC_META_VELOCITY_FACEBOOK_COURSE", "24"), ("SRC_VEL_FUNNELS", "27")}
    matrix = []
    retrieved_pairs = collections.Counter()
    for d in evidence["domains"]:
        for q in d["queries"]:
            for h in q["top5"]: retrieved_pairs[(h["source_id"], d["domain_id"])] += 1
    for source in inventory["sources"]:
        for domain in coverage:
            pair = (source["source_id"], domain["domain_id"])
            if source["source_id"] == "acb-7efda14cb56f" and domain["domain_id"] in direct_domains: relation = "DIRECT"
            elif source["source_id"] == "acb-7efda14cb56f" and domain["domain_id"] in partial_domains: relation = "PARTIAL"
            elif pair in secondary: relation = "PARTIAL"
            else: relation = "NONE"
            matrix.append({"source_id": source["source_id"], "domain_id": domain["domain_id"], "classification": relation, "retrieved_slots": retrieved_pairs[pair]})
    write("source_domain_matrix.json", {"generated_at": now(), "sources": len(inventory["sources"]), "domains": 30, "pair_count": len(matrix), "classes": ["DIRECT","PARTIAL","NONE"], "matrix": matrix})

    orientation = {
        "acb-7efda14cb56f": ("MATERIAL", "advertising creative, concept, copy, art direction, and print design"),
        "SRC_META_VELOCITY_FACEBOOK_COURSE": ("LIMITED", "Meta Ads campaign strategy; limited creative craft"),
        "SRC_VEL_FUNNELS": ("LIMITED", "funnel/landing-page structure with isolated CTA/layout guidance"),
    }
    for source in inventory["sources"]:
        contribution, primary = orientation.get(source["source_id"], ("NO_MATERIAL_CONTRIBUTION", source.get("category") or "marketing/business"))
        source["design_creative_contribution"] = contribution
        source["primary_orientation"] = primary
    inventory["design_sources_identified"] = 1
    inventory["design_adjacent_sources_with_limited_contribution"] = 2
    write("source_inventory.json", inventory)

    prior = json.loads((BASE / "astra" / "knowledge_discovery" / "normalized_methods.json").read_text(encoding="utf-8"))
    methods = []
    for method in prior["methods"]:
        methods.append({
            "canonical_name": method["canonical_name"], "aliases": method["aliases"],
            "sources": [{"source_id": "acb-7efda14cb56f", "source_title": method["primary_source"]}],
            "evidence_count": len(method["evidence_refs"]), "evidence_refs": method["evidence_refs"],
            "best_for": method["subdomain"],
            "limitations": ["Single-source support.", "Readiness limited to the supported advertising subdomain."],
            "readiness": "EVIDENCE_BACKED_PARTIALLY_MAPPED", "confidence": method["existence_confidence"],
        })
    write("design_method_inventory.json", {"generated_at": now(), "method_count": len(methods), "no_generic_advice_promoted": True, "methods": methods})

    gaps = []
    for d in coverage:
        availability = "AVAILABLE_NOW" if d["coverage_class"] == "STRONG" else ("MISSING" if d["coverage_class"] == "NONE" else "PARTIAL")
        gaps.append({"domain_id": d["domain_id"], "domain_name": d["domain_name"], "availability": availability, "coverage_class": d["coverage_class"], "reason": d["limitations"][0]})
    readiness = {
        "CREATIVE_DIRECTOR": {"readiness": "PARTIALLY_READY", "basis": "Strong advertising concept/SMP/art-direction/copy/print core; foundational and current digital gaps remain."},
        "ART_DIRECTOR": {"readiness": "PARTIALLY_READY", "basis": "Strong hierarchy/layout/color/art direction; grids, balance, rhythm, and cross-source depth are insufficient."},
        "GRAPHIC_DESIGN_SPECIALIST": {"readiness": "NOT_READY", "basis": "No full graphic-design foundation across grids, balance, rhythm, typography, identity systems, and editorial design."},
        "AD_CREATIVE_SPECIALIST": {"readiness": "PARTIALLY_READY", "basis": "Strong concept/copy/print; performance, mobile-first, and scroll-stopping methods are absent or weak."},
        "CREATIVE_CRITIC_QA": {"readiness": "PARTIALLY_READY", "basis": "Actionable advertising critique criteria exist but are concentrated in one source and lack current performance-validation depth."},
    }
    write("gap_analysis.json", {"generated_at": now(), "domains": gaps, "future_specialist_readiness": readiness})
    decision = "READY_WITH_LIMITATIONS"
    limitations = [
        "368/375 retrieval slots and every evidence-backed named creative method are concentrated in one advertising book.",
        "Visual rhythm, mobile-first creative, and scroll-stopping craft have no meaningful current evidence.",
        "Grids, visual balance, editorial design, and performance creative are weak.",
        "Typography, visual identity, digital/social creative, CTA hierarchy, density, and legibility are useful but incomplete.",
        "Meta/social evidence does not provide a deep, current performance-creative testing system.",
        "A Creative Director can be bounded to advertising concept and art direction, but cannot be presented as a complete graphic-design or current performance-creative authority.",
    ]
    write("creative_director_readiness.json", {
        "generated_at": now(), "question": "Can ASTRA-08B Creative Director be built now using only the current corpus?",
        "decision": decision, "limitations": limitations, "ready_for_astra_08b_creative_director": True,
        "required_scope_guard": "Build only a bounded advertising Creative Director that exposes these limitations; do not claim full graphic-design or current-platform authority.",
    })
    priorities = [
        {"missing_domain": "mobile-first creative and scroll-stopping craft", "why_it_matters": "Core social/performance execution must work in small-screen feeds and earn attention quickly.", "future_specialist_affected": ["CREATIVE_DIRECTOR","AD_CREATIVE_SPECIALIST","CREATIVE_CRITIC_QA"], "priority": "P0", "recommended_source_type_book_category": "Current, method-focused mobile/social advertising creative craft and platform-format guidance", "current_kb_partially_compensates": False},
        {"missing_domain": "performance creative testing and iteration", "why_it_matters": "Creative decisions need hypothesis, variation, measurement, diagnosis, and iteration—not only concept quality.", "future_specialist_affected": ["AD_CREATIVE_SPECIALIST","CREATIVE_CRITIC_QA"], "priority": "P0", "recommended_source_type_book_category": "Current performance-creative experimentation and creative analytics methodology", "current_kb_partially_compensates": True},
        {"missing_domain": "grid systems, visual balance, and rhythm", "why_it_matters": "These are foundational composition controls for reliable art direction and graphic design.", "future_specialist_affected": ["ART_DIRECTOR","GRAPHIC_DESIGN_SPECIALIST"], "priority": "P1", "recommended_source_type_book_category": "Authoritative graphic-design foundations covering grids, composition, balance, rhythm, and spacing", "current_kb_partially_compensates": True},
        {"missing_domain": "typography and legibility depth", "why_it_matters": "Reliable type systems require hierarchy, scale, spacing, pairing, readability, and accessibility beyond isolated advice.", "future_specialist_affected": ["ART_DIRECTOR","GRAPHIC_DESIGN_SPECIALIST","CREATIVE_CRITIC_QA"], "priority": "P1", "recommended_source_type_book_category": "Typography systems and screen/print legibility reference", "current_kb_partially_compensates": True},
        {"missing_domain": "visual identity systems", "why_it_matters": "Brand consistency advice does not replace identity architecture, systems, governance, and applications.", "future_specialist_affected": ["CREATIVE_DIRECTOR","ART_DIRECTOR","GRAPHIC_DESIGN_SPECIALIST"], "priority": "P2", "recommended_source_type_book_category": "Brand identity systems and visual-identity design methodology", "current_kb_partially_compensates": True},
        {"missing_domain": "editorial design", "why_it_matters": "Long-form and multi-page communication needs editorial hierarchy, pacing, navigation, and grid application.", "future_specialist_affected": ["GRAPHIC_DESIGN_SPECIALIST"], "priority": "P2", "recommended_source_type_book_category": "Editorial design and publication systems", "current_kb_partially_compensates": True},
        {"missing_domain": "cross-source creative critique", "why_it_matters": "One-source criteria increase doctrinal concentration and blind spots.", "future_specialist_affected": ["CREATIVE_DIRECTOR","CREATIVE_CRITIC_QA"], "priority": "P2", "recommended_source_type_book_category": "Independent advertising creative review/critique frameworks with worked cases", "current_kb_partially_compensates": True},
    ]
    write("recommended_ingestion_priorities.json", {"generated_at": now(), "recommendation_only": True, "executed": False, "priorities": priorities})
    print(json.dumps({"coverage": dict(counts), "methods": len(methods), "creative_director": decision, "matrix_pairs": len(matrix)}))


if __name__ == "__main__": main()
