# Instagram Inbox Agent — Bagelito

## Goal

Build a bilingual (Spanish/English) Instagram inbox agent that feels like Bagelito, not like a menu-driven chatbot.

The first production milestone is **Shadow Mode**:

- receive official Instagram webhook events;
- persist conversations and messages;
- audit language, intent, tone, and media use;
- generate future draft replies;
- never send an automatic Instagram reply.

No browser automation, Instagram username/password login, scraping, or unofficial session cookies are used.

## Architecture

```text
Instagram @bagelito.pe
        |
        v
Meta webhook -> /api/instagram/webhook
        |
        v
Supabase
  instagram_accounts
  instagram_contacts
  instagram_conversations
  instagram_messages
  instagram_webhook_events
  instagram_ai_runs
  instagram_media_assets
  instagram_conversation_events
        |
        v
Bagelito Admin Inbox (next milestone)
        |
        +-> Shadow suggestion
        +-> Human takeover
        +-> Review/edit/send (later)
```

## Safety modes

Conversation state:

- `ai_active`
- `review_required`
- `human_active`

AI execution mode:

- `shadow` — current/default rollout; no sending
- `draft` — human must approve
- `auto` — future, only for explicitly allowlisted low-risk intents

The code added in this milestone has **no Send API implementation**.

## Required server variables

```dotenv
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_USERNAME=bagelito.pe
INSTAGRAM_AUTOMATION_MODE=shadow
```

Never expose these variables with `NEXT_PUBLIC_`.

## Database

Run:

```text
supabase/add-instagram-inbox.sql
```

against the same Supabase project already used by Bagelito.

All Instagram inbox tables use RLS and are server/service-role only.

## Webhook

Callback:

```text
https://bagelito.pe/api/instagram/webhook
```

GET performs Meta verification using `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.

POST:

1. reads the raw request body;
2. verifies `X-Hub-Signature-256` with the Meta app secret;
3. hashes the raw event for webhook idempotency;
4. normalizes Instagram messaging events;
5. stores the account/contact/conversation/message;
6. returns 200;
7. does not send any customer message.

## Bilingual behavior

Language is tracked separately as:

- `es`
- `en`
- `mixed`
- `unknown`

The response layer must answer in the customer's current conversational language. It must not translate Bagelito literally from Spanish to English or vice versa. Spanish and English voice examples will be audited independently.

## Historical audit

The live webhook only covers new activity. Historical training/audit data should combine:

1. Instagram conversations accessible through Meta APIs;
2. Instagram account export for older conversations or media not returned by APIs;
3. current manual inbox review as a qualitative verification set.

Historical messages must be used to learn **style and conversational behavior**. Current prices, availability, batch status, delivery rules, products, and order/payment state must come from Bagelito's live data, not historical chat text.

## Next milestones

1. Inbox read UI inside `/admin`.
2. Historical import/audit pipeline.
3. Bagelito Voice DNA: Spanish / English / mixed.
4. Intent taxonomy and GREEN / YELLOW / RED risk policy.
5. Approved media library and media-selection rules.
6. Shadow reply generator with live Bagelito facts.
7. Evaluation against held-out historical conversations.
8. Draft mode.
9. Limited autopilot for allowlisted intents.

## Deployment validation

The Instagram webhook must be reachable from a public HTTPS URL before Meta webhook verification. Preview deployments are used for build validation first; production remains Shadow Mode and has no Instagram Send API implementation.
