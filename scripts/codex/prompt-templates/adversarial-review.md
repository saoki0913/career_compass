# Adversarial Design Review

delegate.sh fallback 用テンプレート。codex-plugin-cc の `/codex:adversarial-review` が primary。

## Review Focus

通常の post_review（OWASP, dead code, hotspot）とは異なり、設計判断の妥当性を問う。

### 1. Design Decisions
- Why was this approach chosen over alternatives?
- What were the alternatives considered?
- Is this the simplest solution that meets the requirements?

### 2. Trade-off Analysis
- What is being traded off (performance vs readability, flexibility vs simplicity)?
- Is this the right balance for Career Compass's stage and scale?
- Are there hidden costs that will surface later?

### 3. Assumption Validation
- What assumptions does this code make about the data, environment, or usage patterns?
- Are these assumptions documented or enforced?
- What happens when these assumptions are violated?

### 4. Maintainability
- Will this be easy to modify when requirements change?
- Does it introduce coupling that will resist future changes?
- Is the abstraction level appropriate (not too low, not too high)?

### 5. Business Rule Alignment
- Does this align with Career Compass business rules (CLAUDE.md)?
- Success-only credit consumption?
- JST datetime handling?
- Guest/user dual ownership?
- Deadline approval workflow?

## Output Format

```
## Status
APPROVE / CONCERN / REDESIGN_SUGGESTED

## Summary
1-3 sentence summary of design assessment.

## Design Questions
- question | context | risk_level(low/medium/high)

## Trade-off Analysis
- trade-off | current_balance | recommendation

## Recommendations
- recommendation | priority(low/medium/high) | effort(low/medium/high)
```

## Constraints
- This is advisory, NOT blocking. Findings inform the developer but do not block commit.
- Focus on design depth, not code style or formatting.
- Reference existing patterns in the codebase when suggesting alternatives.
