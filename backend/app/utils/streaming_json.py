"""Streaming JSON field extractor for token-level LLM streaming.

Incrementally parses a JSON object stream, detecting when top-level fields
complete and optionally streaming string field contents character-by-character.

Used by call_llm_streaming_fields() to emit field_complete SSE events
as the LLM generates JSON output token-by-token.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from typing import Any


class StreamEventType(Enum):
    """Types of events emitted by StreamingJSONExtractor."""

    CHUNK = "chunk"  # Raw text chunk from LLM
    STRING_CHUNK = "string_chunk"  # Partial string field content
    FIELD_COMPLETE = "field_complete"  # A top-level field finished parsing
    ARRAY_ITEM_COMPLETE = "array_item_complete"  # An array element finished


@dataclass
class StreamEvent:
    """Event emitted by the streaming JSON extractor."""

    type: StreamEventType
    path: str = ""  # e.g., "scores", "top3.0", "rewrites.1"
    text: str = ""  # For CHUNK/STRING_CHUNK events
    value: Any = None  # For FIELD_COMPLETE/ARRAY_ITEM_COMPLETE events


class StreamingJSONExtractor:
    """Incrementally extract completed JSON fields from a streaming response.

    Strategy: Track the full JSON text and use a simple depth-based approach.
    When we detect that a top-level field value has completed (depth returns to 1
    for root object), we extract and parse that field's raw value text.

    For arrays, we also detect when individual elements complete (depth returns
    to the array's level).

    Args:
        schema_hints: Expected top-level fields and types (informational).
        stream_string_fields: Field names whose string content should be
            streamed character-by-character (emits STRING_CHUNK events).
    """

    def __init__(
        self,
        schema_hints: dict[str, str] | None = None,
        stream_string_fields: list[str] | None = None,
    ):
        self._schema_hints = schema_hints or {}
        self._stream_string_fields = set(stream_string_fields or [])
        self._buffer = ""
        self._completed_fields: dict[str, Any] = {}

        # Character-level state
        self._in_string = False
        self._escape_next = False
        self._depth = 0  # 0=outside root, 1=inside root object
        self._stack: list[str] = []  # Stack of container types: '{' or '['

        # Field state (tracks the current top-level field)
        self._current_key: str | None = None
        self._key_buffer = ""
        self._reading_key = False
        self._awaiting_colon = False
        self._awaiting_value = False  # After colon, before value starts
        self._value_start_idx: int | None = None
        self._value_started = False

        # Array element tracking
        self._in_top_array = False  # depth==2 and parent is array
        self._array_elem_start_idx: int | None = None
        self._array_elem_index = 0

        # Streaming string tracking
        self._streaming_string_active = False
        self._string_stream_depth = 0  # depth at which the string lives

    def feed(self, chunk: str) -> list[StreamEvent]:
        """Feed a text chunk and return events for completed fields."""
        events: list[StreamEvent] = []

        for ch in chunk:
            pos = len(self._buffer)
            self._buffer += ch
            ch_events = self._process(ch, pos)
            if ch_events:
                events.extend(ch_events)

        return events

    def get_accumulated(self) -> str:
        """Return all accumulated text for final JSON parse fallback."""
        return self._buffer

    def get_completed_fields(self) -> dict[str, Any]:
        """Return fields completed so far (for error recovery)."""
        return dict(self._completed_fields)

    def _process(self, ch: str, pos: int) -> list[StreamEvent] | None:
        """Process a single character at the given position."""
        events: list[StreamEvent] = []

        # Handle escape
        if self._escape_next:
            self._escape_next = False
            if self._streaming_string_active and self._in_string:
                events.append(StreamEvent(
                    type=StreamEventType.STRING_CHUNK,
                    path=self._current_key or "",
                    text=_decode_escape(ch),
                ))
            return events or None

        if ch == "\\" and self._in_string:
            self._escape_next = True
            return None

        # Handle string toggle
        if ch == '"':
            if self._in_string:
                self._in_string = False
                if self._streaming_string_active:
                    self._streaming_string_active = False

                # Check if reading a key at depth 1
                if self._reading_key and self._depth == 1:
                    self._reading_key = False
                    self._current_key = self._key_buffer
                    self._awaiting_colon = True
                    return None

                # Check if a top-level string value just closed (depth==1, value started)
                if self._depth == 1 and self._value_started and not self._in_top_array:
                    return self._complete_field(pos)

                # Check if an array element string just closed (depth==2 in top array)
                if self._in_top_array and self._depth == 2:
                    return self._complete_array_item(pos)

                return None
            else:
                self._in_string = True
                # Are we starting a key at depth 1? (Not awaiting value)
                if self._depth == 1 and not self._awaiting_value and not self._value_started:
                    self._reading_key = True
                    self._key_buffer = ""
                    return None

                # Starting a string value at depth 1
                if self._depth == 1 and self._awaiting_value:
                    self._awaiting_value = False
                    self._value_started = True
                    self._value_start_idx = pos
                    if self._current_key in self._stream_string_fields:
                        self._streaming_string_active = True
                    return None

                return None

        # Inside string — just stream content
        if self._in_string:
            if self._reading_key:
                self._key_buffer += ch
            elif self._streaming_string_active:
                events.append(StreamEvent(
                    type=StreamEventType.STRING_CHUNK,
                    path=self._current_key or "",
                    text=ch,
                ))
            return events or None

        # Outside strings — structural characters
        if ch == ":":
            if self._awaiting_colon and self._depth == 1:
                self._awaiting_colon = False
                self._awaiting_value = True
                self._value_started = False
                self._value_start_idx = None
                return None

        if ch in " \t\n\r":
            return None

        if ch in "{[":
            self._depth += 1
            self._stack.append(ch)

            # If depth goes to 1, this is the root object open
            if self._depth == 1 and ch == "{":
                return None

            # Mark value start if at depth 2 and we're expecting a field value
            if self._depth == 2 and self._current_key is not None and self._awaiting_value:
                self._awaiting_value = False
                self._value_started = True
                self._value_start_idx = pos
                if ch == "[":
                    self._in_top_array = True
                    self._array_elem_index = 0
                    self._array_elem_start_idx = pos + 1  # After the [

            # If we entered depth 3 inside a top array, start tracking elem
            if self._in_top_array and self._depth == 3 and self._array_elem_start_idx is None:
                self._array_elem_start_idx = pos

            return None

        if ch in "}]":
            prev_depth = self._depth
            self._depth -= 1
            if self._stack:
                self._stack.pop()

            # Top-level field value closed (depth went from 2 to 1)
            if prev_depth == 2 and self._depth == 1 and self._value_started:
                if self._in_top_array and ch == "]":
                    # Array closed — flush last item, then complete field
                    item_events = self._complete_array_item(pos - 1)
                    if item_events:
                        events.extend(item_events)
                    self._in_top_array = False
                complete_events = self._complete_field(pos)
                if complete_events:
                    events.extend(complete_events)
                return events or None

            # Array element closed (depth went from 3 to 2 inside top array)
            if self._in_top_array and prev_depth == 3 and self._depth == 2:
                item_events = self._complete_array_item(pos)
                if item_events:
                    events.extend(item_events)
                return events or None

            # Root object closed
            if self._depth == 0:
                # Flush pending primitive if any
                if self._value_started and self._value_start_idx is not None:
                    primitive_raw = self._buffer[self._value_start_idx:pos].strip()
                    if primitive_raw:
                        return self._complete_field_from_raw(primitive_raw)
                return None

            return None

        if ch == ",":
            # Comma at depth 1 — field separator (primitive value ended)
            if self._depth == 1 and self._value_started and not self._in_top_array:
                # Primitive value (number, boolean, null) ended
                if self._value_start_idx is not None:
                    raw = self._buffer[self._value_start_idx:pos].strip()
                    return self._complete_field_from_raw(raw)

            # Comma at depth 2 inside top array — array element separator
            if self._in_top_array and self._depth == 2:
                item_events = self._complete_array_item(pos - 1)
                if item_events:
                    events.extend(item_events)
                self._array_elem_start_idx = pos + 1
                return events or None

            return None

        # Any other character — mark value start if needed (primitive: number/bool/null)
        if self._depth == 1 and self._current_key is not None and self._awaiting_value:
            self._awaiting_value = False
            self._value_started = True
            self._value_start_idx = pos

        # If in top array at depth 2 and no elem start yet
        if self._in_top_array and self._depth == 2 and self._array_elem_start_idx is None:
            self._array_elem_start_idx = pos

        return None

    def _complete_field(self, end_pos: int) -> list[StreamEvent] | None:
        """Complete a field by extracting from value_start_idx to end_pos (inclusive)."""
        if self._value_start_idx is None or self._current_key is None:
            self._value_started = False
            return None

        raw = self._buffer[self._value_start_idx:end_pos + 1].strip()
        return self._complete_field_from_raw(raw)

    def _complete_field_from_raw(self, raw: str) -> list[StreamEvent] | None:
        """Parse raw value string and emit field_complete event."""
        key = self._current_key
        self._value_started = False
        self._value_start_idx = None
        self._current_key = None
        self._in_top_array = False
        self._awaiting_value = False

        if not raw or key is None:
            return None

        value = _safe_json_parse(raw)
        if value is _PARSE_FAILED:
            return None

        self._completed_fields[key] = value
        return [StreamEvent(
            type=StreamEventType.FIELD_COMPLETE,
            path=key,
            value=value,
        )]

    def _complete_array_item(self, end_pos: int) -> list[StreamEvent] | None:
        """Complete an array element by extracting from array_elem_start_idx."""
        if self._array_elem_start_idx is None or self._current_key is None:
            return None

        raw = self._buffer[self._array_elem_start_idx:end_pos + 1].strip()
        self._array_elem_start_idx = end_pos + 2  # After comma/space

        if not raw:
            return None

        value = _safe_json_parse(raw)
        if value is _PARSE_FAILED:
            self._array_elem_index += 1
            return None

        path = f"{self._current_key}.{self._array_elem_index}"
        self._array_elem_index += 1
        return [StreamEvent(
            type=StreamEventType.ARRAY_ITEM_COMPLETE,
            path=path,
            value=value,
        )]


# Sentinel for parse failure (distinct from None which is a valid JSON value)
_PARSE_FAILED = object()


def _safe_json_parse(raw: str) -> Any:
    """Try to parse a JSON value, returning _PARSE_FAILED on failure."""
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        pass
    try:
        return json.loads(_sanitize_json_string(raw))
    except (json.JSONDecodeError, ValueError):
        return _PARSE_FAILED


def _decode_escape(ch: str) -> str:
    """Decode a JSON escape character for display."""
    escape_map = {"n": "\n", "r": "\r", "t": "\t", '"': '"', "\\": "\\", "/": "/"}
    return escape_map.get(ch, ch)


def _sanitize_json_string(raw: str) -> str:
    """Sanitize unescaped newlines/tabs inside JSON strings."""
    result = []
    in_string = False
    escape_next = False
    for ch in raw:
        if escape_next:
            result.append(ch)
            escape_next = False
            continue
        if ch == "\\":
            result.append(ch)
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            result.append(ch)
            continue
        if in_string:
            if ch == "\n":
                result.append("\\n")
                continue
            if ch == "\r":
                result.append("\\r")
                continue
            if ch == "\t":
                result.append("\\t")
                continue
        result.append(ch)
    return "".join(result)
