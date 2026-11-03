# Bagelito → GHL Starter: readiness, not activation

Verified 2026-11-02. No subscription change, remote CRM write, token creation,
credential change, customer communication, payment, merge or deployment occurred.

## No upgrade is established as necessary

HighLevel's [official API-access table](https://help.gohighlevel.com/support/solutions/articles/48001060529-highlevel-api)
currently lists Private Integration Tokens and standard endpoints on Starter.
Endpoint permissions and account access still need verification; this is not proof
that the connected account can execute Bagelito operations. The article retains
older/inconsistent FAQ language about OAuth tiers, so this plan relies only on
the explicit PIT/standard-endpoint table, not unrestricted agency capabilities.
[Private Integrations guidance](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
documents scoped access for agencies and subaccounts. No paid automation or new
SaaS/subaccount-creation endpoint is required by the proposed single-location CRM
mirror design. This does not certify every endpoint needed by a future adapter.

## Observed access blocker

Read-only `list_locations(query="Bagelito")` returned `items: []` in both available
Gourmet HighLevel and RikRodriguezMarketing GHL connections at approximately
18:17 UTC. Neither operation was denied. Empty results establish only that no
matching accessible location was returned in those connection contexts; they do
not establish global absence or identify an alternative authorized tenant.

**Required next action:** identify the intended Bagelito subaccount by its exact
location ID and make that subaccount available through the authorized connection.
If credential/scope configuration is needed, obtain specific authorization first;
do not paste tokens in chat, reuse an unrelated account, broaden permissions, or
create a new account merely because the name search is empty. That action remains
pending; no write was attempted and there is no uncertain remote write to retry.

## Integration boundary

- [PR46](https://github.com/rikrodriguez/bagelito-pe/pull/46), inspected at
  `1cf48c666bcc377e1cd8a068906d27e2494203cf`, contains only a tested local loyalty
  ledger and mirror contract. Its remote guard remains closed even when a fixture
  claims a verified capability. It is not a deployed GHL adapter.
- [PR47](https://github.com/rikrodriguez/bagelito-pe/pull/47), inspected at
  `10f2b9dde77bd9c8c4614ee56aa823ddb6bdd7e0`, preserves review-only storefront and
  default-off sandbox receipt gates. It is not a working external purchase flow.
- Keep backend orders/payments/loyalty authoritative. Verify subject/contact/
  location binding from trusted server observations before any mirror write.
  Document the actual recipient's conditional-write/revision behavior; do not
  infer compare-and-swap from an API `Version` header or claim that blind upserts
  are safe against stale concurrent workers.
- Audit existing workflows before adding/updating contacts: a CRM write may
  trigger messages. No contact/field mutation, enrollment or send is authorized
  by the offline preparation recorded here.

Once access and side effects are verified, prepare a minimal scoped adapter and
test with explicitly approved synthetic records. Remote activation and credential
configuration remain separate from the authorized draft bugfix/QA work.

## Sales-readiness improvement completed separately

The public API rate limiter now fails closed within a shared 2 s requester/contact
budget and rejects malformed authorization replies instead of accepting truthy
values. [Regression evidence](qa/api-rate-limit-20261102/README.md). This closes an
application-level failure mode without enabling checkout or GHL.

Real Culqi sandbox/3DS/webhook acceptance and reconciliation with the existing
financial lane remain required. Commercial merchant approval is already recorded;
it is not being requested again. See [payment-readiness](payment-readiness-20261102.md).
