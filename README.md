# live-vad-experiments

Experiments with **Voice Activity Detection (VAD) in noisy environments** using the Gemini Live API (`gemini-3.8-live` on Vertex AI) and Google ADK.

The testbed is **Lumi**, a real-time voice assistant for a fictional investment app (*Aurora Invest*, in Brazilian Portuguese). On top of the assistant sits a **VAD lab**: per-connection VAD settings, synthetic noise mixed into the microphone, and a live monitor showing what the server-side VAD detected.

## Highlights

- **Per-connection VAD config:** sensitivity, prefix padding, silence duration and interruption behavior are set from query params and applied as `RealtimeInputConfig`. Switching presets reconnects on the same session, so the conversation is kept.
- **Client-side noise injection:** fan, traffic, café babble, hiss, or your own audio file, mixed into the mic before it reaches the model.
- **Live VAD monitor:** timeline of mic level, detected turns, model speech, interruptions and tool calls, plus false-trigger and latency metrics.
- **Push-to-talk fallback:** manual `activity_start` / `activity_end` signals for extreme environments.
- **Two backends, one UI:** ADK (`/live`) or the raw `google-genai` Live client (`/live-genai`).

## Architecture

| Service | Port | Description |
|---|---|---|
| `mock_api/` (FastAPI) | 8092 | Market data, product catalog (fixed income, treasury bonds, funds, stocks/ETFs, crypto), in-memory portfolio, simulations and orders. Its OpenAPI spec becomes the agent's tools. |
| `server.py` (FastAPI + ADK) | 8010 | ADK session routes plus the `/live` (ADK) and `/live-genai` (google-genai) WebSockets, with a custom `RunConfig` (voice, language, transcription, per-connection VAD). |
| `webapp/` (React + Vite) | 5190 | Simulated phone UI, VAD lab and VAD monitor. |

```
agents/invest_live/   agent definition, callbacks, OpenAPI toolset, genai backend
mock_api/             fake investments API
webapp/src/           React app: live session hook, audio capture/noise, VAD monitor
server.py             live WebSocket server + RunConfig / VAD config builders
```

## Getting started

Prerequisites: Python 3.12–3.13 with [uv](https://docs.astral.sh/uv/), Node.js (LTS), and a Google Cloud project with Vertex AI enabled.

```bash
gcloud auth application-default login
cp agents/invest_live/.env.example agents/invest_live/.env   # set GOOGLE_CLOUD_PROJECT
make install        # uv sync + npm install
make run            # start all 3 services (Ctrl-C stops everything)
```

Open http://localhost:5190.

- `make up` / `make down` run the stack in the background (logs in `.logs/`).
- `gemini-3.8-live` is available in `us-central1` and the `us` / `eu` multi-regions.
- The portfolio lives in memory. Restart the API (`make kill-api && make api`) to reset it.

Things to try (in Portuguese):

- *"Quero investir em cripto"* (I want to invest in crypto): Lumi searches for options, asks for an amount, warns that the risk is above the moderate profile, and only executes after explicit consent.
- *"Quanto rendeu minha carteira?"* (How has my portfolio performed?) · *"Como está o dólar hoje?"* (How is the dollar doing today?)
- *"Simula mil reais no Tesouro Selic por dois anos"* (Simulate R$1,000 in Tesouro Selic for two years)
- *"Resgata quinhentos reais do CDB"* (Redeem R$500 from the CDB)

## Deploying to Cloud Run

A single Cloud Run service behind IAP serves the agent, the mock API (at `/mock`) and the static webapp.

```bash
cp deploy.env.example deploy.env    # set GCP_PROJECT
make deploy
make grant EMAIL=user@example.com   # give a user IAP access
```

`--max-instances 1` is required: sessions, resumption handles and the mock portfolio are all kept in memory. For users outside your Google Workspace org, configure an External OAuth client and run `scripts/iap-setup.sh`.

## Voice and language config (`server.py`)

- **Voice:** `Leda` (`VOICE_NAME`).
- **Explicit language:** `SpeechConfig(language_code="pt-BR")`, `language_codes=["pt-BR"]` on input and output transcription, and a "respond in Brazilian Portuguese" rule in the system instruction, as recommended by the Live API best practices.
- **`custom_vocabulary`** on input transcription with financial terms (CDB, LCI, Tesouro IPCA+, BOVA11, Bitcoin…) to bias the ASR, which the system instruction alone can't do.
- `enable_affective_dialog` and `proactivity` are **not** sent: they are always on in 3.8 Live. Proactive audio is what makes the model ignore side conversations and background noise.

## Exploring VAD

### 1 · VAD presets (server)

Each `/live` connection takes its VAD parameters from the query string, and the server turns them into a `RealtimeInputConfig`.

| Preset (UI label) | start / end sensitivity | prefix padding | silence | interruptible |
|---|---|---|---|---|
| Model default (*Padrão do modelo*) | default | default | default | yes |
| Quiet · snappy (*Silencioso · ágil*) | high / high | 20 ms | 300 ms | yes |
| Street / café (*Rua / café*) | low / low | 300 ms | 800 ms | yes |
| Very noisy (*Muito ruidoso*) | low / low | 600 ms | 1200 ms | **no** (`NO_INTERRUPTION`) |
| Push-to-talk | VAD disabled (`disabled=true`); `activity_start` / `activity_end` sent from the button or space bar | | | |

The UI is in Portuguese; preset names are shown in parentheses. The fine-tuning panel exposes each `AutomaticActivityDetection` field individually.

### 2 · Simulated noise

Synthetic noise is mixed into the microphone **before** audio is sent to the model, and can be adjusted live without reconnecting:

- fan (pink noise)
- traffic (rumble, passing cars, horns)
- café (synthetic voice babble and dishes)
- hiss (white noise)
- **your own audio file** on loop (e.g. a real bar recording, the most realistic test)

You can also turn off the browser's noise suppression, echo cancellation and auto gain control to send raw audio.

### 3 · Monitor

With `explicit_vad_signal=True`, the server sends back the VAD's `ACTIVITY_START` / `ACTIVITY_END` events (`event.voiceActivity`). The monitor shows:

- a timeline of the last 20 s: mic level (including noise), turns detected by the VAD, Lumi's speech, interruptions and tool calls;
- **false triggers:** turns the VAD opened with no transcribed words, which is typical of noise;
- model **interruptions**, and **latency** from end of speech to the first audio of the response.

**Suggested walkthrough:**

1. Pick the *Café* noise at 50–60% with the *Padrão do modelo* (model default) preset, talk for a bit, and watch for false triggers and interruptions.
2. Switch to *Rua / café* or *Muito ruidoso* and compare.
3. Finally, try push-to-talk as the fallback for extreme environments.

Mic audio is sent in 40 ms chunks, following the Live API recommendation of 20–40 ms so the VAD reacts faster.
