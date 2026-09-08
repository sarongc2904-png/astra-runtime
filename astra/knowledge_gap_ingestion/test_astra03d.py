import hashlib
import json
import unittest
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "knowledge_gap_ingestion"


def load(name):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


class Astra03DArtifacts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates = load("candidate_sources.json")
        cls.admission = load("source_admission.json")
        cls.extraction = load("extraction_qa.json")
        cls.chunks = load("new_chunks.json")
        cls.chunk_qa = load("chunk_qa.json")
        cls.embedding = load("embedding_validation.json")
        cls.ingestion = load("ingestion_execution.json")
        cls.meta = load("meta_ads_retrieval_validation.json")
        cls.whatsapp = load("whatsapp_sales_retrieval_validation.json")
        cls.coverage = load("post_ingestion_gap_coverage.json")
        cls.readiness = load("remap_readiness.json")
        cls.protection = load("protection_validation.json")

    def test_candidate_schema(self):
        required = {"source_id", "source_name", "source_type", "domain", "subdomains", "source_path_or_reference",
                    "authority", "relevance", "redundancy", "conflict_risk", "expected_value", "format", "parseability",
                    "provenance", "usage_or_license_status_if_known", "admission_candidate", "notes"}
        self.assertEqual(self.candidates["count"], 7)
        self.assertTrue(all(required <= set(x) for x in self.candidates["sources"]))

    def test_candidates_only_target_domains(self):
        self.assertEqual({x["domain"] for x in self.candidates["sources"]}, {"Meta Ads", "WhatsApp Sales"})

    def test_admission_counts(self):
        self.assertEqual(self.admission["counts"], {"ADMIT": 1, "DEFER": 3, "REJECT": 3})

    def test_only_meta_course_admitted(self):
        admitted = [x["source_id"] for x in self.admission["decisions"] if x["decision"] == "ADMIT"]
        self.assertEqual(admitted, ["SRC_META_VELOCITY_FACEBOOK_COURSE"])

    def test_no_whatsapp_source_admitted(self):
        domains = {x["source_id"]: x["domain"] for x in self.candidates["sources"]}
        self.assertFalse(any(domains[x["source_id"]] == "WhatsApp Sales" and x["decision"] == "ADMIT" for x in self.admission["decisions"]))

    def test_extraction_units(self):
        source = self.extraction["sources"][0]
        self.assertEqual((source["units_total"], source["units_extracted"], source["blank_units"]), (6, 6, 0))

    def test_chunk_count(self):
        self.assertEqual(self.chunks["count"], 35)
        self.assertEqual(self.chunk_qa["chunk_count"], 35)

    def test_chunk_integrity(self):
        self.assertEqual(self.chunk_qa["status"], "PASS")
        self.assertEqual(sum(self.chunk_qa[k] for k in ("blank_chunks", "duplicate_chunk_ids", "oversize_chunks", "undersize_chunks", "provenance_incomplete")), 0)

    def test_chunk_hashes(self):
        for chunk in self.chunks["chunks"]:
            digest = hashlib.sha256(chunk["content"].encode("utf-8")).hexdigest()
            self.assertEqual(digest, chunk["content_sha256"])

    def test_provenance_complete(self):
        required = {"source_id", "source_name", "source_type", "domain", "source_path", "unit_path", "source_sha256", "unit_sha256", "content_sha256", "ingestion_batch_id"}
        self.assertTrue(all(required <= set(x["provenance"]) for x in self.chunks["chunks"]))

    def test_warnings_retained(self):
        self.assertTrue(all("AUTOMATIC_SPEECH_RECOGNITION" in x["warning_flags"] and "NO_CAPI_OR_ADVANTAGE_PLUS" in x["warning_flags"] for x in self.chunks["chunks"]))

    def test_embedding_model_dimension(self):
        self.assertEqual((self.embedding["model"], self.embedding["dimension_validation"]["expected"]), ("text-embedding-3-small", 1536))
        self.assertEqual(self.embedding["dimension_validation"]["shape"], [35, 1536])
        self.assertTrue(self.embedding["dimension_validation"]["finite"] and self.embedding["dimension_validation"]["nonzero"])

    def test_embedding_file_shape(self):
        self.assertEqual(np.load(OUT / "new_embeddings.npy").shape, (35, 1536))

    def test_additive_counts(self):
        self.assertEqual((self.ingestion["chunks_before"], self.ingestion["chunks_inserted"], self.ingestion["chunks_after_expected"]), (1380, 35, 1415))
        self.assertEqual(self.ingestion["insert_failures"], [])

    def test_duplicate_prevention(self):
        self.assertEqual(self.ingestion["duplicates_skipped"], 0)
        self.assertIn("no update or overwrite", self.ingestion["conflict_policy"])

    def test_meta_retrieval_visibility(self):
        self.assertEqual(self.meta["status"], "PASS")
        self.assertEqual(self.meta["queries_with_dedicated_subject_hit"], 11)
        self.assertGreaterEqual(self.meta["total_dedicated_subject_hits"], 35)
        self.assertTrue(all(x["provenance_ok"] for x in self.meta["queries"]))

    def test_capi_limit_not_overstated(self):
        capi = next(x for x in self.meta["queries"] if "CAPI" in x["query"])
        self.assertEqual(capi["coverage_assessment"], "PARTIAL_PIXEL_ONLY")

    def test_whatsapp_gap_honest(self):
        self.assertEqual(self.whatsapp["coverage"], "NONE")
        self.assertEqual(self.whatsapp["queries_with_dedicated_subject_hit"], 0)

    def test_coverage_classifications(self):
        self.assertEqual(self.coverage["META_ADS"]["after"], "MODERATE")
        self.assertEqual(self.coverage["WHATSAPP_SALES"]["after"], "NONE")

    def test_remap_readiness(self):
        self.assertTrue(self.readiness["METHOD_META_ADS"]["META_ADS_EVIDENCE_READY_FOR_REMAP"])
        self.assertFalse(self.readiness["METHOD_WHATSAPP_SALES"]["WHATSAPP_SALES_EVIDENCE_READY_FOR_REMAP"])
        self.assertFalse(self.readiness["READY_FOR_ASTRA_03E_FINAL_REMAP_AND_READINESS"])
        self.assertFalse(self.readiness["READY_FOR_ASTRA_04_VERTICAL_SLICE_360"])

    def test_prior_rows_and_vectors_preserved(self):
        self.assertTrue(self.protection["existing_chunks_and_embeddings_preserved"])
        self.assertEqual(self.protection["existing_canonical_chunks_before_after"], [1380, 1380])

    def test_protected_runtime_unchanged(self):
        self.assertTrue(self.protection["protected_code_and_policy_unchanged"])
        self.assertTrue(self.protection["classifier_cache_unchanged"])

    def test_legacy_and_ann_unchanged(self):
        self.assertEqual(self.protection["legacy_kb_chunks_before_after"], [7584, 7584])
        self.assertEqual(self.protection["ann_indexes_before_after"], [0, 0])

    def test_no_specialists(self):
        self.assertFalse(self.protection["specialists_executed"])

    def test_agent_v1_protected(self):
        self.assertTrue(self.protection["AGENT_V1_PROTECTED"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
