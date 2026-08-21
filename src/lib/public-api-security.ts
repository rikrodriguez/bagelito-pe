import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logWarn } from "@/lib/monitoring";

type PublicApiScope = "complaints" | "payments" | "reservations" | "track" | "waitlist";

type RateLimitRule = {
  limit: number;
  scope: string;
  windowSeconds: number;
};

type RateLimitRpcRow = {
  allowed: boolean;
  hits: number;
  retry_after_seconds: number;
};

const scopeRules: Record<PublicApiScope, { contact: RateLimitRule; requester: RateLimitRule }> = {
  complaints: {
    contact: {
      limit: 4,
      scope: "complaints_contact",
      windowSeconds: 60 * 60 * 24,
    },
    requester: {
      limit: 10,
      scope: "complaints_requester",
      windowSeconds: 60 * 10,
    },
  },
  payments: {
    contact: {
      limit: 10,
      scope: "payments_contact",
      windowSeconds: 60 * 60,
    },
    requester: {
      limit: 20,
      scope: "payments_requester",
      windowSeconds: 60 * 10,
    },
  },
  reservations: {
    contact: {
      limit: 4,
      scope: "reservations_contact",
      windowSeconds: 60 * 60 * 12,
    },
    requester: {
      limit: 6,
      scope: "reservations_requester",
      windowSeconds: 60 * 10,
    },
  },
  waitlist: {
    contact: {
      limit: 2,
      scope: "waitlist_contact",
      windowSeconds: 60 * 60 * 24,
    },
    requester: {
      limit: 8,
      scope: "waitlist_requester",
      windowSeconds: 60 * 10,
    },
  },
  track: {
    contact: {
      limit: 8,
      scope: "track_contact",
      windowSeconds: 60 * 60 * 6,
    },
    requester: {
      limit: 15,
      scope: "track_requester",
      windowSeconds: 60 * 10,
    },
  },
};

export class PublicApiError extends Error {
  code: string;
  retryAfterSeconds: number | null;
  status: number;

  constructor(
    message: string,
    {
      code = "public_api_error",
      retryAfterSeconds = null,
      status = 400,
    }: {
      code?: string;
      retryAfterSeconds?: number | null;
      status?: number;
    } = {},
  ) {
    super(message);
    this.code = code;
    this.name = "PublicApiError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = status;
  }
}

export class RateLimitError extends PublicApiError {
  constructor(retryAfterSeconds: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    super(`Too many attempts. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`, {
      code: "rate_limited",
      retryAfterSeconds,
      status: 429,
    });
    this.name = "RateLimitError";
  }
}

export class BotTrapError extends PublicApiError {
  constructor() {
    super("Could not submit request. Please refresh and try again.", {
      code: "bot_trap_triggered",
      status: 400,
    });
    this.name = "BotTrapError";
  }
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length === 11) return digits.slice(2);
  if (digits.length > 9) return digits.slice(-9);
  return digits;
}

function hashIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined, functionName: string) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42883" || message.includes(functionName.toLowerCase());
}

function getRequesterIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? request.headers.get("cf-connecting-ip") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() ?? "";
  if (ip) return `ip:${ip}`;

  const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(0, 160);
  return `ua:${userAgent}`;
}

function getContactIdentifier(email: string, whatsapp: string) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(whatsapp);

  if (normalizedEmail) return `email:${normalizedEmail}`;
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  return "";
}

async function consumeRateLimit(scope: string, identifier: string, limit: number, windowSeconds: number) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .rpc("consume_api_rate_limit", {
      p_identifier: hashIdentifier(identifier),
      p_limit: limit,
      p_scope: scope,
      p_window_seconds: windowSeconds,
    })
    .single();

  if (error) {
    if (isMissingFunctionError(error, "consume_api_rate_limit")) {
      logWarn("public_rate_limit_rpc_missing", {
        limit,
        scope,
        windowSeconds,
      });
      return;
    }

    throw new Error("Could not verify request rate limit: " + error.message);
  }

  const result = data as RateLimitRpcRow | null;
  if (!result?.allowed) {
    throw new RateLimitError(Math.max(1, result?.retry_after_seconds ?? windowSeconds));
  }
}

export function assertBotTrapClear(value: string | null | undefined) {
  if ((value ?? "").trim()) {
    throw new BotTrapError();
  }
}

export async function enforcePublicApiSecurity({
  email,
  request,
  scope,
  trapValue,
  whatsapp,
}: {
  email: string;
  request: Request;
  scope: PublicApiScope;
  trapValue?: string | null | undefined;
  whatsapp: string;
}) {
  assertBotTrapClear(trapValue);

  const rules = scopeRules[scope];
  const requesterIdentifier = getRequesterIdentifier(request);
  const contactIdentifier = getContactIdentifier(email, whatsapp);

  await consumeRateLimit(
    rules.requester.scope,
    requesterIdentifier,
    rules.requester.limit,
    rules.requester.windowSeconds,
  );

  if (contactIdentifier) {
    await consumeRateLimit(
      rules.contact.scope,
      contactIdentifier,
      rules.contact.limit,
      rules.contact.windowSeconds,
    );
  }
}
