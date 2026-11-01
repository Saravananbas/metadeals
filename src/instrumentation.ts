import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  const { logger } = await import("@/server/logging/logger");
  // Do not log raw errors, URLs, query strings or headers: these may contain secrets.
  logger.error({
    event: "unhandled_request_error",
    route: context.routePath,
    digest: error instanceof Error && "digest" in error && typeof error.digest === "string"
      && /^[a-zA-Z0-9_-]{1,64}$/.test(error.digest) ? error.digest : undefined,
  }, "Request failed");
};
