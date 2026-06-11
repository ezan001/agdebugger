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

    assert response.status_code == 200
    diagnostic = response.json()["diagnostic"]
    assert diagnostic["parsed_payload"] is not None
    assert diagnostic["steps"]["schema_validated"]["status"] == "success"
    assert diagnostic["steps"]["workflow_message_created"]["detail"]["type"] == "GroupChatStart"
    assert diagnostic["steps"]["message_queued"]["detail"]["queue_size"] == 1

    queue = queue_response.json()
    assert len(queue) == 1
    assert queue[0]["message"]["type"] == "GroupChatStart"
    assert "GroupChatManager" in queue[0]["recipient"]


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
