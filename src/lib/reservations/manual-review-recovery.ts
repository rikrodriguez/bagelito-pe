import { createHash } from "node:crypto";
import { getMissingReservationEnv } from "@/lib/env";
import { logError } from "@/lib/monitoring";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ManualReservationError } from "./manual-errors";
import { observeManual } from "./manual-observation";
import { manualOwnerV1HashInput, manualRequestV1FromFormData, manualRequestV1HashInput } from "./manual-request-v1";

// Review mode has a separate read-only boundary. Do not call the full creation
// service here: an awaiting operation must not prepare, upload or finalize.
const maxProofBytesV1 = 5 * 1024 * 1024;
const proofExtensionsV1: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
type BackendFailure = { code?: string; message?: string };
type OperationRow = {
  operation_id: string;
  state: "awaiting_proof" | "completed";
  order_code: string;
  proof_path: string;
  amount: number | string;
  pack_slug: string;
  replayed: boolean;
};

class ReadReplyFailure extends Error {
  readonly code: string;
  constructor(error: BackendFailure) {
    super(error.message ?? "Manual recovery read failed.");
    this.name = "ReadReplyFailure";
    this.code = error.code ?? "";
  }
}

function sha256(bytes: string | ArrayBuffer) {
  return createHash("sha256").update(typeof bytes === "string" ? bytes : Buffer.from(bytes)).digest("hex");
}

export async function recoverManualReservationForReview(formData: FormData) {
  // This is the same frozen v1 normalization and full proof identity used by
  // the creation service. Possession of the UUID alone never authorizes a read.
  const payload = manualRequestV1FromFormData(formData);
  const { operationId } = payload;
  const file = formData.get("paymentScreenshot");
  if (!(file instanceof File) || file.size === 0) throw new Error("Payment screenshot is required.");
  const proofType = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!proofExtensionsV1[proofType]) throw new Error("Payment screenshot must be PNG, JPG, JPEG, or WEBP.");
  if (file.size > maxProofBytesV1) throw new Error("Payment screenshot must be 5MB or smaller.");

  const unavailable = () => new ManualReservationError(
    "Manual reservation recovery is temporarily unavailable. Keep the same operation ID.",
    { code: "manual_reservation_unavailable", operationId, status: 503 },
  );
  if (getMissingReservationEnv().length) throw unavailable();

  const proofSha = sha256(await file.arrayBuffer());
  const ownerHash = sha256(manualOwnerV1HashInput(payload));
  const requestHash = sha256(manualRequestV1HashInput(payload, {
    sha256: proofSha, type: proofType, size: file.size,
  }));
  const expectedPath = `manual/${operationId}/${proofSha}.${proofExtensionsV1[proofType]}`;
  const supabase = createSupabaseAdminClient();
  const identity = { p_operation_id: operationId, p_owner_hash: ownerHash, p_request_hash: requestHash,
    p_proof_sha256: proofSha, p_proof_type: proofType, p_proof_size: file.size };

  function knownRejection(error: unknown) {
    if (!(error instanceof ReadReplyFailure)) return;
    if (error.code === "P4090") {
      throw new ManualReservationError("This operation ID belongs to a different reservation request.", {
        code: "operation_conflict", operationId, status: 409,
      });
    }
    if (["42883", "PGRST202", "42501", "55000"].includes(error.code)) throw unavailable();
  }
  function recordFailure(stage: string, error: unknown) {
    observeManual(() => logError("manual_review_recovery_read_failed", error, {
      operationId, stage, outcome: "unknown",
    }));
  }
  async function read() {
    const { data, error } = await supabase.rpc("read_manual_reservation_v1", identity).maybeSingle();
    if (error) throw new ReadReplyFailure(error);
    if (data === null) return null;
    const row = data as OperationRow;
    if (!row || row.operation_id !== operationId || row.pack_slug !== payload.packSlug
      || row.proof_path !== expectedPath || typeof row.order_code !== "string" || !row.order_code
      || !["number", "string"].includes(typeof row.amount) || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0
      || (row.state !== "completed" && row.state !== "awaiting_proof") || typeof row.replayed !== "boolean") {
      throw new Error("Manual recovery read returned an incomplete operation.");
    }
    return row;
  }

  let operation: OperationRow | null;
  try {
    operation = await read();
  } catch (error) {
    recordFailure("review_read", error);
    knownRejection(error);
    try {
      operation = await read();
    } catch (recoveryError) {
      recordFailure("review_read_recovery", recoveryError);
      knownRejection(recoveryError);
      throw new ManualReservationError("The operation outcome is not confirmed. Keep the same operation ID and form.", {
        code: "manual_reservation_pending", operationId, state: "pending", status: 202,
      });
    }
  }
  if (!operation) {
    throw new ManualReservationError("Checkout is a preview; new reservations are not enabled.", {
      code: "manual_review_intake_closed", operationId, status: 503,
    });
  }
  if (operation.state === "awaiting_proof") {
    throw new ManualReservationError("This operation is pending. Review mode only permits recovery; keep the same operation ID.", {
      code: "manual_reservation_pending", operationId, state: "pending", status: 202,
    });
  }
  return { amount: Number(operation.amount), operationId, orderCode: operation.order_code,
    packSlug: operation.pack_slug, replayed: true };
}
