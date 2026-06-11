import { AngleDown } from "flowbite-react-icons/outline";
import { useState } from "react";

import GrowTextarea from "../common/GrowTextarea";
import type { MessageDisplayProps } from "./MessageDisplayProps";
import { formatReadableContent } from "../../utils/trace-display";

const GroupChatAgentDisplay: React.FC<MessageDisplayProps> = ({
  messageDict,
  allowEdit = false,
  setMessage,
  type,
}) => {
  const [showDetails, setShowDetails] = useState<boolean>(false);

  function getValue(message): unknown {
    if (type === "GroupChatAgentResponse") {
      return (
        message?.response?.chat_message?.content ||
        message?.agent_response?.chat_message?.content ||
        ""
      );
    }
    if (type === "GroupChatMessage" || type === "GroupChatTermination") {
      return message?.message?.content || "";
    }
    if (type === "GroupChatStart") {
      return message?.messages?.[0]?.content || "";
    }
  }

  const rawValue = getValue(messageDict);
  const readableValue = formatReadableContent(rawValue);
  const canEditValue = allowEdit && typeof rawValue === "string";

  function setValue(s: string) {
    setMessage((prev) => {
      const updatedMessage = structuredClone(prev);

      if (type === "GroupChatAgentResponse") {
        const responseKey =
          updatedMessage.response !== undefined ? "response" : "agent_response";
        updatedMessage[responseKey].chat_message.content = s;
      } else if (
        type === "GroupChatMessage" ||
        type === "GroupChatTermination"
      ) {
        updatedMessage.message.content = s;
      } else if (type === "GroupChatStart") {
        updatedMessage.messages[0].content = s;
      }

      return updatedMessage;
    });
  }

  return (
    <div>
      {canEditValue ? (
        <div>
          <GrowTextarea
            onChange={(e) => setValue(e.target.value)}
            value={rawValue as string}
            className="border-white bg-white font-mono hover:bg-gray-50 focus:bg-gray-50"
          />
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">
          {readableValue ||
            (type === "GroupChatTermination" ? "任务成功结束" : "")}
        </p>
      )}
      <div className="flex justify-end">
        <button
          className="hover:bg-gray-100 rounded p-1 flex items-center text-sm text-gray-400 my-1"
          onClick={(e) => {
            e.preventDefault();
            setShowDetails(!showDetails);
          }}
        >
          <AngleDown
            size={15}
            className={` ${showDetails ? "" : "-rotate-90"}`}
          />
          <p>Details</p>
        </button>
      </div>
      {showDetails && (
        <pre className="font-mono text-sm text-wrap break-all">
          {JSON.stringify(messageDict, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default GroupChatAgentDisplay;
