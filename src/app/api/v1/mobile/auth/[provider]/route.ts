import { readJson } from "@/server/auth/request";
import { customerErrorResponse, customerJson } from "@/server/customer/http";
import { nativeProviderLogin } from "@/server/customer/native-login";
import { refreshAppToken } from "@/server/customer/app-tokens";
import { limitCustomerRequests } from "@/server/customer/service";
import { clientIpFromHeaders } from "@/server/client-ip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/v1/mobile/auth/google  { idToken, device? }
 * POST /api/v1/mobile/auth/apple   { idToken, nonce, name?, device? }
 * POST /api/v1/mobile/auth/refresh { refreshToken }
 * Answers with a new access + refresh token pair. The password sign-in is /api/v1/mobile/auth/login.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const body = ((await readJson(request)) ?? {}) as Record<string, unknown>;
    const address = clientIpFromHeaders(request.headers);
    if (provider === "refresh") {
      await limitCustomerRequests(`native-refresh:${address ?? "unknown"}`, 120, 900);
      return customerJson({ data: await refreshAppToken(String(body.refreshToken ?? "")) });
    }
    if (provider !== "google" && provider !== "apple") return customerJson({ error: "Not found." }, 404);
    return customerJson({ data: await nativeProviderLogin(provider, body, address) });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
