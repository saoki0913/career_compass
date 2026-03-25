#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cd "$repo_root"

python -m pytest \
  backend/tests/company_info/test_public_url_guard.py \
  backend/tests/company_info/test_content_type_keywords.py \
  backend/tests/company_info/test_domain_pattern_matching.py \
  backend/tests/company_info/test_hybrid_search_short_circuit.py \
  backend/tests/company_info/test_schedule_search_policy.py \
  backend/tests/company_info/test_upload_pdf_ingestion.py \
  backend/tests/es_review/test_es_review_quality_rubric.py \
  backend/tests/es_review/test_es_review_final_quality_cases.py \
  backend/tests/es_review/test_es_review_prompt_structure.py \
  backend/tests/es_review/test_es_review_rag_profiles.py \
  backend/tests/es_review/test_es_review_template_rag_policy.py \
  backend/tests/es_review/test_es_review_template_repairs.py \
  backend/tests/es_review/test_live_es_review_gate_support.py \
  backend/tests/es_review/test_reference_es_quality.py \
  backend/tests/es_review/test_review_telemetry_summary.py \
  backend/tests/gakuchika/test_gakuchika_next_question.py \
  backend/tests/motivation/test_motivation_flow_helpers.py \
  backend/tests/motivation/test_motivation_streaming.py \
  backend/tests/shared/test_llm_message_normalization.py \
  backend/tests/shared/test_llm_provider_routing.py \
  backend/tests/shared/test_prompt_safety.py \
  backend/tests/shared/test_streaming_json.py \
  -q
