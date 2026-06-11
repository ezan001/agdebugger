export interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
}

export interface MessageTypeDescription {
  name: string;
  fields?: FieldInfo[];
}

export interface Message {
  type: string;
  message: object;
  recipient: string | null;
  sender: string | null;
  drop?: boolean;
  timestamp: number;
  id: number; // python object id
  run_id?: string | null;
  run_started_at?: number | null;
  trace_status?: TraceStatus;
  folded_count?: number;
}

export type TraceStatus =
  | "success"
  | "no_result"
  | "runtime_error"
  | "no_progress"
  | "format_warning";

export interface MessageHistoryState {
  current_session: number;
  message_history: MessageHistoryMap;
  current_run_id?: string | null;
  runs?: RunInfo[];
}

export interface RunInfo {
  run_id: string;
  task?: string | null;
  started_at: number;
  start_timestamp: number;
  parent_run_id?: string | null;
  branch_from_timestamp?: number;
  branch_type?: string;
}

export interface MessageHistoryMap {
  [sessionId: number]: MessageHistory;
}

export interface ScoreResult {
  passed: boolean;
  first_timestamp: number | undefined;
  expected?: string;
  actual?: string;
}

export interface MessageHistory {
  messages: Message[];
  current_session_reset_from?: number;
  next_session_starts_at?: number;
  current_session_score?: ScoreResult;
}

export interface LogMessage {
  message: string;
  level: string;
  name: string;
  time: number;
}

export type AgentName = string;

export type GenericMessage = {
  [key: string]: unknown;
};

export interface AnnotationState {
  name: string;
  description: string;
  tags?: string[];
}

export interface MessageAnnotation {
  annotations?: AnnotationState[];
  timestamp: number;
}

export interface ErrorSpan {
  error: string;
  start_index: number;
  end_index: number;
  quote: string;
  explanation: string;
}

export interface ErrorSummary {
  summary: string;
  tags: ErrorSpan[];
}

export interface AgentConfig {
  [key: string]: string;
}

export interface TaskInfo {
  prompt: string;
  expected_answer: string;
  annotator_steps: string;
}

export interface CurrentStudyTasks {
  current_task: string;
  all_tasks: { [key: string]: TaskInfo };
}

export type colorOption = "none" | "type" | "sender" | "recipient";

export type ResetMap = { [key: number]: number };

export type DiagnosticStatus = "pending" | "success" | "error" | "failed";

export interface DiagnosticStep {
  status: DiagnosticStatus;
  detail?: unknown;
  error?: string;
}

export interface MessageDiagnostic {
  id: string;
  created_at: number;
  run_id?: string | null;
  run_started_at?: number;
  run_start_timestamp?: number;
  raw_body?: string;
  parsed_payload?: unknown;
  steps: Record<string, DiagnosticStep>;
}
