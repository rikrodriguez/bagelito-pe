import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/env";
import type { LogContext } from "./monitoring";

type AlertLevel = "warn" | "error";

type MonitoringAlertPolicy = {
  cooldownMinutes: number;
};

type MonitoringAlertDispatchInput = {
  context: LogContext;
  error?: string;
  errorName?: string;
  level: AlertLevel;
  msg: string;
};

type MonitoringAlertRpcRow = {
  event_id: string;
  first_seen_at: string;
  last_seen_at: string;
  last_sent_at: string | null;
  occurrences: number;
  should_send: boolean;
};

const defaultCooldownMinutes = 15;
const warnAlertEvents = new Set([
  "admin_login_missing_password_env",
  "analytics_event_failed",
  "public_rate_limit_rpc_missing",
  "reservation_legacy_order_cleanup_failed",
  "reservation_payment_proof_cleanup_failed",
]);

function rawMonitoringLog(level: AlertLevel, msg: string, context: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...context,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  console.warn(line);
}

function getMonitoringWebhookUrl() {
  return process.env.MONITORING_ALERT_WEBHOOK_URL?.trim() ?? "";
}

function getMonitoringEnvironment() {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
}

function getMonitoringCooldownMinutes() {
  const raw = Number(process.env.MONITORING_ALERT_COOLDOWN_MINUTES ?? defaultCooldownMinutes);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : defaultCooldownMinutes;
}

function getAlertPolicy(level: AlertLevel, msg: string): MonitoringAlertPolicy | null {
  if (level === "error") {
    return { cooldownMinutes: getMonitoringCooldownMinutes() };
  }

  if (warnAlertEvents.has(msg)) {
    return { cooldownMinutes: getMonitoringCooldownMinutes() };
  }

  return null;
}

function compactContext(context: LogContext) {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined));
}

function hashString(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return `mon_${(hash >>> 0).toString(16)}`;
}

function buildFingerprint(level: AlertLevel, msg: string, context: LogContext) {
  const fingerprintContext = {
    action: context.action,
    batchId: context.batchId,
    intent: context.intent,
    route: context.route,
    source: context.source,
    status: context.status,
    type: context.type,
  };

  return hashString(JSON.stringify({ context: fingerprintContext, level, msg }));
}

function buildAlertText({
  context,
  error,
  errorName,
  level,
  msg,
  occurrences,
}: MonitoringAlertDispatchInput & { occurrences: number }) {
  const route = context.route ? `Route: ${context.route}` : null;
  const orderCode = context.orderCode ? `Order: ${context.orderCode}` : null;
  const batchId = context.batchId ? `Batch: ${context.batchId}` : null;
  const type = context.type ? `Type: ${context.type}` : null;
  const environment = `Environment: ${getMonitoringEnvironment()}`;
  const site = `Site: ${getSiteUrl()}`;
  const requestId = context.requestId ? `Request: ${context.requestId}` : null;
  const duration = typeof context.durationMs === "number" ? `Duration: ${context.durationMs}ms` : null;
  const source = context.source ? `Source: ${context.source}` : null;
  const status = context.status != null ? `Status: ${context.status}` : null;
  const issue = error ? `Error: ${errorName ? `${errorName}: ` : ""}${error}` : null;
  const repeats = occurrences > 1 ? `Occurrences: ${occurrences}` : null;

  return [
    `[Bagelito ${level.toUpperCase()}] ${msg}`,
    environment,
    site,
    route,
    status,
    type,
    source,
    orderCode,
    batchId,
    requestId,
    duration,
    repeats,
    issue,
  ].filter(Boolean).join("\n");
}

async function recordAlertOccurrence({
  context,
  error,
  errorName,
  level,
  msg,
  policy,
}: MonitoringAlertDispatchInput & { policy: MonitoringAlertPolicy }) {
  const supabase = createSupabaseAdminClient();
  const { data, error: rpcError } = await supabase
    .rpc("record_monitoring_alert", {
      p_context: {
        ...compactContext(context),
        environment: getMonitoringEnvironment(),
        error,
        errorName,
      },
      p_cooldown_minutes: policy.cooldownMinutes,
      p_event_name: msg,
      p_fingerprint: buildFingerprint(level, msg, context),
      p_level: level,
      p_summary: error ? `${msg}: ${error}` : msg,
    })
    .single();

  if (rpcError) {
    rawMonitoringLog("error", "monitoring_alert_record_failed", {
      error: rpcError.message,
      event: msg,
    });
    return null;
  }

  return data as MonitoringAlertRpcRow | null;
}

async function markAlertSent(eventId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("mark_monitoring_alert_sent", {
    p_event_id: eventId,
  });

  if (error) {
    rawMonitoringLog("error", "monitoring_alert_mark_sent_failed", {
      error: error.message,
      eventId,
    });
    return false;
  }

  return true;
}

async function sendWebhookAlert({
  context,
  error,
  errorName,
  level,
  msg,
  occurrences,
}: MonitoringAlertDispatchInput & { occurrences: number }) {
  const webhookUrl = getMonitoringWebhookUrl();
  if (!webhookUrl) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const text = buildAlertText({ context, error, errorName, level, msg, occurrences });
    const response = await fetch(webhookUrl, {
      body: JSON.stringify({
        content: text,
        context: {
          ...compactContext(context),
          environment: getMonitoringEnvironment(),
          error,
          errorName,
          siteUrl: getSiteUrl(),
        },
        event: msg,
        level,
        text,
        username: "Bagelito Monitor",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      rawMonitoringLog("error", "monitoring_alert_webhook_failed", {
        event: msg,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    rawMonitoringLog("error", "monitoring_alert_webhook_failed", {
      error: error instanceof Error ? error.message : String(error),
      event: msg,
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatchMonitoringAlert(input: MonitoringAlertDispatchInput) {
  const policy = getAlertPolicy(input.level, input.msg);
  if (!policy) return;

  try {
    const record = await recordAlertOccurrence({
      ...input,
      policy,
    });

    if (!record?.should_send) return;

    const sent = await sendWebhookAlert({
      ...input,
      occurrences: record.occurrences,
    });

    if (sent && record.event_id) {
      await markAlertSent(record.event_id);
    }
  } catch (error) {
    rawMonitoringLog("error", "monitoring_alert_dispatch_failed", {
      error: error instanceof Error ? error.message : String(error),
      event: input.msg,
    });
  }
}
