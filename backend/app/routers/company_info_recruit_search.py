"""Recruitment page search — hybrid/legacy search, filtering, scoring."""

from __future__ import annotations

from urllib.parse import urlparse

from app.routers.company_info_candidate_scoring import (
    HAS_DDGS,
    _candidate_sort_key,
    _contains_company_name,
    _detect_other_graduation_years,
    _domain_from_url,
    _get_conflicting_companies,
    _get_graduation_year,
    _has_strict_company_name_match,
    _recruitment_hybrid_score_to_confidence,
    _recruitment_score_to_confidence,
    _normalize_recruitment_source_type,
    _score_recruit_candidate_with_breakdown,
    _search_with_ddgs,
)
from app.routers.company_info_models import (
    SearchCandidate,
    SearchPagesRequest,
)
from app.routers.company_info_schedule_links import _build_recruit_queries
from app.routers.company_info_url_utils import (
    _classify_company_relation,
    _get_source_type_legacy as _get_source_type,
    _is_irrelevant_url,
    _normalize_url,
)
from app.utils.company_names import get_company_domain_patterns
from app.utils.secure_logger import get_logger
from app.utils.web_search import hybrid_web_search

logger = get_logger(__name__)


async def _search_company_pages_impl(
    payload: SearchPagesRequest,
    use_hybrid_search: bool,
) -> dict:
    """Core logic for search_company_pages route handler."""
    request = payload
    company_name = request.company_name
    industry = request.industry
    custom_query = request.custom_query
    max_results = min(request.max_results, 15)
    graduation_year = request.graduation_year
    selection_type = request.selection_type
    allow_snippet_match = request.allow_snippet_match

    candidates = []

    logger.debug(f"\n[サイト検索] {'='*50}")
    logger.debug(f"[サイト検索] 🔍 企業名: {company_name}")
    if industry:
        logger.debug(f"[サイト検索] 🏢 業界: {industry}")

    # ===== Hybrid Search Path (RRF + Cross-Encoder Reranking) =====
    if use_hybrid_search and not custom_query:
        logger.debug(f"[サイト検索] 🚀 Hybrid Search モード (RRF + Reranking)")

        domain_patterns = get_company_domain_patterns(company_name)

        hybrid_results = await hybrid_web_search(
            company_name=company_name,
            search_intent="recruitment",
            graduation_year=graduation_year,
            selection_type=selection_type,
            max_results=max_results + 10,
            domain_patterns=domain_patterns,
            use_cache=True,
            content_type="new_grad_recruitment",
            strict_company_match=True,
            allow_aggregators=False,
            allow_snippet_match=allow_snippet_match,
        )

        try:
            from app.utils.web_search import generate_query_variations

            hybrid_queries = generate_query_variations(
                company_name=company_name,
                search_intent="recruitment",
                graduation_year=graduation_year,
                selection_type=selection_type,
            )
            logger.debug(f"[サイト検索] 🔍 Hybridクエリ一覧: {hybrid_queries}")
        except Exception:
            pass

        logger.debug(f"[サイト検索] 📊 Hybrid検索結果: {len(hybrid_results)}件")

        ranked_candidates: list[tuple[tuple[int, int, float], SearchCandidate]] = []
        excluded_reasons = {
            "不適切なサイト": 0,
            "非許可信頼サイト": 0,
        }

        for result in hybrid_results:
            url = result.url
            title = result.title
            snippet = result.snippet

            logger.debug(f"[サイト検索] 📋 {url[:60]}...")
            logger.debug(
                f"  │  RRF: {result.rrf_score:.3f}, Rerank: {result.rerank_score:.3f}, Combined: {result.combined_score:.3f}"
            )

            if _is_irrelevant_url(url):
                excluded_reasons["不適切なサイト"] = (
                    excluded_reasons.get("不適切なサイト", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: 不適切なサイト")
                continue

            relation = _classify_company_relation(url, company_name)
            relation_company_name = relation["relation_company_name"]
            source_type = _normalize_recruitment_source_type(
                url,
                result.source_type,
                relation,
            )

            if source_type == "other":
                excluded_reasons["非許可信頼サイト"] = (
                    excluded_reasons.get("非許可信頼サイト", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: 非許可の外部サイト")
                continue

            adjusted_score = result.combined_score
            confidence = _recruitment_hybrid_score_to_confidence(
                adjusted_score,
                source_type,
                year_matched=result.year_matched,
            )

            source_label = {
                "official": "公式",
                "aggregator": "就活サイト",
                "job_site": "就活サイト",
                "parent": "親会社",
                "subsidiary": "子会社",
                "other": "その他",
            }.get(source_type, source_type)
            logger.debug(f"[サイト検索] ✅ 採用: {source_label}, {confidence}")

            candidate = SearchCandidate(
                url=url,
                title=title[:100] if title else url[:50],
                confidence=confidence,
                source_type=source_type,
                relation_company_name=(
                    relation_company_name
                    if isinstance(relation_company_name, str)
                    else None
                ),
            )
            score_for_rank = float(result.combined_score)
            if source_type == "official":
                score_for_rank += 0.015
            if result.year_matched:
                score_for_rank += 0.01
            ranked_candidates.append(
                (_candidate_sort_key(candidate, score_for_rank), candidate)
            )

        filtered_candidates = [
            candidate
            for _, candidate in sorted(
                ranked_candidates,
                key=lambda item: item[0],
            )[:max_results]
        ]

        logger.debug(f"\n[サイト検索] 📊 Hybrid検索結果サマリー:")
        logger.debug(
            f"  └─ 検索結果: {len(hybrid_results)}件 → 採用: {len(filtered_candidates)}件"
        )
        if any(excluded_reasons.values()):
            excluded_str = ", ".join(
                f"{k}: {v}件" for k, v in excluded_reasons.items() if v > 0
            )
            logger.debug(f"     除外内訳: {excluded_str}")
        logger.debug(f"[サイト検索] {'='*50}\n")

        return {"candidates": filtered_candidates}

    # ===== Legacy Search Path (Original DuckDuckGo Search) =====
    queries = _build_recruit_queries(
        company_name,
        industry,
        custom_query,
        graduation_year=graduation_year,
        selection_type=selection_type,
    )

    if HAS_DDGS:
        results_map = {}
        score_details = {}
        per_query = min(8, max_results + 3)

        for query in queries:
            logger.debug(f"[サイト検索] 🔍 検索クエリ: {query}")
            search_results = await _search_with_ddgs(query, per_query)
            logger.debug(f"[サイト検索] 📊 DuckDuckGo結果: {len(search_results)}件")

            for result in search_results:
                url = result.get("href", result.get("url", ""))
                title = result.get("title", "")
                snippet = result.get("body", "")

                if not url:
                    continue

                normalized = _normalize_url(url)
                score, breakdown, patterns = _score_recruit_candidate_with_breakdown(
                    url,
                    title,
                    snippet,
                    company_name,
                    industry or "",
                    graduation_year=graduation_year,
                )
                if score is None:
                    logger.debug(f"[サイト検索] ❌ 除外: {url[:60]}... (除外ドメイン)")
                    continue

                existing = results_map.get(normalized)
                if existing is None or score > existing["score"]:
                    results_map[normalized] = {
                        "url": url,
                        "title": title,
                        "snippet": snippet,
                        "score": score,
                    }
                    score_details[normalized] = {
                        "breakdown": breakdown,
                        "patterns": patterns,
                    }

        scored = sorted(
            results_map.values(), key=lambda x: (-x["score"], len(x["title"] or ""))
        )

        logger.debug(f"\n[サイト検索] 📋 スコア詳細 ({len(scored)}件):")
        for i, item in enumerate(scored[:10]):
            url = item["url"]
            normalized = _normalize_url(url)
            details = score_details.get(normalized, {})
            breakdown = details.get("breakdown", {})
            patterns = details.get("patterns", [])

            prefix = "├─" if i < min(9, len(scored) - 1) else "└─"
            logger.debug(f"  {prefix} URL: {url[:70]}{'...' if len(url) > 70 else ''}")
            logger.debug(
                f"  │  タイトル: {(item['title'] or '')[:50]}{'...' if len(item['title'] or '') > 50 else ''}"
            )
            logger.debug(f"  │  スコア: {item['score']:.1f}pt")
            if patterns:
                logger.debug(f"  │  ドメインパターン: {patterns}")
            if breakdown:
                breakdown_str = ", ".join(f"{k}{v}" for k, v in breakdown.items())
                logger.debug(f"  │  内訳: {breakdown_str}")
            logger.debug(f"  │")

        ranked_candidates: list[tuple[tuple[int, int, float], SearchCandidate]] = []
        excluded_reasons = {
            "不適切なサイト": 0,
            "非許可信頼サイト": 0,
        }

        for item in scored:
            title = item["title"]
            url = item["url"]
            snippet = item.get("snippet", "")
            domain_patterns = get_company_domain_patterns(company_name)

            if _is_irrelevant_url(url):
                excluded_reasons["不適切なサイト"] = (
                    excluded_reasons.get("不適切なサイト", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: {url[:50]}... (不適切なサイト)")
                continue

            relation = _classify_company_relation(url, company_name)
            is_official_domain = bool(relation["is_official"])
            relation_company_name = relation["relation_company_name"]

            url_domain = _domain_from_url(url)
            conflicts = _get_conflicting_companies(url_domain, company_name)
            if conflicts and not is_official_domain and not _has_strict_company_name_match(
                company_name, title, snippet
            ):
                excluded_reasons["競合ドメイン"] = (
                    excluded_reasons.get("競合ドメイン", 0) + 1
                )
                conflict_label = ", ".join(sorted(conflicts))[:50]
                logger.debug(
                    f"[サイト検索] ❌ 除外: {url[:50]}... (競合ドメイン: {conflict_label})"
                )
                continue

            is_parent_site = bool(relation["is_parent"])
            if is_parent_site and not is_official_domain:
                item["score"] *= 0.5
                item["is_parent_company"] = True
                logger.debug(f"[サイト検索] ⚠️ ペナルティ: {url[:50]}... (親会社サイト, 0.5x)")

            is_sub = bool(relation["is_subsidiary"])
            sub_name = (
                relation_company_name
                if isinstance(relation_company_name, str)
                else None
            )
            if is_sub and not is_official_domain:
                item["score"] *= 0.3
                item["is_subsidiary"] = True
                item["subsidiary_name"] = sub_name
                logger.debug(
                    f"[サイト検索] ⚠️ ペナルティ: {url[:50]}... (子会社: {sub_name}, 0.3x)"
                )

            source_type = _normalize_recruitment_source_type(
                url,
                _get_source_type(url, company_name),
                relation,
            )
            if source_type == "other":
                excluded_reasons["非許可信頼サイト"] = (
                    excluded_reasons.get("非許可信頼サイト", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: {url[:50]}... (非許可の外部サイト)")
                continue

            try:
                parsed_url = urlparse(url)
                url_domain = parsed_url.netloc.lower()
            except Exception:
                url_domain = ""

            if not is_official_domain and not _contains_company_name(
                company_name, title, url, snippet, allow_snippet_match
            ):
                excluded_reasons["企業名不一致"] = (
                    excluded_reasons.get("企業名不一致", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: {url[:50]}... (企業名不一致)")
                continue

            grad_year_for_check = graduation_year or _get_graduation_year()
            other_years = _detect_other_graduation_years(
                url, title, snippet, grad_year_for_check
            )
            year_matched = not bool(other_years)
            confidence = _recruitment_score_to_confidence(
                item["score"],
                source_type,
                year_matched,
            )

            source_label = {
                "official": "公式",
                "job_site": "就活サイト",
                "blog": "ブログ",
                "other": "その他",
                "subsidiary": "子会社",
                "parent": "親会社",
            }.get(source_type, source_type)
            logger.debug(f"[サイト検索] ✅ 採用: {url[:50]}... ({source_label}, {confidence})")

            candidate = SearchCandidate(
                url=url,
                title=title[:100] if title else url[:50],
                confidence=confidence,
                source_type=source_type,
                relation_company_name=(
                    relation_company_name
                    if isinstance(relation_company_name, str)
                    else None
                ),
            )
            ranked_candidates.append(
                (_candidate_sort_key(candidate, float(item["score"])), candidate)
            )

        logger.debug(f"\n[サイト検索] 📊 結果サマリー:")
        logger.debug(
            f"  └─ 検索結果: {len(scored)}件 → 採用: {len(ranked_candidates)}件"
        )
        if any(excluded_reasons.values()):
            excluded_str = ", ".join(
                f"{k}: {v}件" for k, v in excluded_reasons.items() if v > 0
            )
            logger.debug(f"     除外内訳: {excluded_str}")
        logger.debug(f"[サイト検索] {'='*50}\n")

        if ranked_candidates:
            candidates = [
                candidate
                for _, candidate in sorted(ranked_candidates, key=lambda item: item[0])[
                    :max_results
                ]
            ]
            return {"candidates": candidates}

    logger.warning("[サイト検索] ⚠️ DuckDuckGo 検索が利用できません。手動URL入力が必要です。")
    return {
        "candidates": [],
        "error": "検索機能が無効です。公式URLを手動入力してください。",
    }
