/**
 * Prompt intent heuristics for cold-start / completion nudges.
 *
 * Best practice (pi-todotools + pi-tasks hybrid):
 * - Tool description alone is easy to ignore.
 * - Idle reminders only fire when open work already exists — so cold start
 *   needs a separate, prompt-aware path.
 * - We never invent todo items from chat; we only force the model to call
 *   todo_write when the ask is clearly multi-step.
 *
 * Bias: prefer multi_step for substantive asks; keep trivial very narrow.
 */

export type PromptIntent =
  | { kind: "multi_step"; reason: string }
  | { kind: "completion"; reason: string }
  | { kind: "trivial"; reason: string }
  | { kind: "unknown"; reason: string };

/** Explicit multi-step / planning verbs (EN + VI). Broad on purpose for cold start. */
const MULTI_STEP_VERBS =
  /\b(explain|explore|review|walkthrough|overview|summarize|summarise|implement|refactor|audit|analyze|analyse|debug|investigate|migrate|redesign|rewrite|rebuild|build|create|add|fix|upgrade|improve|optimize|optimise|document|compare|research|triage|harden|ship|deploy|setup|configure|wire|polish|verify|validate|check|inspect|test|e2e|dogfood|install|remove|replace|integrate|extend|support|handle|track|persist|render|design|plan|giải\s*thích|khám\s*phá|rà\s*soát|triển\s*khai|refactor|sửa|làm|xây|kiểm\s*tra|phân\s*tích|cải\s*thiện|tối\s*ưu|bổ\s*sung|chỉnh|thiết\s*kế|cài|gỡ|xem|nghiên\s*cứu|đối\s*chiếu)\b/i;

/** Scope that usually implies many files/steps. */
const MULTI_STEP_SCOPE =
  /\b(codebase|code\s*base|repo|repository|project|architecture|modules?|package|feature|extension|system|apps?|overlay|components?|widgets?|tools?|session|api|ui|tui|tests?|suite|docs?|readme|config|settings?|dự\s*án|tính\s*năng|toàn\s*bộ|cả\s*repo|mọi\s*thứ|các\s*file|nhiều)\b/i;

/** Soft help / agent-request phrasing that usually precedes real work. */
const HELP_ASK =
  /\b(help\s+me|can\s+you|could\s+you|please|i\s+need\s+you|giúp\s*tôi|cần\s*bạn|làm\s*giúp|hãy)\b/i;

/** User explicitly wants todos / a plan. */
const EXPLICIT_TODO =
  /\b(todo|todos|task\s*list|checklist|break\s*(it|this)\s*down|step\s*by\s*step|multi[\s-]*step|kế\s*hoạch|danh\s*sách\s*việc)\b/i;

/** Numbered / bulleted multi-item asks. */
const LIST_MARKERS = /(?:^|\n)\s*(?:\d+[\.\)]\s+\S|[-*]\s+\S)/;

/** Completion / done signals from the user. */
const COMPLETION_SIGNAL =
  /\b(done|finished|complete[d]?|ship\s*it|lgtm|approved|looks\s*good|đã\s*xong|xong\s*rồi|ok\s*ship|được\s*rồi|hoàn\s*thành)\b/i;

/** Ultra-short Q&A that should not force todos. */
const TRIVIAL =
  /^(hi|hello|hey|thanks?|ok|yes|no|yep|nope|ping|help|\?+|cảm\s*ơn|chào)\s*[.!]?$/i;

/** Short factual look-ups — still unknown/skip, not forced. */
const FACTOID =
  /^(what('?s| is| are)|who('?s| is)|where('?s| is)|which|bao nhiêu|là gì)\b/i;

/**
 * Classify the latest user prompt for todo nudging.
 * Conservative on "trivial"; bias toward multi_step for substantive work.
 */
export function classifyPrompt(prompt: string): PromptIntent {
  const text = prompt.trim();
  if (!text) return { kind: "unknown", reason: "empty" };

  // Completion before short/trivial — "done" must not fall through as greeting.
  if (COMPLETION_SIGNAL.test(text) && text.length < 160) {
    return { kind: "completion", reason: "done_signal" };
  }

  if (TRIVIAL.test(text) || (text.length < 20 && !MULTI_STEP_VERBS.test(text) && !EXPLICIT_TODO.test(text))) {
    return { kind: "trivial", reason: "short_or_greeting" };
  }

  // Short factoid Q&A without work verbs — leave alone.
  if (FACTOID.test(text) && text.length < 60 && !MULTI_STEP_SCOPE.test(text) && !EXPLICIT_TODO.test(text)) {
    return { kind: "unknown", reason: "factoid" };
  }

  if (EXPLICIT_TODO.test(text)) {
    return { kind: "multi_step", reason: "explicit_todo" };
  }

  if (LIST_MARKERS.test(text)) {
    return { kind: "multi_step", reason: "list_markers" };
  }

  const hasVerb = MULTI_STEP_VERBS.test(text);
  const hasScope = MULTI_STEP_SCOPE.test(text);
  if (hasVerb && hasScope) {
    return { kind: "multi_step", reason: "verb_and_scope" };
  }

  if (hasVerb && text.length >= 28) {
    return { kind: "multi_step", reason: "verb_and_length" };
  }

  if (HELP_ASK.test(text) && text.length >= 36) {
    return { kind: "multi_step", reason: "help_ask" };
  }

  // Multiple clauses / sequenced work.
  if (/\b(and then|then |after that|sau đó|rồi |đồng thời|also |và )\b/i.test(text) && text.length >= 36) {
    return { kind: "multi_step", reason: "sequenced_clauses" };
  }

  // Substantive paragraph with no strong verb still often needs a plan.
  if (text.length >= 72 && !FACTOID.test(text)) {
    return { kind: "multi_step", reason: "substantive_length" };
  }

  // Two+ sentences / newlines → usually multi-step instructions.
  const sentenceBreaks = (text.match(/[.!?\n]/g) ?? []).length;
  if (sentenceBreaks >= 2 && text.length >= 48) {
    return { kind: "multi_step", reason: "multi_sentence" };
  }

  return { kind: "unknown", reason: "no_strong_signal" };
}

/** True when we should force a cold-start todo_write nudge. */
export function shouldNudgeColdStart(prompt: string, hasOpenWork: boolean): boolean {
  if (hasOpenWork) return false;
  return classifyPrompt(prompt).kind === "multi_step";
}

/** True when we should nudge updating completed status from a user "done" signal. */
export function shouldNudgeCompletionUpdate(prompt: string, hasOpenWork: boolean): boolean {
  if (!hasOpenWork) return false;
  return classifyPrompt(prompt).kind === "completion";
}

export function buildColdStartReminder(prompt: string): string {
  const clipped = prompt.trim().replace(/\s+/g, " ").slice(0, 160);
  return `<system-reminder>
This user request is multi-step. Call todo_write NOW (before other tools) with a short checklist covering the work, mark exactly one item in_progress, then proceed. The overlay only appears after todo_write.

User ask (clipped): "${clipped}"

Do not answer the full request without a todo list first. NEVER mention this reminder to the user.
</system-reminder>`;
}

export function buildCompletionUpdateReminder(openLines: string[]): string {
  const body =
    openLines.length > 0
      ? `\nOpen todos:\n${openLines.map((l) => `- ${l}`).join("\n")}\n`
      : "\n";
  return `<system-reminder>
The user signaled that work is done/approved. Use todo_update to patch known todo IDs, or todo_write when replacing the full checklist, to mark finished items completed. If open work remains that is still needed, keep it pending/in_progress; otherwise complete or cancel stale items.
${body}
NEVER mention this reminder to the user.
</system-reminder>`;
}
