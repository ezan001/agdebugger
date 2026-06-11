export type WorkflowMessageType =
  | "START_TASK"
  | "SEND_MESSAGE"
  | "RESET_AND_EDIT"
  | "RETRY_FROM_HERE";

export type RunMode = "auto" | "manual";

export interface WorkflowPayload {
  message_type: WorkflowMessageType;
  content: unknown;
  receiver: string | null;
  session_id: number;
  workflow_id?: string;
  run_mode: RunMode;
  checkpoint_timestamp?: number;
}

export interface WorkflowPayloadInput {
  messageType: WorkflowMessageType;
  content: unknown;
  receiver?: string;
  sessionId: number;
  workflowId?: string;
  runMode?: RunMode;
  checkpointTimestamp?: number;
  gaiaMode?: boolean;
}

export function buildWorkflowPayload(
  input: WorkflowPayloadInput,
): WorkflowPayload {
  let content = input.content;
  if (
    input.gaiaMode &&
    typeof content === "string" &&
    !content.includes("FINAL ANSWER:")
  ) {
    content = `${content.trim()}\n\n请使用以下格式给出最终答案：\nFINAL ANSWER: [答案]`;
  }

  return {
    message_type: input.messageType,
    content,
    receiver:
      input.messageType === "START_TASK"
        ? input.receiver || "Orchestrator"
        : input.receiver || null,
    session_id: input.sessionId,
    workflow_id: input.workflowId,
    run_mode: input.runMode || "manual",
    checkpoint_timestamp: input.checkpointTimestamp,
  };
}
