'use strict'

// Local mirror fixture. Reads the real loyalty core in the backend transaction;
// it has no public identity mapping, provider client, or remote credentials.
const { createLoyaltyService } = require('./load-loyalty.cjs')

const faultPoints = new Set([
  'after_projection_write', 'after_ack_write', 'before_commit', 'after_commit',
])

function createMirrorStore(backendStore) {
  const db = backendStore.db
  db.exec(`
    CREATE TABLE IF NOT EXISTS fixture_mirror_bindings (
      subjectId TEXT PRIMARY KEY NOT NULL REFERENCES fixture_subjects(id),
      destinationRef TEXT NOT NULL UNIQUE,
      UNIQUE (subjectId, destinationRef)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS mirror_projection (
      subjectId TEXT PRIMARY KEY NOT NULL,
      messageId TEXT NOT NULL UNIQUE,
      destinationRef TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 1),
      payloadHash TEXT NOT NULL,
      summaryJSON TEXT NOT NULL CHECK (json_valid(summaryJSON)),
      pending INTEGER NOT NULL CHECK (pending IN (0, 1)),
      attempts INTEGER NOT NULL CHECK (attempts >= 0),
      lastError TEXT,
      FOREIGN KEY (subjectId, destinationRef)
        REFERENCES fixture_mirror_bindings(subjectId, destinationRef)
    ) STRICT;
  `)

  let configuredFault = null
  function fault(at) {
    if (!configuredFault || configuredFault.at !== at) return
    configuredFault = null
    const error = new Error('injected mirror SQLite fixture fault: ' + at)
    error.code = 'FIXTURE_FAULT'
    error.at = at
    throw error
  }
  function projection(subjectId) {
    const row = db.prepare('SELECT * FROM mirror_projection WHERE subjectId = ?').get(subjectId)
    if (!row) return null
    return {
      envelope: {
        schema: 1,
        messageId: row.messageId,
        subjectId: row.subjectId,
        destinationRef: row.destinationRef,
        revision: row.revision,
        payloadHash: row.payloadHash,
        summary: JSON.parse(row.summaryJSON),
      },
      pending: row.pending === 1,
      attempts: row.attempts,
      lastError: row.lastError,
    }
  }
  const casWhere = ' WHERE subjectId = ? AND messageId = ? AND destinationRef = ? AND revision = ? AND payloadHash = ? AND pending = 1'
  const casArgs = envelope => [envelope.subjectId, envelope.messageId, envelope.destinationRef, envelope.revision, envelope.payloadHash]

  return {
    db,
    get fault() { return configuredFault },
    set fault(value) {
      if (value != null && !faultPoints.has(value.at)) throw new TypeError('Unknown mirror fixture fault point')
      configuredFault = value ?? null
    },
    bind(subjectId, destinationRef) {
      db.prepare('INSERT INTO fixture_mirror_bindings (subjectId, destinationRef) VALUES (?, ?)')
        .run(subjectId, destinationRef)
    },
    get: projection,
    async transaction(work) {
      const result = await backendStore.transaction(async loyaltyTx => {
        let active = true
        const check = () => { if (!active) throw new Error('Mirror fixture transaction is no longer active') }
        const tx = {
          readProgress(subjectId) {
            check()
            // This adapter is an internal test fixture, not a customer login.
            // Subject existence is looked up in the same authoritative SQL tx.
            const exists = Boolean(db.prepare('SELECT id FROM fixture_subjects WHERE id = ?').get(subjectId))
            const core = createLoyaltyService({
              transaction: callback => callback({
                ...loyaltyTx,
                authenticatedSubject: () => exists ? subjectId : null,
              }),
            })
            return core.getProgress(null)
          },
          getBinding(subjectId) {
            check()
            return db.prepare('SELECT destinationRef FROM fixture_mirror_bindings WHERE subjectId = ?')
              .get(subjectId)?.destinationRef ?? null
          },
          getProjection(subjectId) { check(); return projection(subjectId) },
          saveProjection(envelope) {
            check()
            db.prepare(`
              INSERT INTO mirror_projection
                (subjectId, messageId, destinationRef, revision, payloadHash, summaryJSON, pending, attempts, lastError)
              VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL)
              ON CONFLICT(subjectId) DO UPDATE SET
                messageId = excluded.messageId, destinationRef = excluded.destinationRef,
                revision = excluded.revision, payloadHash = excluded.payloadHash,
                summaryJSON = excluded.summaryJSON, pending = 1, attempts = 0, lastError = NULL
            `).run(envelope.subjectId, envelope.messageId, envelope.destinationRef, envelope.revision,
              envelope.payloadHash, JSON.stringify(envelope.summary))
            fault('after_projection_write')
          },
          attempt(envelope) {
            check()
            const result = db.prepare('UPDATE mirror_projection SET attempts = attempts + 1' + casWhere)
              .run(...casArgs(envelope))
            return Number(result.changes) === 1
          },
          acknowledge(envelope) {
            check()
            const result = db.prepare('UPDATE mirror_projection SET pending = 0, lastError = NULL' + casWhere)
              .run(...casArgs(envelope))
            if (Number(result.changes) === 1) fault('after_ack_write')
            return Number(result.changes) === 1
          },
          fail(envelope, code) {
            check()
            const result = db.prepare('UPDATE mirror_projection SET lastError = ?' + casWhere)
              .run(code, ...casArgs(envelope))
            return Number(result.changes) === 1
          },
          listSubjects() {
            check()
            return db.prepare('SELECT id FROM fixture_subjects ORDER BY id').all().map(row => row.id)
          },
        }
        try {
          const value = await work(tx)
          fault('before_commit')
          return value
        } finally {
          active = false
        }
      })
      // The backend transaction has committed. A lost response must not undo it.
      fault('after_commit')
      return result
    },
  }
}

module.exports = { createMirrorStore }
