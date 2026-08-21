import { after } from "next/server";
import { dispatchMonitoringAlert } from "./monitoring-alerts";

type LogValue = string | number | boolean | null | undefined;
export type LogContext = Record<string, LogValue>;

function cleanContext(context: LogContext) {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined));
}

type LogLevel = "info" | "warn" | "error";

function writeStructuredLog(level: LogLevel, msg: string, context: LogContext = {}) {
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

function normalizeError(error: unknown) {
  return {
    errorMessage: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : typeof error,
  };
}

function scheduleMonitoringAlert(input: Parameters<typeof dispatchMonitoringAlert>[0]) {
  try {
    after(() => dispatchMonitoringAlert(input));
  } catch {
    void dispatchMonitoringAlert(input);
  }
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
  scheduleMonitoringAlert({
    context: context ?? {},
    level: "warn",
    msg,
  });
}

export function logError(msg: string, error: unknown, context: LogContext = {}) {
  const { errorMessage, errorName } = normalizeError(error);

  writeStructuredLog("error", msg, {
    ...context,
    error: errorMessage,
    errorName,
  });
  scheduleMonitoringAlert({
    context,
    error: errorMessage,
    errorName,
    level: "error",
    msg,
  });
}

export async function logErrorAndFlush(msg: string, error: unknown, context: LogContext = {}) {
  const { errorMessage, errorName } = normalizeError(error);

  writeStructuredLog("error", msg, {
    ...context,
    error: errorMessage,
    errorName,
  });

  await dispatchMonitoringAlert({
    context,
    error: errorMessage,
    errorName,
    level: "error",
    msg,
  });
}
