export type BagelitoSalesStage =
  | "new_inquiry"
  | "menu_discovery"
  | "recommendation"
  | "order_configuration"
  | "details_collection"
  | "quote_ready"
  | "payment_pending"
  | "payment_evidence_received"
  | "confirmed"
  | "production"
  | "delivery"
  | "completed"
  | "lost"
  | "human_review";

export type GhlCustomFieldValue = {
  id: string;
  fieldValue: string | number;
};

export const BAGELITO_GHL_CONFIG = {
  locationId: "wGVp4L7zAl46JR7gg0Hx",
  pipelineId: "atqtqzswVGYoGU18TF8z",
  stageIds: {
    new_inquiry: "bbe7c4a0-e9db-4a07-b57d-0721dd5f8b73",
    menu_discovery: "742a824e-0cf0-4616-9213-5ebeef71dc9d",
    recommendation: "742a824e-0cf0-4616-9213-5ebeef71dc9d",
    order_configuration: "65a30996-7475-461a-80b8-75e685e1d5e4",
    details_collection: "44974f36-cf1e-4cdb-9aaf-87d527be9176",
    quote_ready: "2e97ae2c-eaf1-4307-9b00-745fad62f83d",
    payment_pending: "0585ceec-3683-49cf-8d0f-6b966341f61c",
    payment_evidence_received: "0b8e8d6a-a3a7-4baa-9be2-7dd005ff9083",
    confirmed: "ee15b1c7-b83b-4f00-995d-d7aefad559cf",
    production: "a156a48a-2afa-411a-9d2b-3fc9c1006701",
    delivery: "2858af5b-1d27-4ede-8ef7-6f2867d89cdd",
    completed: "09c4debd-4170-41b1-b36c-26c5b33f0e8c",
    human_review: "cc706e8b-07d7-4079-ab48-47609c310542",
    lost: "464f9679-6a5c-4e3b-961f-d782cd1c59e7",
  },
  contactFields: {
    instagramUserId: "YMqyWSqEiTyE3u3SgXl5",
    instagramUsername: "YxVBq2caxvWmpgkQKIcx",
    preferredLanguage: "domH1AQAZQBfKN1UFoUL",
    favoriteFlavors: "Ilz60BOeZnt7SOPogWrB",
    customerStatus: "98Tyyn9n6MxrocJZoOby",
  },
  opportunityFields: {
    draftId: "VURl4HkdljWGJHXA6TLW",
    conversationId: "XuusqPh2IFQ86DytisNa",
    batchId: "M7CdQanSHXDXp76cKFBY",
    pack: "JIpR445DlJu3dyzEKbS4",
    units: "qDAsMNcxqP442rhyS8TM",
    flavors: "pbqo9DiMWLbNQdjmHJ7P",
    schmears: "j6QJNN7gLhiJHoV8UApy",
    district: "YcVEYnwErfb41tmLcxSX",
    address: "laCgedFMnlN6BgIxHqgs",
    total: "ehvbhMqtdQ63YmKvrdPD",
    paymentMethod: "56x7Vk2On55txY4fOzmB",
    paymentStatus: "FAGU5085fCUqbSj5YXoY",
    stage: "fFDZRiMIPr6tuiECFwEx",
    nextBestAction: "LnkfrJpsLPtBiCmrL1ik",
    handoffReason: "Y6THkp6mRCAfCV9vFwLD",
    checkoutUrl: "Aok79XFWl22gTqVluOpW",
    deliveryWindow: "XF1Zu13UFq9v5zJBqFv4",
    voucherReference: "60gUz0JPM0OwYkKBIl1z",
  },
} as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || "Instagram Lead", lastName: undefined };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function addField(
  fields: GhlCustomFieldValue[],
  id: string,
  value: unknown,
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    fields.push({ id, fieldValue: value });
    return;
  }
  const normalized = clean(value);
  if (normalized) fields.push({ id, fieldValue: normalized });
}

function formatLines(lines: Array<{ name: string; quantity: number }> | undefined) {
  return (lines ?? [])
    .filter((line) => clean(line.name) && Number.isFinite(line.quantity) && line.quantity > 0)
    .map((line) => `${line.name.trim()}: ${line.quantity}`)
    .join("\n");
}

export function getGhlStage(stage: BagelitoSalesStage) {
  return BAGELITO_GHL_CONFIG.stageIds[stage];
}

export function getGhlOpportunityStatus(stage: BagelitoSalesStage) {
  if (stage === "completed") return "won" as const;
  if (stage === "lost") return "lost" as const;
  return "open" as const;
}

export function buildGhlContactPayload(input: {
  instagramUserId: string;
  instagramUsername?: string | null;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
  preferredLanguage?: string | null;
  favoriteFlavors?: string[];
  customerStatus?: string | null;
}) {
  const identityName = clean(input.displayName) || clean(input.instagramUsername) || "Instagram Lead";
  const { firstName, lastName } = splitName(identityName);
  const customFields: GhlCustomFieldValue[] = [];

  addField(customFields, BAGELITO_GHL_CONFIG.contactFields.instagramUserId, input.instagramUserId);
  addField(customFields, BAGELITO_GHL_CONFIG.contactFields.instagramUsername, input.instagramUsername);
  addField(customFields, BAGELITO_GHL_CONFIG.contactFields.preferredLanguage, input.preferredLanguage);
  addField(
    customFields,
    BAGELITO_GHL_CONFIG.contactFields.favoriteFlavors,
    (input.favoriteFlavors ?? []).map((flavor) => flavor.trim()).filter(Boolean).join(", "),
  );
  addField(customFields, BAGELITO_GHL_CONFIG.contactFields.customerStatus, input.customerStatus);

  return {
    firstName,
    ...(lastName ? { lastName } : {}),
    ...(clean(input.phone) ? { phone: clean(input.phone) } : {}),
    ...(clean(input.email) ? { email: clean(input.email) } : {}),
    source: "Bagelito Instagram",
    country: "PE",
    timezone: "America/Lima",
    customFields,
  };
}

export function buildGhlOpportunityPayload(input: {
  draftId: string;
  contactId: string;
  customerName?: string | null;
  stage: BagelitoSalesStage;
  total?: number | null;
  opportunityId?: string | null;
}) {
  const draftId = input.draftId.trim();
  const customerName = clean(input.customerName) || "Instagram Lead";
  if (!draftId || !input.contactId.trim()) {
    throw new Error("bagelito_ghl_opportunity_identity_missing");
  }

  return {
    ...(clean(input.opportunityId) ? { id: clean(input.opportunityId) } : {}),
    pipelineId: BAGELITO_GHL_CONFIG.pipelineId,
    pipelineStageId: getGhlStage(input.stage),
    contactId: input.contactId.trim(),
    name: `Bagelito | ${customerName} | ${draftId}`,
    status: getGhlOpportunityStatus(input.stage),
    ...(typeof input.total === "number" && Number.isFinite(input.total)
      ? { monetaryValue: input.total }
      : {}),
  };
}

export function buildGhlOpportunityCustomFields(input: {
  draftId: string;
  conversationId: string;
  batchId?: string | null;
  packName?: string | null;
  units?: number | null;
  items?: Array<{ name: string; quantity: number }>;
  schmears?: Array<{ name: string; quantity: number }>;
  district?: string | null;
  address?: string | null;
  total?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  stage: BagelitoSalesStage;
  nextBestAction?: string | null;
  handoffReason?: string | null;
  checkoutUrl?: string | null;
  deliveryWindow?: string | null;
  voucherReference?: string | null;
}) {
  const fields: GhlCustomFieldValue[] = [];
  const ids = BAGELITO_GHL_CONFIG.opportunityFields;

  addField(fields, ids.draftId, input.draftId);
  addField(fields, ids.conversationId, input.conversationId);
  addField(fields, ids.batchId, input.batchId);
  addField(fields, ids.pack, input.packName);
  addField(fields, ids.units, input.units);
  addField(fields, ids.flavors, formatLines(input.items));
  addField(fields, ids.schmears, formatLines(input.schmears));
  addField(fields, ids.district, input.district);
  addField(fields, ids.address, input.address);
  addField(fields, ids.total, input.total);
  addField(fields, ids.paymentMethod, input.paymentMethod);
  addField(fields, ids.paymentStatus, input.paymentStatus);
  addField(fields, ids.stage, input.stage);
  addField(fields, ids.nextBestAction, input.nextBestAction);
  addField(fields, ids.handoffReason, input.handoffReason);
  addField(fields, ids.checkoutUrl, input.checkoutUrl);
  addField(fields, ids.deliveryWindow, input.deliveryWindow);
  addField(fields, ids.voucherReference, input.voucherReference);

  return fields;
}

export function buildGhlSyncBundle(input: {
  contact: Parameters<typeof buildGhlContactPayload>[0];
  opportunity: Parameters<typeof buildGhlOpportunityPayload>[0];
  order: Parameters<typeof buildGhlOpportunityCustomFields>[0];
}) {
  return {
    locationId: BAGELITO_GHL_CONFIG.locationId,
    contactPayload: buildGhlContactPayload(input.contact),
    opportunityPayload: buildGhlOpportunityPayload(input.opportunity),
    opportunityUpdatePayload: {
      pipelineId: BAGELITO_GHL_CONFIG.pipelineId,
      pipelineStageId: getGhlStage(input.order.stage),
      status: getGhlOpportunityStatus(input.order.stage),
      customFields: buildGhlOpportunityCustomFields(input.order),
    },
  };
}
