const EVENT_NAMES: Record<string, string> = {
  GroupChatStart: "工作流开始",
  GroupChatMessage: "Agent 发言",
  GroupChatAgentResponse: "Agent 响应",
  GroupChatRequestPublish: "请求 Agent 执行",
  GroupChatTermination: "任务结束",
  GroupChatError: "执行错误",
  None: "内部空响应",
};

const ACTION_NAMES: Record<string, string> = {
  Send: "发送",
  Publish: "广播",
  Response: "响应",
};

export function getEventDisplayName(value?: string | null): string {
  if (!value) return "内部事件";
  return EVENT_NAMES[value] || value;
}

export function getActionDisplayName(value?: string | null): string {
  if (!value) return "";
  return ACTION_NAMES[value] || value;
}
