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
} from "./shared-types";
import type { WorkflowMessageType } from "./workflow-payload";

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
  const [runStartTimestamp, setRunStartTimestamp] = useState<number>();
  const [runStartedAt, setRunStartedAt] = useState<number>();

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
    setRunStartTimestamp(
      timestamps.length > 0 ? Math.max(...timestamps) : -1,
    );
    setRunStartedAt(Date.now() / 1000);
    setDiagnostics([]);
  }, [messageQueue, sessionHistory]);

  const onDiagnostic = useCallback((diagnostic: MessageDiagnostic) => {
    setDiagnostics((previous) => [
      diagnostic,
      ...previous.filter((item) => item.id !== diagnostic.id).slice(0, 49),
    ]);
  }, []);

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
    const messages =
      memoizedSessionHistory != undefined && currentSession != undefined
        ? memoizedSessionHistory[currentSession]?.messages || []
        : [];
    return runStartTimestamp === undefined
      ? messages
      : messages.filter((message) => message.timestamp > runStartTimestamp);
  }, [currentSession, memoizedSessionHistory, runStartTimestamp]);

  const visibleMessageQueue = useMemo(
    () =>
      runStartTimestamp === undefined
        ? memoizedMessageQueue
        : memoizedMessageQueue.filter(
            (message) => message.timestamp > runStartTimestamp,
          ),
    [memoizedMessageQueue, runStartTimestamp],
  );

  const visibleSessionHistory = useMemo<MessageHistoryMap | undefined>(() => {
    if (currentSession === undefined) return undefined;
    const current = memoizedSessionHistory?.[currentSession];
    if (!current) return undefined;
    return {
      [currentSession]: {
        ...current,
        messages: visibleMessages,
      },
    };
  }, [currentSession, memoizedSessionHistory, visibleMessages]);

  const visibleDiagnostics = useMemo(
    () =>
      runStartedAt === undefined
        ? diagnostics
        : diagnostics.filter(
            (diagnostic) => diagnostic.created_at >= runStartedAt,
          ),
    [diagnostics, runStartedAt],
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
            <AgentList agents={memoizedAgents} />
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
              <MessageList messageHistory={visibleMessages} />

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
            messageQueue={visibleMessageQueue}
            diagnostics={visibleDiagnostics}
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
