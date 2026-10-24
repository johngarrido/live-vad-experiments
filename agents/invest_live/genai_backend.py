"""Backend alternativo: Gemini Live direto pelo genai SDK, sem ADK.

Faz à mão o que o ADK faz no backend padrão:
- declara as tools a partir da spec OpenAPI da API mock e executa as chamadas via httpx;
- injeta o account_id do cliente (o modelo nem vê esse parâmetro);
- preenche o prompt com o perfil do cliente;
- guarda o handle de session resumption por sessão, para reconectar (troca de VAD ou
  de modalidade) sem perder o contexto.

Para a webapp nada muda: as mensagens do Live API são traduzidas para o mesmo formato
JSON dos eventos do ADK (inputTranscription, content.parts, voiceActivity…), e a entrada
aceita o mesmo formato do LiveRequest ({blob}, {content}, {activity_start}, {activity_end}).
"""

import asyncio
import base64
import json
import logging
from typing import Any

import httpx
from fastapi import WebSocket
from pydantic import BaseModel
from google import genai
from google.genai import types

from mock_api.main import app as mock_api_app

from .agent import INSTRUCTION, LIVE_MODEL
from .openapi_spec import MOCK_API_URL
from .profile import USER_PROFILE

logger = logging.getLogger("lumi.genai")

# Parâmetro preenchido pelo servidor, nunca pelo modelo (equivale ao inject_account_id).
INJECTED_PARAMS = {"account_id": USER_PROFILE["account_id"]}

# session_id -> último handle de session resumption recebido do Live API.
# Em memória: reiniciar o servidor perde o contexto das sessões genai.
_resumption_handles: dict[str, str] = {}

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    # Lazy: o .env com as credenciais Vertex é carregado pelo server.py antes da 1ª conexão.
    global _client
    if _client is None:
        _client = genai.Client()
    return _client


def _build_tools() -> tuple[list[types.FunctionDeclaration], dict[str, tuple[str, str]]]:
    """FunctionDeclarations + rotas (método, path) a partir da spec OpenAPI da API mock.

    Todas as rotas da API mock recebem só query params, então basta mapear `parameters`.
    """
    declarations: list[types.FunctionDeclaration] = []
    routes: dict[str, tuple[str, str]] = {}
    for path, operations in mock_api_app.openapi()["paths"].items():
        for method, op in operations.items():
            properties: dict[str, Any] = {}
            required: list[str] = []
            for param in op.get("parameters", []):
                name = param["name"]
                if name in INJECTED_PARAMS:
                    continue
                schema = dict(param["schema"])
                schema.pop("title", None)
                if "description" in param:
                    schema["description"] = param["description"]
                properties[name] = schema
                if param.get("required"):
                    required.append(name)
            name = op["operationId"]
            declarations.append(
                types.FunctionDeclaration(
                    name=name,
                    description=op.get("description") or op.get("summary", ""),
                    parameters_json_schema={
                        "type": "object",
                        "properties": properties,
                        "required": required,
                    },
                )
            )
            routes[name] = (method.upper(), path)
    return declarations, routes


TOOL_DECLARATIONS, _ROUTES = _build_tools()


async def _call_tool(http: httpx.AsyncClient, call: types.FunctionCall) -> dict[str, Any]:
    route = _ROUTES.get(call.name or "")
    if route is None:
        return {"status": "erro", "message": f"Tool desconhecida: {call.name}"}
    method, path = route
    params = {k: v for k, v in (call.args or {}).items() if v is not None}
    params.update(INJECTED_PARAMS)
    try:
        res = await http.request(method, path, params=params)
        body = res.json()
    except (httpx.HTTPError, ValueError) as e:
        return {"status": "erro", "message": f"Falha ao chamar a API: {e}", "retryable": True}
    # FunctionResponse.response precisa ser um objeto.
    return body if isinstance(body, dict) else {"result": body}


def build_live_connect_config(
    run_config: Any, session_id: str
) -> types.LiveConnectConfig:
    """Converte o RunConfig do backend ADK em LiveConnectConfig — uma única fonte de verdade
    para voz, idioma, transcrição e VAD nos dois backends."""
    handle = _resumption_handles.get(session_id)
    return types.LiveConnectConfig(
        response_modalities=run_config.response_modalities,
        speech_config=run_config.speech_config,
        input_audio_transcription=run_config.input_audio_transcription,
        output_audio_transcription=run_config.output_audio_transcription,
        realtime_input_config=run_config.realtime_input_config,
        explicit_vad_signal=run_config.explicit_vad_signal,
        context_window_compression=run_config.context_window_compression,
        session_resumption=types.SessionResumptionConfig(handle=handle),
        system_instruction=INSTRUCTION.format(**USER_PROFILE),
        tools=[types.Tool(function_declarations=TOOL_DECLARATIONS)],
    )


def _event(**fields: Any) -> str:
    """Serializa no mesmo formato camelCase dos eventos do ADK que a webapp já entende."""
    payload = {}
    for key, value in fields.items():
        if value is None:
            continue
        if isinstance(value, BaseModel):
            value = value.model_dump(mode="json", exclude_none=True, by_alias=True)
        payload[key] = value
    return json.dumps(payload, ensure_ascii=False)


async def run_genai_live(
    websocket: WebSocket, session_id: str, config: types.LiveConnectConfig
) -> None:
    """Faz a ponte webapp <-> Live API até um dos lados fechar."""
    resumed = config.session_resumption.handle is not None
    logger.info("Sessão genai %s — %s", session_id, "retomando contexto" if resumed else "nova")

    async with (
        _get_client().aio.live.connect(model=LIVE_MODEL, config=config) as session,
        httpx.AsyncClient(base_url=MOCK_API_URL, timeout=15) as http,
    ):
        send = websocket.send_text

        async def run_tools(calls: list[types.FunctionCall]) -> None:
            responses = []
            for call in calls:
                result = await _call_tool(http, call)
                fr = types.FunctionResponse(id=call.id, name=call.name, response=result)
                responses.append(fr)
                await send(_event(content=types.Content(role="user", parts=[types.Part(function_response=fr)])))
            await session.send_tool_response(function_responses=responses)

        async def upstream_to_client() -> None:
            tool_tasks: set[asyncio.Task] = set()
            # receive() encerra a cada turno completo; o laço externo mantém a sessão.
            while True:
                async for msg in session.receive():
                    if msg.session_resumption_update:
                        update = msg.session_resumption_update
                        if update.resumable and update.new_handle:
                            _resumption_handles[session_id] = update.new_handle
                    if msg.voice_activity:
                        await send(_event(voiceActivity=msg.voice_activity))
                    if msg.go_away:
                        logger.warning("Live API vai encerrar a conexão em %s", msg.go_away.time_left)
                    if msg.tool_call and msg.tool_call.function_calls:
                        calls = msg.tool_call.function_calls
                        await send(_event(content=types.Content(
                            role="model", parts=[types.Part(function_call=c) for c in calls]
                        )))
                        # Em task própria para não travar o recebimento de áudio/VAD.
                        task = asyncio.create_task(run_tools(calls))
                        tool_tasks.add(task)
                        task.add_done_callback(tool_tasks.discard)
                    if msg.tool_call_cancellation:
                        logger.info("Tool calls canceladas: %s", msg.tool_call_cancellation.ids)

                    sc = msg.server_content
                    if sc is None:
                        continue
                    if sc.input_transcription and sc.input_transcription.text:
                        # No 3.8 Live a transcrição de entrada chega numa única mensagem final.
                        await send(_event(inputTranscription={"text": sc.input_transcription.text, "finished": True}))
                    if sc.output_transcription and sc.output_transcription.text:
                        await send(_event(outputTranscription={"text": sc.output_transcription.text, "finished": False}))
                    if sc.model_turn and sc.model_turn.parts:
                        parts = [p for p in sc.model_turn.parts if p.inline_data or (p.text and not p.thought)]
                        if parts:
                            await send(_event(content=types.Content(role="model", parts=parts), partial=True))
                    if sc.turn_complete or sc.interrupted:
                        await send(_event(turnComplete=sc.turn_complete or None, interrupted=sc.interrupted or None))

        async def client_to_upstream() -> None:
            while True:
                req = json.loads(await websocket.receive_text())
                if blob := req.get("blob"):
                    await session.send_realtime_input(
                        audio=types.Blob(data=base64.b64decode(blob["data"]), mime_type=blob["mimeType"])
                    )
                elif content := req.get("content"):
                    text = "".join(p.get("text", "") for p in content.get("parts", []))
                    if text:
                        await session.send_realtime_input(text=text)
                elif "activity_start" in req:
                    await session.send_realtime_input(activity_start=types.ActivityStart())
                elif "activity_end" in req:
                    await session.send_realtime_input(activity_end=types.ActivityEnd())

        tasks = [asyncio.create_task(upstream_to_client()), asyncio.create_task(client_to_upstream())]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        finally:
            for task in tasks:
                task.cancel()
