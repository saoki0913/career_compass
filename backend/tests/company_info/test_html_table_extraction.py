from app.utils.http_fetch import extract_text_from_html


def html_bytes(html: str) -> bytes:
    return html.encode("utf-8")


def test_basic_schedule_table_preserves_column_associations():
    html = html_bytes("""
    <table>
      <tr><th>日程</th><th>内容</th></tr>
      <tr><td>6月15日</td><td>ES締切</td></tr>
    </table>
    """)

    text = extract_text_from_html(html)

    assert "| 日程 | 内容 |" in text
    assert "| 6月15日 | ES締切 |" in text


def test_table_with_nested_links_extracts_cell_text():
    html = html_bytes("""
    <table>
      <tr><td><a href="/entry">エントリー</a></td><td>受付中</td></tr>
    </table>
    """)

    text = extract_text_from_html(html)

    assert "| エントリー | 受付中 |" in text


def test_empty_table_is_removed():
    text = extract_text_from_html(html_bytes("<main>本文<table></table>続き</main>"))

    assert "table" not in text.lower()
    assert "本文" in text
    assert "続き" in text


def test_pipe_characters_in_cells_are_escaped():
    text = extract_text_from_html(html_bytes("<table><tr><td>A|B</td><td>C</td></tr></table>"))

    assert "| A｜B | C |" in text


def test_page_with_no_tables_keeps_existing_text_behavior():
    html = html_bytes("<html><body><h1>採用情報</h1><p>ES締切は6月15日です。</p></body></html>")

    text = extract_text_from_html(html)

    assert text == "採用情報\nES締切は6月15日です。"


def test_mixed_content_keeps_regular_text_and_table_text():
    html = html_bytes("""
    <main>
      <h1>採用情報</h1>
      <table><tr><td>6月15日</td><td>ES締切</td></tr></table>
      <p>詳細はマイページを確認してください。</p>
    </main>
    """)

    text = extract_text_from_html(html)

    assert "採用情報" in text
    assert "| 6月15日 | ES締切 |" in text
    assert "詳細はマイページを確認してください。" in text


def test_layout_table_is_converted_but_remains_identifiable_as_non_schedule():
    html = html_bytes("""
    <table>
      <tr><td>サイトマップ</td><td>お問い合わせ</td><td>プライバシーポリシー</td></tr>
    </table>
    """)

    text = extract_text_from_html(html)

    assert "| サイトマップ | お問い合わせ | プライバシーポリシー |" in text


def test_empty_cells_are_preserved_between_pipes():
    text = extract_text_from_html(
        html_bytes("<table><tr><td>6月15日</td><td></td><td>ES締切</td></tr></table>")
    )

    assert "| 6月15日 |  | ES締切 |" in text


def test_header_row_with_th_is_included():
    text = extract_text_from_html(html_bytes("<table><tr><th>締切</th><th>提出物</th></tr></table>"))

    assert "| 締切 | 提出物 |" in text
