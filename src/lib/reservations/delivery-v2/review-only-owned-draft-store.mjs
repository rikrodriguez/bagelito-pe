/**
 * REVIEW-ONLY owner-isolated SQLite contract for Bagelito (offline/QA only).
 *
 * This is not a production API or an authentication implementation. The host
 * must provide a principal obtained from a verified server session, never a
 * tenant/owner identifier from request body, query string or client storage.
 * This adapter never accepts ownership in a draft input or CAS proposal.
 *
 * Uses Node 22+ experimental node:sqlite via an injected server-owned db.
 * Contains no payment/inventory functionality; leave V2 reservation hard stop.
 */
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const SHA = /^[0-9a-f]{64}$/;
const exact = (v, keys) => v !== null && typeof v === 'object' &&
  !Array.isArray(v) && Object.keys(v).length === keys.length &&
  keys.every(key => Object.hasOwn(v, key));
const id = v => typeof v === 'string' && ID.test(v);
const rev = v => Number.isSafeInteger(v) && v > 0;
const FIELDS = ['draftId','revision','cartSha256','destinationId','destinationRevision'];
const validDraft = d => exact(d, FIELDS) && id(d.draftId) &&
  rev(d.revision) && d.revision < Number.MAX_SAFE_INTEGER && typeof d.cartSha256 === 'string' &&
  SHA.test(d.cartSha256) &&
  id(d.destinationId) && rev(d.destinationRevision);
const exposed = row => row === undefined ? null : Object.freeze({
  draftId:row.draft_id, revision:row.revision, cartSha256:row.cart_sha256,
  destinationId:row.destination_id, destinationRevision:row.destination_revision,
});

export function createReviewOnlyOwnedDraftStore({db, getTrustedPrincipal}={}) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function' ||
      typeof getTrustedPrincipal !== 'function') {
    throw new TypeError('trusted server SQLite and principal resolver required');
  }
  function actor() {
    // Resolve on EACH operation; do not bind the actor from a previous request.
    const p = getTrustedPrincipal();
    // Copy validated scalar identities once; never retain mutable session data.
    const tenantId = p?.tenantId, ownerId = p?.ownerId;
    if (!exact(p,['tenantId','ownerId']) || !id(tenantId) || !id(ownerId)) {
      throw new TypeError('verified synchronous server principal required');
    }
    return Object.freeze({tenantId,ownerId});
  }
  db.exec(`CREATE TABLE IF NOT EXISTS bagelito_review_owned_drafts (
    tenant_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>0),
    cart_sha256 TEXT NOT NULL,
    destination_id TEXT NOT NULL,
    destination_revision INTEGER NOT NULL CHECK(destination_revision>0),
    PRIMARY KEY (tenant_id, owner_id, draft_id)
  )`);
  const insert = db.prepare(`INSERT INTO bagelito_review_owned_drafts
    (tenant_id,owner_id,draft_id,revision,cart_sha256,destination_id,destination_revision)
    VALUES (?,?,?,?,?,?,?)`);
  const select = db.prepare(`SELECT draft_id,revision,cart_sha256,destination_id,destination_revision
    FROM bagelito_review_owned_drafts
    WHERE tenant_id=? AND owner_id=? AND draft_id=?`);
  const cas = db.prepare(`UPDATE bagelito_review_owned_drafts
    SET revision=revision+1,cart_sha256=?,destination_id=?,destination_revision=?
    WHERE tenant_id=? AND owner_id=? AND draft_id=? AND revision=?`);

  function insertInitialDraft(input) {
    const p = actor();
    if (!validDraft(input)) throw new TypeError('invalid server-owned draft snapshot');
    insert.run(p.tenantId,p.ownerId,input.draftId,input.revision,
      input.cartSha256,input.destinationId,input.destinationRevision);
  }
  function loadDraft(draftId) {
    const p = actor();
    if (!id(draftId)) throw new TypeError('invalid draft identity');
    return exposed(select.get(p.tenantId,p.ownerId,draftId));
  }
  function compareAndSetDraft(input) {
    const p = actor();
    const keys=['draftId','expectedRevision','cartSha256','destinationId','destinationRevision'];
    if (!exact(input,keys) || !id(input.draftId) ||
        !rev(input.expectedRevision) || input.expectedRevision >= Number.MAX_SAFE_INTEGER ||
        typeof input.cartSha256 !== 'string' || !SHA.test(input.cartSha256) ||
        !id(input.destinationId) || !rev(input.destinationRevision)) {
      throw new TypeError('invalid server-owned CAS proposal');
    }
    const r = cas.run(input.cartSha256,input.destinationId,input.destinationRevision,
      p.tenantId,p.ownerId,input.draftId,input.expectedRevision);
    return r.changes===1;
  }
  return Object.freeze({insertInitialDraft,loadDraft,compareAndSetDraft});
}
