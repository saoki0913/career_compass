"""Unit tests for StreamingJSONExtractor."""

import pytest
from app.utils.streaming_json import (
    StreamingJSONExtractor,
    StreamEventType,
)


class TestBasicFieldExtraction:
    """Test basic JSON field completion detection."""

    def test_simple_object_fields(self):
        """Detects completion of simple object and string fields."""
        extractor = StreamingJSONExtractor()
        json_str = '{"name": "test", "scores": {"a": 1, "b": 2}}'

        events = []
        # Simulate streaming character by character
        for ch in json_str:
            events.extend(extractor.feed(ch))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 2

        assert field_events[0].path == "name"
        assert field_events[0].value == "test"

        assert field_events[1].path == "scores"
        assert field_events[1].value == {"a": 1, "b": 2}

    def test_number_and_boolean_fields(self):
        """Detects completion of number and boolean fields."""
        extractor = StreamingJSONExtractor()
        json_str = '{"count": 42, "active": true, "rate": 3.14}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 3

        assert field_events[0].path == "count"
        assert field_events[0].value == 42

        assert field_events[1].path == "active"
        assert field_events[1].value is True

        assert field_events[2].path == "rate"
        assert field_events[2].value == 3.14

    def test_null_field(self):
        """Detects completion of null fields."""
        extractor = StreamingJSONExtractor()
        json_str = '{"data": null, "name": "x"}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 2
        assert field_events[0].path == "data"
        assert field_events[0].value is None

    def test_chunked_delivery(self):
        """Works with multi-character chunks (realistic streaming)."""
        extractor = StreamingJSONExtractor()
        chunks = [
            '{"score',
            's": {"lo',
            'gic": 4, "sp',
            'ecificity": 3},',
            ' "question": "テスト質問です"}',
        ]

        events = []
        for chunk in chunks:
            events.extend(extractor.feed(chunk))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 2
        assert field_events[0].path == "scores"
        assert field_events[0].value == {"logic": 4, "specificity": 3}
        assert field_events[1].path == "question"
        assert field_events[1].value == "テスト質問です"


class TestArrayFieldExtraction:
    """Test array field and element-level detection."""

    def test_array_items(self):
        """Detects individual array element completion."""
        extractor = StreamingJSONExtractor()
        json_str = '{"items": [{"a": 1}, {"a": 2}, {"a": 3}]}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        item_events = [e for e in events if e.type == StreamEventType.ARRAY_ITEM_COMPLETE]
        assert len(item_events) == 3
        assert item_events[0].path == "items.0"
        assert item_events[0].value == {"a": 1}
        assert item_events[1].path == "items.1"
        assert item_events[1].value == {"a": 2}
        assert item_events[2].path == "items.2"
        assert item_events[2].value == {"a": 3}

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 1
        assert field_events[0].path == "items"
        assert field_events[0].value == [{"a": 1}, {"a": 2}, {"a": 3}]

    def test_string_array(self):
        """Handles arrays of strings."""
        extractor = StreamingJSONExtractor()
        json_str = '{"tags": ["alpha", "beta", "gamma"]}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        item_events = [e for e in events if e.type == StreamEventType.ARRAY_ITEM_COMPLETE]
        assert len(item_events) == 3
        assert item_events[0].value == "alpha"
        assert item_events[1].value == "beta"
        assert item_events[2].value == "gamma"

    def test_empty_array(self):
        """Handles empty arrays."""
        extractor = StreamingJSONExtractor()
        json_str = '{"items": [], "name": "test"}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 2
        assert field_events[0].path == "items"
        assert field_events[0].value == []

    def test_nested_arrays(self):
        """Handles nested arrays in objects."""
        extractor = StreamingJSONExtractor()
        json_str = '{"data": [{"tags": ["a", "b"]}, {"tags": ["c"]}]}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        item_events = [e for e in events if e.type == StreamEventType.ARRAY_ITEM_COMPLETE]
        assert len(item_events) == 2
        assert item_events[0].value == {"tags": ["a", "b"]}
        assert item_events[1].value == {"tags": ["c"]}


class TestStreamStringFields:
    """Test character-by-character streaming of string fields."""

    def test_string_field_streaming(self):
        """Emits STRING_CHUNK events for designated fields."""
        extractor = StreamingJSONExtractor(
            stream_string_fields=["question"]
        )
        json_str = '{"question": "こんにちは", "score": 5}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        string_chunks = [e for e in events if e.type == StreamEventType.STRING_CHUNK]
        assert len(string_chunks) == 5  # こ, ん, に, ち, は
        assert "".join(e.text for e in string_chunks) == "こんにちは"
        assert all(e.path == "question" for e in string_chunks)

        # Field should also complete
        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert any(e.path == "question" and e.value == "こんにちは" for e in field_events)

    def test_non_designated_field_not_streamed(self):
        """Non-designated string fields don't emit STRING_CHUNK."""
        extractor = StreamingJSONExtractor(
            stream_string_fields=["question"]
        )
        json_str = '{"name": "test", "question": "Q?"}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        string_chunks = [e for e in events if e.type == StreamEventType.STRING_CHUNK]
        # Only "Q?" should be streamed, not "test"
        assert "".join(e.text for e in string_chunks) == "Q?"

    def test_escaped_characters_in_streamed_field(self):
        """Escape sequences are decoded in STRING_CHUNK events."""
        extractor = StreamingJSONExtractor(
            stream_string_fields=["question"]
        )
        json_str = '{"question": "line1\\nline2"}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        string_chunks = [e for e in events if e.type == StreamEventType.STRING_CHUNK]
        full_text = "".join(e.text for e in string_chunks)
        assert full_text == "line1\nline2"


class TestEdgeCases:
    """Test edge cases and error resilience."""

    def test_braces_in_strings(self):
        """Handles brace characters inside string values."""
        extractor = StreamingJSONExtractor()
        json_str = '{"text": "value with { and } inside", "num": 1}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 2
        assert field_events[0].path == "text"
        assert field_events[0].value == "value with { and } inside"

    def test_escaped_quotes_in_strings(self):
        """Handles escaped quotes inside string values."""
        extractor = StreamingJSONExtractor()
        json_str = '{"text": "he said \\"hello\\"", "num": 1}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 2
        assert field_events[0].value == 'he said "hello"'

    def test_unicode_content(self):
        """Handles Japanese and multi-byte characters."""
        extractor = StreamingJSONExtractor()
        json_str = '{"質問": "就職活動について教えてください。", "スコア": 85}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 2
        assert field_events[0].value == "就職活動について教えてください。"
        assert field_events[1].value == 85

    def test_get_accumulated(self):
        """get_accumulated returns all fed text."""
        extractor = StreamingJSONExtractor()
        chunks = ['{"a":', ' 1, ', '"b": 2}']
        for c in chunks:
            extractor.feed(c)

        assert extractor.get_accumulated() == '{"a": 1, "b": 2}'

    def test_get_completed_fields(self):
        """get_completed_fields returns parsed fields so far."""
        extractor = StreamingJSONExtractor()
        # Feed partial JSON (only first field completes)
        json_partial = '{"scores": {"a": 1}, "question": "半分'
        for ch in json_partial:
            extractor.feed(ch)

        completed = extractor.get_completed_fields()
        assert "scores" in completed
        assert completed["scores"] == {"a": 1}
        assert "question" not in completed  # Not yet complete

    def test_whitespace_handling(self):
        """Handles various whitespace in JSON."""
        extractor = StreamingJSONExtractor()
        json_str = '{\n  "name" :  "test" ,\n  "value" : 42\n}'

        events = []
        for ch in json_str:
            events.extend(extractor.feed(ch))

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        assert len(field_events) == 2
        assert field_events[0].value == "test"
        assert field_events[1].value == 42


class TestRealisticScenarios:
    """Test with realistic LLM response structures."""

    def test_gakuchika_response(self):
        """Handles a typical gakuchika next-question response."""
        extractor = StreamingJSONExtractor(
            stream_string_fields=["question"],
            schema_hints={"question": "string", "star_scores": "object"},
        )
        json_str = (
            '{"question": "具体的にどんな困難に直面しましたか？", '
            '"reasoning": "行動面を深掘りするため", '
            '"should_continue": true, '
            '"star_scores": {"situation": 60, "task": 45, "action": 20, "result": 10}, '
            '"target_element": "action", '
            '"question_type": "difficulty", '
            '"suggestions": ["チームの課題", "個人の挑戦", "予想外の事態"], '
            '"quality_rationale": ["行動面のスコアが低い"]}'
        )

        events = []
        # Simulate realistic chunk sizes
        i = 0
        while i < len(json_str):
            chunk_size = min(15, len(json_str) - i)
            chunk = json_str[i : i + chunk_size]
            events.extend(extractor.feed(chunk))
            i += chunk_size

        # Should get string chunks for question
        string_chunks = [e for e in events if e.type == StreamEventType.STRING_CHUNK]
        assert "".join(e.text for e in string_chunks) == "具体的にどんな困難に直面しましたか？"

        # Should get field completions
        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        field_paths = [e.path for e in field_events]
        assert "question" in field_paths
        assert "star_scores" in field_paths
        assert "suggestions" in field_paths

        # Array items from suggestions
        suggestion_items = [
            e for e in events
            if e.type == StreamEventType.ARRAY_ITEM_COMPLETE and e.path.startswith("suggestions.")
        ]
        assert len(suggestion_items) == 3
        assert suggestion_items[0].value == "チームの課題"

        # quality_rationale array items
        rationale_items = [
            e for e in events
            if e.type == StreamEventType.ARRAY_ITEM_COMPLETE and e.path.startswith("quality_rationale.")
        ]
        assert len(rationale_items) == 1
        assert rationale_items[0].value == "行動面のスコアが低い"

    def test_es_review_response(self):
        """Handles a typical ES review response."""
        extractor = StreamingJSONExtractor(
            schema_hints={
                "scores": "object",
                "top3": "array",
                "rewrites": "array",
            },
        )
        json_str = (
            '{"scores": {"logic": 4, "specificity": 3, "passion": 4, "readability": 3}, '
            '"top3": ['
            '{"category": "具体性", "issue": "数字が不足", "suggestion": "数値を追加"}, '
            '{"category": "論理性", "issue": "因果関係が弱い", "suggestion": "理由を補強"}, '
            '{"category": "熱意", "issue": "動機が不明確", "suggestion": "原体験を記述"}'
            '], '
            '"rewrites": ["リライト文1です。", "リライト文2です。"]}'
        )

        events = []
        i = 0
        while i < len(json_str):
            chunk_size = min(20, len(json_str) - i)
            events.extend(extractor.feed(json_str[i : i + chunk_size]))
            i += chunk_size

        field_events = [e for e in events if e.type == StreamEventType.FIELD_COMPLETE]
        paths = {e.path for e in field_events}
        assert "scores" in paths
        assert "top3" in paths
        assert "rewrites" in paths

        # Verify scores
        scores_event = next(e for e in field_events if e.path == "scores")
        assert scores_event.value == {
            "logic": 4,
            "specificity": 3,
            "passion": 4,
            "readability": 3,
        }

        # Verify top3 array items
        top3_items = [
            e for e in events if e.type == StreamEventType.ARRAY_ITEM_COMPLETE and e.path.startswith("top3.")
        ]
        assert len(top3_items) == 3
        assert top3_items[0].value["category"] == "具体性"

        # Verify rewrites array items
        rewrite_items = [
            e
            for e in events
            if e.type == StreamEventType.ARRAY_ITEM_COMPLETE
            and e.path.startswith("rewrites.")
        ]
        assert len(rewrite_items) == 2
        assert rewrite_items[0].value == "リライト文1です。"
