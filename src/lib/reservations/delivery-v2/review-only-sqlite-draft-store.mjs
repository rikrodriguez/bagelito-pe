/**
 * Bagelito REVIEW-ONLY SQLite draft persistence reference, Node.js 22+.
 * Uses the experimental built-in node:sqlite module (injected by the caller).
 *
 * This is a local/offline contract test of *durable compare-and-swap*, NOT a
 * production database adapter, API endpoint, inventory reservation, payment
 * authorization or owner/authentication layer. Do not use with production
 * customer records or import into client code. Keep the reservation hard stop.
 *
 * The host must enforce account ownership/tenant isolation before calling any
 * method and must never use these methods as a public HTTP route. This model
 * intentionally stores only opaque identifiers, revisions and a cart digest.
 */
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const SHA = /^[0-9a-f]{64}$/;
const COLUMNS = ['draftId','revision','cartSha256','destinationId','destinationRevision'];
const validId = v => typeof v === 'string' && ID.test(v);
const positive = v => Number.isSafeInteger(v) && v > 0;
const exact = (obj, keys) => obj !== null && typeof obj === 'object' &&
  !Array.isArray(obj) && Object.keys(obj).length === keys.length &&
  keys.every(key => Object.hasOwn(obj, key));
const validate = v => exact(v,COLUMNS) && validId(v.draftId) &&
  positive(v.revision) && v.revision < Number.MAX_SAFE_INTEGER &&
  typeof v.cartSha256 === 'string' && SHA.test(v.cartSha256) &&
  validId(v.destinationId) && positive(v.destinationRevision);
const freeze = r => r ? Object.freeze({
  draftId:r.draft_id, revision:r.revision, cartSha256:r.cart_sha256,
  destinationId:r.destination_id,destinationRevision:r.destination_revision,
}) : null;

export function createReviewOnlySqliteDraftStore({db}={}) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
    throw new TypeError('trusted server-owned SQLite connection required');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS bagelito_review_only_drafts (
    draft_id TEXT PRIMARY KEY NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>0),
    cart_sha256 TEXT NOT NULL,
    destination_id TEXT NOT NULL,
    destination_revision INTEGER NOT NULL CHECK(destination_revision>0)
  )`);
  const insert = db.prepare(`INSERT INTO bagelito_review_only_drafts
    (draft_id,revision,cart_sha256,destination_id,destination_revision)
    VALUES (?,?,?,?,?)`);
  const select = db.prepare(`SELECT draft_id,revision,cart_sha256,destination_id,destination_revision
    FROM bagelito_review_only_drafts WHERE draft_id=?`);
  const cas = db.prepare(`UPDATE bagelito_review_only_drafts
    SET revision=revision+1,cart_sha256=?,destination_id=?,destination_revision=?
    WHERE draft_id=? AND revision=?`);

  // Test-fixture bootstrap only. A real integration must seed only after
  // authenticating and authorizing the draft owner in the host.
  function insertInitialDraft(input) {
    if (!validate(input)) throw new TypeError('invalid server-owned draft snapshot');
    insert.run(input.draftId,input.revision,input.cartSha256,input.destinationId,input.destinationRevision);
  }

  function loadDraft(draftId) {
    if (!validId(draftId)) throw new TypeError('invalid opaque draft ID');
    return freeze(select.get(draftId));
  }

  // Atomic comparison takes place *inside SQLite*, not as load + save in JS.
  // A mismatch returns false without modifying the stored draft. No amount,
  // payable flag or customer-controlled revised number is ever accepted.
  function compareAndSetDraft({draftId,expectedRevision,cartSha256,destinationId,destinationRevision,...extras}={}) {
    if (Object.keys(extras).length || !validId(draftId) ||
        !positive(expectedRevision) || expectedRevision >= Number.MAX_SAFE_INTEGER ||
        typeof cartSha256!=='string' || !SHA.test(cartSha256) ||
        !validId(destinationId) || !positive(destinationRevision)) {
      throw new TypeError('invalid server-owned CAS proposal');
    }
    const result = cas.run(cartSha256,destinationId,destinationRevision,draftId,expectedRevision);
    return result.changes===1;
  }

  return Object.freeze({loadDraft,compareAndSetDraft,insertInitialDraft});
}
