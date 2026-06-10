---
name: llm-council
description: Use when the user wants several models to independently answer a question and then cross-review each other before a final synthesized answer — an "LLM council", model panel, ensemble, jury, "ask multiple models and combine", or "/llm-council". Also when a high-stakes, ambiguous, or contested answer should be vetted by more than one model. Subscription-only; no API keys.
metadata:
  tags: orchestration multi-model ensemble panel council
  credit: port of Andrej Karpathy's llm-council (https://github.com/karpathy/llm-council)
---

# LLM Council

## Overview

A port of Andrej Karpathy's [`llm-council`](https://github.com/karpathy/llm-council) that runs inside Claude Code on the **subscription** — no OpenRouter / API keys. A question is answered independently by several models, the answers are anonymized and peer-reviewed by those same models, then a **Chairman** model synthesizes one final answer. Members are different Claude model tiers, spawned with a `model` override.

## When to Use

- "Ask the council", "/llm-council", "panel of models", "ensemble answer", "have several models review each other".
- High-stakes, ambiguous, or contested questions where one model's answer isn't enough.
- **NOT** for routine/cheap questions — this spawns `2N+1` agents and burns tokens. One model is plenty for normal work.

## Council members (default)

| Member | `model` |
|--------|---------|
| opus    | `opus`   |
| sonnet  | `sonnet` |
| fable   | `fable`  |

Chairman default: `opus`. User can shrink/rename the roster (minimum 2 members). `haiku` is excluded — too weak as an autonomous member.

**Execution engine — use the `Workflow` tool, not raw parallel `Agent` calls.** In heavily-loaded setups (many SessionStart hooks injecting context into subagents), a raw `Agent` dispatch with a non-`opus` `model` can drift into chat mode and *idle* — replying "ready, what would you like?" instead of answering. Workflow subagents are told "your final text IS the return value", so they answer reliably. Orchestrate the 3 stages below as a `Workflow` script with `agent(prompt, {model})` per member.

## Workflow — 3 stages

Question `Q` = the user's request, or the text after `/llm-council`. **Interpolate `Q` directly into each agent's prompt string** — don't rely solely on the Workflow `args` object (it can arrive `undefined`/stringified). Members should answer in the same language as the question.

**Stage 1 — Independent answers (parallel).**
Spawn one `agent` per member with its `model`. Identical prompt:
> Answer the question below thoroughly and independently, in its language. Don't greet, don't ask for clarification, don't use tools — just write the answer. QUESTION: `Q`

Collect the N answers. **Discard any member whose output is a non-answer** (a greeting / "what would you like help with?" / clarification request) and proceed with the rest — keep at least 2.

**Stage 2 — Anonymous peer review (parallel).**
Relabel answers `Response A, B, C` in order — **never reveal which model wrote which**. Spawn one `agent` per live member:
> QUESTION: `Q`. Below are anonymous responses. Rank them best→worst with one line of justification each, and flag any factual errors. Responses: `<A..C>`

Collect the rankings.

**Stage 3 — Chairman synthesis.**
Spawn one `agent` with `model` = chairman, passing Q + all responses + all reviews:
> You are the Chairman. Using the responses and peer reviews below, write the single best final answer. Resolve disagreements; drop claims flagged as wrong. Return the final answer only.

## Output to user

1. **Final answer** — the Chairman's output (the headline).
2. **Council summary** — aggregate ranking + any notable disagreement. Keep it tight.

## Reference script

A ready-to-run Workflow script ships next to this file: `run.js`. Copy it, set `args.question`, and run via the `Workflow` tool.

## Options

- Fewer members or a different chairman: honor the user's request.
- External models (GPT/Gemini) as extra members: only if the user has them wired (separate auth, not the subscription).
- Many rounds / loop-until-consensus: extend the Workflow script (judge-panel / loop-until-dry pattern).

## Common mistakes

- Revealing model identities to reviewers → biased ranking. Keep Stage 2 anonymous.
- Running a stage's members sequentially → slow. Dispatch each stage's members in parallel.
- Letting Stage-1 agents see each other → answers no longer independent.
- Convening the council for trivial questions → wasted tokens. Gate on stakes.
