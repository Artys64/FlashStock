type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

type SendEmailResult = {
  provider: "resend";
  messageId: string | null;
};

function readOptionalEnv(key: string): string | null {
  const value = process.env[key];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isEmailNotificationsEnabled(): boolean {
  return Boolean(readOptionalEnv("RESEND_API_KEY") && readOptionalEnv("ALERT_EMAIL_FROM"));
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resendApiKey = readOptionalEnv("RESEND_API_KEY");
  const from = readOptionalEnv("ALERT_EMAIL_FROM");

  if (!resendApiKey || !from) {
    throw new Error("Email provider is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend API error (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as { id?: string };
  return {
    provider: "resend",
    messageId: payload.id ?? null,
  };
}
