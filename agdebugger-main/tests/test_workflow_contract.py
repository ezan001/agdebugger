import json
import importlib

import httpx
import pytest
from autogen_agentchat.messages import TextMessage
from autogen_agentchat.teams._group_chat._events import GroupChatStart
from pydantic import ValidationError

from agdebugger.serialization import deserialize_or_raise, serialize
from agdebugger.types import WorkflowMessagePayload

from .test_backend import get_agent_team


def test_workflow_payload_accepts_object_contract():
    payload = WorkflowMessagePayload.model_validate(
        {
            "message_type": "START_TASK",
            "content": "hello",
            "receiver": "Orchestrator",
            "session_id": 0,
            "run_mode": "auto",
        }
    )

    assert payload.content == "hello"
    assert payload.receiver == "Orchestrator"


def test_workflow_payload_accepts_json_string_contract():
    raw_payload = json.dumps(
        {
            "message_type": "SEND_MESSAGE",
            "content": {"type": "TextMessage", "source": "user", "content": "hello"},
            "receiver": "LOCAL_AGENT_1",
            "session_id": 2,
            "run_mode": "manual",
        }
    )

    payload = WorkflowMessagePayload.model_validate_json(raw_payload)
    typed_message = deserialize_or_raise(payload.content)

    assert isinstance(typed_message, TextMessage)
    assert typed_message.content == "hello"


def test_workflow_payload_rejects_missing_session_id():
    with pytest.raises(ValidationError):
        WorkflowMessagePayload.model_validate(
            {
                "message_type": "START_TASK",
                "content": "hello",
                "receiver": "Orchestrator",
            }
        )


def test_group_chat_start_never_deserializes_to_none():
    message = GroupChatStart(messages=[TextMessage(source="user", content="hello")])

    restored = deserialize_or_raise(json.dumps(serialize(message), default=str))

    assert isinstance(restored, GroupChatStart)
    assert restored.messages is not None
    assert restored.messages[0].content == "hello"


@pytest.mark.asyncio
async def test_start_task_endpoint_validates_converts_and_queues(monkeypatch):
    app_module = importlib.import_module("agdebugger.app")

    async def load_test_app(_module_str):
        return get_agent_team()

    monkeypatch.setattr(app_module, "load_app", load_test_app)
    monkeypatch.setenv("AGDEBUGGER_BACKEND_SERVE_UI", "FALSE")
    server = await app_module.get_server("unused:test")

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/workflow/messages",
            json={
                "message_type": "START_TASK",
                "content": "hello",
                "receiver": "Orchestrator",
                "session_id": 0,
                "run_mode": "manual",
            },
        )
        queue_response = await client.get("/api/getMessageQueue")
        history_response = await client.get("/api/getSessionHistory")

    assert response.status_code == 200
    diagnostic = response.json()["diagnostic"]
    assert diagnostic["parsed_payload"] is not None
    assert diagnostic["steps"]["schema_validated"]["status"] == "success"
    assert diagnostic["steps"]["workflow_message_created"]["detail"]["type"] == "GroupChatStart"
    assert diagnostic["steps"]["message_queued"]["detail"]["queue_size"] == 1
    assert diagnostic["run_id"]

    queue = queue_response.json()
    assert len(queue) == 1
    assert queue[0]["message"]["type"] == "GroupChatStart"
    assert "GroupChatManager" in queue[0]["recipient"]
    assert queue[0]["run_id"] == diagnostic["run_id"]
    assert queue[0]["run_started_at"] == diagnostic["run_started_at"]

    history_state = history_response.json()
    assert history_state["current_run_id"] == diagnostic["run_id"]
    assert history_state["runs"][0]["task"] == "hello"


@pytest.mark.asyncio
async def test_workflow_endpoint_reports_raw_body_and_expected_schema(monkeypatch):
    app_module = importlib.import_module("agdebugger.app")

    async def load_test_app(_module_str):
        return get_agent_team()

    monkeypatch.setattr(app_module, "load_app", load_test_app)
    monkeypatch.setenv("AGDEBUGGER_BACKEND_SERVE_UI", "FALSE")
    server = await app_module.get_server("unused:test")

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/workflow/messages",
            content=json.dumps(json.dumps({"message_type": "START_TASK", "content": "hello"})),
            headers={"content-type": "application/json"},
        )

    assert response.status_code == 422
    diagnostic = response.json()["detail"]
    schema_error = diagnostic["steps"]["schema_validated"]
    assert diagnostic["raw_body"]
    assert diagnostic["parsed_payload"]["content"] == "hello"
    assert "expected_schema" in schema_error["detail"]


@pytest.mark.asyncio
async def test_reset_all_clears_run_queue_history_and_diagnostics(monkeypatch):
    app_module = importlib.import_module("agdebugger.app")

    async def load_test_app(_module_str):
        return get_agent_team()

    monkeypatch.setattr(app_module, "load_app", load_test_app)
    monkeypatch.setenv("AGDEBUGGER_BACKEND_SERVE_UI", "FALSE")
    server = await app_module.get_server("unused:test")

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server),
        base_url="http://test",
    ) as client:
        start = await client.post(
            "/api/workflow/messages",
            json={
                "message_type": "START_TASK",
                "content": "hello",
                "receiver": "Orchestrator",
                "session_id": 0,
                "run_mode": "manual",
            },
        )
        assert start.status_code == 200

        reset = await client.post("/api/debugger/reset-all")
        queue = await client.get("/api/getMessageQueue")
        history = await client.get("/api/getSessionHistory")
        diagnostics = await client.get("/api/message_diagnostics")

    assert reset.status_code == 200
    assert queue.json() == []
    assert diagnostics.json() == []
    assert history.json()["current_run_id"] is None
    assert history.json()["runs"] == []
    assert history.json()["message_history"]["0"]["messages"] == []


@pytest.mark.asyncio
async def test_start_task_rejects_when_previous_queue_is_not_empty(monkeypatch):
    app_module = importlib.import_module("agdebugger.app")

    async def load_test_app(_module_str):
        return get_agent_team()

    monkeypatch.setattr(app_module, "load_app", load_test_app)
    monkeypatch.setenv("AGDEBUGGER_BACKEND_SERVE_UI", "FALSE")
    server = await app_module.get_server("unused:test")
    payload = {
        "message_type": "START_TASK",
        "content": "hello",
        "receiver": "Orchestrator",
        "session_id": 0,
        "run_mode": "manual",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server),
        base_url="http://test",
    ) as client:
        first = await client.post("/api/workflow/messages", json=payload)
        second = await client.post("/api/workflow/messages", json=payload)

    assert first.status_code == 200
    assert second.status_code == 422
    detail = second.json()["detail"]
    assert "previous task" in detail["steps"]["workflow_message_created"]["error"]


@pytest.mark.asyncio
async def test_reset_current_run_removes_only_current_run(monkeypatch):
    app_module = importlib.import_module("agdebugger.app")

    async def load_test_app(_module_str):
        return get_agent_team()

    monkeypatch.setattr(app_module, "load_app", load_test_app)
    monkeypatch.setenv("AGDEBUGGER_BACKEND_SERVE_UI", "FALSE")
    server = await app_module.get_server("unused:test")

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server),
        base_url="http://test",
    ) as client:
        start = await client.post(
            "/api/workflow/messages",
            json={
                "message_type": "START_TASK",
                "content": "hello",
                "receiver": "Orchestrator",
                "session_id": 0,
                "run_mode": "manual",
            },
        )
        run_id = start.json()["diagnostic"]["run_id"]
        reset = await client.post("/api/debugger/reset-current-run")
        queue = await client.get("/api/getMessageQueue")
        history = await client.get("/api/getSessionHistory")
        diagnostics = await client.get("/api/message_diagnostics")

    assert reset.status_code == 200
    assert reset.json()["current_run_id"] is None
    assert queue.json() == []
    assert all(run["run_id"] != run_id for run in history.json()["runs"])
    assert all(item.get("run_id") != run_id for item in diagnostics.json())
