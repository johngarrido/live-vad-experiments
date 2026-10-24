#!/usr/bin/env bash
# Configura o OAuth client "External" no IAP do serviço lumi e libera os e-mails do cliente.
# Uso: ./scripts/iap-setup.sh   (pede client ID, secret e e-mails interativamente)
set -euo pipefail

# GCP_PROJECT/GCP_REGION vêm do ambiente ou de deploy.env (gitignored)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ -f "$ROOT/deploy.env" ]] && source "$ROOT/deploy.env"
PROJECT="${GCP_PROJECT:?Defina GCP_PROJECT em deploy.env (veja deploy.env.example)}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="lumi"

read -rp "OAuth client ID: " CLIENT_ID
read -rsp "OAuth client secret (não aparece na tela): " CLIENT_SECRET; echo
read -rp "E-mails a liberar (separados por vírgula, vazio pra pular): " EMAILS

if [[ -z "$CLIENT_ID" || -z "$CLIENT_SECRET" ]]; then
  echo "Client ID e secret são obrigatórios." >&2
  exit 1
fi

# Arquivo temporário só legível por você, apagado ao sair (mesmo com erro).
umask 077
SETTINGS="$(mktemp)"
trap 'rm -f "$SETTINGS"' EXIT
cat > "$SETTINGS" <<EOF
access_settings:
  oauth_settings:
    client_id: ${CLIENT_ID}
    client_secret: ${CLIENT_SECRET}
EOF

echo "→ Aplicando OAuth client no IAP do projeto ${PROJECT}…"
gcloud iap settings set "$SETTINGS" --project="$PROJECT" --format="none"
echo "  ok"

IFS=',' read -ra LIST <<< "$EMAILS"
for raw in "${LIST[@]}"; do
  email="$(echo "$raw" | xargs)"  # tira espaços
  [[ -z "$email" ]] && continue
  echo "→ Liberando ${email}…"
  gcloud iap web add-iam-policy-binding \
    --project="$PROJECT" --region="$REGION" \
    --resource-type=cloud-run --service="$SERVICE" \
    --member="user:${email}" --role=roles/iap.httpsResourceAccessor \
    --format="none"
  echo "  ok"
done

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo
echo "Pronto. Compartilhe: ${URL}"
echo "Lembrete: o redirect URI do client precisa ser"
echo "  https://iap.googleapis.com/v1/oauth/clientIds/${CLIENT_ID}:handleRedirect"
