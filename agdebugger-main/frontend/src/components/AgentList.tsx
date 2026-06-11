import type { AgentName } from "../shared-types";
import { getAgentBaseName, getDisplayName } from "../utils/display-name";
import AgentCard from "./AgentCard.tsx";

interface AgentListProps {
  agents: AgentName[];
  observedAgents?: AgentName[];
}

const AgentList: React.FC<AgentListProps> = (props) => {
  const sourceAgents =
    props.agents.length > 0 ? props.agents : props.observedAgents || [];
  const teamAgents = Array.from(
    new Map(
      sourceAgents.map((agent) => [getAgentBaseName(agent), agent]),
    ).values(),
  );
  const orchestrators = teamAgents.filter((agent) =>
    getAgentBaseName(agent).toLowerCase().includes("orchestrator"),
  );
  const toolAgents = teamAgents.filter(
    (agent) => !orchestrators.includes(agent),
  );
  const formatAgent = (agent: string) =>
    `${getDisplayName(agent)} (${getAgentBaseName(agent)})`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">
          当前团队：{teamAgents.length} 个 Agent
        </span>
        {orchestrators.length > 0 && (
          <span title={orchestrators.join(", ")}>
            总控 Agent：{orchestrators.map(formatAgent).join("、")}
          </span>
        )}
        {toolAgents.length > 0 && (
          <span title={toolAgents.join(", ")}>
            工具 Agent：{toolAgents.map(formatAgent).join("、")}
          </span>
        )}
      </div>
      <div className="flex gap-4 items-center">
        {teamAgents.map((agent) => (
          <AgentCard key={agent} agent={agent} />
        ))}
        <div className="grow"></div>
      </div>
    </div>
  );
};

export default AgentList;
