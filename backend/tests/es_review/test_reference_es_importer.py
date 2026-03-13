from app.prompts.reference_es_importer import (
    build_reference_import_report,
    normalize_notion_reference_payload,
)


def test_normalize_notion_reference_payload_from_database_results() -> None:
    payload = {
        "results": [
            {
                "id": "page-1",
                "created_time": "2026-03-01T00:00:00.000Z",
                "last_edited_time": "2026-03-02T00:00:00.000Z",
                "properties": {
                    "Title": {
                        "type": "title",
                        "title": [{"plain_text": "志望理由 400字"}],
                    },
                    "Question Type": {
                        "type": "select",
                        "select": {"name": "company_motivation"},
                    },
                    "Char Max": {"type": "number", "number": 400},
                    "Company Name": {
                        "type": "rich_text",
                        "rich_text": [{"plain_text": "三井住友銀行"}],
                    },
                    "Text": {
                        "type": "rich_text",
                        "rich_text": [
                            {
                                "plain_text": "顧客に寄り添いながら挑戦を後押しできる環境に魅力を感じ、貴行を志望する。"
                                "長期インターンでは利用者の声を基に改善を重ね、継続率を向上させた。"
                            }
                        ],
                    },
                    "Status": {"type": "status", "status": {"name": "active"}},
                },
            },
            {
                "id": "page-2",
                "properties": {
                    "Title": {"type": "title", "title": [{"plain_text": "下書き"}]},
                    "Question Type": {"type": "select", "select": {"name": "company_motivation"}},
                    "Text": {"type": "rich_text", "rich_text": [{"plain_text": "短い"}]},
                    "Status": {"type": "status", "status": {"name": "draft"}},
                },
            },
        ]
    }

    normalized = normalize_notion_reference_payload(payload)

    assert normalized["version"] == 1
    assert len(normalized["references"]) == 1
    ref = normalized["references"][0]
    assert ref["question_type"] == "company_motivation"
    assert ref["char_max"] == 400
    assert ref["company_name"] == "三井住友銀行"
    assert "継続率を向上させた" in ref["text"]
    assert ref["id"].startswith("company_motivation_")
    assert set(ref.keys()) == {"id", "question_type", "company_name", "char_max", "title", "text"}


def test_normalize_notion_reference_payload_accepts_japanese_property_names() -> None:
    payload = {
        "results": [
            {
                "id": "page-ja",
                "properties": {
                    "タイトル": {
                        "type": "title",
                        "title": [{"plain_text": "研究概要 300字"}],
                    },
                    "設問タイプ": {
                        "type": "rich_text",
                        "rich_text": [{"plain_text": "role_course_reason"}],
                    },
                    "文字数上限": {
                        "type": "rich_text",
                        "rich_text": [{"plain_text": "300字"}],
                    },
                    "本文": {
                        "type": "rich_text",
                        "rich_text": [
                            {
                                "plain_text": "研究で培った仮説検証力を生かし、事業と技術をつなぐ役割を担いたい。"
                                "実験条件の設計と検証を粘り強く繰り返し、成果の再現性を高めた経験がある。"
                            }
                        ],
                    },
                },
            }
        ]
    }

    normalized = normalize_notion_reference_payload(payload)

    assert len(normalized["references"]) == 1
    ref = normalized["references"][0]
    assert ref["question_type"] == "role_course_reason"
    assert ref["char_max"] == 300
    assert ref["text"].startswith("研究で培った仮説検証力を生かし")


def test_normalize_notion_reference_payload_extracts_multiple_sections_from_page_body() -> None:
    payload = {
        "results": [
            {
                "id": "nri-page",
                "title": "NRI ES",
                "properties": {
                    "タイトル": {"type": "title", "title": [{"plain_text": "NRI ES"}]},
                    "タイプ": {"type": "select", "select": {"name": "ES"}},
                },
                "content": """
### 質問: 大学入学以降の経験について、「挑戦し成し遂げたこと」または「乗り越えた困難」のいずれかをテーマに選び、具体的に教えてください。(500）
挑戦し成し遂げたことは、ベンチャー企業の長期インターンでリーダーを務め、AIチャットアプリ開発したことだ。チーム4人全員がWeb開発未経験であり、2ヶ月という短期間での完遂は大きな挑戦であった。当初はエラーが頻発し、全体の約3割の時間をエラー対応に費やした。そこで私は、エラーの再発防止と解決時間短縮には、(1)エラー対応手順の標準化(2)チーム全体の基礎技術力向上が必要と考え、二つの施策を立案しチームに提案した。

### 質問：あなたが本インターンシップで「特にやってみたい仕事・業務領域」と「経験したいこと」を教えてください。また、「身につけたいこと」を具体的に教えてください。加えて、そう考えた理由についても併せて教えてください。（300字以内で記入してください。）
貴社のITソリューション業務を通して、顧客の課題発見から解決までの一連のプロセスを経験し、顧客のニーズに合わせた課題解決を行うためのスキルや論理的思考力を身につけたい。私は長期インターンで社内向けAIチャットアプリを開発した際、業務フローが改善され、現場の生産性と社員の満足度が向上する瞬間に立ち会った。この経験から、IT技術によって課題に直接インパクトを与える仕事に強いやりがいを感じた。

### 質問: 希望コースを選択してください（１～３）
B12.クラウドサービスエンジニア
""",
            }
        ]
    }

    normalized = normalize_notion_reference_payload(payload)

    assert len(normalized["references"]) == 2
    assert [ref["question_type"] for ref in normalized["references"]] == ["gakuchika", "intern_goals"]
    assert normalized["references"][0]["company_name"] == "NRI"
    assert normalized["references"][0]["char_max"] == 500
    assert normalized["references"][1]["char_max"] == 300


def test_normalize_notion_reference_payload_extracts_post_join_goals_from_bold_question() -> None:
    payload = {
        "results": [
            {
                "id": "mec-page",
                "title": "三菱地所ES",
                "properties": {
                    "タイトル": {"type": "title", "title": [{"plain_text": "三菱地所ES"}]},
                    "タイプ": {"type": "select", "select": {"name": "ES"}},
                },
                "content": """
**あなたは三菱地所でどのような仕事をし、何を成し遂げたいですか。そのように考える理由も併せて教えてください。**
**◆成し遂げたいこと（500文字以内）**
「リアルとデジタルが融合し、人と人が温かくつながる街づくり」を実現したい。サークル代表として100人規模の組織を率いる中で、全員が楽しめる場をつくることに注力した。長期インターンでも同様の気づきがあり、AIチャットアプリの開発でユーザーが求める情報に素早くアクセスできる仕組みを整えた結果、利便性が向上し満足度が高まった。貴社のDX推進やエリアマネジメントに携わりたい。
""",
            }
        ]
    }

    normalized = normalize_notion_reference_payload(payload)

    assert len(normalized["references"]) == 1
    ref = normalized["references"][0]
    assert ref["question_type"] == "post_join_goals"
    assert ref["company_name"] == "三菱地所"
    assert ref["char_max"] == 500


def test_build_reference_import_report_tracks_excluded_sections() -> None:
    payload = {
        "results": [
            {
                "id": "report-page",
                "title": "SONY ES",
                "properties": {
                    "タイトル": {"type": "title", "title": [{"plain_text": "SONY ES"}]},
                    "タイプ": {"type": "select", "select": {"name": "ES"}},
                },
                "content": """
### 質問: 志望動機をご記入ください。（500文字以内）
ハードウェアと連携した大規模商用クラウドサービスの設計開発に挑戦し、テクノロジーで人々の感動体験を支えたいと考え、貴社のインターンを志望する。大学では深層学習による双腕ロボットの協調動作生成に取り組み、クラウド技術の拡張性と可用性の高さを体感した。

### 質問: 希望コースを選択してください（１～３）
B12.クラウドサービスエンジニア
""",
            }
        ]
    }

    report = build_reference_import_report(payload)

    assert report["page_count"] == 1
    assert report["reference_count"] == 1
    items = report["pages"][0]["items"]
    assert items[0]["included"] is True
    assert items[0]["question_type"] == "intern_reason"
    assert items[1]["included"] is False
    assert items[1]["exclusion_reason"] == "text_too_short"
