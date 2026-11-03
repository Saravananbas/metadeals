export interface DispatchResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
}

export async function sendTelegramMessage(
  destinationId: string,
  htmlContent: string,
  mock = false
): Promise<DispatchResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const isMock = mock || !token || process.env.TELEGRAM_MOCK === "true";

  if (isMock) {
    return {
      success: true,
      externalMessageId: `mock-tg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: destinationId,
        text: htmlContent,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!data.ok || !data.result) {
      return {
        success: false,
        error: data.description || `Telegram API error (${response.status})`,
      };
    }

    return {
      success: true,
      externalMessageId: String(data.result.message_id),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error contacting Telegram",
    };
  }
}
