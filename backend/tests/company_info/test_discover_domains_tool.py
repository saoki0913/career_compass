from evals.company_info_search.cli.discover_domains import _get_company_patterns


def test_get_company_patterns_reads_object_format_domains():
    mappings = {
        "mappings": {
            "三菱商事": {
                "domains": ["career-mc", "mitsubishicorp"],
                "logo_domains": ["mitsubishicorp.com"],
            }
        }
    }

    assert _get_company_patterns(mappings, "三菱商事") == ["career-mc", "mitsubishicorp"]


def test_get_company_patterns_keeps_legacy_list_format():
    mappings = {"mappings": {"佐川急便": ["sagawa-exp.co.jp", "sagawa-exp"]}}

    assert _get_company_patterns(mappings, "佐川急便") == ["sagawa-exp.co.jp", "sagawa-exp"]
