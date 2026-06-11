import { memo } from "react";

import { api } from "../api";
import { useAllowActions } from "../context/AllowActionsContext";
import type { Message, GenericMessage } from "../shared-types";
import MessageCard from "./MessageCard";

export interface RunDebugSummary {
  task: string;
  runId: string;
  finalAnswer: string;
  normalMessageCount: number;
  fullTraceCount: number;
  hiddenInternalCount: number;
  foldedDuplicateCount: number;
  errorEventCount: number;
  noResultCount: number;
  noProgressCount: number;
  formatWarningCount: number;
  agentsUsed: string[];
  errorSummary: string;
}

interface MessageListProps {
  messageHistory: Message[];
  rawMessageCount: number;
  showFullTrace: boolean;
  onShowFullTraceChange: (show: boolean) => void;
  showAllHistory: boolean;
  onShowAllHistoryChange: (show: boolean) => void;
  runSummary: RunDebugSummary;
  onBranchCreated: (runId: string) => void;
  onClearCurrentRun: () => Promise<void>;
  onClearAllHistory: () => Promise<void>;
}

const MessageList: React.FC<MessageListProps> = memo(({
  messageHistory,
  rawMessageCount,
  showFullTrace,
  onShowFullTraceChange,
  showAllHistory,
  onShowAllHistoryChange,
  runSummary,
  onBranchCreated,
  onClearCurrentRun,
  onClearAllHistory,
}) => {
  const { setAllowActions } = useAllowActions();

  const copyRunSummary = async () => {
    const summary = [
      `task: ${runSummary.task || "(unknown)"}`,
      `run_id: ${runSummary.runId || "(legacy run)"}`,
      `final_answer: ${runSummary.finalAnswer || "(not available)"}`,
      `normal_messages: ${runSummary.normalMessageCount}`,
      `full_trace_events: ${runSummary.fullTraceCount}`,
      `hidden_internal_events: ${runSummary.hiddenInternalCount}`,
      `folded_duplicate_events: ${runSummary.foldedDuplicateCount}`,
      `no_result_events: ${runSummary.noResultCount}`,
      `no_progress_groups: ${runSummary.noProgressCount}`,
      `format_warnings: ${runSummary.formatWarningCount}`,
      `agents_used: ${runSummary.agentsUsed.join(", ") || "(none)"}`,
      `error_summary: ${runSummary.errorSummary || "(none)"}`,
    ].join("\n");
    await navigator.clipboard.writeText(summary);
  };

  const editHistory = (
    messageId: number,
    newMessage: GenericMessage | undefined,
  ) => {
    // write new message to database

    setAllowActions(false);

    api
      .post("/editAndRevertHistoryMessage", {
        timestamp: messageId,
        body: newMessage,
      })
      .then((response) => {
        const runId = response.data?.run?.run_id;
        if (runId) onBranchCreated(runId);
        setAllowActions(true);
      })
      .catch((error) => {
        console.error("Error editing message:", error);
        setAllowActions(true);
      });
  };

  return (
    <div className="py-2">
      <section className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">当前任务摘要</h3>
          {runSummary.runId && (
            <span
              className="rounded bg-white px-2 py-1 font-mono text-xs"
              title={runSummary.runId}
            >
              Run {runSummary.runId.slice(0, 8)}
            </span>
          )}
          <div className="grow" />
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-100"
            onClick={onClearCurrentRun}
          >
            清空当前 run
          </button>
          <button
            type="button"
            className="rounded border border-red-300 bg-white px-2 py-1 text-sm text-red-700 hover:bg-red-50"
            onClick={async () => {
              if (
                window.confirm(
                  "确定清空全部调试历史吗？该操作会停止运行并删除队列、诊断和所有历史。",
                )
              ) {
                await onClearAllHistory();
              }
            }}
          >
            清空全部历史
          </button>
          <button
            type="button"
            className="rounded border border-blue-300 bg-white px-2 py-1 text-sm hover:bg-blue-100"
            onClick={copyRunSummary}
          >
            复制当前任务摘要
          </button>
        </div>
        {runSummary.task && (
          <p className="mt-2 line-clamp-2 text-sm" title={runSummary.task}>
            {runSummary.task}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-white px-2 py-1">
            普通消息 {runSummary.normalMessageCount}
          </span>
          <span className="rounded bg-white px-2 py-1">
            完整 trace {runSummary.fullTraceCount}
          </span>
          <span className="rounded bg-white px-2 py-1">
            隐藏内部事件 {runSummary.hiddenInternalCount}
          </span>
          <span className="rounded bg-white px-2 py-1">
            折叠重复 {runSummary.foldedDuplicateCount}
          </span>
          <span className="rounded bg-white px-2 py-1">
            错误 {runSummary.errorEventCount}
          </span>
          <span className="rounded bg-white px-2 py-1">
            无结果 {runSummary.noResultCount}
          </span>
          <span className="rounded bg-white px-2 py-1">
            无进展 {runSummary.noProgressCount}
          </span>
          <span className="rounded bg-white px-2 py-1">
            格式提醒 {runSummary.formatWarningCount}
          </span>
          <span
            className="rounded bg-white px-2 py-1"
            title={runSummary.agentsUsed.join(", ")}
          >
            使用 Agent {runSummary.agentsUsed.length}
          </span>
        </div>
        <p className="mt-2 text-xs text-blue-800">
          完整 trace 包含 runtime 调度事件，不等于 Agent 对话轮数。
        </p>
      </section>

      <div className="mb-2 flex gap-2 items-center">
        <h3 className="text-lg">Message History</h3>
        <span className="text-sm text-gray-500">
          当前任务 {messageHistory.length} 条
        </span>
        <div className="grow" />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAllHistory}
            onChange={(event) => onShowAllHistoryChange(event.target.checked)}
          />
          显示全部历史
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showFullTrace}
            onChange={(event) => onShowFullTraceChange(event.target.checked)}
          />
          显示完整 trace
        </label>
      </div>
      {!showFullTrace && rawMessageCount > messageHistory.length && (
        <p className="mb-2 text-xs text-gray-500">
          默认视图已隐藏内部事件并折叠语义重复消息。
        </p>
      )}

      <div className="space-y-1">
        {messageHistory.map((message, index) => (
          <MessageCard
            key={`message.id-${message.timestamp}`}
            editId={message.timestamp}
            timestamp={message.timestamp}
            historyIndex={index}
            message={message}
            writeEditAndRevertMessage={editHistory}
            writeMessageTag="Save & revert"
            allowRevert={message.type !== "TraceFoldSummary"}
          />
        ))}
      </div>
    </div>
  );
});

export default MessageList;
