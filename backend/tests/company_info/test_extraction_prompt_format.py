import re

from app.prompts.company_info_prompts import EXTRACTION_SYSTEM_PROMPT


def test_extraction_system_prompt_formats_with_current_and_next_year():
    output = EXTRACTION_SYSTEM_PROMPT.format(
        current_year=2026,
        next_year=2027,
        url="https://example.com",
    )

    assert "2026" in output
    assert "2027" in output


def test_extraction_system_prompt_has_no_unresolved_named_placeholders():
    output = EXTRACTION_SYSTEM_PROMPT.format(
        current_year=2026,
        next_year=2027,
        url="https://example.com",
    )

    assert not re.search(r"\{(?:current_year|next_year|url)[^}]*\}", output)
