export type InstagramOutboundMedia = {
  assetKey: string;
  publicUrl: string;
};

export type InstagramSendResult = {
  recipientId: string | null;
  messageId: string | null;
  raw: Record<string, unknown>;
};

const GRAPH_VERSION = "v26.0";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

async function postInstagramMessage(
  recipientId: string,
  message: Record<string, unknown>,
): Promise<InstagramSendResult> {
  const accountId = requiredEnv("INSTAGRAM_ACCOUNT_ID");
  const accessToken = requiredEnv("INSTAGRAM_ACCESS_TOKEN");

  const response = await fetch(
    `https://graph.instagram.com/${GRAPH_VERSION}/${accountId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message,
      }),
    },
  );

  const rawText = await response.text();
  let payload: Record<string, unknown> = {};

  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { raw_text: rawText.slice(0, 1000) };
  }

  if (!response.ok) {
    throw new Error(
      `instagram_send_failed:${response.status}:${rawText.slice(0, 500)}`,
    );
  }

  return {
    recipientId:
      typeof payload.recipient_id === "string" ? payload.recipient_id : null,
    messageId:
      typeof payload.message_id === "string" ? payload.message_id : null,
    raw: payload,
  };
}

export async function sendInstagramText(
  recipientId: string,
  text: string,
): Promise<InstagramSendResult> {
  const clean = text.trim();
  if (!clean) throw new Error("instagram_send_empty_text");

  return postInstagramMessage(recipientId, { text: clean });
}

export async function sendInstagramImage(
  recipientId: string,
  publicUrl: string,
): Promise<InstagramSendResult> {
  const url = publicUrl.trim();
  if (!/^https:\/\//i.test(url)) throw new Error("instagram_send_invalid_image_url");

  return postInstagramMessage(recipientId, {
    attachment: {
      type: "image",
      payload: {
        url,
        is_reusable: false,
      },
    },
  });
}
