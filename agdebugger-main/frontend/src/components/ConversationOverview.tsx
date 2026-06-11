import { useMemo, useState } from "react";

import type {
  AgentName,
  Message,
  MessageDiagnostic,
  MessageHistoryMap,
} from "../shared-types";

const AGENT_LABELS: Record<string, string> = {
  Orchestrator: "总控 Agent",
  WebSurfer: "网页搜索 Agent",
  FileSurfer: "文件读取 Agent",
  Coder: "代码编写 Agent",
  Executor: "代码执行 Agent",
  User: "用户",
};

interface TimelineNode {
  id: string;
  lane: string;
  sender?: string | null;
  receiver?: string | null;
  messageType: string;
  status: "queued" | "processed" | "failed" | "edited";
  detail: unknown;
}

interface ConversationOverviewProps {
  messageHistoryData: MessageHistoryMap;
  currentSession: number;
  agents: AgentName[];
  messageQueue: Message[];
  diagnostics: MessageDiagnostic[];
}

const normalizeAgent = (value?: string | null) => {
  if (!value) return "User";
  if (value.includes("/")) return value.split("/")[0];
  return value;
};

const ConversationOverview: React.FC<ConversationOverviewProps> = ({
  messageHistoryData,
  currentSession,
  agents,
  messageQueue,
  diagnostics,
}) => {
  const [selectedNode, setSelectedNode] = useState<TimelineNode>();

  const nodes = useMemo(() => {
    const result: TimelineNode[] = [];
    Object.entries(messageHistoryData).forEach(([sessionId, session]) => {
      session.messages.forEach((message) => {
        const innerType =
          typeof message.message === "object" && message.message !== null
            ? String((message.message as { type?: string }).type || message.type)
            : message.type;
        result.push({
          id: `history-${sessionId}-${message.timestamp}`,
          lane: normalizeAgent(message.recipient || message.sender),
          sender: normalizeAgent(message.sender),
          receiver: normalizeAgent(message.recipient),
          messageType: innerType,
          status:
            Number(sessionId) === currentSession ? "processed" : "edited",
          detail: message,
        });
      });
    });

    messageQueue.forEach((message, index) => {
      result.push({
        id: `queue-${message.id}-${index}`,
        lane: normalizeAgent(message.recipient),
        sender: normalizeAgent(message.sender),
        receiver: normalizeAgent(message.recipient),
        messageType:
          String((message.message as { type?: string })?.type || message.type),
        status: "queued",
        detail: message,
      });
    });

    diagnostics.forEach((diagnostic) => {
      const failedStep = Object.entries(diagnostic.steps).find(
        ([, step]) => step.status === "error",
      );
      if (failedStep) {
        result.push({
          id: diagnostic.id,
          lane: normalizeAgent(
            (diagnostic.parsed_payload as { receiver?: string } | undefined)
              ?.receiver,
          ),
          sender: "User",
          receiver:
            (diagnostic.parsed_payload as { receiver?: string } | undefined)
              ?.receiver || null,
          messageType: failedStep[0],
          status: "failed",
          detail: {
            raw_backend_body: diagnostic.raw_body,
            parsed_payload: diagnostic.parsed_payload,
            error: failedStep[1],
          },
        });
      }
    });
    return result;
  }, [currentSession, diagnostics, messageHistoryData, messageQueue]);

  const lanes = useMemo(
    () =>
      Array.from(
        new Set([
          "User",
          "Orchestrator",
          ...agents,
          ...nodes.map((node) => node.lane),
        ]),
      ),
    [agents, nodes],
  );

  const statusClass: Record<TimelineNode["status"], string> = {
    queued: "border-amber-400 bg-amber-50",
    processed: "border-green-400 bg-green-50",
    failed: "border-red-500 bg-red-50",
    edited: "border-purple-400 bg-purple-50",
  };

  return (
    <aside className="sticky top-0 h-screen w-[460px] shrink-0 overflow-auto border-l-2 border-gray-200 bg-gray-50 p-4">
      <div className="flex items-end justify-between">
        <h3 className="text-lg font-semibold">Agent 泳道与工作流时间线</h3>
        <span className="text-sm">Session {currentSession}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-amber-100 px-2 py-1">队列中</span>
        <span className="rounded bg-green-100 px-2 py-1">已处理</span>
        <span className="rounded bg-red-100 px-2 py-1">失败</span>
        <span className="rounded bg-purple-100 px-2 py-1">用户 edit 分支</span>
      </div>

      <div className="mt-4 space-y-2">
        {lanes.map((lane) => (
          <div
            key={lane}
            className="grid min-h-16 grid-cols-[120px_1fr] rounded border bg-white"
          >
            <div className="border-r bg-gray-100 p-2 text-sm font-medium">
              <div>{AGENT_LABELS[lane] || lane}</div>
              <div className="text-xs font-normal text-gray-500">{lane}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 p-2">
              {nodes
                .filter((node) => node.lane === lane)
                .map((node) => (
                  <button
                    key={node.id}
                    className={`max-w-52 rounded border-l-4 p-2 text-left text-xs ${statusClass[node.status]}`}
                    onClick={() => setSelectedNode(node)}
                  >
                    <div className="font-semibold">{node.messageType}</div>
                    <div className="truncate">
                      {node.sender || "User"} → {node.receiver || lane}
                    </div>
                    <div>{node.status}</div>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      {selectedNode && (
        <div className="mt-4 rounded border bg-white p-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">节点详情</h4>
            <button
              className="text-sm text-gray-500"
              onClick={() => setSelectedNode(undefined)}
            >
              关闭
            </button>
          </div>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(selectedNode.detail, null, 2)}
          </pre>
        </div>
      )}
    </aside>
  );
};

export default ConversationOverview;
