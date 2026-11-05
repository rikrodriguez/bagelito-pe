import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type InstagramNormalizedEvent = {
  accountInstagramId: string | null;
  attachments: unknown[];
  eventKey: string;
  isEcho: boolean;
  kind: "message" | "postback" | "reaction" | "read" | "unknown";
  messageId: string | null;
  raw: Record<string, unknown>;
  recipientInstagramId: string | null;
  senderInstagramId: string | null;
  sentAt: string;
  text: string | null;
};

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function hashInstagramPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function verifyInstagramWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const supplied = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  if (supplied.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(supplied, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

export function verifyWebhookToken(
  suppliedToken: string | null,
  configuredToken: string | undefined,
): boolean {
  if (!suppliedToken || !configuredToken) return false;
  const supplied = Buffer.from(suppliedToken, "utf8");
  const expected = Buffer.from(configuredToken, "utf8");
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

export function normalizeInstagramWebhook(
  payload: unknown,
): InstagramNormalizedEvent[] {
  const root = asRecord(payload);
  if (!root || root.object !== "instagram" || !Array.isArray(root.entry)) return [];

  const normalized: InstagramNormalizedEvent[] = [];

  root.entry.forEach((entryValue, entryIndex) => {
    const entry = asRecord(entryValue);
    if (!entry) return;

    const accountInstagramId = safeString(entry.id);
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];

    messaging.forEach((eventValue, eventIndex) => {
      const event = asRecord(eventValue);
      if (!event) return;

      const sender = asRecord(event.sender);
      const recipient = asRecord(event.recipient);
      const message = asRecord(event.message);
      const postback = asRecord(event.postback);
      const reaction = asRecord(event.reaction);
      const read = asRecord(event.read);

      const senderInstagramId = safeString(sender?.id);
      const recipientInstagramId = safeString(recipient?.id);
      const messageId = safeString(message?.mid);
      const text = safeString(message?.text);
      const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
      const timestamp =
        typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
          ? event.timestamp
          : Date.now();

      let kind: InstagramNormalizedEvent["kind"] = "unknown";
      if (message) kind = "message";
      else if (postback) kind = "postback";
      else if (reaction) kind = "reaction";
      else if (read) kind = "read";

      const isEcho = message?.is_echo === true;
      const eventKey =
        messageId ??
        createHash("sha256")
          .update(
            JSON.stringify({
              accountInstagramId,
              entryIndex,
              event,
              eventIndex,
            }),
            "utf8",
          )
          .digest("hex");

      normalized.push({
        accountInstagramId,
        attachments,
        eventKey,
        isEcho,
        kind,
        messageId,
        raw: event,
        recipientInstagramId,
        senderInstagramId,
        sentAt: new Date(timestamp).toISOString(),
        text,
      });
    });
  });

  return normalized;
}
