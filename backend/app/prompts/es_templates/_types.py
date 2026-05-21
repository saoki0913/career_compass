"""Typed contracts for ES template definitions and prompt rendering."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any, Iterable, NotRequired, TypedDict, assert_never


class EvaluationAxis(TypedDict):
    name: str
    pass_condition: str
    rewrite_instruction: str


class RewritePromptPolicy(TypedDict, total=False):
    description: str
    purpose: str
    required_elements: list[str]
    anti_patterns: list[str]
    structure_short: str
    dense_short_answer: bool
    three_sentence_close_on_short_band: bool
    composition_ratio: str
    why_now_hint: str
    playbook: dict[str, str]
    company_usage: str
    fact_priority: str
    extra_fields: list[str]
    rewrite_closing_guidance: str
    negative_reframe_guidance: list[str]
    question_focus_rules: list[dict[str, Any]]


class TemplateValidationPolicy(TypedDict, total=False):
    requires_company_rag: bool
    grounding_level: str
    evaluation_checks: dict[str, Any]
    evaluation_axes: list[EvaluationAxis]


class TemplateRetryPolicy(TypedDict, total=False):
    guidance_by_failure: dict[str, str]


class TemplateDef(TypedDict):
    label: str
    rewrite_policy: RewritePromptPolicy
    validation_policy: TemplateValidationPolicy
    retry_policy: TemplateRetryPolicy
    legacy_notes: NotRequired[str]


class InstructionId(StrEnum):
    OUTPUT_TEXT_ONLY = "output.text_only"
    OUTPUT_JSON_DRAFT = "output.json_draft"
    OUTPUT_SINGLE_PARAGRAPH = "output.single_paragraph"
    STYLE_DA_DEARU = "style.da_dearu"
    ANSWER_DIRECTLY = "task.answer_directly"
    CONCLUSION_FIRST = "task.conclusion_first"
    NO_VERBOSE_OPENING = "task.no_verbose_opening"
    QUALITY_BLUEPRINT = "quality.blueprint"
    FACT_BOUNDARY = "fact.boundary"
    LENGTH_STYLE_COMPACT = "length_style.compact"
    TEMPLATE_SPECIAL_CASES = "template.special_cases"
    USER_FACTS = "context.user_facts"
    COMPANY_CONTEXT = "company.context"
    RETRY_DELTA = "retry.delta"
    REFERENCE_COPY_SAFETY = "reference.copy_safety"
    COMPANY_GROUNDING_POLICY = "company.grounding_policy"
    RAW_BLOCK = "raw.block"


class Priority(StrEnum):
    ABSOLUTE = "absolute"
    CORE = "core"
    TARGET = "target"
    ADVISORY = "advisory"
    RETRY = "retry"


class PromptSection(StrEnum):
    ROLE_TASK = "role_task"
    OUTPUT_CONTRACT = "output_contract"
    ABSOLUTE = "absolute"
    QUALITY = "quality"
    TEMPLATE_SPECIAL_CASES = "template_special_cases"
    FACT_BOUNDARY = "fact_boundary"
    LENGTH_STYLE = "length_style"
    CORE = "core"
    TARGET = "target"
    LENGTH = "length"
    STYLE = "style"
    TEMPLATE = "template"
    COMPANY = "company"
    CONTEXT = "context"
    RETRY = "retry"


class PromptPhase(StrEnum):
    REWRITE = "rewrite"
    FALLBACK = "fallback"
    DRAFT = "draft"


@dataclass(frozen=True, slots=True)
class PromptInstruction:
    id: InstructionId
    priority: Priority
    section: PromptSection
    text: str
    source: str
    render_on_initial: bool = True
    render_on_retry: bool = True
    phase: PromptPhase | None = None
    allow_reinforcement: bool = False


_PRIORITY_RANK = {
    Priority.ABSOLUTE: 0,
    Priority.CORE: 1,
    Priority.TARGET: 2,
    Priority.ADVISORY: 3,
    Priority.RETRY: 4,
}


def priority_rank(priority: Priority) -> int:
    return _PRIORITY_RANK[priority]


def merge_instruction(left: PromptInstruction, right: PromptInstruction) -> PromptInstruction:
    if right.allow_reinforcement:
        merged_text = "\n".join(item for item in [left.text.strip(), right.text.strip()] if item)
        return replace(
            right if priority_rank(right.priority) <= priority_rank(left.priority) else left,
            text=merged_text,
            source=f"{left.source},{right.source}",
        )
    if priority_rank(right.priority) < priority_rank(left.priority):
        return right
    return left


@dataclass(slots=True)
class PromptPlan:
    phase: PromptPhase
    user_prompt: str
    persona: str = "あなたは日本語のES編集者である。"
    instructions: dict[InstructionId, PromptInstruction] = field(default_factory=dict)
    raw_blocks: list[PromptInstruction] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def add(self, instruction: PromptInstruction) -> None:
        text = instruction.text.strip()
        if not text:
            return
        normalized = replace(instruction, text=text)
        if normalized.id == InstructionId.RAW_BLOCK:
            self.raw_blocks.append(normalized)
            return
        existing = self.instructions.get(normalized.id)
        self.instructions[normalized.id] = (
            normalized if existing is None else merge_instruction(existing, normalized)
        )

    def extend(self, instructions: Iterable[PromptInstruction]) -> None:
        for instruction in instructions:
            self.add(instruction)


@dataclass(frozen=True, slots=True)
class RenderedPrompt:
    system_prompt: str
    user_prompt: str


class PromptRenderer:
    section_order: tuple[PromptSection, ...] = (
        PromptSection.ROLE_TASK,
        PromptSection.OUTPUT_CONTRACT,
        PromptSection.ABSOLUTE,
        PromptSection.QUALITY,
        PromptSection.TEMPLATE_SPECIAL_CASES,
        PromptSection.FACT_BOUNDARY,
        PromptSection.LENGTH_STYLE,
        PromptSection.CORE,
        PromptSection.TARGET,
        PromptSection.LENGTH,
        PromptSection.STYLE,
        PromptSection.TEMPLATE,
        PromptSection.COMPANY,
        PromptSection.CONTEXT,
        PromptSection.RETRY,
    )

    def render(self, plan: PromptPlan, *, is_retry: bool = False) -> RenderedPrompt:
        sections: list[str] = [plan.persona.strip()]
        all_instructions = [*plan.instructions.values(), *plan.raw_blocks]
        for section in self.section_order:
            rendered = self._render_section(all_instructions, section, is_retry=is_retry)
            if rendered:
                sections.append(rendered)
        return RenderedPrompt(system_prompt="\n\n".join(sections).strip(), user_prompt=plan.user_prompt)

    def _render_section(
        self,
        instructions: list[PromptInstruction],
        section: PromptSection,
        *,
        is_retry: bool,
    ) -> str:
        section_instructions = [
            instruction
            for instruction in instructions
            if instruction.section == section
            and (instruction.render_on_retry if is_retry else instruction.render_on_initial)
        ]
        if not section_instructions:
            return ""
        body = "\n".join(self._render_instruction(instruction) for instruction in section_instructions)
        if section == PromptSection.QUALITY and body.lstrip().startswith("<quality_blueprint"):
            return body
        tag = self._tag_for_section(section)
        if section in {PromptSection.ROLE_TASK, PromptSection.OUTPUT_CONTRACT}:
            return f"<{tag}>\n{body}\n</{tag}>"
        if section in {PromptSection.ABSOLUTE, PromptSection.CORE, PromptSection.TARGET}:
            return f'<constraints priority="{tag}">\n{body}\n</constraints>'
        return f"<{tag}>\n{body}\n</{tag}>"

    def _render_instruction(self, instruction: PromptInstruction) -> str:
        text = instruction.text.strip()
        if "\n" in text or text.startswith("<") or text.startswith("【") or text.startswith("##"):
            return text
        return f"- {text}"

    def _tag_for_section(self, section: PromptSection) -> str:
        match section:
            case PromptSection.ROLE_TASK:
                return "role_task"
            case PromptSection.OUTPUT_CONTRACT:
                return "output_contract"
            case PromptSection.ABSOLUTE:
                return "absolute"
            case PromptSection.QUALITY:
                return "quality"
            case PromptSection.TEMPLATE_SPECIAL_CASES:
                return "template_special_cases"
            case PromptSection.FACT_BOUNDARY:
                return "fact_boundary"
            case PromptSection.LENGTH_STYLE:
                return "length_style"
            case PromptSection.CORE:
                return "core"
            case PromptSection.TARGET:
                return "target"
            case PromptSection.LENGTH:
                return "length"
            case PromptSection.STYLE:
                return "style"
            case PromptSection.TEMPLATE:
                return "template"
            case PromptSection.COMPANY:
                return "company"
            case PromptSection.CONTEXT:
                return "context"
            case PromptSection.RETRY:
                return "retry"
            case _ as unreachable:
                assert_never(unreachable)


def rewrite_policy(template_def: TemplateDef) -> RewritePromptPolicy:
    return template_def["rewrite_policy"]


def validation_policy(template_def: TemplateDef) -> TemplateValidationPolicy:
    return template_def["validation_policy"]


def retry_policy(template_def: TemplateDef) -> TemplateRetryPolicy:
    return template_def["retry_policy"]
