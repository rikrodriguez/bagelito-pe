'use strict'

// Local fixture metadata, not GHL API facts or production authentication.
// Lookup keys deliberately remain separate from the JSON under evaluation.
function createActivationStore(backendStore) {
  const db = backendStore.db
  db.exec(`
    CREATE TABLE IF NOT EXISTS fixture_activation_tenants (
      lookupTenantId TEXT PRIMARY KEY NOT NULL,
      factJSON TEXT NOT NULL CHECK (json_valid(factJSON))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS fixture_activation_bindings (
      lookupTenantId TEXT NOT NULL,
      lookupSubjectId TEXT NOT NULL,
      factJSON TEXT NOT NULL CHECK (json_valid(factJSON)),
      PRIMARY KEY (lookupTenantId, lookupSubjectId)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS fixture_activation_contacts (
      lookupLocationId TEXT NOT NULL,
      lookupContactId TEXT NOT NULL,
      factJSON TEXT NOT NULL CHECK (json_valid(factJSON)),
      PRIMARY KEY (lookupLocationId, lookupContactId)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS fixture_activation_capabilities (
      lookupLocationId TEXT PRIMARY KEY NOT NULL,
      factJSON TEXT NOT NULL CHECK (json_valid(factJSON))
    ) STRICT;
  `)

  let activeReads = 0
  function serialize(fact) {
    if (activeReads) throw new Error('Activation fixture facts cannot change during a guard transaction')
    const json = JSON.stringify(fact)
    if (typeof json !== 'string') throw new TypeError('Fixture fact must be JSON serializable')
    return json
  }
  function fact(sql, ...keys) {
    const row = db.prepare(sql).get(...keys)
    return row ? JSON.parse(row.factJSON) : null
  }

  return {
    seedTenant(lookupTenantId, value) {
      const json = serialize(value)
      db.prepare(`INSERT INTO fixture_activation_tenants (lookupTenantId, factJSON) VALUES (?, ?)
        ON CONFLICT(lookupTenantId) DO UPDATE SET factJSON = excluded.factJSON`)
        .run(lookupTenantId, json)
    },
    seedBinding(lookupTenantId, lookupSubjectId, value) {
      const json = serialize(value)
      db.prepare(`INSERT INTO fixture_activation_bindings (lookupTenantId, lookupSubjectId, factJSON) VALUES (?, ?, ?)
        ON CONFLICT(lookupTenantId, lookupSubjectId) DO UPDATE SET factJSON = excluded.factJSON`)
        .run(lookupTenantId, lookupSubjectId, json)
    },
    seedContact(lookupLocationId, lookupContactId, value) {
      const json = serialize(value)
      db.prepare(`INSERT INTO fixture_activation_contacts (lookupLocationId, lookupContactId, factJSON) VALUES (?, ?, ?)
        ON CONFLICT(lookupLocationId, lookupContactId) DO UPDATE SET factJSON = excluded.factJSON`)
        .run(lookupLocationId, lookupContactId, json)
    },
    seedCapabilities(lookupLocationId, value) {
      const json = serialize(value)
      db.prepare(`INSERT INTO fixture_activation_capabilities (lookupLocationId, factJSON) VALUES (?, ?)
        ON CONFLICT(lookupLocationId) DO UPDATE SET factJSON = excluded.factJSON`)
        .run(lookupLocationId, json)
    },
    transaction(work) {
      return backendStore.transaction(async () => {
        let active = true
        activeReads++
        const check = () => { if (!active) throw new Error('Activation fixture transaction is no longer active') }
        const tx = {
          getTenant(tenantId) {
            check()
            return fact('SELECT factJSON FROM fixture_activation_tenants WHERE lookupTenantId = ?', tenantId)
          },
          getBinding(tenantId, subjectId) {
            check()
            return fact('SELECT factJSON FROM fixture_activation_bindings WHERE lookupTenantId = ? AND lookupSubjectId = ?', tenantId, subjectId)
          },
          getContact(locationId, contactId) {
            check()
            return fact('SELECT factJSON FROM fixture_activation_contacts WHERE lookupLocationId = ? AND lookupContactId = ?', locationId, contactId)
          },
          getCapabilities(locationId) {
            check()
            return fact('SELECT factJSON FROM fixture_activation_capabilities WHERE lookupLocationId = ?', locationId)
          },
        }
        try { return await work(tx) } finally { active = false; activeReads-- }
      })
    },
  }
}

module.exports = { createActivationStore }
