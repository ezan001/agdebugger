import type { Message, TraceStatus } from "../shared-types";

const INTERNAL_EVENT_TYPES = new Set([
  "None",
  "GroupChatRequestPublish",
  "GroupChatReset",
  "ResetMessage",
  "RequestReplyMessage",
]);

const CONVERSATION_EVENT_TYPES = new Set([
  "GroupChatMessage",
  "GroupChatAgentResponse",
]);

const NO_RESULT_PATTERNS = [
  /\bno (?:email|result|information|matching|relevant)\b/i,
  /\b(?:could not|couldn't|did not|didn't|unable to) find\b/i,
  /\bnot found\b/i,
  /\binvalid (?:url|address)\b/i,
  /\b(?:could not|couldn't|unable to) (?:open|access|navigate|load)\b/i,
  /\bdoes not (?:list|contain|provide|show)\b/i,
  /没有(?:找到|提供|显示|列出)/,
  /未找到/,
];

const FORMAT_WARNING_PATTERNS = [
  /\bformat warning\b/i,
  /\bdoes not (?:match|follow) (?:the )?(?:requested )?format\b/i,
  /\bexpected format\b/i,
  /\bthe (?:result|final answer) (?:of .+ )?is\b/i,
  /\bbased on (?:the )?(?:calculation|python code|execution)\b/i,
  /\bthe python code was executed successfully\b/i,
  /格式(?:不符|警告|错误)/,
];

export interface TraceAnalysis {
  visibleMessages: Message[];
  hiddenInternalCount: number;
  foldedDuplicateCount: number;
  errorEventCount: number;
  noResultCount: number;
  noProgressCount: number;
  formatWarningCount: number;
}

export function getInnerMessageType(message: Message): string {
  if (typeof message.message !== "object" || message.message === null) {
    return message.type;
  }
  return String((message.message as { type?: string }).type || message.type);
}

function getContentValue(message: Message): unknown {
  const body = message.message as {
    content?: unknown;
    messages?: Array<{ content?: unknown }>;
    message?: { content?: unknown };
    response?: { chat_message?: { content?: unknown } };
    agent_response?: { chat_message?: { content?: unknown } };
  };
  return (
    body.content ??
    body.messages?.[0]?.content ??
    body.message?.content ??
    body.response?.chat_message?.content ??
    body.agent_response?.chat_message?.content
  );
}

export function formatReadableContent(value: unknown): string {
  if (typeof value === "string") {
    return value
      .replace(/\[object Object\]/g, "[截图对象，点击 Details 查看]")
      .trim();
  }
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    const output = getExecutionOutput(value);
    if (output) return output;
    return value
      .map((item) =>
        typeof item === "string"
          ? item
          : "[截图对象，点击 Details 查看]",
      )
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "object") {
    const output = getExecutionOutput(value);
    if (output) return output;
    return "[截图对象，点击 Details 查看]";
  }
  return String(value);
}

function getExecutionOutput(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    return value.map(getExecutionOutput).find(Boolean) || "";
  }

  const record = value as Record<string, unknown>;
  for (const key of ["stdout", "output"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const key of ["result", "execution_result", "code_result"]) {
    const nested = getExecutionOutput(record[key]);
    if (nested) return nested;
  }

  return "";
}

export function getReadableMessageContent(message: Message): string {
  if (message.trace_status === "no_progress" && message.folded_count) {
    return `已折叠 ${message.folded_count} 条重复无进展事件。建议重置当前 run 或编辑任务后重试。`;
  }
  return formatReadableContent(getContentValue(message));
}

function hasNonEmptyError(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasNonEmptyError);

  return Object.entries(value).some(([key, item]) => {
    if (/^(error|exception)$/i.test(key)) {
      return item !== null && item !== undefined && item !== "";
    }
    return hasNonEmptyError(item);
  });
}

export function classifyTraceMessage(message: Message): TraceStatus {
  if (message.trace_status) return message.trace_status;

  const type = getInnerMessageType(message);
  if (type === "GroupChatError" || hasNonEmptyError(message.message)) {
    return "runtime_error";
  }

  const content = getReadableMessageContent(message);
  if (FORMAT_WARNING_PATTERNS.some((pattern) => pattern.test(content))) {
    return "format_warning";
  }
  if (NO_RESULT_PATTERNS.some((pattern) => pattern.test(content))) {
    return "no_result";
  }
  return "success";
}

export function isErrorMessage(message: Message): boolean {
  return classifyTraceMessage(message) === "runtime_error";
}

function normalizedContent(message: Message): string {
  return getReadableMessageContent(message)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftWords = new Set(left.split(/\W+/).filter(Boolean));
  const rightWords = new Set(right.split(/\W+/).filter(Boolean));
  const intersection = [...leftWords].filter((word) =>
    rightWords.has(word),
  ).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return union === 0 ? 0 : intersection / union;
}

function isSemanticDuplicate(previous: Message, current: Message): boolean {
  const previousType = getInnerMessageType(previous);
  const currentType = getInnerMessageType(current);
  if (
    !CONVERSATION_EVENT_TYPES.has(previousType) ||
    !CONVERSATION_EVENT_TYPES.has(currentType) ||
    previousType === currentType
  ) {
    return false;
  }
  return normalizedContent(previous) === normalizedContent(current);
}

function isRepeatedStall(previous: Message, current: Message): boolean {
  const previousStatus = classifyTraceMessage(previous);
  const currentStatus = classifyTraceMessage(current);
  const foldable = new Set<TraceStatus>([
    "runtime_error",
    "no_result",
    "no_progress",
  ]);
  return (
    foldable.has(previousStatus) &&
    foldable.has(currentStatus) &&
    (previousStatus === currentStatus || previousStatus === "no_progress") &&
    similarity(normalizedContent(previous), normalizedContent(current)) >= 0.7
  );
}

function makeNoProgressSummary(message: Message, count: number): Message {
  return {
    ...message,
    id: -Math.abs(message.id || message.timestamp || count),
    type: "TraceFoldSummary",
    message: { type: "TraceFoldSummary" },
    trace_status: "no_progress",
    folded_count: count,
  };
}

export function analyzeTrace(messages: Message[]): TraceAnalysis {
  const analysis: TraceAnalysis = {
    visibleMessages: [],
    hiddenInternalCount: 0,
    foldedDuplicateCount: 0,
    errorEventCount: 0,
    noResultCount: 0,
    noProgressCount: 0,
    formatWarningCount: 0,
  };

  let lastFoldSource: Message | undefined;
  let foldedStallCount = 0;

  const flushFoldedStalls = () => {
    if (!lastFoldSource || foldedStallCount === 0) return;
    analysis.visibleMessages.push(
      makeNoProgressSummary(lastFoldSource, foldedStallCount),
    );
    analysis.noProgressCount += 1;
    lastFoldSource = undefined;
    foldedStallCount = 0;
  };

  messages.forEach((message) => {
    const status = classifyTraceMessage(message);
    const classified = { ...message, trace_status: status };
    const eventType = getInnerMessageType(message);

    if (
      status !== "runtime_error" &&
      (INTERNAL_EVENT_TYPES.has(eventType) ||
        (!getReadableMessageContent(message) &&
          eventType !== "GroupChatTermination"))
    ) {
      analysis.hiddenInternalCount += 1;
      return;
    }

    const previous =
      analysis.visibleMessages[analysis.visibleMessages.length - 1];
    const foldSource = lastFoldSource || previous;
    if (foldSource && isRepeatedStall(foldSource, classified)) {
      lastFoldSource = foldSource;
      foldedStallCount += 1;
      analysis.foldedDuplicateCount += 1;
      return;
    }

    flushFoldedStalls();

    if (previous && isSemanticDuplicate(previous, classified)) {
      analysis.foldedDuplicateCount += 1;
      return;
    }

    if (status === "runtime_error") analysis.errorEventCount += 1;
    if (status === "no_result") analysis.noResultCount += 1;
    if (status === "format_warning") analysis.formatWarningCount += 1;
    analysis.visibleMessages.push(classified);
  });

  flushFoldedStalls();
  return analysis;
}

export function getUserTraceMessages(
  messages: Message[],
  showFullTrace: boolean,
): Message[] {
  return showFullTrace ? messages : analyzeTrace(messages).visibleMessages;
}
