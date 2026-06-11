import { useMemo, useState } from "react";

import { useHoveredMessage } from "../context/HoveredMessageContext";
import type {
  AgentName,
  Message,
  MessageDiagnostic,
  MessageHistoryMap,
  RunInfo,
} from "../shared-types";
import { canonicalAgentKey, getDisplayName } from "../utils/display-name";
import { getEventDisplayName } from "../utils/event-display";
import {
  classifyTraceMessage,
  getInnerMessageType,
  isErrorMessage,
} from "../utils/trace-display";

interface TimelineNode {
  id: string;
  lane: string;
  sender?: string | null;
  receiver?: string | null;
  messageType: string;
  status: "queued" | "processed" | "failed" | "edited";
  detail: unknown;
  timestamp?: number;
  traceStatus?: string;
}

interface ConversationOverviewProps {
  messageHistoryData: MessageHistoryMap;
  currentSession: number;
  agents: AgentName[];
  messageQueue: Message[];
  diagnostics: MessageDiagnostic[];
  currentRunId?: string;
  currentRun?: RunInfo;
}

const normalizeAgent = (value?: string | null) => {
  return canonicalAgentKey(value);
};

const ConversationOverview: React.FC<ConversationOverviewProps> = ({
  messageHistoryData,
  currentSession,
  agents,
  messageQueue,
  diagnostics,
  currentRunId,
  currentRun,
}) => {
  const [selectedNode, setSelectedNode] = useState<TimelineNode>();
  const { setHoveredMessageId } = useHoveredMessage();

  const nodes = useMemo(() => {
    const result: TimelineNode[] = [];
    const historyMessageIds = new Set<number>();
    Object.entries(messageHistoryData).forEach(([sessionId, session]) => {
      session.messages.forEach((message) => {
        historyMessageIds.add(message.id);
        const innerType = getInnerMessageType(message);
        const failed = isErrorMessage(message);
        result.push({
          id: `history-${sessionId}-${message.timestamp}`,
          lane: failed
            ? "Failure"
            : normalizeAgent(message.recipient || message.sender),
          sender: normalizeAgent(message.sender),
          receiver: normalizeAgent(message.recipient),
          messageType: innerType,
          status: failed
            ? "failed"
            : Number(sessionId) === currentSession
              ? "processed"
              : "edited",
          detail: message,
          timestamp: message.timestamp,
          traceStatus: classifyTraceMessage(message),
        });
      });
    });

    messageQueue.forEach((message, index) => {
      if (historyMessageIds.has(message.id)) return;
      result.push({
        id: `queue-${message.id}-${index}`,
        lane: isErrorMessage(message)
          ? "Failure"
          : normalizeAgent(message.recipient),
        sender: normalizeAgent(message.sender),
        receiver: normalizeAgent(message.recipient),
        messageType:
          String((message.message as { type?: string })?.type || message.type),
        status: isErrorMessage(message) ? "failed" : "queued",
        detail: message,
        timestamp: message.timestamp,
        traceStatus: classifyTraceMessage(message),
      });
    });

    diagnostics.forEach((diagnostic) => {
      const failedStep = Object.entries(diagnostic.steps).find(
        ([, step]) => step.status === "error" || step.status === "failed",
      );
      if (failedStep) {
        result.push({
          id: diagnostic.id,
          lane: "Failure",
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
    if (currentRun?.branch_from_timestamp !== undefined) {
      result.push({
        id: `branch-${currentRun.run_id}`,
        lane: "EditBranch",
        sender: "User",
        receiver: "MagenticOneOrchestrator",
        messageType: currentRun.branch_type || "RETRY_FROM_HERE",
        status: "edited",
        detail: currentRun,
        timestamp: currentRun.branch_from_timestamp,
      });
    }
    return result;
  }, [
    currentRun,
    currentSession,
    diagnostics,
    messageHistoryData,
    messageQueue,
  ]);

  const lanes = useMemo(() => {
    const teamKeys = new Set(agents.map((agent) => normalizeAgent(agent)));
    const eventKeys = new Set(nodes.map((node) => node.lane));
    return Array.from(new Set([...teamKeys, ...eventKeys])).filter(
      (lane) => teamKeys.has(lane) || eventKeys.has(lane),
    );
  }, [agents, nodes]);

  const statusClass: Record<TimelineNode["status"], string> = {
    queued: "border-amber-400 bg-amber-50",
    processed: "border-green-400 bg-green-50",
    failed: "border-red-500 bg-red-50",
    edited: "border-purple-400 bg-purple-50",
  };

  const handleNodeClick = (node: TimelineNode) => {
    setSelectedNode(node);
    if (node.timestamp === undefined) return;

    const target = document.getElementById(
      `message-history-item-${node.timestamp}`,
    );
    if (!target) {
      console.warn("No Message History item for timeline node", node.id);
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHoveredMessageId(node.timestamp);
    window.setTimeout(() => setHoveredMessageId(undefined), 1800);
  };

  return (
    <aside className="sticky top-0 h-screen w-[460px] shrink-0 overflow-auto border-l-2 border-gray-200 bg-gray-50 p-4">
      <div className="flex items-end justify-between">
        <h3 className="text-lg font-semibold">Agent 泳道与工作流时间线</h3>
        <span className="text-sm" title={currentRunId}>
          {currentRunId
            ? `Run ${currentRunId.slice(0, 8)}`
            : `Session ${currentSession}`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-amber-100 px-2 py-1">队列中</span>
        <span className="rounded bg-green-100 px-2 py-1">已处理</span>
        {nodes.some((node) => node.status === "failed") && (
          <span className="rounded bg-red-100 px-2 py-1">失败</span>
        )}
        {nodes.some((node) => node.status === "edited") && (
          <span className="rounded bg-purple-100 px-2 py-1">
            用户 edit 分支
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {lanes.map((lane) => (
          <div
            key={lane}
            className="grid min-h-16 grid-cols-[120px_1fr] rounded border bg-white"
          >
            <div className="border-r bg-gray-100 p-2 text-sm font-medium">
              <div title={lane}>{getDisplayName(lane)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 p-2">
              {nodes
                .filter((node) => node.lane === lane)
                .map((node) => (
                  <button
                    key={node.id}
                    className={`max-w-52 cursor-pointer rounded border-l-4 p-2 text-left text-xs transition hover:brightness-95 hover:shadow ${statusClass[node.status]}`}
                    onClick={() => handleNodeClick(node)}
                    title={
                      node.timestamp === undefined
                        ? "查看事件详情"
                        : "点击跳转到对应消息"
                    }
                  >
                    <div className="font-semibold">
                      {getEventDisplayName(node.messageType)}
                    </div>
                    <div className="truncate">
                      <span title={node.sender || "User"}>
                        {getDisplayName(node.sender)}
                      </span>
                      {" → "}
                      <span title={node.receiver || lane}>
                        {getDisplayName(node.receiver || lane)}
                      </span>
                    </div>
                    <div>{node.status}</div>
                    {node.traceStatus &&
                      node.traceStatus !== "success" &&
                      node.status !== "failed" && (
                        <div className="mt-1 font-medium">
                          {node.traceStatus.replace("_", " ")}
                        </div>
                      )}
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
