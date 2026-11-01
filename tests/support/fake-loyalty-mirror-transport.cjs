'use strict'

// Explicit local test receiver. This is not GHL, HTTP, an API contract or a
// production integration. Its SQLite file is independent of the backend ledger.
const {DatabaseSync} = require('node:sqlite')
const {createHash} = require('node:crypto')

function failure(code, message = code) {
  const error = new Error(message)
  error.code = code
  return error
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function validate(envelope) {
  const fields = ['schema', 'messageId', 'subjectId', 'destinationRef', 'revision', 'payloadHash', 'summary']
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).length !== fields.length || !fields.every(field => Object.hasOwn(envelope, field)) ||
      envelope.schema !== 1 || !identifier(envelope.messageId) ||
      !identifier(envelope.subjectId) || !identifier(envelope.destinationRef) ||
      !Number.isSafeInteger(envelope.revision) || envelope.revision < 0 ||
      typeof envelope.payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.payloadHash) ||
      !envelope.summary || typeof envelope.summary !== 'object' || Array.isArray(envelope.summary)) {
    throw failure('invalid_payload')
  }
  let summaryJson, envelopeJson
  try {
    summaryJson = JSON.stringify(envelope.summary)
    envelopeJson = JSON.stringify(envelope)
    if (typeof summaryJson !== 'string' || typeof envelopeJson !== 'string') throw failure('invalid_payload')
  } catch {
    throw failure('invalid_payload')
  }
  const hash = createHash('sha256').update(summaryJson).digest('hex')
  if (hash !== envelope.payloadHash) throw failure('invalid_payload')
  return envelopeJson
}

function createFakeMirrorTransport(sqlitePath) {
  if (!identifier(sqlitePath)) throw new TypeError('An independent local SQLite path is required')
  const db = new DatabaseSync(sqlitePath)
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 10000;
      CREATE TABLE IF NOT EXISTS fake_mirror_bindings (
        subjectId TEXT PRIMARY KEY NOT NULL,
        destinationRef TEXT NOT NULL UNIQUE,
        UNIQUE (subjectId, destinationRef)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS fake_mirror_state (
        subjectId TEXT PRIMARY KEY NOT NULL,
        destinationRef TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        payloadHash TEXT NOT NULL,
        lastSnapshotJson TEXT NOT NULL,
        FOREIGN KEY (subjectId, destinationRef)
          REFERENCES fake_mirror_bindings(subjectId, destinationRef)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS fake_mirror_applies (
        subjectId TEXT NOT NULL REFERENCES fake_mirror_bindings(subjectId),
        revision INTEGER NOT NULL CHECK (revision >= 0),
        messageId TEXT NOT NULL,
        payloadHash TEXT NOT NULL,
        UNIQUE (subjectId, revision)
      ) STRICT;
    `)
  } catch (error) {
    db.close()
    throw error
  }

  let configuredFault = null
  let closed = false
  const checkOpen = () => { if (closed) throw new Error('Fake mirror transport is closed') }
  function inject(at) {
    if (configuredFault?.at !== at) return
    configuredFault = null
    throw failure('injected_fault', 'injected fake mirror transport fault: ' + at)
  }

  return {
    db,
    get fault() { return configuredFault },
    set fault(value) {
      if (value != null && !['before_apply', 'after_apply'].includes(value.at)) {
        throw new TypeError('Unknown fake mirror transport fault point')
      }
      configuredFault = value == null ? null : {at: value.at}
    },
    close() {
      if (!closed) { db.close(); closed = true }
    },
    bind(subjectId, destinationRef) {
      checkOpen()
      if (!identifier(subjectId) || !identifier(destinationRef)) throw failure('invalid_payload')
      const existing = db.prepare('SELECT destinationRef FROM fake_mirror_bindings WHERE subjectId = ?').get(subjectId)
      if (existing) {
        if (existing.destinationRef === destinationRef) return
        throw failure('binding_conflict')
      }
      try {
        db.prepare('INSERT INTO fake_mirror_bindings (subjectId, destinationRef) VALUES (?, ?)').run(subjectId, destinationRef)
      } catch (error) {
        if (/unique constraint/i.test(error.message)) throw failure('binding_conflict')
        throw error
      }
    },
    get(subjectId) {
      checkOpen()
      if (!identifier(subjectId)) throw failure('invalid_payload')
      // One SELECT gives both fields the same SQLite snapshot during races.
      const state = db.prepare(`SELECT
        (SELECT lastSnapshotJson FROM fake_mirror_state WHERE subjectId = ?) AS lastSnapshotJson,
        (SELECT COUNT(*) FROM fake_mirror_applies WHERE subjectId = ?) AS applies
      `).get(subjectId, subjectId)
      return {envelope: state.lastSnapshotJson === null ? null : JSON.parse(state.lastSnapshotJson), applies: state.applies}
    },
    async send(envelope) {
      checkOpen()
      const envelopeJson = validate(envelope)
      // A one-shot failure before any send-side SQLite access or writes.
      inject('before_apply')
      db.exec('BEGIN IMMEDIATE')
      let committed = false
      let status
      try {
        const binding = db.prepare('SELECT destinationRef FROM fake_mirror_bindings WHERE subjectId = ?').get(envelope.subjectId)
        if (!binding || binding.destinationRef !== envelope.destinationRef) throw failure('binding_mismatch')
        const state = db.prepare('SELECT revision, payloadHash FROM fake_mirror_state WHERE subjectId = ?').get(envelope.subjectId)
        if (state && envelope.revision < state.revision) status = 'stale'
        else if (state && envelope.revision === state.revision) {
          if (envelope.payloadHash !== state.payloadHash) throw failure('revision_conflict')
          status = 'duplicate'
        } else {
          const applied = db.prepare(`
            INSERT INTO fake_mirror_state (subjectId, destinationRef, revision, payloadHash, lastSnapshotJson)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(subjectId) DO UPDATE SET
              destinationRef = excluded.destinationRef,
              revision = excluded.revision,
              payloadHash = excluded.payloadHash,
              lastSnapshotJson = excluded.lastSnapshotJson
            WHERE excluded.revision > fake_mirror_state.revision
          `).run(envelope.subjectId, envelope.destinationRef, envelope.revision, envelope.payloadHash, envelopeJson)
          if (applied.changes !== 1) throw failure('revision_conflict')
          db.prepare('INSERT INTO fake_mirror_applies (subjectId, revision, messageId, payloadHash) VALUES (?, ?, ?, ?)')
            .run(envelope.subjectId, envelope.revision, envelope.messageId, envelope.payloadHash)
          status = 'applied'
        }
        db.exec('COMMIT')
        committed = true
      } catch (error) {
        if (!committed) db.exec('ROLLBACK')
        throw error
      }
      // Deliberately outside rollback handling: a lost response must preserve
      // the committed state so delivery retry observes duplicate or stale.
      inject('after_apply')
      return {
        messageId: envelope.messageId,
        subjectId: envelope.subjectId,
        destinationRef: envelope.destinationRef,
        revision: envelope.revision,
        payloadHash: envelope.payloadHash,
        status,
      }
    },
  }
}

module.exports = {createFakeMirrorTransport}
