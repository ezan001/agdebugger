import { Button, Select, ToggleSwitch } from "flowbite-react";
import { PaperPlane } from "flowbite-react-icons/outline";
import React, { memo, useEffect, useState } from "react";

import { api } from "../api";
import { useAllowActions } from "../context/AllowActionsContext";
import type { AgentName, MessageDiagnostic } from "../shared-types";
import { getDisplayName } from "../utils/display-name";
import {
  buildWorkflowPayload,
  type RunMode,
  type WorkflowMessageType,
} from "../workflow-payload";
import GrowTextarea from "./common/GrowTextarea";

const MODE_LABELS: Record<WorkflowMessageType, string> = {
  START_TASK: "开始新任务",
  SEND_MESSAGE: "发送中途干预消息",
  RESET_AND_EDIT: "回退并编辑历史消息",
  RETRY_FROM_HERE: "从 checkpoint 重试",
};

interface SendMessageProps {
  agents: AgentName[];
  checkpointTimestamps: number[];
  currentSession: number;
  onSend: (messageType: WorkflowMessageType) => void;
  onStartTask: () => void;
  onDiagnostic: (diagnostic: MessageDiagnostic) => void;
}

const SendMessage: React.FC<SendMessageProps> = memo(
  ({
    agents,
    checkpointTimestamps,
    currentSession,
    onSend,
    onStartTask,
    onDiagnostic,
  }) => {
    const [mode, setMode] = useState<WorkflowMessageType>("START_TASK");
    const [content, setContent] = useState("");
    const [receiver, setReceiver] = useState("Orchestrator");
    const [runMode, setRunMode] = useState<RunMode>("auto");
    const [checkpoint, setCheckpoint] = useState<number | undefined>();
    const [gaiaMode, setGaiaMode] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const { allowActions } = useAllowActions();

    useEffect(() => {
      if (mode === "START_TASK") setReceiver("Orchestrator");
      if (mode === "SEND_MESSAGE" && receiver === "Orchestrator") {
        setReceiver(agents[0] || "");
      }
    }, [agents, mode, receiver]);

    useEffect(() => {
      if (gaiaMode) {
        setMode("START_TASK");
        setReceiver("Orchestrator");
        setRunMode("auto");
      }
    }, [gaiaMode]);

    useEffect(() => {
      if (checkpoint === undefined && checkpointTimestamps.length > 0) {
        setCheckpoint(checkpointTimestamps[checkpointTimestamps.length - 1]);
      }
    }, [checkpoint, checkpointTimestamps]);

    const requiresContent = mode !== "RETRY_FROM_HERE";
    const requiresCheckpoint =
      mode === "RESET_AND_EDIT" || mode === "RETRY_FROM_HERE";

    const handleSubmit = async (event: React.FormEvent) => {
      event.preventDefault();
      if (requiresContent && !content.trim()) {
        setErrorMessage("请输入消息内容。");
        return;
      }
      if (mode === "SEND_MESSAGE" && !receiver) {
        setErrorMessage("发送中途干预消息时必须选择具体 agent。");
        return;
      }
      if (requiresCheckpoint && checkpoint === undefined) {
        setErrorMessage("请选择 checkpoint。");
        return;
      }

      const payload = buildWorkflowPayload({
        messageType: mode,
        content: content.trim(),
        receiver,
        sessionId: currentSession,
        runMode,
        checkpointTimestamp: checkpoint,
        gaiaMode,
      });
      if (mode === "START_TASK") onStartTask();
      const frontendDiagnostic: MessageDiagnostic = {
        id: `frontend-${Date.now()}`,
        created_at: Date.now() / 1000,
        parsed_payload: payload,
        steps: {
          payload_generated: { status: "success", detail: payload },
          payload_sent: { status: "pending" },
        },
      };
      onDiagnostic(frontendDiagnostic);

      try {
        const response = await api.post<{
          diagnostic: MessageDiagnostic;
        }>("/workflow/messages", payload);
        onDiagnostic(response.data.diagnostic);
        setErrorMessage("");
        if (mode !== "SEND_MESSAGE") setContent("");
        onSend(mode);
      } catch (error: unknown) {
        const responseData =
          typeof error === "object" &&
          error !== null &&
          "response" in error
            ? (error as { response?: { data?: { detail?: unknown } } }).response
                ?.data
            : undefined;
        const backendDiagnostic = responseData?.detail;
        if (
          typeof backendDiagnostic === "object" &&
          backendDiagnostic !== null &&
          "steps" in backendDiagnostic
        ) {
          onDiagnostic(backendDiagnostic as MessageDiagnostic);
        } else {
          onDiagnostic({
            ...frontendDiagnostic,
            steps: {
              ...frontendDiagnostic.steps,
              payload_sent: {
                status: "error",
                error: "请求未到达后端或网络连接失败",
              },
            },
          });
        }
        const detail =
          responseData
            ? JSON.stringify(responseData, null, 2)
            : String(error);
        setErrorMessage(detail);
        onSend(mode);
      }
    };

    return (
      <section className="bg-white p-4 shadow-md rounded-lg">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">工作流消息</h3>
          <ToggleSwitch
            checked={gaiaMode}
            label="GAIA 模式"
            onChange={setGaiaMode}
          />
        </div>

        <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            操作模式
            <Select
              className="mt-1"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as WorkflowMessageType)
              }
            >
              {Object.entries(MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label} ({value})
                </option>
              ))}
            </Select>
          </label>

          {(mode === "START_TASK" || mode === "SEND_MESSAGE") && (
            <label className="block text-sm font-medium">
              接收者
              <Select
                className="mt-1"
                value={receiver}
                disabled={mode === "START_TASK"}
                onChange={(event) => setReceiver(event.target.value)}
              >
                {mode === "START_TASK" && (
                  <option value="Orchestrator">
                    总控 Agent (Orchestrator)
                  </option>
                )}
                {agents.map((agent) => (
                  <option key={agent} value={agent}>
                    {getDisplayName(agent)}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {requiresCheckpoint && (
            <label className="block text-sm font-medium">
              Checkpoint
              <Select
                className="mt-1"
                value={checkpoint ?? ""}
                onChange={(event) => setCheckpoint(Number(event.target.value))}
              >
                {checkpointTimestamps.map((timestamp) => (
                  <option key={timestamp} value={timestamp}>
                    {timestamp}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {requiresContent && (
            <label className="block text-sm font-medium">
              消息内容
              <GrowTextarea
                className="mt-1 w-full rounded-lg border-gray-300"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={
                  mode === "START_TASK"
                    ? "输入任务，例如：请回答这个 GAIA 问题"
                    : "输入干预或编辑后的消息"
                }
              />
            </label>
          )}

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">运行方式</label>
            <Select
              sizing="sm"
              value={runMode}
              onChange={(event) => setRunMode(event.target.value as RunMode)}
            >
              <option value="auto">自动 (auto)</option>
              <option value="manual">手动单步 (manual)</option>
            </Select>
            <div className="grow" />
            <Button
              type="submit"
              disabled={!allowActions}
              size="sm"
              title="发送工作流消息"
            >
              <PaperPlane className="mr-2 rotate-90" />
              发送
            </Button>
          </div>

          {gaiaMode && (
            <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
              <div className="font-medium">GAIA 推荐操作</div>
              <p>网页题：启用 WebSurfer</p>
              <p>文件题：启用 FileSurfer，并检查附件路径</p>
              <p>计算/表格题：启用 Coder + Executor</p>
              <p className="mt-1 font-mono">FINAL ANSWER: [答案]</p>
            </div>
          )}

          {errorMessage && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-red-400 bg-red-50 p-3 text-xs text-red-700">
              {errorMessage}
            </pre>
          )}
        </form>
      </section>
    );
  },
);

export default SendMessage;
