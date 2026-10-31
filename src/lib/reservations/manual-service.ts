import { createHash } from "node:crypto";
import { getFlavorBySlug, getPackBySlug } from "@/lib/catalog";
import { getDeliveryDistanceKm, getDeliveryFee } from "@/lib/delivery-pricing";
import { CHECKOUT_LEGAL_VERSION } from "@/lib/legal-terms";
import { logError, logWarn } from "@/lib/monitoring";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ManualReservationError } from "./manual-errors";
import { observeManual } from "./manual-observation";
import { canonicalManualRequestV1, manualOwnerV1HashInput, manualRequestV1FromFormData, manualRequestV1HashInput } from "./manual-request-v1";
import { reservationPayloadSchema } from "./schema";

const proofBucket = "payment-proofs";
const maxProofBytes = 5 * 1024 * 1024;
const proofExtensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
type OperationRow = {
  operation_id: string;
  state: "awaiting_proof" | "completed";
  order_code: string;
  proof_path: string;
  amount: number;
  pack_slug: string;
  replayed: boolean;
};
type BackendFailure = { code?: string; message?: string };

class RpcReplyFailure extends Error {
  readonly code: string;
  constructor(error: BackendFailure) {
    super(error.message ?? "Manual reservation RPC failed.");
    this.name = "RpcReplyFailure";
    this.code = error.code ?? "";
  }
}

function sha256(bytes: string | ArrayBuffer) {
  return createHash("sha256").update(typeof bytes === "string" ? bytes : Buffer.from(bytes)).digest("hex");
}

function failureCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
}

function errorForLog(error: unknown) {
  return error instanceof Error ? error : new Error((error as BackendFailure | null)?.message ?? "Unknown backend failure.");
}

function pending(operationId: string) {
  return new ManualReservationError(
    "The reservation outcome is not confirmed. Keep this operation ID and retry the same form; do not start another operation.",
    { code: "manual_reservation_pending", operationId, state: "pending", status: 202 },
  );
}

function isSqlRejection(error: unknown) {
  const code = failureCode(error);
  // Only an RPC error response can establish rollback. Native errors such as
  // EPIPE, connection exceptions and statement_completion_unknown cannot.
  return error instanceof RpcReplyFailure
    && /^(?:[0-9]{2}|P[0-9]|F0|HV|XX)[0-9A-Z]{3}$/.test(code)
    && !code.startsWith("08") && code !== "40003";
}

function throwKnownRejection(error: unknown, operationId: string) {
  if (!(error instanceof RpcReplyFailure)) return;
  const code = failureCode(error);
  if (code === "P4090") {
    throw new ManualReservationError("This operation ID belongs to a different reservation request.", {
      code: "operation_conflict", operationId, status: 409,
    });
  }
  if (code === "P4091") {
    throw new ManualReservationError("This pending operation needs review because its quote or terms changed. Keep the same operation ID.", {
      code: "manual_reservation_quote_changed", operationId, status: 409,
    });
  }
  if (code === "42883" || code === "PGRST202" || code === "42501" || code === "55000") {
    throw new ManualReservationError("Manual reservations are temporarily unavailable. Keep the same operation ID.", {
      code: "manual_reservation_unavailable", operationId, status: 503,
    });
  }
  // PostgreSQL rejection rolls back this RPC. PostgREST/client parse and network
  // errors do not establish whether a transaction committed.
  if (isSqlRejection(error)) {
    throw new ManualReservationError(
      code === "P0001" ? errorForLog(error).message : "Could not complete this reservation. Keep the same operation ID.",
      { code: "manual_reservation_rejected", operationId, status: 400 },
    );
  }
}

export async function createManualReservation(formData: FormData) {
  const payload = manualRequestV1FromFormData(formData);
  const file = formData.get("paymentScreenshot");
  if (!(file instanceof File) || file.size === 0) throw new Error("Payment screenshot is required.");
  const proofType = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!proofExtensions[proofType]) throw new Error("Payment screenshot must be PNG, JPG, JPEG, or WEBP.");
  if (file.size > maxProofBytes) throw new Error("Payment screenshot must be 5MB or smaller.");

  const { operationId } = payload;
  const normalized = canonicalManualRequestV1(payload);
  const proofBytes = await file.arrayBuffer();
  const proofSha = sha256(proofBytes);
  const ownerHash = sha256(manualOwnerV1HashInput(payload));
  const requestHash = sha256(manualRequestV1HashInput(payload, { sha256: proofSha, type: proofType, size: file.size }));
  const expectedPath = `manual/${operationId}/${proofSha}.${proofExtensions[proofType]}`;
  const supabase = createSupabaseAdminClient();
  const identity = { p_operation_id: operationId, p_owner_hash: ownerHash, p_request_hash: requestHash };
  const recoveryIdentity = { ...identity, p_proof_sha256: proofSha, p_proof_type: proofType, p_proof_size: file.size };
  async function recoverOperation() {
    const { data, error } = await supabase.rpc("read_manual_reservation_v1", recoveryIdentity).maybeSingle();
    if (error) throw new RpcReplyFailure(error);
    return data === null ? null : validateOperation(data);
  }
  let existing: OperationRow | null;
  try {
    existing = await recoverOperation();
  } catch (error) {
    recordFailure("read", error);
    throwKnownRejection(error, operationId);
    try {
      existing = await recoverOperation();
    } catch (recoveryError) {
      recordFailure("read_recovery", recoveryError);
      if (failureCode(recoveryError) === "P4090") throwKnownRejection(recoveryError, operationId);
      throw pending(operationId);
    }
  }
  if (existing?.state === "completed") return result({ ...existing, replayed: true });

  // Recovery uses frozen v1 identity first. New and pending operations still
  // need every current catalog, quantity, delivery and consent validation.
  reservationPayloadSchema.parse(payload);
  const pack = getPackBySlug(payload.packSlug);
  if (!pack) throw new Error("Invalid pack selected.");
  const deliveryFee = getDeliveryFee(payload.district);
  const handoffNote = payload.deliveryHandoff === "porteria" ? "Recepción: Dejar en portería" : "Recepción: Yo lo recibo";
  const deliveryNotes = [handoffNote,
    `Delivery: S/${deliveryFee} (${getDeliveryDistanceKm(payload.district)} km)`, payload.deliveryNotes].filter(Boolean).join(" | ");
  const prepareInput = {
    ...recoveryIdentity,
    p_order_payload: {
      address_reference: payload.addressReference, customer_name: payload.customerName,
      delivery_address: payload.deliveryAddress, delivery_notes: deliveryNotes, district: payload.district,
      email: normalized.email, exact_amount_confirmed: payload.exactAmountConfirmed,
      items: payload.items.map((item) => {
        const flavor = getFlavorBySlug(item.flavorSlug);
        if (!flavor) throw new Error("Invalid flavor selected.");
        return { flavor_name: flavor.name, flavor_slug: flavor.slug, quantity: item.quantity };
      }),
      marketing_opt_in: payload.marketingOptIn, pack_name: pack.name, pack_slug: pack.slug,
      pack_type: pack.packType, pack_units: pack.units,
      payment_holder_name: payload.paymentHolderName, payment_method: payload.paymentMethod,
      payment_phone_number: payload.paymentPhoneNumber, payment_transaction_number: payload.paymentTransactionNumber,
      terms_accepted: payload.termsAccepted, terms_version: CHECKOUT_LEGAL_VERSION,
      total_amount: pack.amount + deliveryFee, whatsapp: payload.whatsapp,
    },
  };
  function recordFailure(stage: string, error: unknown) {
    observeManual(() => logError("manual_reservation_backend_failed", errorForLog(error), {
      operationId, stage, code: failureCode(error),
      outcome: stage.endsWith("_recovered") ? "recovered" : isSqlRejection(error) ? "rejected" : "unknown",
    }));
  }
  function validateOperation(data: unknown) {
    const row = data as OperationRow | null;
    if (!row || row.operation_id !== operationId || row.proof_path !== expectedPath
      || !row.order_code || row.pack_slug !== payload.packSlug
      || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0
      || (row.state !== "awaiting_proof" && row.state !== "completed")
      || typeof row.replayed !== "boolean") {
      throw new Error("Manual reservation transaction returned an incomplete operation.");
    }
    return { ...row, amount: Number(row.amount) };
  }
  async function readOperation(name: "prepare_manual_reservation_v1" | "finalize_manual_reservation_v1") {
    const { data, error } = await supabase.rpc(name, name === "prepare_manual_reservation_v1" ? prepareInput : identity).single();
    if (error) throw new RpcReplyFailure(error);
    return validateOperation(data);
  }
  function result(row: OperationRow) {
    return { amount: row.amount, operationId, orderCode: row.order_code,
      packSlug: row.pack_slug, replayed: row.replayed };
  }

  let operation: OperationRow;
  try {
    operation = await readOperation("prepare_manual_reservation_v1");
  } catch (error) {
    recordFailure("prepare", error);
    throwKnownRejection(error, operationId);
    // Safe bounded recovery: this RPC itself is keyed and serialized in SQL.
    try {
      operation = await readOperation("prepare_manual_reservation_v1");
    } catch (recoveryError) {
      recordFailure("prepare_recovery", recoveryError);
      if (failureCode(recoveryError) === "P4090") throwKnownRejection(recoveryError, operationId);
      throw pending(operationId);
    }
  }
  if (operation.state === "completed") return result({ ...operation, replayed: true });

  try {
    const canonicalProof = new Blob([proofBytes], { type: proofType });
    const { error } = await supabase.storage.from(proofBucket).upload(operation.proof_path, canonicalProof, {
      contentType: proofType, upsert: false,
    });
    if (error) throw error;
  } catch (error) {
    // A lost upload response and a concurrent exact replay may both leave the
    // correct object present. Verify bytes before treating either as success.
    observeManual(() => logWarn("manual_reservation_proof_upload_unconfirmed", { operationId, path: operation.proof_path }));
    try {
      const { data: proof, error: downloadError } = await supabase.storage.from(proofBucket).download(operation.proof_path);
      if (downloadError) throw downloadError;
      if (!proof || proof.size !== file.size || proof.type !== proofType || sha256(await proof.arrayBuffer()) !== proofSha) {
        throw new Error("Stored proof does not match this operation.");
      }
    } catch (verificationError) {
      recordFailure("proof_verification", verificationError);
      throw pending(operationId);
    }
    recordFailure("proof_upload_recovered", error);
  }

  try {
    const completed = await readOperation("finalize_manual_reservation_v1");
    if (completed.state !== "completed") throw new Error("Manual reservation commit is not confirmed.");
    return result(completed);
  } catch (error) {
    recordFailure("finalize", error);
    throwKnownRejection(error, operationId);
    try {
      const recovered = await recoverOperation();
      if (recovered?.state === "completed") return result({ ...recovered, replayed: true });
    } catch (recoveryError) {
      recordFailure("finalize_recovery", recoveryError);
      if (failureCode(recoveryError) === "P4090") throwKnownRejection(recoveryError, operationId);
    }
    // Never delete an operation-bound proof based on a negative/failed lookup:
    // the original transaction may still commit after that lookup.
    throw pending(operationId);
  }
}
