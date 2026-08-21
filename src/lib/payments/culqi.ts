import { assertCulqiEnabled } from "./config";

const culqiApiUrl = "https://api.culqi.com/v2";

type CulqiOrderResponse = {
  id: string;
  amount: number;
  currency_code: string;
  expiration_date?: number;
  metadata?: Record<string, string> | null;
  order_number?: string;
  state?: string;
};

type CulqiEventResponse = {
  id: string;
  type: string;
  data?: unknown;
};

export type CulqiChargeResponse = {
  action_code?: string;
  amount: number;
  currency_code?: string;
  currency?: string;
  duplicated?: boolean;
  id?: string;
  metadata?: Record<string, string> | null;
  outcome?: {
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
  user_message?: string;
};

export class CulqiApiError extends Error {
  chargeId: string | null;
  code: string | null;
  status: number;
  userMessage: string;

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
  }
}

function toMinorUnits(amount: number) {
  const minor = Math.round(amount * 100);
  if (!Number.isInteger(minor) || minor < 1) throw new Error("Payment amount must be a positive amount.");
  return minor;
}

async function culqiRequestWithStatus<T>(path: string, init: RequestInit = {}) {
  const { hasSecretKey } = assertCulqiEnabled();
  if (!hasSecretKey) throw new Error("Culqi secret key is not configured.");

  const response = await fetch(`${culqiApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CULQI_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as T | CulqiErrorPayload | null;
  if (!response.ok) {
    throw new CulqiApiError(payload as CulqiErrorPayload | null, response.status);
  }

  return {
    payload: payload as T,
    status: response.status,
  };
}

async function culqiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await culqiRequestWithStatus<T>(path, init);
  return response.payload;
}

export async function createCulqiOrder({
  amount,
  customerEmail,
  customerName,
  orderCode,
  phoneNumber,
  expirationDate,
}: {
  amount: number;
  customerEmail: string;
  customerName: string;
  orderCode: string;
  phoneNumber: string;
  expirationDate?: Date;
}) {
  const expiration = expirationDate ?? new Date(Date.now() + 30 * 60 * 1000);
  const { firstName, lastName } = splitCustomerName(customerName);
  const order = await culqiRequest<CulqiOrderResponse>("/orders", {
    body: JSON.stringify({
      amount: toMinorUnits(amount),
      currency_code: "PEN",
      confirm: false,
      description: `Bagelito batch - ${orderCode}`,
      order_number: orderCode,
      client_details: {
        email: customerEmail,
        first_name: firstName,
        last_name: lastName,
        phone_number: normalizePhoneNumber(phoneNumber),
      },
      expiration_date: Math.floor(expiration.getTime() / 1000),
      metadata: {
        bagelito_order_code: orderCode,
      },
    }),
    method: "POST",
  });

  return {
    ...order,
    amount: Number(order.amount),
    expiresAt: expiration.toISOString(),
  };
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
  const { payload: charge, status } = await culqiRequestWithStatus<CulqiChargeResponse>("/charges", {
    body: JSON.stringify(chargePayload),
    method: "POST",
  });

  if (status === 200 && charge?.action_code === "REVIEW") {
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
  return culqiRequest<CulqiEventResponse>(`/events/${encodeURIComponent(eventId)}`);
}

export function toPaymentMinorUnits(amount: number) {
  return toMinorUnits(amount);
}
