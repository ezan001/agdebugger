import type { MessageDiagnostic } from "../shared-types";

const STEP_LABELS: Record<string, string> = {
  payload_generated: "前端 payload 已生成",
  payload_sent: "payload 已发送",
  raw_body_received: "后端 raw body 已收到",
  schema_validated: "后端 schema 校验通过",
  workflow_message_created: "已转换为 workflow message",
  message_queued: "已加入 message queue",
  workflow_started: "workflow 已启动或 resume",
  first_agent_processed: "第一个 agent 已处理消息",
};

const MessageDiagnostics: React.FC<{
  diagnostics: MessageDiagnostic[];
}> = ({ diagnostics }) => {
  const diagnostic = diagnostics[0];

  return (
    <section className="bg-white p-4 shadow-md rounded-lg">
      <h3 className="text-lg font-semibold">消息发送链路诊断</h3>
      {!diagnostic && (
        <p className="mt-2 text-sm text-gray-500">发送消息后，这里会显示完整链路。</p>
      )}
      {diagnostic && (
        <div className="mt-3 space-y-2">
          {Object.entries(STEP_LABELS).map(([key, label]) => {
            const step = diagnostic.steps[key] || { status: "pending" };
            const color =
              step.status === "success"
                ? "border-green-300 bg-green-50"
                : step.status === "error"
                  ? "border-red-400 bg-red-50"
                  : "border-gray-200 bg-gray-50";
            return (
              <details key={key} className={`rounded border p-2 ${color}`}>
                <summary className="cursor-pointer text-sm font-medium">
                  {step.status === "success"
                    ? "✓"
                    : step.status === "error"
                      ? "!"
                      : "…"}{" "}
                  {label}
                </summary>
                {(step.error || step.detail !== undefined) && (
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(step.error || step.detail, null, 2)}
                  </pre>
                )}
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default MessageDiagnostics;
