import json
import logging
import os
import time
from typing import List

from autogen_agentchat.messages import TextMessage
from autogen_agentchat.teams._group_chat._events import GroupChatStart
from autogen_core import EVENT_LOGGER_NAME
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .backend import BackendRuntimeManager
from .intervention_utils import write_file_async
from .serialization import deserialize, deserialize_or_raise, serialize
from .types import (
    EditHistoryMessage,
    EditQueueMessage,
    PublishMessage,
    SendMessage,
    WorkflowMessagePayload,
)
from .utils import load_app, message_to_json

# alt would be TRACE_LOGGER_NAME
logger = logging.getLogger(EVENT_LOGGER_NAME)
logger.setLevel(logging.DEBUG)


async def get_server(module_str: str, message_history=None, state_cache=None) -> FastAPI:
    origins = [
        "http://localhost",
        "http://localhost:5173",
        "http://localhost:*",
    ]
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    api = FastAPI(root_path="/api")
    app.mount("/api", api)
    package_folder = os.path.dirname(os.path.abspath(__file__))
    ui_candidates = [
        os.path.join(package_folder, "web", "dist"),
        os.path.abspath(os.path.join(package_folder, "..", "..", "frontend", "dist")),
    ]
    ui_folder_path = next((path for path in ui_candidates if os.path.isdir(path)), ui_candidates[0])
    if os.environ.get("AGDEBUGGER_BACKEND_SERVE_UI", "TRUE") == "TRUE":
        app.mount("/", StaticFiles(directory=ui_folder_path, html=True), name="ui")

    # load app and make backend
    loaded_gc = await load_app(module_str)
    backend = BackendRuntimeManager(loaded_gc, logger, message_history, state_cache)
    await backend.async_initialize()

    @api.get("/agents")
    async def get_agent_list() -> List[str]:
        if not backend.ready:
            print("Agents not ready yet...")
            return []
        return backend.agent_names

    @api.get("/getMessageQueue")
    async def get_messages():
        message_queue = [message_to_json(msg) for msg in backend.message_queue_list]
        return message_queue

    @api.get("/getSessionHistory")
    async def getSessionHistory():
        saved_sessions = backend.read_current_session_history()

        return {
            "current_session": backend.session_counter,
            "message_history": saved_sessions,
        }

    @api.get("/num_tasks")
    async def get_outstanding_tasks() -> int:
        return backend.unprocessed_messages_count

    @api.post("/drop")
    async def drop():
        if backend.unprocessed_messages_count == 0:
            return {"status": "ok"}

        backend.intervention_handler.drop = True
        await backend.process_next()
        return {"status": "ok"}

    @api.post("/step")
    async def step():
        if backend.unprocessed_messages_count == 0:
            return {"status": "ok"}
        await backend.process_next()
        return {"status": "ok"}

    @api.post("/start_loop")
    async def start_loop():
        backend.start_processing()
        return {"status": "ok"}

    @api.post("/stop_loop")
    async def stop_loop():
        await backend.stop_processing()
        return {"status": "ok"}

    @api.get("/loop_status")
    async def loop_status() -> bool:
        return backend.is_processing

    @api.get("/message_types")
    async def message_types():
        return backend.message_info

    @api.get("/topics")
    async def topics() -> List[str]:
        return backend.all_topics

    @api.get("/message_diagnostics")
    async def message_diagnostics():
        diagnostics = backend.message_diagnostics
        if diagnostics and diagnostics[0].get("steps", {}).get("first_agent_processed", {}).get("status") == "pending":
            diagnostic = diagnostics[0]
            processed = [
                item
                for item in backend.intervention_handler.history[diagnostic.get("history_count_before", 0) :]
                if getattr(item.message, "sender", None) is not None
            ]
            if processed:
                diagnostic["steps"]["first_agent_processed"] = {
                    "status": "success",
                    "detail": message_to_json(processed[0].message, processed[0].timestamp),
                }
        return diagnostics

    @api.post("/workflow/messages")
    async def workflow_message(request: Request):
        raw_bytes = await request.body()
        raw_body = raw_bytes.decode("utf-8", errors="replace")
        diagnostic = {
            "id": f"message-{time.time_ns()}",
            "created_at": time.time(),
            "history_count_before": len(backend.intervention_handler.history),
            "raw_body": raw_body,
            "parsed_payload": None,
            "steps": {
                "payload_generated": {"status": "success"},
                "payload_sent": {"status": "success"},
                "raw_body_received": {"status": "success", "detail": raw_body},
                "schema_validated": {"status": "pending"},
                "workflow_message_created": {"status": "pending"},
                "message_queued": {"status": "pending"},
                "workflow_started": {"status": "pending"},
                "first_agent_processed": {"status": "pending"},
            },
        }
        backend.add_diagnostic(diagnostic)

        try:
            parsed_payload = json.loads(raw_body)
            if isinstance(parsed_payload, str):
                parsed_payload = json.loads(parsed_payload)
            diagnostic["parsed_payload"] = parsed_payload
            payload = WorkflowMessagePayload.model_validate(parsed_payload)
            diagnostic["steps"]["schema_validated"] = {
                "status": "success",
                "detail": payload.model_dump(),
            }
        except Exception as exc:
            diagnostic["steps"]["schema_validated"] = {
                "status": "error",
                "error": str(exc),
                "detail": {
                    "raw_body": raw_body,
                    "parsed_payload": diagnostic["parsed_payload"],
                    "expected_schema": WorkflowMessagePayload.model_json_schema(),
                },
            }
            raise HTTPException(status_code=422, detail=diagnostic) from exc

        try:
            if payload.message_type in ("RESET_AND_EDIT", "RETRY_FROM_HERE"):
                if payload.checkpoint_timestamp is None:
                    raise ValueError(f"{payload.message_type} requires checkpoint_timestamp")
                new_message = None
                if payload.message_type == "RESET_AND_EDIT":
                    if payload.content in (None, ""):
                        raise ValueError("RESET_AND_EDIT requires content")
                    new_message = deserialize_or_raise(payload.content)
                diagnostic["steps"]["workflow_message_created"] = {
                    "status": "success",
                    "detail": payload.content,
                }
                await backend.edit_and_revert_message(new_message, payload.checkpoint_timestamp)
                diagnostic["steps"]["message_queued"] = {
                    "status": "success",
                    "detail": {"queue_size": backend.unprocessed_messages_count},
                }
            else:
                receiver = payload.receiver or ("Orchestrator" if payload.message_type == "START_TASK" else None)
                if receiver is None:
                    raise ValueError("SEND_MESSAGE requires receiver")

                if payload.message_type == "START_TASK" and isinstance(payload.content, str):
                    typed_message = GroupChatStart(
                        messages=[TextMessage(source="user", content=payload.content)]
                    )
                elif payload.message_type == "SEND_MESSAGE" and isinstance(payload.content, str):
                    typed_message = GroupChatStart(
                        messages=[TextMessage(source="user", content=payload.content)]
                    )
                else:
                    typed_message = deserialize_or_raise(payload.content)
                if typed_message is None:
                    raise ValueError("Message conversion produced None")

                diagnostic["steps"]["workflow_message_created"] = {
                    "status": "success",
                    "detail": serialize(typed_message),
                }
                queue_size = await backend.enqueue_message(typed_message, receiver)
                diagnostic["steps"]["message_queued"] = {
                    "status": "success",
                    "detail": {"queue_size": queue_size, "receiver": receiver},
                }

            if payload.run_mode == "auto":
                if backend.is_processing:
                    workflow_status = "already_running"
                else:
                    backend.start_processing()
                    workflow_status = "started"
            else:
                workflow_status = "ready_for_manual_step"
            diagnostic["steps"]["workflow_started"] = {
                "status": "success",
                "detail": workflow_status,
            }
            return {"status": "ok", "diagnostic": diagnostic}
        except Exception as exc:
            for step_name in ("workflow_message_created", "message_queued", "workflow_started"):
                if diagnostic["steps"][step_name]["status"] == "pending":
                    diagnostic["steps"][step_name] = {"status": "error", "error": str(exc)}
                    break
            raise HTTPException(status_code=422, detail=diagnostic) from exc

    @api.get("/state/{name}/get")
    async def get_config(name: str):
        try:
            config = await backend.get_agent_config(name)
            return config
        except Exception as e:
            print("Error getting state: ", e)
            return {"status": "error", "message": str(e)}

    @api.post("/publish")
    async def publish_message(message: PublishMessage):
        if message.body is None:
            return {"status": "error", "message": "Message body cannot be None"}

        new_message = deserialize(message.body)
        backend.publish_message(new_message, message.topic)
        return {"status": "ok"}

    @api.post("/send")
    async def send_message(message: SendMessage):
        if message.body is None:
            return {"status": "error", "message": "Message body cannot be None"}
        try:
            new_message = deserialize_or_raise(message.body)
            await backend.enqueue_message(new_message, message.recipient)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e)) from e

        return {"status": "ok"}

    @api.post("/editQueue")
    async def edit_message_queue(edit_message: EditQueueMessage):
        print("Editing message at index ", edit_message.idx, "with new content: ", edit_message.body)

        if edit_message.body is None:
            return {"status": "error", "message": "Messgage body cannot be None"}

        try:
            new_message = deserialize(edit_message.body)
            await backend.edit_message_queue(new_message, edit_message.idx)
        except Exception as e:
            return {"status": "error", "message": e}

        return {"status": "ok"}

    @api.post("/editAndRevertHistoryMessage")
    async def edit_and_revert_message(edit_message: EditHistoryMessage):
        try:
            if edit_message.body is not None:
                new_message = deserialize(edit_message.body)
            else:
                new_message = None
            await backend.edit_and_revert_message(new_message, edit_message.timestamp)
        except Exception as e:
            return {"status": "error", "message": e}

        return {"status": "ok"}

    @api.get("/logs")
    async def get_logs():
        return backend.log_handler.get_log_messages()

    @api.post("/save_to_file")
    async def save_to_file():
        await write_file_async("history.pickle", backend.intervention_handler.history)
        await write_file_async("cache.pickle", backend.agent_checkpoints)

        return {"status": "ok"}

    return app
