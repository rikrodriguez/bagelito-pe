import { assertCulqiEnabled } from "./config";

const culqiApiUrl = "https://api.culqi.com/v2";

type CulqiEventResponse = {
  id: string;
  type: string;
  data?: unknown;
};

export type CulqiChargeResponse = {
  action_code?: string;
  amount: number;
  amount_refunded?: number;
  capture?: boolean;
  capture_date?: number;
  current_amount?: number;
  currency_code?: string;
  currency?: string;
  dispute?: boolean;
  duplicated?: boolean;
  id?: string;
  metadata?: Record<string, string> | null;
  outcome?: {
    type?: string;
    code?: string;
    decline_code?: string;
    merchant_message?: string;
    user_message?: string;
  } | null;
  paid?: boolean;
  object?: string;
  source?: {
    id?: string;
    type?: string;
  } | null;
  state?: string;
};

export type CulqiAuthentication3DS = {
  cavv: string;
  directoryServerTransactionId?: string;
  eci: string;
  protocolVersion: string;
  xid: string;
};

export type CulqiChargeResult =
  | {
    charge: CulqiChargeResponse & { id: string };
    requires3DS: false;
  }
  | {
    response: CulqiChargeResponse;
    requires3DS: true;
  };

type CulqiErrorPayload = {
  charge_id?: string;
  code?: string;
  decline_code?: string;
  merchant_message?: string;
  message?: string;
  object?: string;
  param?: unknown;
  type?: unknown;
  user_message?: string;
};

export type CulqiErrorType = "invalid_request_error" | "authentication_error" | "parameter_error"
  | "card_error" | "limit_api_error" | "resource_error" | "api_error" | "unknown";

export type CulqiEventErrorParam = "id" | "environment" | "version" | "authorization" | "other" | "absent";

function eventLookupApiError(payload: CulqiErrorPayload | null, status: number) {
  let type: unknown;
  let param: unknown;
  let upstreamErrorParam: CulqiEventErrorParam = "other";
  try { type = payload?.type; } catch { /* Unreadable provider type is unknown. */ }
  try {
    param = payload?.param;
    // Exact, closed labels only. Never normalize, coerce or retain a raw param.
    switch (param) {
      case undefined: case null: upstreamErrorParam = "absent"; break;
      case "id": upstreamErrorParam = "id"; break;
      case "environment": case "x-culqi-env": upstreamErrorParam = "environment"; break;
      case "version": case "x-api-version": upstreamErrorParam = "version"; break;
      case "authorization": upstreamErrorParam = "authorization"; break;
    }
  } catch { /* Unreadable provider param stays other. */ }
  // Event failures retain only bounded context. Charge error construction and
  // its user-facing messages/fields continue through the original path.
  const error = new CulqiApiError({ type }, status);
  Object.defineProperty(error, "upstreamErrorParam", { value: upstreamErrorParam });
  return error;
}

const culqiErrorTypes = new Set<CulqiErrorType>([
  "invalid_request_error", "authentication_error", "parameter_error", "card_error",
  "limit_api_error", "resource_error", "api_error",
]);

export class CulqiApiError extends Error {
  chargeId: string | null;
  code: string | null;
  status: number;
  userMessage: string;
  readonly errorType: CulqiErrorType;
  readonly eventModeMatchesConfig: boolean | null = null;

  constructor(payload: CulqiErrorPayload | null, status: number) {
    const userMessage = payload?.user_message
      ?? payload?.merchant_message
      ?? payload?.message
      ?? `Culqi request failed with status ${status}.`;
    super(userMessage);
    this.name = "CulqiApiError";
    this.chargeId = payload?.charge_id ?? null;
    this.code = payload?.decline_code ?? payload?.code ?? null;
    this.status = status;
    this.userMessage = userMessage;
    let errorType: unknown;
    try { errorType = payload?.type; } catch { /* An unreadable provider type is unknown. */ }
    this.errorType = typeof errorType === "string" && culqiErrorTypes.has(errorType as CulqiErrorType)
      ? errorType as CulqiErrorType : "unknown";
  }
}

function toMinorUnits(amount: number) {
  const minor = Math.round(amount * 100);
  if (!Number.isInteger(minor) || minor < 1) throw new Error("Payment amount must be a positive amount.");
  return minor;
}

async function culqiRequestWithStatus<T>(path: string, init: RequestInit = {}, assertInBudget?: () => void,
  errorForResponse?: (payload: CulqiErrorPayload | null, status: number) => CulqiApiError) {
  const { hasSecretKey } = assertCulqiEnabled();
  if (!hasSecretKey) throw new Error("Culqi secret key is not configured.");

  assertInBudget?.();
  const response = await fetch(`${culqiApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CULQI_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  assertInBudget?.();
  if (init.redirect === "error" && (response.redirected
    || (response.url && response.url !== `${culqiApiUrl}${path}`))) {
    throw new Error("Culqi charge requests cannot follow redirects.");
  }
  const payload = await response.json().catch(() => null) as T | CulqiErrorPayload | null;
  assertInBudget?.();
  if (!response.ok) {
    if (errorForResponse) throw errorForResponse(payload as CulqiErrorPayload | null, response.status);
    throw new CulqiApiError(payload as CulqiErrorPayload | null, response.status);
  }

  return {
    payload: payload as T,
    status: response.status,
  };
}

async function culqiRequest<T>(path: string, init: RequestInit = {}, assertInBudget?: () => void,
  errorForResponse?: (payload: CulqiErrorPayload | null, status: number) => CulqiApiError) {
  const response = await culqiRequestWithStatus<T>(path, init, assertInBudget, errorForResponse);
  return response.payload;
}

// Charge operations own one budget across headers, JSON and queued continuations.
// Racing the operation is necessary because AbortSignal is only cooperative.
async function withinChargeDeadline<T>(
  operation: (signal: AbortSignal, assertInBudget: () => void) => Promise<T>,
) {
  const controller = new AbortController();
  const expiresAt = performance.now() + 10_000;
  const timeoutError = new DOMException("Culqi charge request deadline exceeded.", "TimeoutError");
  const assertInBudget = () => {
    if (controller.signal.aborted || performance.now() >= expiresAt) {
      controller.abort(timeoutError);
      throw timeoutError;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError);
      controller.abort(timeoutError);
    }, 10_000);
  });
  try {
    assertInBudget();
    const result = await Promise.race([operation(controller.signal, assertInBudget), deadline]);
    assertInBudget();
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// Authenticated observation of exactly one persisted charge reference. This does
// not assert payment: callers must still validate money, source, order and capture.
export async function fetchCulqiCharge(chargeId: string): Promise<CulqiChargeResponse> {
  const { mode, hasSecretKey } = assertCulqiEnabled();
  const environment = mode === "sandbox" ? "test" : mode === "live" ? "live" : null;
  if (!environment) throw new Error("Culqi charge environment is not configured.");
  if (!hasSecretKey) throw new Error("Culqi secret key is not configured.");
  if (typeof chargeId !== "string" || !/^chr_(test|live)_[A-Za-z0-9_-]{8,100}$/.test(chargeId)
    || !chargeId.startsWith(`chr_${environment}_`)) {
    throw new Error("A matching Culqi charge ID is required.");
  }
  const url = `${culqiApiUrl}/charges/${encodeURIComponent(chargeId)}`;
  return withinChargeDeadline(async (signal, assertInBudget) => {
    const response = await fetch(url, {
      method: "GET", signal, cache: "no-store", redirect: "error", credentials: "omit",
      headers: {
        Authorization: `Bearer ${process.env.CULQI_SECRET_KEY}`,
        "Content-Type": "application/json", Accept: "application/json",
        "x-api-version": "2", "x-culqi-env": environment,
      },
    });
    assertInBudget();
    if (response.redirected || (response.url && response.url !== url)) {
      throw new Error("Culqi charge lookup cannot follow redirects.");
    }
    const payload: unknown = await response.json().catch(() => null);
    assertInBudget();
    if (!response.ok) {
      // Preserve only bounded classification, never raw provider error messages,
      // charge IDs or payment details in an exception that a caller could log.
      const type = payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as { type?: unknown }).type : undefined;
      throw new CulqiApiError({ type }, response.status);
    }
    if (response.status !== 200 || !payload || typeof payload !== "object" || Array.isArray(payload)
      || (payload as { object?: unknown }).object !== "charge"
      || (payload as { id?: unknown }).id !== chargeId) {
      throw new Error("Culqi did not return the requested charge.");
    }
    return payload as CulqiChargeResponse;
  });
}

function splitCustomerName(customerName: string) {
  const parts = customerName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "Cliente";
  return {
    firstName,
    lastName: parts.join(" ") || "Bagelito",
  };
}

function normalizePhoneNumber(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.startsWith("51") && digits.length === 11) return digits.slice(2);
  return digits.slice(-9);
}

export async function createCulqiCharge({
  amount,
  authentication3DS,
  customerEmail,
  customerName,
  deliveryAddress,
  deviceFingerprintId,
  district,
  orderCode,
  phoneNumber,
  sourceId,
}: {
  amount: number;
  authentication3DS?: CulqiAuthentication3DS;
  customerEmail: string;
  customerName: string;
  deliveryAddress: string;
  deviceFingerprintId?: string;
  district: string;
  orderCode: string;
  phoneNumber: string;
  sourceId: string;
}) {
  if (sourceId.startsWith("ype_") && (authentication3DS || amount > 2000)) {
    throw new Error("Yape does not support card 3DS or payments above PEN 2000.");
  }
  const { firstName, lastName } = splitCustomerName(customerName);
  const chargePayload = {
      amount: toMinorUnits(amount),
      antifraud_details: {
        address: deliveryAddress,
        address_city: district,
        country_code: "PE",
        ...(deviceFingerprintId ? { device_finger_print_id: deviceFingerprintId } : {}),
        email: customerEmail,
        first_name: firstName,
        last_name: lastName,
        phone_number: normalizePhoneNumber(phoneNumber),
      },
      capture: true,
      currency_code: "PEN",
      description: `Bagelito batch - ${orderCode}`,
      email: customerEmail,
      metadata: {
        bagelito_order_code: orderCode,
      },
      source_id: sourceId,
      ...(authentication3DS ? { authentication_3DS: authentication3DS } : {}),
  };
  const { payload: charge, status } = await withinChargeDeadline((signal, assertInBudget) =>
    culqiRequestWithStatus<CulqiChargeResponse>("/charges", {
      body: JSON.stringify(chargePayload), method: "POST", signal, redirect: "error", credentials: "omit",
    }, assertInBudget));

  if (status === 200 && charge?.action_code === "REVIEW") {
    if (!sourceId.startsWith("tkn_")) throw new Error("Unexpected card authentication for non-card source.");
    if (typeof charge.id === "string" && charge.id) {
      // A returned charge identity must survive reconciliation. This is only an
      // observation: the evidence policy rejects REVIEW rather than paying or
      // reopening the claim for another charge POST.
      return { charge: charge as CulqiChargeResponse & { id: string }, requires3DS: false } satisfies CulqiChargeResult;
    }
    if (charge.id != null || charge.capture === true) {
      throw new Error("Ambiguous Culqi authentication response.");
    }
    return {
      requires3DS: true,
      response: charge,
    } satisfies CulqiChargeResult;
  }

  if (status !== 201 || !charge?.id || (charge.object && charge.object !== "charge")) {
    throw new Error("Culqi did not return a valid charge. The payment was not completed.");
  }

  return {
    charge: charge as CulqiChargeResponse & { id: string },
    requires3DS: false,
  } satisfies CulqiChargeResult;
}

export async function fetchCulqiEvent(eventId: string) {
  const { mode } = assertCulqiEnabled();
  const environment = mode === "sandbox" ? "test" : mode === "live" ? "live" : null;
  if (!environment) throw new Error("Culqi event environment is not configured.");
  const controller = new AbortController();
  const expiresAt = performance.now() + 10_000;
  const timeoutError = new DOMException("Culqi event lookup deadline exceeded.", "TimeoutError");
  const assertInBudget = () => {
    // A delayed timer cannot authorize accepting headers or a body after expiry.
    if (controller.signal.aborted || performance.now() >= expiresAt) {
      controller.abort(timeoutError);
      throw timeoutError;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError);
      controller.abort(timeoutError);
    }, 10_000);
  });
  // Match the official SDK's event lookup contract without changing charge requests.
  try {
    // The official SDK sends version/environment headers; Culqi's documented
    // Event GET also supports Authorization only. Retry once with minimal
    // headers ONLY for a 400 parameter error on a correctly shaped same-mode ID.
    // Both GETs share one ten-second deadline. Neither can create charges.
    const readEvent = (headers: Record<string, string>) => culqiRequest<CulqiEventResponse>(
      `/events/${encodeURIComponent(eventId)}`, {
        method: "GET", signal: controller.signal, redirect: "error", credentials: "omit",
        headers,
      }, assertInBudget, eventLookupApiError,
    );
    const readWithDocumentedFallback = async () => {
      try {
        return await readEvent({
          Accept: "application/json", "x-api-version": "2", "x-culqi-env": environment,
        });
      } catch (error) {
        const parameter = (error as CulqiApiError & { upstreamErrorParam?: CulqiEventErrorParam })
          ?.upstreamErrorParam;
        if (!(error instanceof CulqiApiError)
          || error.status !== 400 || error.errorType !== "parameter_error"
          || !["version", "environment", "absent"].includes(parameter ?? "")
          || !new RegExp(`^evt_${environment}_[A-Za-z0-9]{16}$`).test(eventId)) throw error;
        assertInBudget();
        return readEvent({ Accept: "application/json" });
      }
    };
    // Bounds both HTTP responses and JSON parsing under the original deadline.
    const event = await Promise.race([readWithDocumentedFallback(), deadline]);
    assertInBudget();
    return event;
  } catch (error) {
    if (error instanceof CulqiApiError) {
      // Event-only context contains no ID or provider payload. It is immutable
      // and does not change ID acceptance, authentication or transaction rules.
      Object.defineProperty(error, "eventModeMatchesConfig", {
        value: eventId.startsWith(`evt_${environment}_`), writable: false, configurable: false,
      });
      Object.defineProperty(error, "eventIdMatchesDocumentedLength", {
        // Observation only: the existing event ID acceptance rules are unchanged.
        value: eventId.length === 25, writable: false, configurable: false,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function toPaymentMinorUnits(amount: number) {
  return toMinorUnits(amount);
}
