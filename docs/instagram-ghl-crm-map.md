# Bagelito Instagram → GHL CRM Map

Configured: 2026-11-03  
GHL sub-account: RikMarketing (`wGVp4L7zAl46JR7gg0Hx`)  
Operational source of truth: Supabase  
Human CRM and pipeline view: GoHighLevel

## Source-of-truth contract

Supabase owns:

- Instagram identity and conversation history;
- lead state and current sales stage;
- structured order drafts and item quantities;
- current batch and live prices;
- delivery calculation and address details;
- payment evidence and verified payment state;
- production, delivery and revenue reporting;
- idempotent CRM sync queue.

GHL receives a projection for humans. A GHL edit must not silently overwrite operational truth unless a reviewed reverse-sync workflow is explicitly added.

## Pipeline

Pipeline: `Bagelito | Instagram Orders`  
Pipeline ID: `atqtqzswVGYoGU18TF8z`

| Internal stage | GHL stage | Stage ID |
| --- | --- | --- |
| `new_inquiry` | New Instagram DM | `bbe7c4a0-e9db-4a07-b57d-0721dd5f8b73` |
| `menu_discovery`, `recommendation` | Menu / Discovery | `742a824e-0cf0-4616-9213-5ebeef71dc9d` |
| `order_configuration` | Configuring Order | `65a30996-7475-461a-80b8-75e685e1d5e4` |
| `details_collection` | Details Missing | `44974f36-cf1e-4cdb-9aaf-87d527be9176` |
| `quote_ready` | Quote Sent | `2e97ae2c-eaf1-4307-9b00-745fad62f83d` |
| `payment_pending` | Payment Pending | `0585ceec-3683-49cf-8d0f-6b966341f61c` |
| `payment_evidence_received` | Voucher Received | `0b8e8d6a-a3a7-4baa-9be2-7dd005ff9083` |
| `confirmed` | Payment Confirmed | `ee15b1c7-b83b-4f00-995d-d7aefad559cf` |
| `production` | In Production | `a156a48a-2afa-411a-9d2b-3fc9c1006701` |
| `delivery` | Ready for Delivery | `2858af5b-1d27-4ede-8ef7-6f2867d89cdd` |
| `completed` | Delivered | `09c4debd-4170-41b1-b36c-26c5b33f0e8c` |
| `human_review` | Human Review | `cc706e8b-07d7-4079-ab48-47609c310542` |
| `lost` | Lost / No Response | `464f9679-6a5c-4e3b-961f-d782cd1c59e7` |

GHL opportunity status mapping:

- `completed` → `won`
- `lost` → `lost`
- every other internal stage → `open`

## Contact custom fields

| Field | ID |
| --- | --- |
| Bagelito | Instagram User ID | `YMqyWSqEiTyE3u3SgXl5` |
| Bagelito | Instagram Username | `YxVBq2caxvWmpgkQKIcx` |
| Bagelito | Preferred Language | `domH1AQAZQBfKN1UFoUL` |
| Bagelito | Favorite Flavors | `Ilz60BOeZnt7SOPogWrB` |
| Bagelito | Customer Status | `98Tyyn9n6MxrocJZoOby` |

Use built-in contact fields for name, phone and email. Do not overwrite GHL tags through contact upsert; tags require a dedicated additive/removal operation.

### Instagram-only contacts

A new Instagram lead may not yet have a phone number or email. HighLevel's contact upsert route rejects that shape, so the worker uses a deterministic IG-only path:

1. derive the stable placeholder contact name already stored in the queued payload;
2. search GHL by exact `contactName`;
3. verify the candidate's `Bagelito | Instagram User ID` custom field;
4. update the verified contact if found;
5. otherwise create one contact through `POST /contacts/` using the name and Instagram custom fields;
6. save the returned contact ID in `instagram_leads.ghl_contact_id` so subsequent syncs update by ID.

Never manufacture a fake phone number or email for duplicate matching.

## Opportunity custom fields

| Field | ID |
| --- | --- |
| Bagelito | Draft ID | `VURl4HkdljWGJHXA6TLW` |
| Bagelito | Conversation ID | `XuusqPh2IFQ86DytisNa` |
| Bagelito | Batch ID | `M7CdQanSHXDXp76cKFBY` |
| Bagelito | Pack | `JIpR445DlJu3dyzEKbS4` |
| Bagelito | Bagel Quantity | `qDAsMNcxqP442rhyS8TM` |
| Bagelito | Flavor Breakdown | `pbqo9DiMWLbNQdjmHJ7P` |
| Bagelito | Schmears & Add-ons | `j6QJNN7gLhiJHoV8UApy` |
| Bagelito | Delivery District | `YcVEYnwErfb41tmLcxSX` |
| Bagelito | Delivery Address | `laCgedFMnlN6BgIxHqgs` |
| Bagelito | Order Total | `ehvbhMqtdQ63YmKvrdPD` |
| Bagelito | Payment Method | `56x7Vk2On55txY4fOzmB` |
| Bagelito | Payment Status | `FAGU5085fCUqbSj5YXoY` |
| Bagelito | Sales Stage Key | `fFDZRiMIPr6tuiECFwEx` |
| Bagelito | Next Best Action | `LnkfrJpsLPtBiCmrL1ik` |
| Bagelito | Handoff Reason | `Y6THkp6mRCAfCV9vFwLD` |
| Bagelito | Checkout URL | `Aok79XFWl22gTqVluOpW` |
| Bagelito | Delivery Window | `XF1Zu13UFq9v5zJBqFv4` |
| Bagelito | Voucher Reference | `60gUz0JPM0OwYkKBIl1z` |

The voucher field stores only a private reference, amount/date and verification state. Do not place bank credentials, full sensitive payment data or a publicly accessible voucher URL in GHL.

## Supabase schema

Tables:

- `instagram_leads`
- `instagram_order_drafts`
- `instagram_order_draft_items`
- `instagram_sales_events`
- `instagram_crm_sync_queue`

Operational views:

- `instagram_production_by_flavor`
- `instagram_delivery_schedule`
- `instagram_sales_pipeline_summary`
- `instagram_payment_state_summary`

Queue worker RPCs:

- `enqueue_instagram_crm_sync`
- `claim_instagram_crm_sync_jobs`
- `complete_instagram_crm_sync_job`
- `requeue_stale_instagram_crm_sync_jobs`

## Sync lifecycle

1. Incoming DM updates the Supabase lead.
2. The sales engine extracts explicit order changes and updates the active draft.
3. A new draft version enqueues a GHL sync job with an idempotency key like `ghl:opportunity:<draft-id>:v<version>`.
4. `instagram-ghl-sync` claims jobs with `FOR UPDATE SKIP LOCKED` and supersedes older unsent versions of the same entity.
5. It creates or updates the GHL contact using the phone/email upsert path or the verified IG-only path.
6. It upserts the opportunity and writes the current custom fields.
7. Returned GHL IDs are written back to `instagram_leads` and `instagram_order_drafts`.
8. Failed jobs retry with backoff and become `dead` after five attempts.

## Runtime requirements

Supabase Edge Function: `instagram-ghl-sync`

Required secret:

- `GHL_API_TOKEN`: a least-privilege HighLevel Private Integration token with contact and opportunity read/write scopes.

Optional secrets:

- `GHL_LOCATION_ID` — defaults to RikMarketing location `wGVp4L7zAl46JR7gg0Hx`
- `GHL_API_VERSION` — defaults to `2021-07-28`

The worker is deployed with JWT verification enabled. Until `GHL_API_TOKEN` is configured, it reports `configured: false` and returns 503 without claiming or modifying queue jobs.

## Checkout evolution

Current payment motion:

- verified order total;
- current approved Yape destination supplied from live payment policy;
- customer sends evidence;
- evidence moves the order to verification, never directly to paid.

Future motion:

- generate one checkout session from the structured order draft;
- store its URL in Supabase and `Bagelito | Checkout URL`;
- send the customer a pre-filled checkout containing the exact order discussed in Instagram;
- payment webhook confirms the order and advances both Supabase and GHL.
