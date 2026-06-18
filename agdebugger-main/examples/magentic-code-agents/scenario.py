import asyncio
import re
import sys
from pathlib import Path

from autogen_agentchat.agents import (
    ApprovalRequest,
    ApprovalResponse,
    AssistantAgent,
    CodeExecutorAgent,
)
from autogen_agentchat.teams import MagenticOneGroupChat
from autogen_agentchat.ui import Console
from autogen_ext.agents.web_surfer import MultimodalWebSurfer
from autogen_ext.code_executors.local import LocalCommandLineCodeExecutor
from autogen_ext.models.openai import OpenAIChatCompletionClient


WORKSPACE = Path(__file__).resolve().parent / "workspace"
EXECUTION_TIMEOUT_SECONDS = 20

DANGEROUS_CODE_PATTERNS = [
    r"\bos\.system\s*\(",
    r"\bsubprocess\.",
    r"\bshutil\.rmtree\s*\(",
    r"\bPath\s*\([^)]*[\"']~",
    r"\bopen\s*\([^)]*[\"'](?:[A-Za-z]:\\|/)",
    r"\b__import__\s*\(",
    r"\beval\s*\(",
    r"\bexec\s*\(",
]


def approve_python_only(request: ApprovalRequest) -> ApprovalResponse:
    """Allow small Python snippets, reject shell/system-style operations."""
    code = request.code
    for pattern in DANGEROUS_CODE_PATTERNS:
        if re.search(pattern, code):
            return ApprovalResponse(
                approved=False,
                reason=f"Rejected potentially unsafe code pattern: {pattern}",
            )
    return ApprovalResponse(
        approved=True,
        reason="Approved for execution inside the scenario workspace.",
    )


async def get_agent_team():
    WORKSPACE.mkdir(parents=True, exist_ok=True)

    model_client = OpenAIChatCompletionClient(model="gpt-4o")

    surfer = MultimodalWebSurfer(
        "WebSurfer",
        model_client=model_client,
    )

    coder = AssistantAgent(
        "PythonCoder",
        model_client=model_client,
        description=(
            "Writes concise Python code for arithmetic, text processing, "
            "data cleaning, and answer-format validation."
        ),
        system_message=(
            "You are PythonCoder. Write short, deterministic Python snippets "
            "when calculation, counting, parsing, or format validation is useful. "
            "Do not use shell commands. Do not access user directories or files "
            "outside the provided task context. If code is needed, provide only "
            "a ```python code block and a brief note about what it computes."
        ),
    )

    code_executor = LocalCommandLineCodeExecutor(
        timeout=EXECUTION_TIMEOUT_SECONDS,
        work_dir=WORKSPACE,
        cleanup_temp_files=True,
    )
    executor = CodeExecutorAgent(
        "PythonExecutor",
        code_executor=code_executor,
        description=(
            "Executes approved Python code in the local scenario workspace only. "
            "Used for calculations, text processing, and format checks."
        ),
        system_message=(
            "You are PythonExecutor. Execute only Python code blocks that are "
            "needed for the task. Do not run shell commands. Do not read or write "
            "outside the configured workspace."
        ),
        supported_languages=["python"],
        approval_func=approve_python_only,
    )

    team = MagenticOneGroupChat(
        [surfer, coder, executor],
        model_client=model_client,
        max_turns=30,
        max_stalls=3,
    )

    return team


async def main() -> None:
    team = await get_agent_team()

    await Console(
        team.run_stream(
            task=(
                "Open https://example.com, count the number of words in the "
                "main paragraph using Python, and answer with only the number."
            )
        )
    )


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
