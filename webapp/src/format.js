const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const brl = (value) => (value == null ? "—" : BRL.format(value));

export const pct = (value, digits = 2) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits).replace(".", ",")}%`;

export const RISK_TONE = { baixo: "low", moderado: "mid", alto: "high", "muito alto": "max" };

export const CATEGORY_ICON = {
  "renda fixa": "🏦",
  "tesouro direto": "🇧🇷",
  fundos: "📊",
  ações: "📈",
  cripto: "🪙",
};
