// src/App.tsx
import { Container, Section, Bar } from "@column-resizer/react";
import _ from "lodash";
import React, { useEffect, useState, useMemo, useCallback } from "react";

import { api, step } from "./api.ts";
import AgentList from "./components/AgentList.tsx";
import ConversationOverview from "./components/ConversationOverview.tsx";
import LogList from "./components/LogList.tsx";
import MessageDiagnostics from "./components/MessageDiagnostics.tsx";
import MessageList from "./components/MessageList.tsx";
import MessageQueue from "./components/MessageQueue.tsx";
import RunControls from "./components/RunControls.tsx";
import SendMessage from "./components/SendMessage.tsx";
import type {
  AgentName,
  Message,
  LogMessage,
  MessageHistoryMap,
  MessageHistoryState,
  MessageDiagnostic,
  RunInfo,
} from "./shared-types";
import type { WorkflowMessageType } from "./workflow-payload";
import { getAgentBaseName } from "./utils/display-name";
import {
  analyzeTrace,
  getReadableMessageContent,
  getUserTraceMessages,
} from "./utils/trace-display";

const RUN_START_TIMESTAMP_KEY = "agdebugger.runStartTimestamp";
const RUN_STARTED_AT_KEY = "agdebugger.runStartedAt";

const App: React.FC = () => {
  const [agents, setAgents] = useState<AgentName[]>([]);
  const [timeStep, setTimeStep] = useState<number>(0);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [numTasks, setNumTasks] = useState<number>(0);
  const [loopRunning, setLoopRunning] = useState<boolean>(false);
  const [messageQueue, setMessageQueue] = useState<Message[]>([]);
  const [sessionHistory, setSessionHistory] = useState<
    MessageHistoryMap | undefined
  >(undefined);
  const [currentSession, setCurrentSession] = useState<number | undefined>(
    undefined,
  );
  const [diagnostics, setDiagnostics] = useState<MessageDiagnostic[]>([]);
  const [runStartTimestamp, setRunStartTimestamp] = useState<
    number | undefined
  >(() => {
    const value = sessionStorage.getItem(RUN_START_TIMESTAMP_KEY);
    return value === null ? undefined : Number(value);
  });
  const [runStartedAt, setRunStartedAt] = useState<number | undefined>(() => {
    const value = sessionStorage.getItem(RUN_STARTED_AT_KEY);
    return value === null ? undefined : Number(value);
  });
  const [showFullTrace, setShowFullTrace] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string>();
  const [runs, setRuns] = useState<RunInfo[]>([]);

  // timer to poll backend
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeStep(timeStep + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeStep]);

  useEffect(() => {
    api
      .get<AgentName[]>("/agents")
      .then((response) => {
        setAgents((prev) =>
          _.isEqual(prev, response.data) ? prev : response.data,
        );
      })
      .catch((error) => console.error("Error fetching agents:", error));

    api
      .get<Message[]>("/getMessageQueue")
      .then((response) => {
        setMessageQueue((prev) =>
          _.isEqual(prev, response.data) ? prev : response.data,
        );
      })
      .catch((error) => console.error("Error fetching messages:", error));

    api
      .get<LogMessage[]>("/logs")
      .then((response) =>
        setLogs((prev) =>
          _.isEqual(prev, response.data) ? prev : response.data,
        ),
      )
      .catch((error) => console.error("Error fetching logs:", error));

    api
      .get<number>("/num_tasks")
      .then((response) =>
        setNumTasks((prev) =>
          _.isEqual(prev, response.data) ? prev : response.data,
        ),
      )
      .catch((error) => console.error("Error fetching tasks:", error));

    api
      .get<MessageHistoryState>("/getSessionHistory")
      .then((response) => {
        const historyState = response.data;

        setSessionHistory((prev) =>
          _.isEqual(prev, historyState.message_history)
            ? prev
            : historyState.message_history,
        );
        setCurrentSession((prev) =>
          _.isEqual(prev, historyState.current_session)
            ? prev
            : historyState.current_session,
        );
        setCurrentRunId(historyState.current_run_id || undefined);
        setRuns(historyState.runs || []);
      })
      .catch((error) => console.error("Error fetching history:", error));

    api
      .get<boolean>("/loop_status")
      .then((response) => {
        setLoopRunning((prev) =>
          _.isEqual(prev, response.data) ? prev : response.data,
        );
      })
      .catch((error) => console.error("Error fetching loop_status:", error));

    api
      .get<MessageDiagnostic[]>("/message_diagnostics")
      .then((response) => {
        setDiagnostics((prev) =>
          _.isEqual(prev, response.data) ? prev : response.data,
        );
      })
      .catch((error) => console.error("Error fetching diagnostics:", error));
  }, [timeStep]);

  const onProcessNext = useCallback(() => {
    step(() => setTimeStep((prev) => prev + 1));
  }, []);

  const onDropNext = useCallback(() => {
    api
      .post("/drop")
      .then((response) => {
        console.log("Message dropped:", response.data);
        setTimeStep((prev) => prev + 1);
      })
      .catch((error) => console.error("Error dropping next:", error));
  }, []);

  const onSend = useCallback((_messageType: WorkflowMessageType) => {
    setTimeStep((prev) => prev + 1);
  }, []);

  const onStartTask = useCallback(() => {
    const timestamps = [
      ...Object.values(sessionHistory || {}).flatMap((session) =>
        session.messages.map((message) => message.timestamp),
      ),
      ...messageQueue.map((message) => message.timestamp),
    ];
    const startTimestamp =
      timestamps.length > 0 ? Math.max(...timestamps) : -1;
    const startedAt = Date.now() / 1000;
    setRunStartTimestamp(startTimestamp);
    setRunStartedAt(startedAt);
    setCurrentRunId(undefined);
    sessionStorage.setItem(RUN_START_TIMESTAMP_KEY, String(startTimestamp));
    sessionStorage.setItem(RUN_STARTED_AT_KEY, String(startedAt));
    setDiagnostics([]);
  }, [messageQueue, sessionHistory]);

  const onDiagnostic = useCallback((diagnostic: MessageDiagnostic) => {
    if (diagnostic.run_id) setCurrentRunId(diagnostic.run_id);
    setDiagnostics((previous) => [
      diagnostic,
      ...previous.filter((item) => item.id !== diagnostic.id).slice(0, 49),
    ]);
  }, []);

  const clearFrontendRunState = useCallback(() => {
    setCurrentRunId(undefined);
    setRunStartTimestamp(undefined);
    setRunStartedAt(undefined);
    setDiagnostics([]);
    setMessageQueue([]);
    setShowAllHistory(false);
    sessionStorage.removeItem(RUN_START_TIMESTAMP_KEY);
    sessionStorage.removeItem(RUN_STARTED_AT_KEY);
  }, []);

  const onClearCurrentRun = useCallback(async () => {
    await api.post("/debugger/reset-current-run");
    clearFrontendRunState();
    setTimeStep((prev) => prev + 1);
  }, [clearFrontendRunState]);

  const onClearAllHistory = useCallback(async () => {
    await api.post("/debugger/reset-all");
    clearFrontendRunState();
    setSessionHistory(undefined);
    setRuns([]);
    setCurrentSession(0);
    setLogs([]);
    setTimeStep((prev) => prev + 1);
  }, [clearFrontendRunState]);

  const setLoop = useCallback((state: "start" | "stop") => {
    if (state === "start") {
      api
        .post("/start_loop")
        .then(() => {
          setLoopRunning(true);
        })
        .catch((error) => console.error("Error starting loop:", error));
    } else {
      api
        .post("/stop_loop")
        .then(() => {
          setLoopRunning(false);
        })
        .catch((error) => console.error("Error stopping loop:", error));
    }
  }, []);

  const memoizedAgents = useMemo(() => agents, [agents]);
  const memoizedLogs = useMemo(() => logs, [logs]);
  const memoizedMessageQueue = useMemo(() => messageQueue, [messageQueue]);
  const memoizedSessionHistory = useMemo(
    () => sessionHistory,
    [sessionHistory],
  );

  const visibleMessages = useMemo(() => {
    if (showAllHistory && memoizedSessionHistory != undefined) {
      return Object.values(memoizedSessionHistory).flatMap(
        (session) => session.messages,
      );
    }
    const messages =
      memoizedSessionHistory != undefined && currentSession != undefined
        ? memoizedSessionHistory[currentSession]?.messages || []
        : [];
    if (!currentRunId && runs.length > 0) return [];
    if (currentRunId && messages.some((message) => message.run_id)) {
      return messages.filter((message) => message.run_id === currentRunId);
    }
    if (
      runStartedAt !== undefined &&
      messages.some((message) => message.run_started_at)
    ) {
      return messages.filter(
        (message) => message.run_started_at === runStartedAt,
      );
    }
    return runStartTimestamp === undefined
      ? messages
      : messages.filter((message) => message.timestamp > runStartTimestamp);
  }, [
    currentRunId,
    currentSession,
    memoizedSessionHistory,
    runStartTimestamp,
    runStartedAt,
    runs.length,
    showAllHistory,
  ]);

  useEffect(() => {
    if (runStartTimestamp === undefined || sessionHistory === undefined) return;
    const timestamps = Object.values(sessionHistory).flatMap((session) =>
      session.messages.map((message) => message.timestamp),
    );
    if (
      timestamps.length > 0 &&
      Math.max(...timestamps) < runStartTimestamp
    ) {
      setRunStartTimestamp(undefined);
      setRunStartedAt(undefined);
      sessionStorage.removeItem(RUN_START_TIMESTAMP_KEY);
      sessionStorage.removeItem(RUN_STARTED_AT_KEY);
    }
  }, [runStartTimestamp, sessionHistory]);

  const traceAnalysis = useMemo(
    () => analyzeTrace(visibleMessages),
    [visibleMessages],
  );

  const displayMessages = showFullTrace
    ? visibleMessages
    : traceAnalysis.visibleMessages;

  const visibleMessageQueue = useMemo(
    () =>
      showAllHistory
        ? memoizedMessageQueue
        : currentRunId && memoizedMessageQueue.some((message) => message.run_id)
        ? memoizedMessageQueue.filter(
            (message) => message.run_id === currentRunId,
          )
        : runStartTimestamp === undefined
          ? memoizedMessageQueue
          : memoizedMessageQueue.filter(
              (message) => message.timestamp > runStartTimestamp,
            ),
    [currentRunId, memoizedMessageQueue, runStartTimestamp, showAllHistory],
  );

  const displayMessageQueue = useMemo(
    () => getUserTraceMessages(visibleMessageQueue, showFullTrace),
    [showFullTrace, visibleMessageQueue],
  );

  const visibleSessionHistory = useMemo<MessageHistoryMap | undefined>(() => {
    if (currentSession === undefined) return undefined;
    const current = memoizedSessionHistory?.[currentSession];
    if (!current) return undefined;
    return {
      [currentSession]: {
        ...current,
        messages: displayMessages,
      },
    };
  }, [currentSession, displayMessages, memoizedSessionHistory]);

  const visibleDiagnostics = useMemo(
    () =>
      showAllHistory
        ? diagnostics
        : currentRunId && diagnostics.some((diagnostic) => diagnostic.run_id)
        ? diagnostics.filter(
            (diagnostic) => diagnostic.run_id === currentRunId,
          )
        : runStartedAt === undefined
          ? diagnostics
          : diagnostics.filter(
              (diagnostic) => diagnostic.created_at >= runStartedAt,
            ),
    [currentRunId, diagnostics, runStartedAt, showAllHistory],
  );

  const currentRun = useMemo(
    () => runs.find((run) => run.run_id === currentRunId),
    [currentRunId, runs],
  );

  const agentsUsed = useMemo(
    () =>
      Array.from(
        new Set(
          visibleMessages
            .flatMap((message) => [message.sender, message.recipient])
            .filter((name): name is string => Boolean(name))
            .map(getAgentBaseName)
            .filter((name) => !["User", "Group", "Unknown"].includes(name)),
        ),
      ),
    [visibleMessages],
  );

  const finalAnswer = useMemo(
    () =>
      [...traceAnalysis.visibleMessages]
        .reverse()
        .map(getReadableMessageContent)
        .find(Boolean) || "",
    [traceAnalysis.visibleMessages],
  );

  const errorSummary = useMemo(
    () =>
      visibleDiagnostics
        .flatMap((diagnostic) =>
          Object.entries(diagnostic.steps)
            .filter(
              ([, step]) =>
                step.status === "error" || step.status === "failed",
            )
            .map(([name, step]) => `${name}: ${step.error || "error"}`),
        )
        .join("; "),
    [visibleDiagnostics],
  );

  const memoizedRunControls = useMemo(
    () => (
      <RunControls
        onProcessNext={onProcessNext}
        onDropNext={onDropNext}
        loopRunning={loopRunning}
        setLoop={setLoop}
        messagesAreHere={memoizedMessageQueue.length > 0}
      />
    ),
    [
      onProcessNext,
      onDropNext,
      loopRunning,
      setLoop,
      memoizedMessageQueue.length,
    ],
  );

  return (
    <div className="bg-gray-100 text-gray-900 flex flex-col min-h-screen">
      <header className="bg-primary-900 text-white p-3 flex">
        <h1 className="text-2xl">AGDebugger 工作流调试器</h1>
      </header>

      {/* body */}
      <div className="flex grow">
        <div className="flex flex-col grow">
          <div className="border-b-2 border-b-gray-200 px-4 py-4 bg-gray-100 sticky top-0 z-10">
            <AgentList agents={memoizedAgents} observedAgents={agentsUsed} />
          </div>
          <Container className="grow">
            <Section
              minSize={525}
              defaultSize={525}
              className="py-2 px-4 space-y-2 sticky top-20 z-5 h-screen"
            >
              <SendMessage
                agents={memoizedAgents}
                onSend={onSend}
                onStartTask={onStartTask}
                onDiagnostic={onDiagnostic}
                currentSession={currentSession ?? 0}
                checkpointTimestamps={
                  memoizedSessionHistory != undefined &&
                  currentSession != undefined
                    ? memoizedSessionHistory[currentSession].messages.map(
                        (message) => message.timestamp,
                      )
                    : []
                }
              />
              <MessageDiagnostics diagnostics={visibleDiagnostics} />
              <MessageQueue
                messages={memoizedMessageQueue}
                numOutstandingTasks={numTasks}
                runControls={memoizedRunControls}
              />
            </Section>

            <Bar
              size={2}
              className="transition bg-gray-200 hover:bg-primary-800 active:bg-primary-800 cursor-col-resize"
            />

            <Section minSize={300} className="space-y-4 p-4">
              <MessageList
                messageHistory={displayMessages}
                rawMessageCount={visibleMessages.length}
                showFullTrace={showFullTrace}
                onShowFullTraceChange={setShowFullTrace}
                showAllHistory={showAllHistory}
                onShowAllHistoryChange={setShowAllHistory}
                runSummary={{
                  task: currentRun?.task || "",
                  runId: currentRunId || "",
                  finalAnswer,
                  normalMessageCount: traceAnalysis.visibleMessages.length,
                  fullTraceCount: visibleMessages.length,
                  hiddenInternalCount: traceAnalysis.hiddenInternalCount,
                  foldedDuplicateCount: traceAnalysis.foldedDuplicateCount,
                  errorEventCount:
                    traceAnalysis.errorEventCount +
                    visibleDiagnostics.filter((diagnostic) =>
                      Object.values(diagnostic.steps).some(
                        (step) =>
                          step.status === "error" ||
                          step.status === "failed",
                      ),
                    ).length,
                  noResultCount: traceAnalysis.noResultCount,
                  noProgressCount: traceAnalysis.noProgressCount,
                  formatWarningCount: traceAnalysis.formatWarningCount,
                  agentsUsed,
                  errorSummary,
                }}
                onBranchCreated={(runId) => {
                  setCurrentRunId(runId);
                  setShowAllHistory(false);
                  setTimeStep((prev) => prev + 1);
                }}
                onClearCurrentRun={onClearCurrentRun}
                onClearAllHistory={onClearAllHistory}
              />

              <hr />

              <LogList logs={memoizedLogs} />
            </Section>
          </Container>
        </div>

        {visibleSessionHistory != undefined && currentSession != undefined && (
          <ConversationOverview
            messageHistoryData={visibleSessionHistory}
            currentSession={currentSession}
            agents={memoizedAgents}
            messageQueue={displayMessageQueue}
            diagnostics={visibleDiagnostics}
            currentRunId={currentRunId}
            currentRun={currentRun}
          />
        )}
      </div>

      {/* <footer className="bg-gray-800 text-white p-4">
        <p>&copy; 2024 Microsoft</p>
      </footer> */}
    </div>
  );
};

export default App;
