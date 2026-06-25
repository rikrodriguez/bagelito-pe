type LogValue = string | number | boolean | null | undefined;
type LogContext = Record<string, LogValue>;

function cleanContext(context: LogContext) {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined));
}

function writeStructuredLog(level: "info" | "warn" | "error", msg: string, context: LogContext = {}) {
  const payload = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...cleanContext(context),
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function getRequestId(request: Request) {
  return request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? undefined;
}

export function getDurationMs(startedAt: number) {
  return Date.now() - startedAt;
}

export function logInfo(msg: string, context?: LogContext) {
  writeStructuredLog("info", msg, context);
}

export function logWarn(msg: string, context?: LogContext) {
  writeStructuredLog("warn", msg, context);
}

export function logError(msg: string, error: unknown, context: LogContext = {}) {
  writeStructuredLog("error", msg, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : typeof error,
  });
}
