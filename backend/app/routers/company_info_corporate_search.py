"""Corporate page search — hybrid/legacy search, query building, scoring."""

from __future__ import annotations

from app.config import settings
from app.routers.company_info_auth import _normalize_cache_mode
from app.routers.company_info_candidate_scoring import (
    HAS_DDGS,
    _candidate_sort_key,
    _contains_company_name,
    _domain_from_url,
    _get_conflicting_companies,
    _has_strict_company_name_match,
    _hybrid_score_to_confidence,
    _score_corporate_candidate,
    _score_corporate_candidate_with_breakdown,
    _score_to_confidence,
    _search_with_ddgs,
)
from app.routers.company_info_config import (
    CORP_SEARCH_MIN_SCORE,
    CORP_STRICT_MIN_RESULTS,
)
from app.routers.company_info_models import (
    CorporatePageCandidate,
    SearchCandidate,
    SearchCorporatePagesRequest,
)
from app.routers.company_info_url_utils import (
    _classify_company_relation,
    _get_source_type_legacy as _get_source_type,
    _is_irrelevant_url,
    _normalize_url,
    _sanitize_preferred_domain,
    _should_include_corporate_candidate,
)
from app.utils.company_names import (
    get_company_domain_patterns,
    normalize_company_result_source_type,
)
from app.utils.content_type_keywords import url_matches_content_type
from app.utils.secure_logger import get_logger
from app.utils.web_search import (
    CONTENT_TYPE_SEARCH_INTENT,
    hybrid_web_search,
)

logger = get_logger(__name__)


def _build_corporate_queries(
    company_name: str,
    search_type: str,
    custom_query: str | None = None,
    preferred_domain: str | None = None,
    content_type: str | None = None,
) -> list[str]:
    """Build search queries for corporate page search.

    Args:
        company_name: Company name to search for
        search_type: Legacy search type (ir/business/about)
        custom_query: Custom search query override
        preferred_domain: Optional domain to prioritize
        content_type: Specific content type for optimized queries

    Returns:
        List of search queries
    """
    queries = []

    if custom_query:
        queries = [custom_query]
    elif content_type:
        type_queries = {
            "new_grad_recruitment": [
                f"{company_name} 新卒採用",
                f"{company_name} 採用情報",
                f"{company_name} エントリー",
                f"{company_name} 新卒 採用サイト",
            ],
            "midcareer_recruitment": [
                f"{company_name} 中途採用",
                f"{company_name} キャリア採用",
                f"{company_name} 転職",
                f"{company_name} 採用情報",
            ],
            "ceo_message": [
                f"{company_name} 社長メッセージ",
                f"{company_name} 代表メッセージ",
                f"{company_name} トップメッセージ",
                f"{company_name} ごあいさつ",
            ],
            "employee_interviews": [
                f"{company_name} 社員インタビュー",
                f"{company_name} 社員紹介",
                f"{company_name} 先輩社員",
                f"{company_name} 社員の声",
            ],
            "press_release": [
                f"{company_name} プレスリリース",
                f"{company_name} ニュースリリース",
                f"{company_name} お知らせ",
                f"{company_name} ニュース",
            ],
            "ir_materials": [
                f"{company_name} IR",
                f"{company_name} 投資家情報",
                f"{company_name} 決算説明資料",
                f"{company_name} 有価証券報告書",
            ],
            "csr_sustainability": [
                f"{company_name} サステナビリティ",
                f"{company_name} CSR",
                f"{company_name} ESG",
                f"{company_name} 環境",
            ],
            "midterm_plan": [
                f"{company_name} 中期経営計画",
                f"{company_name} 中期計画",
                f"{company_name} 経営戦略",
                f"{company_name} 事業計画",
            ],
            "corporate_site": [
                f"{company_name} 会社概要",
                f"{company_name} 企業情報",
                f"{company_name} 会社案内",
                f"{company_name} 企業概要",
            ],
        }
        queries = type_queries.get(content_type, [f"{company_name} {content_type}"])
    else:
        type_queries = {
            "ir": [
                f"{company_name} IR",
                f"{company_name} 投資家情報",
                f"{company_name} 決算説明資料",
            ],
            "business": [
                f"{company_name} 事業内容",
                f"{company_name} 事業紹介",
                f"{company_name} 製品 サービス",
            ],
            "about": [
                f"{company_name} 会社概要",
                f"{company_name} 企業情報",
                f"{company_name} 会社案内",
            ],
        }
        queries = type_queries.get(search_type, [f"{company_name} {search_type}"])

    seen = set()
    result = []
    for q in queries:
        query = q
        if preferred_domain and "site:" not in q:
            query = f"{q} site:{preferred_domain}"
        if query in seen:
            continue
        seen.add(query)
        result.append(query)
    return result[:4]


def _log_corporate_search_debug(message: str) -> None:
    if settings.company_search_debug:
        logger.debug(f"[企業サイト検索] {message}")


def _classify_corporate_url_confidence(
    url: str, title: str, search_type: str, company_name: str = ""
) -> str:
    """Backward-compatible wrapper for corporate URL confidence."""
    score = _score_corporate_candidate(
        url,
        title,
        "",
        company_name,
        search_type,
        preferred_domain=None,
        strict_company_match=False,
    )
    if score is None:
        return "low"
    source_type = _get_source_type(url, company_name) if company_name else "other"
    return _score_to_confidence(score, source_type)


async def _search_corporate_pages_impl(
    payload: SearchCorporatePagesRequest,
    use_hybrid_search: bool,
) -> dict:
    """Core logic for search_corporate_pages route handler."""
    request = payload
    company_name = request.company_name
    search_type = request.search_type
    content_type = request.content_type
    custom_query = request.custom_query
    preferred_domain = request.preferred_domain
    strict_company_match = (
        True if request.strict_company_match is None else request.strict_company_match
    )
    allow_aggregators = True if request.allow_aggregators else False
    max_results = min(request.max_results, 10)
    allow_snippet_match = request.allow_snippet_match
    cache_mode = _normalize_cache_mode(request.cache_mode, "bypass")
    graduation_year = request.graduation_year
    preferred_domain = _sanitize_preferred_domain(
        company_name, preferred_domain, content_type
    )

    ct_labels = {
        "new_grad_recruitment": "新卒採用",
        "midcareer_recruitment": "中途採用",
        "ceo_message": "社長メッセージ",
        "employee_interviews": "社員インタビュー",
        "press_release": "プレスリリース",
        "ir_materials": "IR資料",
        "csr_sustainability": "CSR/サステナ",
        "midterm_plan": "中期経営計画",
        "corporate_site": "企業情報",
    }
    if content_type and content_type in ct_labels:
        type_label = ct_labels[content_type]
    else:
        type_label = {"about": "企業情報", "ir": "IR", "business": "事業"}.get(
            search_type, search_type
        )

    # ===== Hybrid Search Path (RRF + Cross-Encoder Reranking) =====
    if use_hybrid_search and not custom_query:
        logger.debug(
            f"\n[{type_label}検索] =================================================="
        )
        logger.debug(f"[{type_label}検索] 🔍 企業名: {company_name}")
        logger.debug(f"[{type_label}検索] 🚀 Hybrid Search モード (RRF + Reranking)")
        if content_type:
            logger.debug(f"[{type_label}検索] 📂 コンテンツタイプ: {content_type}")

        try:
            from app.utils.web_search import generate_query_variations

            hybrid_queries = generate_query_variations(
                company_name=company_name,
                search_intent=CONTENT_TYPE_SEARCH_INTENT.get(content_type, "corporate_about"),
                graduation_year=graduation_year,
                selection_type=None,
            )
            logger.debug(f"[{type_label}検索] 🔍 Hybridクエリ一覧: {hybrid_queries}")
        except Exception:
            pass

        domain_patterns = get_company_domain_patterns(company_name)
        search_intent = CONTENT_TYPE_SEARCH_INTENT.get(content_type, "corporate_about")

        if content_type == "new_grad_recruitment":
            allow_aggregators = False

        hybrid_results = await hybrid_web_search(
            company_name=company_name,
            search_intent=search_intent,
            graduation_year=graduation_year,
            max_results=max_results + 10,
            domain_patterns=domain_patterns,
            use_cache=True,
            cache_mode=cache_mode,
            content_type=content_type,
            preferred_domain=preferred_domain,
            strict_company_match=strict_company_match,
            allow_aggregators=allow_aggregators,
            allow_snippet_match=allow_snippet_match,
        )

        logger.debug(f"[{type_label}検索] 📊 Hybrid検索結果: {len(hybrid_results)}件")

        ranked_candidates = []
        excluded_reasons = {
            "不適切なサイト": 0,
            "競合ドメイン": 0,
            "企業名不一致": 0,
        }

        for result in hybrid_results:
            url = result.url
            title = result.title
            snippet = result.snippet

            logger.debug(f"[{type_label}検索] 📋 {url[:60]}...")
            logger.debug(
                f"  │  RRF: {result.rrf_score:.3f}, Rerank: {result.rerank_score:.3f}, Combined: {result.combined_score:.3f}"
            )

            if _is_irrelevant_url(url):
                excluded_reasons["不適切なサイト"] += 1
                logger.debug(f"[{type_label}検索] ❌ 除外: 不適切なサイト")
                continue

            relation = _classify_company_relation(url, company_name, content_type)
            is_official_domain = bool(relation["is_official"])
            relation_company_name = relation["relation_company_name"]

            source_type = normalize_company_result_source_type(
                result.source_type,
                relation,
            )

            keep_candidate, exclude_reason = _should_include_corporate_candidate(
                source_type,
                content_type,
                relation,
                url=url,
                title=title,
                snippet=snippet,
            )
            if not keep_candidate:
                excluded_reasons[exclude_reason or "関連会社サイト"] = (
                    excluded_reasons.get(exclude_reason or "関連会社サイト", 0) + 1
                )
                logger.debug(
                    f"[{type_label}検索] ❌ 除外: {exclude_reason or '関連会社サイト'}"
                )
                continue

            adjusted_score = result.combined_score
            confidence = _hybrid_score_to_confidence(
                adjusted_score,
                source_type,
                year_matched=result.year_matched,
                content_type=content_type,
            )

            source_label = {
                "official": "公式",
                "aggregator": "就活サイト",
                "job_site": "就活サイト",
                "parent": "親会社",
                "subsidiary": "子会社",
                "other": "その他",
            }.get(source_type, source_type)
            logger.debug(f"[{type_label}検索] ✅ 採用: {source_label}, {confidence}")

            normalized_source_type = (
                source_type
                if source_type
                in [
                    "official",
                    "job_site",
                    "parent",
                    "subsidiary",
                    "blog",
                    "other",
                ]
                else "other"
            )

            url_pattern_match = True
            if content_type and content_type != "corporate_site":
                url_pattern_match = url_matches_content_type(url, content_type)

            candidate = SearchCandidate(
                url=url,
                title=title[:100] if title else url[:50],
                confidence=confidence,
                source_type=normalized_source_type,
                relation_company_name=(
                    relation_company_name
                    if isinstance(relation_company_name, str)
                    else None
                ),
                parent_allowed=bool(relation.get("parent_allowed")),
            )
            score_for_rank = float(result.combined_score)
            if url_pattern_match:
                score_for_rank += 0.015
            ranked_candidates.append((_candidate_sort_key(candidate, score_for_rank), candidate))

        filtered_candidates = [
            candidate
            for _, candidate in sorted(
                ranked_candidates,
                key=lambda item: item[0],
            )[:max_results]
        ]

        logger.debug(f"\n[{type_label}検索] 📊 Hybrid検索結果サマリー:")
        logger.debug(
            f"  └─ 検索結果: {len(hybrid_results)}件 → 採用: {len(filtered_candidates)}件"
        )
        if any(excluded_reasons.values()):
            excluded_str = ", ".join(
                f"{k}: {v}件" for k, v in excluded_reasons.items() if v > 0
            )
            logger.debug(f"     除外内訳: {excluded_str}")
        logger.debug(
            f"[{type_label}検索] ==================================================\n"
        )

        return {"candidates": filtered_candidates}

    # ===== Legacy Search Path (Original DuckDuckGo Search) =====
    queries = _build_corporate_queries(
        company_name,
        search_type,
        custom_query,
        preferred_domain,
        content_type=content_type,
    )

    candidates = []

    if HAS_DDGS:
        results_map = {}
        score_details = {}
        per_query = min(8, max_results + 3)

        logger.debug(
            f"\n[{type_label}検索] =================================================="
        )
        logger.debug(f"[{type_label}検索] 🔍 企業名: {company_name}")
        if content_type:
            logger.debug(f"[{type_label}検索] 📂 コンテンツタイプ: {content_type}")
        else:
            logger.debug(f"[{type_label}検索] 📂 検索タイプ: {search_type}")
        if preferred_domain:
            logger.debug(f"[{type_label}検索] 🌐 優先ドメイン: {preferred_domain}")

        async def _collect_results(strict_match: bool, allow_aggs: bool) -> None:
            for query in queries:
                logger.debug(f"[{type_label}検索] 🔍 検索クエリ: {query}")
                search_results = await _search_with_ddgs(
                    query, per_query, cache_mode=cache_mode
                )
                logger.debug(f"[{type_label}検索] 📊 DuckDuckGo結果: {len(search_results)}件")

                for result in search_results:
                    url = result.get("href", result.get("url", ""))
                    title = result.get("title", "")
                    snippet = result.get("body", "")

                    if not url:
                        continue

                    normalized = _normalize_url(url)
                    score, breakdown, patterns = (
                        _score_corporate_candidate_with_breakdown(
                            url,
                            title,
                            snippet,
                            company_name,
                            search_type,
                            preferred_domain=preferred_domain,
                            strict_company_match=strict_match,
                            allow_aggregators=allow_aggs,
                            content_type=content_type,
                        )
                    )
                    if score is None:
                        reason = breakdown.get("除外", "除外")
                        logger.debug(f"[{type_label}検索] ❌ 除外: {url[:60]}... ({reason})")
                        continue
                    if score < CORP_SEARCH_MIN_SCORE:
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

        await _collect_results(strict_company_match, allow_aggregators)
        _log_corporate_search_debug(f"strict results={len(results_map)}")

        if strict_company_match and len(results_map) < CORP_STRICT_MIN_RESULTS:
            _log_corporate_search_debug("relaxed pass enabled")
            await _collect_results(False, allow_aggregators)

        if not allow_aggregators and len(results_map) == 0:
            _log_corporate_search_debug("aggregator fallback enabled")
            await _collect_results(False, True)

        scored = sorted(
            results_map.values(), key=lambda x: (-x["score"], len(x["title"] or ""))
        )

        logger.debug(f"\n[{type_label}検索] 📋 スコア詳細 ({len(scored)}件):")
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

        excluded_reasons = {
            "不適切なサイト": 0,
            "競合ドメイン": 0,
            "企業名不一致": 0,
        }

        for item in scored:
            url = item["url"]
            title = item["title"]
            snippet = item.get("snippet", "")

            if _is_irrelevant_url(url):
                excluded_reasons["不適切なサイト"] = (
                    excluded_reasons.get("不適切なサイト", 0) + 1
                )
                logger.debug(f"[{type_label}検索] ❌ 除外: {url[:50]}... (不適切なサイト)")
                continue

            relation = _classify_company_relation(url, company_name, content_type)
            is_official_domain = bool(relation["is_official"])
            relation_company_name = relation["relation_company_name"]
            is_related_company = bool(relation["is_parent"]) or bool(
                relation["is_subsidiary"]
            )

            url_domain = _domain_from_url(url)
            conflicts = _get_conflicting_companies(url_domain, company_name)
            if (
                conflicts
                and not is_official_domain
                and not is_related_company
                and not _has_strict_company_name_match(company_name, title, snippet)
            ):
                excluded_reasons["競合ドメイン"] = (
                    excluded_reasons.get("競合ドメイン", 0) + 1
                )
                conflict_label = ", ".join(sorted(conflicts))[:50]
                logger.debug(
                    f"[{type_label}検索] ❌ 除外: {url[:50]}... (競合ドメイン: {conflict_label})"
                )
                continue

            is_parent_site = bool(relation["is_parent"])
            if is_parent_site and not is_official_domain:
                item["score"] *= 0.5
                item["is_parent_company"] = True
                logger.debug(
                    f"[{type_label}検索] ⚠️ ペナルティ: {url[:50]}... (親会社サイト, 0.5x)"
                )

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
                    f"[{type_label}検索] ⚠️ ペナルティ: {url[:50]}... (子会社: {sub_name}, 0.3x)"
                )

            if (
                not is_official_domain
                and not is_related_company
                and not _contains_company_name(
                    company_name, title, url, snippet, allow_snippet_match
                )
            ):
                excluded_reasons["企業名不一致"] = (
                    excluded_reasons.get("企業名不一致", 0) + 1
                )
                logger.debug(f"[{type_label}検索] ❌ 除外: {url[:50]}... (企業名不一致)")
                continue

            source_type = normalize_company_result_source_type(
                _get_source_type(url, company_name),
                relation,
            )

            confidence = _score_to_confidence(
                item["score"],
                source_type,
                content_type=content_type,
                company_match=_contains_company_name(
                    company_name, title, url, snippet, allow_snippet_match
                ),
            )

            keep_candidate, exclude_reason = _should_include_corporate_candidate(
                source_type,
                content_type,
                relation,
                url=url,
                title=title,
                snippet=snippet,
            )
            if not keep_candidate:
                excluded_reasons[exclude_reason or "関連会社サイト"] = (
                    excluded_reasons.get(exclude_reason or "関連会社サイト", 0) + 1
                )
                logger.debug(
                    f"[{type_label}検索] ❌ 除外: {url[:50]}... ({exclude_reason or '関連会社サイト'})"
                )
                continue

            source_label = {
                "official": "公式",
                "job_site": "就活サイト",
                "blog": "ブログ",
                "other": "その他",
                "subsidiary": "子会社",
                "parent": "親会社",
            }.get(source_type, source_type)
            logger.debug(
                f"[{type_label}検索] ✅ 採用: {url[:50]}... ({source_label}, {confidence})"
            )

            candidates.append(
                CorporatePageCandidate(
                    url=url,
                    title=title[:100] if title else url[:50],
                    snippet=snippet[:200] if snippet else "",
                    confidence=confidence,
                    source_type=source_type,
                    relation_company_name=(
                        relation_company_name
                        if isinstance(relation_company_name, str)
                        else None
                    ),
                    parent_allowed=bool(relation.get("parent_allowed")),
                )
            )

            if len(candidates) >= max_results:
                break

        logger.debug(f"\n[{type_label}検索] 📊 結果サマリー:")
        logger.debug(f"  └─ 検索結果: {len(scored)}件 → 採用: {len(candidates)}件")
        if any(excluded_reasons.values()):
            excluded_str = ", ".join(
                f"{k}: {v}件" for k, v in excluded_reasons.items() if v > 0
            )
            logger.debug(f"     除外内訳: {excluded_str}")
        logger.debug(f"[{type_label}検索] ==================================================")

    if candidates:
        SOURCE_TYPE_PRIORITY = {
            "official": 0,
            "job_site": 1,
            "parent": 2,
            "subsidiary": 2,
            "other": 3,
            "blog": 4,
        }
        CONFIDENCE_PRIORITY = {"high": 0, "medium": 1, "low": 2}
        candidates.sort(
            key=lambda x: (
                SOURCE_TYPE_PRIORITY.get(x.source_type, 99),
                CONFIDENCE_PRIORITY.get(x.confidence, 99),
            )
        )

    return {"candidates": candidates}
