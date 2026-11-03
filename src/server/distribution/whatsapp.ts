import type { DispatchResult } from "./telegram";

export async function sendWhatsAppMessage(
  destinationId: string,
  text: string,
  mock = false
): Promise<DispatchResult> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const isMock = mock || !token || !phoneId || process.env.WHATSAPP_MOCK === "true";

  if (isMock) {
    return {
      success: true,
      externalMessageId: `mock-wa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destinationId,
        type: "text",
        text: { body: text },
      }),
    });

    const data = await response.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!response.ok || !data.messages?.[0]) {
      return {
        success: false,
        error: data.error?.message || `WhatsApp API error (${response.status})`,
      };
    }

    return {
      success: true,
      externalMessageId: data.messages[0].id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error contacting WhatsApp",
    };
  }
}

