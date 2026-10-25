"""Servidor live da Lumi (Aurora Invest).

Monta o app padrão do ADK (rotas de sessão REST + CORS) e adiciona uma rota
WebSocket `/live` própria, na qual construímos o RunConfig — voz, idioma pt-BR
explícito, transcrição com vocabulário financeiro e, principalmente, VAD
(detecção de atividade de voz) configurável por conexão. A webapp passa os
parâmetros de VAD na query string, então dá para comparar cenários (silêncio,
rua, café, push-to-talk) sem reiniciar o servidor.
"""

import asyncio
import logging
import os
from contextlib import aclosing
from typing import Literal

from fastapi import Query, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from google.adk.agents.live_request_queue import LiveRequest, LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.cli.utils import envs
from google.adk.runners import Runner
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from google.genai import types

logging.basicConfig(level=logging.INFO)
logging.getLogger("lumi").setLevel(logging.DEBUG)
logger = logging.getLogger("lumi.server")

AGENTS_DIR = "agents"
APP_NAME = "invest_live"
DB_PATH = f"agents/{APP_NAME}/.adk/session.db"
WEB_ORIGIN = "http://localhost:5190"

# Mesma voz padrão do Ailo (troque por Aoede, Kore, Charon, etc.).
VOICE_NAME = "Leda"
LANGUAGE_CODE = "pt-BR"

# Termos de domínio que o ASR tende a errar — enviesam a transcrição (até 1000 termos).
# Colocar isso só no system instruction NÃO tem o mesmo efeito.
FINANCE_VOCABULARY = [
    "CDB", "LCI", "LCA", "CDI", "Selic", "IPCA", "IPCA+", "Tesouro Direto", "Tesouro Selic",
    "Tesouro IPCA+", "Tesouro Prefixado", "renda fixa", "renda variável", "liquidez diária",
    "FGC", "come-cotas", "multimercado", "fundo imobiliário", "FII", "ETF", "BOVA11", "IVVB11",
    "HASH11", "AURA11", "PETR4", "ITUB4", "Ibovespa", "S&P 500", "cripto", "criptomoeda",
    "Bitcoin", "Ethereum", "Solana", "JPMASC", "suitability", "resgate", "aporte", "Aurora Invest", "Lumi",
]

# Carrega agents/invest_live/.env (credenciais Vertex) antes de instanciar o runner.
envs.load_dotenv_for_agent(APP_NAME, AGENTS_DIR)

from agents.invest_live.agent import root_agent  # noqa: E402  (após load_dotenv)
from agents.invest_live.genai_backend import build_live_connect_config, run_genai_live  # noqa: E402

# App padrão do ADK: rotas de sessão (POST/GET/DELETE) + CORS.
app = get_fast_api_app(agents_dir=AGENTS_DIR, allow_origins=[WEB_ORIGIN], web=False)

# Runner próprio compartilhando o MESMO SQLite das rotas de sessão do ADK.
session_service = SqliteSessionService(db_path=DB_PATH)
runner = Runner(agent=root_agent, app_name=APP_NAME, session_service=session_service)

Sensitivity = Literal["default", "high", "low"]

_START = {
    "default": None,
    "high": types.StartSensitivity.START_SENSITIVITY_HIGH,
    "low": types.StartSensitivity.START_SENSITIVITY_LOW,
}
_END = {
    "default": None,
    "high": types.EndSensitivity.END_SENSITIVITY_HIGH,
    "low": types.EndSensitivity.END_SENSITIVITY_LOW,
}


def build_realtime_input_config(
    manual: bool,
    start_sensitivity: Sensitivity,
    end_sensitivity: Sensitivity,
    prefix_padding_ms: int | None,
    silence_duration_ms: int | None,
    interruptible: bool,
) -> types.RealtimeInputConfig:
    """VAD do lado do servidor.

    - start_of_speech_sensitivity LOW: exige fala mais clara/forte para abrir um turno —
      menos falsos disparos com ruído de fundo (TV, trânsito, conversa paralela).
    - end_of_speech_sensitivity LOW: tolera pausas maiores antes de fechar o turno —
      evita cortar o usuário no meio de um valor ("mil e... quinhentos").
    - prefix_padding_ms: quanto de fala contínua é necessário antes de confirmar o início
      (mais alto = ignora ruídos curtos como batidas, buzinas, tosse).
    - silence_duration_ms: silêncio necessário para considerar fim de fala.
    - activity_handling NO_INTERRUPTION: a fala do usuário não interrompe a resposta
      (útil quando o ruído fica derrubando o modelo no meio da frase).
    - manual: VAD desligado; a webapp envia activity_start/activity_end (push-to-talk).
    """
    return types.RealtimeInputConfig(
        automatic_activity_detection=types.AutomaticActivityDetection(
            disabled=manual,
            start_of_speech_sensitivity=None if manual else _START[start_sensitivity],
            end_of_speech_sensitivity=None if manual else _END[end_sensitivity],
            prefix_padding_ms=None if manual else prefix_padding_ms,
            silence_duration_ms=None if manual else silence_duration_ms,
        ),
        activity_handling=(
            types.ActivityHandling.START_OF_ACTIVITY_INTERRUPTS
            if interruptible
            else types.ActivityHandling.NO_INTERRUPTION
        ),
    )


def build_run_config(modality: str, realtime_input_config: types.RealtimeInputConfig) -> RunConfig:
    """RunConfig da Lumi — edite aqui para ajustar a experiência de voz."""
    transcription = types.AudioTranscriptionConfig(
        language_codes=[LANGUAGE_CODE],
        custom_vocabulary=FINANCE_VOCABULARY,
    )
    return RunConfig(
        response_modalities=[modality],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE_NAME)
            ),
            # Idioma explícito: sem ele o modelo pode trocar de idioma conforme o contexto.
            language_code=LANGUAGE_CODE,
        ),
        input_audio_transcription=transcription,
        output_audio_transcription=types.AudioTranscriptionConfig(language_codes=[LANGUAGE_CODE]),
        realtime_input_config=realtime_input_config,
        # Devolve os eventos ACTIVITY_START/ACTIVITY_END do VAD do servidor para a webapp
        # (event.voiceActivity) — base do monitor de VAD.
        explicit_vad_signal=True,
        # enable_affective_dialog e proactivity NÃO são enviados: no gemini-3.8-live
        # ambos já vêm sempre ligados (proactive audio ignora ruído e conversa paralela).
        session_resumption=types.SessionResumptionConfig(transparent=False),
        context_window_compression=types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow(),  # sessões longas estáveis
        ),
    )


@app.websocket("/live")
async def live(
    websocket: WebSocket,
    user_id: str = Query(...),
    session_id: str = Query(...),
    app_name: str = Query(default=APP_NAME),
    modalities: str = Query(default="AUDIO"),
    # --- VAD ---
    manual: bool = Query(default=False),
    start_sensitivity: Sensitivity = Query(default="default"),
    end_sensitivity: Sensitivity = Query(default="default"),
    prefix_padding_ms: int | None = Query(default=None, ge=0, le=2000),
    silence_duration_ms: int | None = Query(default=None, ge=0, le=5000),
    interruptible: bool = Query(default=True),
):
    await websocket.accept()

    session = await session_service.get_session(
        app_name=app_name, user_id=user_id, session_id=session_id
    )
    if not session:
        await websocket.close(code=1002, reason="Session not found")
        return

    realtime_input_config = build_realtime_input_config(
        manual, start_sensitivity, end_sensitivity, prefix_padding_ms, silence_duration_ms, interruptible
    )
    logger.info(
        "Sessão live %s — VAD: %s",
        session_id,
        realtime_input_config.model_dump_json(exclude_none=True),
    )

    live_request_queue = LiveRequestQueue()
    run_config = build_run_config(modalities, realtime_input_config)

    async def forward_events():
        async with aclosing(
            runner.run_live(
                user_id=user_id,
                session_id=session_id,
                live_request_queue=live_request_queue,
                run_config=run_config,
            )
        ) as agen:
            async for event in agen:
                await websocket.send_text(
                    event.model_dump_json(exclude_none=True, by_alias=True)
                )

    async def process_messages():
        try:
            while True:
                data = await websocket.receive_text()
                live_request_queue.send(LiveRequest.model_validate_json(data))
        except ValidationError as ve:
            logger.error("Erro de validação em process_messages: %s", ve)

    tasks = [
        asyncio.create_task(forward_events()),
        asyncio.create_task(process_messages()),
    ]
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
    try:
        for task in done:
            task.result()
    except WebSocketDisconnect:
        logger.info("Cliente desconectou da sessão live.")
    except Exception as e:  # noqa: BLE001
        logger.exception("Erro na sessão live: %s", e)
        try:
            await websocket.close(code=1011, reason=str(e)[:123])
        except RuntimeError:
            pass
    finally:
        for task in pending:
            task.cancel()
        live_request_queue.close()


@app.websocket("/live-genai")
async def live_genai(
    websocket: WebSocket,
    session_id: str = Query(...),
    modalities: str = Query(default="AUDIO"),
    # --- VAD (mesmos parâmetros da rota /live) ---
    manual: bool = Query(default=False),
    start_sensitivity: Sensitivity = Query(default="default"),
    end_sensitivity: Sensitivity = Query(default="default"),
    prefix_padding_ms: int | None = Query(default=None, ge=0, le=2000),
    silence_duration_ms: int | None = Query(default=None, ge=0, le=5000),
    interruptible: bool = Query(default=True),
):
    """Mesmo contrato da rota /live, mas falando direto com o Live API via genai SDK.

    O session_id (criado pelas rotas de sessão do ADK) só serve de chave para o handle de
    session resumption; o histórico fica no próprio Live API, não no SQLite.
    """
    await websocket.accept()

    realtime_input_config = build_realtime_input_config(
        manual, start_sensitivity, end_sensitivity, prefix_padding_ms, silence_duration_ms, interruptible
    )
    logger.info(
        "Sessão genai %s — VAD: %s",
        session_id,
        realtime_input_config.model_dump_json(exclude_none=True),
    )
    config = build_live_connect_config(build_run_config(modalities, realtime_input_config), session_id)

    try:
        await run_genai_live(websocket, session_id, config)
    except WebSocketDisconnect:
        logger.info("Cliente desconectou da sessão genai.")
    except Exception as e:  # noqa: BLE001
        logger.exception("Erro na sessão genai: %s", e)
        try:
            await websocket.close(code=1011, reason=str(e)[:123])
        except RuntimeError:
            pass


# Deploy num serviço só (Cloud Run): a API mock fica em /mock e a webapp buildada em /.
# Local (make run) nada disso é usado — cada um roda na sua porta.
if webapp_dist := os.environ.get("WEBAPP_DIST"):
    from mock_api.main import app as mock_api_app

    app.mount("/mock", mock_api_app)
    app.mount("/", StaticFiles(directory=webapp_dist, html=True), name="webapp")
