SHELL := /bin/bash

# Ports / origins
API_PORT     := 8092
AGENT_PORT   := 8010
WEB_PORT     := 5190
WEB_ORIGIN   := http://localhost:$(WEB_PORT)
LOG_DIR      := .logs

# Cloud Run (serviço único com IAP) — GCP_PROJECT/GCP_REGION vêm de deploy.env (gitignored)
-include deploy.env
GCP_REGION   ?= us-central1
RUN_SERVICE  := lumi
RUN_SA       := lumi-run@$(GCP_PROJECT).iam.gserviceaccount.com

.DEFAULT_GOAL := help
.PHONY: help install api agent web adk-web run up down kill kill-api kill-agent kill-web check-ports check-project deploy grant

# Encerra o que estiver escutando na porta $(1)
define kill_port
pids=$$(lsof -ti tcp:$(1) 2>/dev/null); \
if [ -n "$$pids" ]; then kill $$pids 2>/dev/null && echo "porta $(1): encerrado ($$pids)"; else echo "porta $(1): nada rodando"; fi
endef

check-ports: ## Falha com mensagem clara se alguma porta da stack já estiver ocupada
	@busy=""; for p in $(API_PORT) $(AGENT_PORT) $(WEB_PORT); do \
		lsof -ti tcp:$$p >/dev/null 2>&1 && busy="$$busy $$p"; \
	done; \
	if [ -n "$$busy" ]; then echo "Porta(s) já em uso:$$busy — rode 'make down' (ou 'make kill') e tente de novo."; exit 1; fi

help: ## List available targets
	@echo "Lumi (Aurora Invest) — comandos disponíveis:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install Python + webapp dependencies
	uv sync
	cd webapp && npm install

api: ## Run the mock investments API (port 8092)
	uv run uvicorn mock_api.main:app --port $(API_PORT)

agent: ## Run the Lumi live server (custom RunConfig + VAD, port 8010)
	SSL_CERT_FILE=$$(uv run python -m certifi) \
		uv run uvicorn server:app --port $(AGENT_PORT)

web: ## Run the Lumi mobile webapp + VAD lab (Vite, port 5190)
	cd webapp && npm run dev

adk-web: ## Run the bundled ADK web UI instead of the webapp
	SSL_CERT_FILE=$$(uv run python -m certifi) uv run adk web --port $(AGENT_PORT) agents/

run: check-ports ## Run the full Lumi stack (api + agent + webapp) with one Ctrl-C to stop all
	@echo "Starting Lumi stack — mock API:$(API_PORT)  agent:$(AGENT_PORT)  webapp:$(WEB_ORIGIN)"
	@trap 'echo; echo "Stopping Lumi stack…"; kill 0' EXIT INT TERM; \
		uv run uvicorn mock_api.main:app --port $(API_PORT) & \
		SSL_CERT_FILE=$$(uv run python -m certifi) uv run uvicorn server:app --port $(AGENT_PORT) & \
		( cd webapp && npm run dev ) & \
		wait

up: check-ports ## Ramp up the full stack in the background (logs/PIDs in .logs/)
	@mkdir -p $(LOG_DIR)
	@echo "Ramping up Lumi stack (background) — logs in $(LOG_DIR)/"
	@uv run uvicorn mock_api.main:app --port $(API_PORT) > $(LOG_DIR)/api.log 2>&1 & echo $$! > $(LOG_DIR)/api.pid
	@SSL_CERT_FILE=$$(uv run python -m certifi) uv run uvicorn server:app --port $(AGENT_PORT) > $(LOG_DIR)/agent.log 2>&1 & echo $$! > $(LOG_DIR)/agent.pid
	@( cd webapp && npm run dev ) > $(LOG_DIR)/web.log 2>&1 & echo $$! > $(LOG_DIR)/web.pid
	@echo "  mock API:$(API_PORT)  agent:$(AGENT_PORT)  webapp:$(WEB_ORIGIN)"
	@echo "  tail logs: tail -f $(LOG_DIR)/*.log   |   tear down: make down"

down: kill ## Destroy everything running (kills ports + clears .logs/)
	@rm -rf $(LOG_DIR) && echo "$(LOG_DIR)/ limpo"

kill-api: ## Encerra o processo na porta da API mock (8092)
	@$(call kill_port,$(API_PORT))

kill-agent: ## Encerra o processo na porta do agente (8010)
	@$(call kill_port,$(AGENT_PORT))

kill-web: ## Encerra o processo na porta da webapp (5190)
	@$(call kill_port,$(WEB_PORT))

kill: kill-api kill-agent kill-web ## Encerra API + agente + webapp

check-project:
	@test -n "$(GCP_PROJECT)" || { echo "Defina GCP_PROJECT em deploy.env (veja deploy.env.example)"; exit 1; }

deploy: check-project ## Deploy no Cloud Run (agente + API mock + webapp num serviço só, atrás do IAP)
	gcloud run deploy $(RUN_SERVICE) --source . --project $(GCP_PROJECT) --region $(GCP_REGION) \
		--service-account $(RUN_SA) --no-allow-unauthenticated --iap \
		--max-instances 1 --session-affinity --timeout 3600 --memory 1Gi --cpu 1 \
		--set-env-vars GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=$(GCP_PROJECT),GOOGLE_CLOUD_LOCATION=$(GCP_REGION)

grant: check-project ## Libera um usuário no IAP: make grant EMAIL=fulano@empresa.com
	gcloud iap web add-iam-policy-binding --project $(GCP_PROJECT) --region $(GCP_REGION) \
		--resource-type cloud-run --service $(RUN_SERVICE) \
		--member user:$(EMAIL) --role roles/iap.httpsResourceAccessor
