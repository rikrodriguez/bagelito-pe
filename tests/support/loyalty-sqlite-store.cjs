'use strict'

// Local test fixture only. No application route, provider or production DB client.
const { DatabaseSync } = require('node:sqlite')
const { setTimeout: delay } = require('node:timers/promises')

const tables = new Set([
  'fixture_subjects', 'fixture_sessions', 'fixture_orders',
  'loyalty_credits', 'loyalty_entitlements', 'loyalty_redemptions',
])
const faultPoints = new Set([
  'after_credit', 'after_entitlement', 'after_redemption', 'before_commit', 'after_commit',
])

function createStore(filename, options = {}) {
  if (typeof filename !== 'string' || !filename) throw new TypeError('A local SQLite path is required')
  if (options.fault && !faultPoints.has(options.fault.at)) throw new TypeError('Unknown fixture fault point')
  const db = new DatabaseSync(filename)
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 0;
    CREATE TABLE IF NOT EXISTS fixture_subjects (
      id TEXT PRIMARY KEY NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS fixture_sessions (
      token TEXT PRIMARY KEY NOT NULL,
      subjectId TEXT NOT NULL REFERENCES fixture_subjects(id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS fixture_orders (
      orderId TEXT PRIMARY KEY NOT NULL,
      subjectId TEXT REFERENCES fixture_subjects(id),
      paymentState TEXT NOT NULL,
      verifiedSource TEXT,
      verificationId TEXT,
      requiresReview INTEGER NOT NULL CHECK (requiresReview IN (0, 1))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS loyalty_credits (
      orderId TEXT PRIMARY KEY NOT NULL REFERENCES fixture_orders(orderId),
      subjectId TEXT NOT NULL REFERENCES fixture_subjects(id),
      verificationId TEXT NOT NULL,
      creditedAt TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS loyalty_entitlements (
      id TEXT PRIMARY KEY NOT NULL,
      subjectId TEXT NOT NULL REFERENCES fixture_subjects(id),
      cycle INTEGER NOT NULL CHECK (cycle >= 1),
      ruleId TEXT NOT NULL,
      bagels INTEGER NOT NULL CHECK (bagels >= 1),
      schmears INTEGER NOT NULL CHECK (schmears >= 1),
      earnedAt TEXT NOT NULL,
      UNIQUE (subjectId, ruleId, cycle),
      UNIQUE (id, subjectId)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS loyalty_redemptions (
      id TEXT PRIMARY KEY NOT NULL,
      subjectId TEXT NOT NULL REFERENCES fixture_subjects(id),
      entitlementId TEXT NOT NULL UNIQUE,
      requestId TEXT NOT NULL,
      redeemedAt TEXT NOT NULL,
      UNIQUE (subjectId, requestId),
      FOREIGN KEY (entitlementId, subjectId)
        REFERENCES loyalty_entitlements(id, subjectId)
    ) STRICT;
  `)

  let configuredFault = options.fault ?? null
  let queue = Promise.resolve()
  let closed = false
  function fault(at) {
    if (!configuredFault || configuredFault.at !== at) return
    configuredFault = null
    const error = new Error('injected SQLite fixture fault: ' + at)
    error.code = 'FIXTURE_FAULT'
    error.at = at
    throw error
  }
  const get = (sql, ...args) => db.prepare(sql).get(...args) ?? null
  const all = (sql, ...args) => db.prepare(sql).all(...args)
  const plain = row => row === null ? null : { ...row }

  async function begin() {
    const deadline = Date.now() + 10000
    for (;;) {
      try { db.exec('BEGIN IMMEDIATE'); return } catch (error) {
        // Do not use a synchronous busy timeout: another connection on this
        // event loop may need to finish its awaited work before committing.
        if (!/locked|busy/i.test(String(error.message)) || Date.now() >= deadline) throw error
        await delay(1)
      }
    }
  }
  function transaction(work) {
    const run = async () => {
      if (closed) throw new Error('SQLite fixture is closed')
      await begin()
      let committed = false
      let active = true
      const check = () => { if (!active) throw new Error('SQLite fixture transaction is no longer active') }
      const tx = {
        authenticatedSubject(context) {
          check()
          if (typeof context !== 'string') return null
          return get('SELECT subjectId FROM fixture_sessions WHERE token = ?', context)?.subjectId ?? null
        },
        getOrder(orderId) {
          check()
          const row = get('SELECT * FROM fixture_orders WHERE orderId = ?', orderId)
          return row ? { ...row, requiresReview: row.requiresReview === 1 } : null
        },
        getCredit(orderId) {
          check()
          return plain(get('SELECT * FROM loyalty_credits WHERE orderId = ?', orderId))
        },
        listCredits(subjectId) {
          check()
          return all('SELECT * FROM loyalty_credits WHERE subjectId = ? ORDER BY creditedAt, orderId', subjectId).map(plain)
        },
        insertCredit(credit) {
          check()
          db.prepare('INSERT INTO loyalty_credits (orderId, subjectId, verificationId, creditedAt) VALUES (?, ?, ?, ?)')
            .run(credit.orderId, credit.subjectId, credit.verificationId, credit.creditedAt)
          fault('after_credit')
        },
        listEntitlements(subjectId) {
          check()
          return all('SELECT * FROM loyalty_entitlements WHERE subjectId = ? ORDER BY cycle, id', subjectId).map(plain)
        },
        insertEntitlement(entitlement) {
          check()
          db.prepare('INSERT INTO loyalty_entitlements (id, subjectId, cycle, ruleId, bagels, schmears, earnedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(entitlement.id, entitlement.subjectId, entitlement.cycle, entitlement.ruleId, entitlement.bagels, entitlement.schmears, entitlement.earnedAt)
          fault('after_entitlement')
        },
        listRedemptions(subjectId) {
          check()
          return all('SELECT * FROM loyalty_redemptions WHERE subjectId = ? ORDER BY redeemedAt, id', subjectId).map(plain)
        },
        getRedemptionByRequest(subjectId, requestId) {
          check()
          return plain(get('SELECT * FROM loyalty_redemptions WHERE subjectId = ? AND requestId = ?', subjectId, requestId))
        },
        insertRedemption(redemption) {
          check()
          db.prepare('INSERT INTO loyalty_redemptions (id, subjectId, entitlementId, requestId, redeemedAt) VALUES (?, ?, ?, ?, ?)')
            .run(redemption.id, redemption.subjectId, redemption.entitlementId, redemption.requestId, redemption.redeemedAt)
          fault('after_redemption')
        },
      }
      try {
        const result = await work(tx)
        fault('before_commit')
        db.exec('COMMIT')
        committed = true
        active = false
        fault('after_commit')
        return result
      } catch (error) {
        active = false
        if (!committed) db.exec('ROLLBACK')
        throw error
      }
    }
    const result = queue.then(run)
    queue = result.catch(() => {})
    return result
  }

  return {
    db,
    transaction,
    get fault() { return configuredFault },
    set fault(value) {
      if (value != null && !faultPoints.has(value.at)) throw new TypeError('Unknown fixture fault point')
      configuredFault = value ?? null
    },
    close() { if (!closed) { db.close(); closed = true } },
    seedSubject(id, token) {
      if (typeof id !== 'string' || !id || typeof token !== 'string' || !token) throw new TypeError('Fixture subject and token must be nonempty strings')
      db.prepare('INSERT INTO fixture_subjects (id) VALUES (?) ON CONFLICT(id) DO NOTHING').run(id)
      db.prepare('INSERT INTO fixture_sessions (token, subjectId) VALUES (?, ?)').run(token, id)
    },
    seedOrder(order) {
      db.prepare('INSERT INTO fixture_orders (orderId, subjectId, paymentState, verifiedSource, verificationId, requiresReview) VALUES (?, ?, ?, ?, ?, ?)')
        .run(order.orderId, order.subjectId ?? null, order.paymentState === undefined ? 'paid' : order.paymentState, order.verifiedSource === undefined ? 'backend-confirmed' : order.verifiedSource, order.verificationId ?? null, Number(order.requiresReview ?? false))
    },
    setOrder(orderId, changes) {
      const allowed = new Set(['subjectId', 'paymentState', 'verifiedSource', 'verificationId', 'requiresReview'])
      const entries = Object.entries(changes)
      if (!entries.length) return
      if (entries.some(([key]) => !allowed.has(key))) throw new TypeError('Unknown fixture order field')
      const values = entries.map(([key, value]) => key === 'requiresReview' ? Number(value) : value)
      db.prepare('UPDATE fixture_orders SET ' + entries.map(([key]) => key + ' = ?').join(', ') + ' WHERE orderId = ?').run(...values, orderId)
    },
    count(table) {
      if (!tables.has(table)) throw new TypeError('Only fixture and loyalty tables may be counted')
      return get('SELECT COUNT(*) AS count FROM ' + table).count
    },
  }
}

module.exports = { createStore }
