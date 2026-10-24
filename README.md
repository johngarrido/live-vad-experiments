# Lumi · Aurora Invest — demo de investimentos por voz com Gemini 3.8 Live

Demo de um app de investimentos (fictício, todo em pt-BR) com uma assessora por voz em tempo real — a **Lumi** — construída com **`gemini-3.8-live`** (Vertex AI) + **Google ADK**. Baseada na arquitetura do projeto `ailo-live-agent`, com foco em **VAD (detecção de atividade de voz) em ambientes ruidosos**.

Exemplos do que dá para dizer:

- “Quero investir em cripto” → busca opções, pergunta o valor, avisa do risco (acima do perfil moderado) e só executa após ciência explícita
- “Quanto rendeu minha carteira?” · “Como está o dólar hoje?”
- “Simula mil reais no Tesouro Selic por dois anos”
- “Resgata quinhentos reais do CDB”

## Arquitetura

| Serviço | Porta | O quê |
|---|---|---|
| `mock_api/` (FastAPI) | 8092 | mercado, catálogo (renda fixa, Tesouro, fundos, ações/ETFs, cripto), carteira em memória, simulação e ordens. A spec OpenAPI vira as tools do agente. |
| `server.py` (FastAPI + ADK) | 8010 | rotas de sessão do ADK + WebSocket `/live` com `RunConfig` próprio (voz, idioma, transcrição, **VAD por conexão**). |
| `webapp/` (React + Vite) | 5190 | celular simulado + **Laboratório de VAD** + **Monitor de VAD**. |

As portas são diferentes das do ailo (8000/8081/5173) para os dois rodarem lado a lado.

## Rodando

```bash
gcloud auth application-default login     # credenciais com acesso ao Vertex AI
make install                              # uv sync + npm install
make run                                  # sobe os 3 serviços (Ctrl-C encerra tudo)
# ou: make up / make down (background, logs em .logs/)
```

Abra http://localhost:5190. Config Vertex: `cp agents/invest_live/.env.example agents/invest_live/.env` e ajuste (`GOOGLE_GENAI_USE_VERTEXAI=TRUE`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`). O `gemini-3.8-live` está disponível em `us-central1` e nas multi-regiões `us`/`eu`.

Deploy (Cloud Run + IAP): `cp deploy.env.example deploy.env`, defina `GCP_PROJECT` e rode `make deploy`.

A carteira vive em memória no mock API — reinicie a API (`make kill-api && make api`) para voltar ao estado inicial.

## Configuração de voz e idioma (`server.py`)

- **Voz:** `Leda` (mesma voz padrão do ailo) — `VOICE_NAME`.
- **Idioma explícito:** `SpeechConfig(language_code="pt-BR")` + `language_codes=["pt-BR"]` nas transcrições de entrada e saída + instrução "RESPONDA EM PORTUGUÊS DO BRASIL…" no system instruction (recomendação das best practices do Live API).
- **`custom_vocabulary`** na transcrição de entrada com termos financeiros (CDB, LCI, Tesouro IPCA+, BOVA11, Bitcoin…) — enviesa o ASR, algo que o system instruction sozinho não faz.
- `enable_affective_dialog` e `proactivity` **não** são enviados: no 3.8 Live eles já vêm sempre ligados (o proactive audio é o que faz o modelo ignorar conversa paralela e ruído de fundo).

## Explorando VAD

### 1 · Cenário de VAD (servidor)
Cada conexão ao `/live` recebe os parâmetros de VAD na query string, viram `RealtimeInputConfig` no servidor. Trocar o cenário reconecta na **mesma sessão** (conversa preservada).

| Preset | start / end sensitivity | prefix_padding | silence | interrupção |
|---|---|---|---|---|
| Padrão do modelo | padrão | padrão | padrão | sim |
| Silencioso · ágil | alta / alta | 20 ms | 300 ms | sim |
| Rua / café | baixa / baixa | 300 ms | 800 ms | sim |
| Muito ruidoso | baixa / baixa | 600 ms | 1200 ms | **não** (`NO_INTERRUPTION`) |
| Push-to-talk | VAD desligado (`disabled=true`) — `activity_start`/`activity_end` pelo botão ou barra de espaço |

O "ajuste fino" expõe cada campo de `AutomaticActivityDetection` individualmente.

### 2 · Ruído simulado
Ruído sintético mixado no microfone **antes** do envio ao modelo (ajustável ao vivo, sem reconectar): ventilador (rosa), trânsito (ronco + carros + buzinas), café (babble de vozes sintéticas + louça), chiado (branco), ou **um arquivo de áudio seu** em loop (ex.: gravação real de um bar — o teste mais realista). Dá também para desligar a supressão de ruído / AEC / AGC do navegador e mandar o áudio cru.

### 3 · Monitor
Com `explicit_vad_signal=True`, o servidor devolve os eventos `ACTIVITY_START`/`ACTIVITY_END` do VAD dele (`event.voiceActivity`). O monitor mostra:

- linha do tempo dos últimos 20s: nível do mic (com ruído), turnos detectados pelo VAD, fala da Lumi, interrupções e chamadas de tool;
- **falsos disparos**: turnos abertos pelo VAD sem nenhuma palavra transcrita (típico de ruído);
- **interrupções** do modelo, e **latência** fim de fala → primeiro áudio da resposta.

Roteiro sugerido: escolha "Café" a 50–60% com o preset "Padrão do modelo", converse um pouco e observe falsos disparos/interrupções; depois troque para "Rua / café" ou "Muito ruidoso" e compare. Por fim, teste o push-to-talk como alternativa para ambientes extremos.

O áudio do mic agora sai em chunks de 40 ms (eram 200 ms no ailo), seguindo a recomendação de 20–40 ms do Live API para o VAD reagir mais rápido.
