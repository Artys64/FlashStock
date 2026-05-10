export type ExpiryAlertEmailStatus = "alert_milestone" | "expired_daily" | "quarantine_daily";

export function buildExpiryAlertEmail(input: {
  status: ExpiryAlertEmailStatus;
  productName: string;
  lotCode: string;
  expiryDate: string;
  daysUntilExpiry: number;
  establishmentName: string;
}): { subject: string; text: string } {
  const productLabel = `${input.productName} (Lote ${input.lotCode})`;

  if (input.status === "quarantine_daily") {
    return {
      subject: `[Flash Stock] Lote em quarentena: ${productLabel}`,
      text: [
        `Estabelecimento: ${input.establishmentName}`,
        `Produto/Lote: ${productLabel}`,
        `Validade: ${input.expiryDate}`,
        "",
        "Este lote esta em quarentena e nao pode ser usado em saida operacional.",
        "Revise o lote no painel de alertas para regularizacao.",
      ].join("\n"),
    };
  }

  if (input.status === "expired_daily") {
    return {
      subject: `[Flash Stock] Lote vencido: ${productLabel}`,
      text: [
        `Estabelecimento: ${input.establishmentName}`,
        `Produto/Lote: ${productLabel}`,
        `Validade: ${input.expiryDate}`,
        "",
        "O lote esta vencido e requer acao imediata.",
        "Realize baixa por perda ou regularizacao conforme o procedimento operacional.",
      ].join("\n"),
    };
  }

  return {
    subject: `[Flash Stock] Vencimento em ${input.daysUntilExpiry} dia(s): ${productLabel}`,
    text: [
      `Estabelecimento: ${input.establishmentName}`,
      `Produto/Lote: ${productLabel}`,
      `Validade: ${input.expiryDate}`,
      `Dias restantes: ${input.daysUntilExpiry}`,
      "",
      "Este lote entrou na janela automatica de aviso.",
      "Priorize o consumo por PVPS para reduzir risco de perda por vencimento.",
    ].join("\n"),
  };
}
