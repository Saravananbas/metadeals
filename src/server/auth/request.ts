import "server-only";
import { randomUUID } from "node:crypto";
import { createRequestDigest } from "./crypto";
import { getAuthEnv } from "@/config/env";
import { clientIpFromHeaders } from "@/server/client-ip";

export class RequestBodyError extends Error {}

export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const nextAuthHost = new URL(getAuthEnv().NEXTAUTH_URL).host;
    const requestHost = request.headers.get("host") || request.headers.get("x-forwarded-host");

    if (originHost === nextAuthHost) return true;
    if (requestHost && originHost === requestHost) return true;

    // Allow loopback variants in development/local environments (localhost <-> 127.0.0.1)
    const isLocal = (h: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h);
    if (isLocal(originHost) && (isLocal(nextAuthHost) || (requestHost && isLocal(requestHost)))) {
      const originPort = new URL(origin).port;
      const nextAuthPort = new URL(getAuthEnv().NEXTAUTH_URL).port;
      if (originPort === nextAuthPort) return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function getRequestMetadata(request: Request) {
  const address = clientIpFromHeaders(request.headers);
  const pepper = getAuthEnv().AUTH_SESSION_SECRET;
  return {
    ipHash: createRequestDigest(address, pepper),
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    requestId: request.headers.get("x-request-id")?.slice(0, 64) ?? randomUUID(),
  };
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new RequestBodyError("Request body is too large");
  if (!request.body) throw new RequestBodyError("A JSON request body is required");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RequestBodyError("Request body is too large");
    }
    chunks.push(value);
  }
  try {
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Request body must contain valid JSON");
  }
}
