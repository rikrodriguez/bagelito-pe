import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SyncJob = {
  id: string;
  entity_type: "contact" | "opportunity" | "order";
  entity_id: string;
  operation: "upsert" | "stage_update" | "status_update" | "note";
  entity_version: number;
  idempotency_key: string;
  payload: SyncPayload;
  attempts: number;
};

type SyncPayload = {
  leadId?: string | null;
  draftId?: string | null;
  contact: {
    id?: string | null;
    body: Record<string, unknown>;
  };
  opportunity?: {
    id?: string | null;
    body: Record<string, unknown>;
    customFields?: Array<Record<string, unknown>>;
  } | null;
};

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function retrySeconds(attempts: number) {
  return Math.min(3600, 30 * Math.max(1, 2 ** Math.max(0, attempts - 1)));
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

async function ghlRequest(args: {
  token: string;
  version: string;
  method: "POST" | "PUT";
  path: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(`https://services.leadconnectorhq.com${args.path}`, {
    method: args.method,
    headers: {
      authorization: `Bearer ${args.token}`,
      version: args.version,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(args.body),
  });

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw: raw.slice(0, 1000) };
  }

  if (!response.ok) {
    throw new Error(`ghl_api_status_${response.status}`);
  }

  return payload;
}

function extractId(payload: Record<string, unknown>, key: string) {
  const nested = payload[key];
  if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).id === "string") {
    return (nested as Record<string, unknown>).id as string;
  }
  return null;
}

const BAGELITO_LOCATION_ID = "AO82PQzM13CKpSZO2hER";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contactSearchName(body: Record<string, unknown>) {
  const fullName = optionalText(body.name);
  if (fullName) return fullName.toLowerCase();
  const parts = [optionalText(body.firstName), optionalText(body.lastName)].filter(Boolean);
  return parts.length ? parts.join(" ").toLowerCase() : null;
}

function customFieldValue(fields: unknown, fieldId: string) {
  if (!Array.isArray(fields)) return null;
  for (const field of fields) {
    if (!field || typeof field !== "object") continue;
    const record = field as Record<string, unknown>;
    if (record.id !== fieldId) continue;
    const value = record.fieldValue ?? record.field_value ?? record.value;
    return optionalText(value);
  }
  return null;
}

async function findIgOnlyContact(args: {
  token: string;
  version: string;
  body: Record<string, unknown>;
  locationId: string;
  instagramUserIdFieldId: string;
}) {
  const contactName = contactSearchName(args.body);
  const instagramUserId = customFieldValue(args.body.customFields, args.instagramUserIdFieldId);
  if (!contactName || !instagramUserId) return null;

  const response = await ghlRequest({
    token: args.token,
    version: args.version,
    method: "POST",
    path: "/contacts/search",
    body: {
      locationId: args.locationId,
      filters: [{ field: "contactName", operator: "eq", value: contactName }],
      pageLimit: 20,
    },
  });

  const contacts = Array.isArray(response.contacts) ? response.contacts : [];
  for (const candidate of contacts) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const candidateInstagramId = customFieldValue(record.customFields, args.instagramUserIdFieldId);
    if (candidateInstagramId === instagramUserId && typeof record.id === "string") {
      return record.id;
    }
  }
  return null;
}

async function syncJob(args: {
  job: SyncJob;
  db: ReturnType<typeof createClient>;
  token: string;
  version: string;
  locationId: string;
  instagramUserIdFieldId: string;
  pipelineId: string;
}) {
  const { job, db, token, version, locationId, instagramUserIdFieldId, pipelineId } = args;
  const payload = job.payload;
  if (!payload?.contact?.body) throw new Error("invalid_sync_payload:contact");
  if (payload.contact.body.locationId && payload.contact.body.locationId !== locationId) throw new Error("invalid_sync_payload:location_mismatch");
  if (payload.opportunity && payload.opportunity.body?.pipelineId !== pipelineId) {
    throw new Error("invalid_sync_payload:pipeline_mismatch");
  }


  let contactId = payload.contact.id?.trim() || null;
  let contactResponse: Record<string, unknown> = {};

  if (contactId) {
    contactResponse = await ghlRequest({
      token,
      version,
      method: "PUT",
      path: `/contacts/${encodeURIComponent(contactId)}`,
      body: payload.contact.body,
    });
  } else {
    const hasEmailOrPhone = Boolean(
      optionalText(payload.contact.body.email) || optionalText(payload.contact.body.phone),
    );

    if (hasEmailOrPhone) {
      contactResponse = await ghlRequest({
        token,
        version,
        method: "POST",
        path: "/contacts/upsert",
        body: {
          ...payload.contact.body,
          locationId,
          createNewIfDuplicateAllowed: false,
        },
      });
      contactId = extractId(contactResponse, "contact");
    } else {
      contactId = await findIgOnlyContact({ token, version, body: payload.contact.body, locationId, instagramUserIdFieldId });
      if (contactId) {
        contactResponse = await ghlRequest({
          token,
          version,
          method: "PUT",
          path: `/contacts/${encodeURIComponent(contactId)}`,
          body: payload.contact.body,
        });
      } else {
        contactResponse = await ghlRequest({
          token,
          version,
          method: "POST",
          path: "/contacts/",
          body: {
            ...payload.contact.body,
            locationId,
          },
        });
        contactId = extractId(contactResponse, "contact");
      }
    }
  }

  if (!contactId) throw new Error("ghl_contact_id_missing");

  if (payload.leadId) {
    const { error } = await db
      .from("instagram_leads")
      .update({ ghl_contact_id: contactId })
      .eq("id", payload.leadId);
    if (error) throw new Error(`lead_mapping_failed:${error.message}`);
  }

  let opportunityId = payload.opportunity?.id?.trim() || null;
  let opportunityResponse: Record<string, unknown> | null = null;

  if (payload.opportunity) {
    opportunityResponse = await ghlRequest({
      token,
      version,
      method: "POST",
      path: "/opportunities/upsert",
      body: {
        ...payload.opportunity.body,
        ...(opportunityId ? { id: opportunityId } : {}),
        contactId,
      },
    });
    opportunityId = opportunityId || extractId(opportunityResponse, "opportunity");

    if (!opportunityId) throw new Error("ghl_opportunity_id_missing");

    if (payload.opportunity.customFields?.length) {
      opportunityResponse = await ghlRequest({
        token,
        version,
        method: "PUT",
        path: `/opportunities/${encodeURIComponent(opportunityId)}`,
        body: {
          customFields: payload.opportunity.customFields,
        },
      });
    }

    if (payload.draftId) {
      const { error } = await db
        .from("instagram_order_drafts")
        .update({ ghl_opportunity_id: opportunityId })
        .eq("id", payload.draftId);
      if (error) throw new Error(`draft_mapping_failed:${error.message}`);
    }
  }

  return {
    contactId,
    opportunityId,
    contactResponse,
    opportunityResponse,
  };
}

Deno.serve(async (req) => {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("GHL_API_TOKEN")?.trim() ?? "";
  const version = Deno.env.get("GHL_API_VERSION")?.trim() || "2021-07-28";
  const secretLocationId = Deno.env.get("GHL_LOCATION_ID")?.trim() ?? "";

  if (req.method === "GET") {
    return respond({
      ok: true,
      function: "instagram-ghl-sync",
      configured: Boolean(token),
      locationConfigured: Boolean(secretLocationId),
      version,
    });
  }

  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  if (!token) return respond({ ok: false, error: "missing_ghl_api_token" }, 503);
  if (!secretLocationId) return respond({ ok: false, error: "missing_ghl_location_secret" }, 503);
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: crmFact, error: crmConfigError } = await db
    .from("instagram_agent_facts")
    .select("fact_value")
    .eq("fact_key","ghl_crm_config")
    .single();
  if (crmConfigError || !crmFact?.fact_value) return respond({ ok: false, error: "missing_ghl_crm_config" }, 503);
  const config = crmFact.fact_value as Record<string, any>;
  if (config.enabled !== true) return respond({ ok: false, error: "ghl_sync_disabled" }, 503);
  if (!["integration_test_approved","production_approved"].includes(String(config.approval ?? ""))) {
    return respond({ ok: false, error: "ghl_sync_not_approved" }, 503);
  }
  const locationId = typeof config.locationId === "string" ? config.locationId.trim() : "";
  if (!locationId) return respond({ ok: false, error: "missing_ghl_location_id" }, 503);
  if (locationId !== BAGELITO_LOCATION_ID || config.target_name !== "Bagelito") {
    return respond({ ok: false, error: "ghl_target_not_verified" }, 409);
  }
  if (secretLocationId !== locationId) {
    return respond({ ok: false, error: "ghl_location_secret_mismatch" }, 409);
  }
  const pipelineId = typeof config.pipelineId === "string" ? config.pipelineId.trim() : "";
  const instagramUserIdFieldId = typeof config.contactFields?.instagramUserId === "string"
    ? config.contactFields.instagramUserId.trim()
    : "";
  if (!pipelineId || !instagramUserIdFieldId) return respond({ ok: false, error: "ghl_field_mapping_incomplete" }, 503);

  const input = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(20, Number(input?.limit ?? 5)));

  await db.rpc("requeue_stale_instagram_crm_sync_jobs");
  const { data: jobs, error: claimError } = await db.rpc(
    "claim_instagram_crm_sync_jobs",
    { p_limit: limit },
  );

  if (claimError) return respond({ ok: false, error: `claim_failed:${claimError.message}` }, 500);

  const results: Array<Record<string, unknown>> = [];

  for (const job of (jobs ?? []) as SyncJob[]) {
    try {
      const result = await syncJob({ job, db, token, version, locationId, instagramUserIdFieldId, pipelineId });
      const { error: completeError } = await db.rpc("complete_instagram_crm_sync_job", {
        p_id: job.id,
        p_success: true,
        p_response_payload: result,
        p_error: null,
        p_retry_seconds: 0,
      });
      if (completeError) throw new Error(`complete_failed:${completeError.message}`);
      results.push({ id: job.id, ok: true, contactId: result.contactId, opportunityId: result.opportunityId });
    } catch (error) {
      const message = errorText(error);
      await db.rpc("complete_instagram_crm_sync_job", {
        p_id: job.id,
        p_success: false,
        p_response_payload: null,
        p_error: message,
        p_retry_seconds: retrySeconds(job.attempts),
      });
      results.push({ id: job.id, ok: false, error: message.slice(0, 500) });
    }
  }

  return respond({
    ok: results.every((result) => result.ok),
    claimed: (jobs ?? []).length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
});
