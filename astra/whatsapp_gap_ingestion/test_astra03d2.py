import hashlib
import json
import unittest
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "whatsapp_gap_ingestion"


def load(name):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


class Astra03D2Artifacts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates = load("candidate_sources.json")
        cls.admission = load("source_admission.json")
        cls.legacy = load("legacy_source_snapshot.json")
        cls.extraction = load("extraction_qa.json")
        cls.chunks = load("new_chunks.json")
        cls.chunk_qa = load("chunk_qa.json")
        cls.embedding = load("embedding_validation.json")
        cls.ingestion = load("ingestion_execution.json")
        cls.retrieval = load("whatsapp_retrieval_validation.json")
        cls.coverage = load("post_ingestion_coverage.json")
        cls.readiness = load("remap_readiness.json")
        cls.protection = load("protection_validation.json")

    def test_candidate_schema(self):
        required = {"source_id", "source_name", "source_type", "domain", "subdomains", "source_path_or_reference",
                    "authority", "relevance", "redundancy", "conflict_risk", "expected_value", "format", "parseability",
                    "provenance", "usage_or_license_status_if_known", "admission_candidate", "notes"}
        self.assertEqual(self.candidates["count"], 6)
        self.assertTrue(all(required <= set(x) for x in self.candidates["sources"]))

    def test_only_whatsapp_domain_candidates(self):
        self.assertEqual({x["domain"] for x in self.candidates["sources"]}, {"WhatsApp Sales"})

    def test_admission_counts(self):
        self.assertEqual(self.admission["counts"], {"ADMIT": 2, "DEFER": 2, "REJECT": 2})
        self.assertTrue(self.admission["dedicated_source_requirement_satisfied"])

    def test_exact_admitted_sources(self):
        admitted = {x["source_id"] for x in self.admission["decisions"] if x["decision"] == "ADMIT"}
        self.assertEqual(admitted, {"SRC_WA_SALES_OS_LEGACY_CURATED", "SRC_WA_FUNNELCHAT_WORKSHOP_TRANSCRIPT"})

    def test_prompts_and_duplicates_not_admitted(self):
        decisions = {x["source_id"]: x["decision"] for x in self.admission["decisions"]}
        self.assertEqual(decisions["SRC_WA_SYSTEM_PROMPT"], "REJECT")
        self.assertEqual(decisions["SRC_WA_COMBINED_TRANSCRIPT_DUPLICATE"], "REJECT")

    def test_legacy_source_exact(self):
        self.assertEqual(self.legacy["row_count"], 12)
        self.assertTrue(self.legacy["read_only"])
        self.assertTrue(all(x["domain"] == "whatsapp_sales_os" and x["status"] == "active" for x in self.legacy["rows"]))

    def test_extraction_qa(self):
        self.assertEqual((self.extraction["units_total"], self.extraction["units_extracted"]), (14, 14))
        self.assertEqual((self.extraction["blank_units"], self.extraction["garbled_units"]), (0, 0))

    def test_chunk_count(self):
        self.assertEqual(self.chunks["count"], 39)
        self.assertEqual(self.chunk_qa["chunk_count"], 39)

    def test_chunk_qa(self):
        self.assertEqual(self.chunk_qa["status"], "PASS")
        self.assertEqual(sum(self.chunk_qa[key] for key in ("blank_chunks", "duplicate_chunk_ids", "oversize_chunks", "undersize_chunks", "provenance_incomplete")), 0)

    def test_chunk_hashes(self):
        for chunk in self.chunks["chunks"]:
            self.assertEqual(hashlib.sha256(chunk["content"].encode("utf-8")).hexdigest(), chunk["content_sha256"])

    def test_provenance_complete(self):
        required = {"source_id", "source_name", "source_type", "domain", "source_path_or_reference", "source_sha256", "unit_sha256", "content_sha256", "ingestion_batch_id"}
        self.assertTrue(all(required <= set(x["provenance"]) for x in self.chunks["chunks"]))

    def test_source_distribution(self):
        self.assertEqual(self.chunk_qa["source_distribution"], {"SRC_WA_FUNNELCHAT_WORKSHOP_TRANSCRIPT": 36, "SRC_WA_SALES_OS_LEGACY_CURATED": 3})

    def test_warnings_preserved(self):
        legacy = [x for x in self.chunks["chunks"] if x["source_pdf_id"] == "SRC_WA_SALES_OS_LEGACY_CURATED"]
        workshop = [x for x in self.chunks["chunks"] if x["source_pdf_id"] == "SRC_WA_FUNNELCHAT_WORKSHOP_TRANSCRIPT"]
        self.assertTrue(all("ORIGINAL_MARKDOWN_NOT_PRESENT_LOCALLY" in x["warning_flags"] for x in legacy))
        self.assertTrue(all("AUTOMATIC_SPEECH_RECOGNITION" in x["warning_flags"] for x in workshop))

    def test_embedding_contract(self):
        self.assertEqual(self.embedding["model"], "text-embedding-3-small")
        self.assertEqual(self.embedding["dimension_validation"]["shape"], [39, 1536])
        self.assertTrue(self.embedding["dimension_validation"]["finite"] and self.embedding["dimension_validation"]["nonzero"])

    def test_embedding_file(self):
        self.assertEqual(np.load(OUT / "new_embeddings.npy").shape, (39, 1536))

    def test_additive_counts(self):
        self.assertEqual((self.ingestion["chunks_before"], self.ingestion["chunks_inserted"], self.ingestion["chunks_after_expected"]), (1415, 39, 1454))
        self.assertEqual(self.ingestion["insert_failures"], [])

    def test_duplicate_prevention(self):
        self.assertEqual(self.ingestion["duplicates_skipped"], 0)
        self.assertIn("no update", self.ingestion["conflict_policy"])

    def test_whatsapp_retrieval(self):
        self.assertEqual(self.retrieval["status"], "PASS")
        self.assertEqual(self.retrieval["queries_with_dedicated_subject_hit"], 10)
        self.assertGreaterEqual(self.retrieval["total_dedicated_subject_hits"], 30)
        self.assertTrue(all(x["provenance_ok"] for x in self.retrieval["queries"]))

    def test_coverage_is_conservative(self):
        self.assertEqual(self.retrieval["coverage"], "MODERATE")
        self.assertEqual(self.coverage["WHATSAPP_SALES"]["after"], "MODERATE")
        self.assertTrue(self.coverage["WHATSAPP_SALES"]["missing_topics"])

    def test_whatsapp_remap_ready(self):
        self.assertTrue(self.readiness["WHATSAPP_SALES_EVIDENCE_READY_FOR_REMAP"])

    def test_meta_readiness_preserved(self):
        self.assertTrue(self.readiness["META_ADS_EVIDENCE_READY_FOR_REMAP"])

    def test_astra03e_ready(self):
        self.assertTrue(self.readiness["READY_FOR_ASTRA_03E_FINAL_REMAP_AND_READINESS"])
        self.assertFalse(self.readiness["READY_FOR_ASTRA_04_VERTICAL_SLICE_360"])

    def test_prior_data_preserved(self):
        self.assertTrue(self.protection["existing_chunks_and_embeddings_preserved"])
        self.assertEqual(self.protection["existing_canonical_chunks_before_after"], [1415, 1415])

    def test_protected_runtime_and_cache(self):
        self.assertTrue(self.protection["protected_code_and_policy_unchanged"])
        self.assertTrue(self.protection["classifier_cache_unchanged"])

    def test_legacy_ann_and_specialists(self):
        self.assertEqual(self.protection["legacy_kb_chunks_before_after"], [7584, 7584])
        self.assertEqual(self.protection["ann_indexes_before_after"], [0, 0])
        self.assertFalse(self.protection["specialists_executed"])
        self.assertTrue(self.protection["AGENT_V1_PROTECTED"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
