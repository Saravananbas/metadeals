/** A short label for why the database could not be used. Only this label is returned; the full message goes to the server log. */
export function databaseFailure(error: unknown): string {
  const text = `${(error as { code?: string })?.code ?? ""} ${(error as { errno?: number })?.errno ?? ""} ${error instanceof Error ? `${error.name} ${error.message}` : ""}`;
  if (error instanceof URIError) return "password_encoding";
  if (/1045|ACCESS_DENIED_ERROR|access denied/i.test(text)) return "login_refused";
  if (/1044|DBACCESS_DENIED/i.test(text)) return "no_privileges";
  if (/1049|BAD_DB_ERROR|unknown database/i.test(text)) return "unknown_database";
  if (/ECONNREFUSED/i.test(text)) return "connection_refused";
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) return "host_not_found";
  if (/ETIMEDOUT|timeout|timed out/i.test(text)) return "timeout";
  if (/too many connections|1040|1203|user_limit/i.test(text)) return "too_many_connections";
  return "other";
}
