const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

const DISPLAY_NAMES: Record<string, string> = {
  MagenticOneOrchestrator: "总控 Agent",
  Orchestrator: "总控 Agent",
  WebSurfer: "网页浏览 Agent",
  FileSurfer: "文件读取 Agent",
  Coder: "代码编写 Agent",
  Executor: "代码执行 Agent",
  RoundRobinGroupChatManager: "轮询群聊管理器",
  User: "用户",
  Group: "群组",
};

export function getAgentBaseName(value?: string | null): string {
  if (!value) return "User";

  const withoutSession = value.split("/")[0];
  return withoutSession
    .replace(new RegExp(`[_-]?${UUID_PATTERN.source}$`, "i"), "")
    .replace(UUID_PATTERN, "")
    .replace(/[_-]+$/, "");
}

export function getDisplayName(value?: string | null): string {
  const baseName = getAgentBaseName(value);
  return DISPLAY_NAMES[baseName] || baseName || "未知 Agent";
}

