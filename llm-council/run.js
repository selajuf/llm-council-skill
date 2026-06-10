// LLM Council — 3-stage council via the Claude Code Workflow tool.
// Port of Andrej Karpathy's llm-council (https://github.com/karpathy/llm-council).
//
// Run with:
//   Workflow({ scriptPath: "~/.claude/skills/llm-council/run.js", args: { question: "..." } })
//
// Members run as Workflow subagents with a `model` override — this is what makes
// non-opus models actually answer instead of idling like they can under a raw Agent dispatch.

export const meta = {
  name: 'llm-council-run',
  description: 'Run a 3-stage LLM council (independent answers, anonymous peer review, chairman synthesis) on a question',
  phases: [
    { title: 'Answers' },
    { title: 'Review' },
    { title: 'Synthesis' },
  ],
}

const Q = (args && args.question) || ''
if (!Q) log('WARNING: args.question is empty — set args.question to the user question.')

const MEMBERS = ['opus', 'sonnet', 'fable'] // no haiku; chairman = opus

// Detect a subagent that drifted into chat mode instead of answering.
function isNonAnswer(t) {
  if (!t) return true
  const s = String(t).trim().toLowerCase()
  if (s.length < 60) return true
  return /(what would you like|i'm here|how can i help|^ready\b|^here\b|напишите задачу|чем (могу )?помочь|ответ дан ранее|завершено|новых задач нет|^готов|^здесь)/.test(s)
}

// Stage 1 — independent answers
phase('Answers')
const answers = await parallel(MEMBERS.map(m => () =>
  agent(
    `Answer the question below thoroughly and independently, in the same language as the question. Don't greet, don't ask for clarification, don't use tools — just write the answer.\n\nQUESTION: ${Q}`,
    { label: `answer:${m}`, phase: 'Answers', model: m }
  ).then(text => ({ m, text }))
))

const live = answers.filter(Boolean).filter(a => !isNonAnswer(a.text))
const idled = MEMBERS.filter(m => !live.find(a => a.m === m))
log(`live: ${live.map(a => a.m).join(', ') || 'none'}; idled: ${idled.join(', ') || 'none'}`)
if (live.length === 0) return { final: null, error: 'no member answered', idled }

// Anonymize for review
const labels = live.map((a, i) => ({ ...a, label: String.fromCharCode(65 + i) }))
const block = labels.map(l => `### Response ${l.label}\n${l.text}`).join('\n\n')

// Stage 2 — anonymous peer review (needs >= 2 live answers)
phase('Review')
let reviews = []
if (labels.length >= 2) {
  reviews = (await parallel(live.map((a, i) => () =>
    agent(
      `QUESTION: ${Q}\n\nBelow are anonymous responses. Rank them best to worst with one line of justification each, and flag any factual errors. Answer in the same language as the question.\n\n${block}`,
      { label: `review:${i}`, phase: 'Review', model: a.m }
    )
  ))).filter(Boolean).filter(t => !isNonAnswer(t))
}
const reviewBlock = reviews.length
  ? reviews.map((r, i) => `### Review ${i + 1}\n${r}`).join('\n\n')
  : 'No reviews (fewer than two live answers).'

// Stage 3 — chairman synthesis
phase('Synthesis')
const final = await agent(
  `You are the Chairman of a council. Using the responses and peer reviews below, write the single best final answer, in the same language as the question. Resolve disagreements; drop claims flagged as wrong. Don't greet, start immediately.\n\nQUESTION: ${Q}\n\n## Responses\n${block}\n\n## Reviews\n${reviewBlock}`,
  { label: 'chairman:opus', phase: 'Synthesis', model: 'opus' }
)

return { final, liveMembers: live.map(a => a.m), idledMembers: idled, reviewCount: reviews.length, rankings: reviews }
