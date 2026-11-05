# Bagelito Conversation, Sales and CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dawn-faithful Instagram sales agent that creates structured orders and synchronizes the commercial lifecycle to GHL.

**Architecture:** Separate voice generation, sales-state decisions and CRM/order synchronization. Supabase is the operational source of truth; GHL is the pipeline view. The Instagram webhook consumes versioned policy modules and only sends after deterministic gates pass.

**Tech Stack:** Next.js 15, TypeScript, Supabase Postgres/Edge Functions, Instagram Messaging API, OpenAI Responses API, HighLevel API.

**Spec:** `docs/superpowers/specs/2026-11-03-bagelito-conversation-sales-crm-design.md`

## Global Constraints

- Full AUTO stays disabled for real customers during implementation.
- Current prices, menu, promotions, delivery and payment data come from live sources only.
- Sensitive cases always route to human review.
- Messages must satisfy Dawn mobile formatting rules.
- CRM synchronization must be idempotent.

## Review Focus

- Latest customer question interrupts and supersedes an earlier order step.
- A repeated catalog request is distinguished from accidental duplicate media.
- Partial order details merge without overwriting known fields.
- Payment proof does not equal confirmed payment.
- CRM retries cannot create duplicate opportunities.

---

### Task 1: Historical Voice and Conversion Audit

**Files:**
- Create: `docs/instagram-dawn-deep-audit.md`
- Create: `src/lib/instagram/voice-profile.ts`
- Test: `tests/instagram-voice-profile.test.mjs`

**Interfaces:**
- Produces: `DAWN_VOICE_PROFILE`, `scoreDawnStyle(reply)`.

- [ ] Derive conversation and conversion-signal metrics from Supabase.
- [ ] Document tone, spacing, emojis, bubble splitting, CTAs, media and exceptions with real patterns.
- [ ] Write failing tests for wall-of-text, pipe separators, excessive emojis, support-bot phrasing and correct order-summary layout.
- [ ] Implement the profile and scorer.
- [ ] Run `npm test` and commit.

### Task 2: Dynamic Sales State Machine

**Files:**
- Create: `src/lib/instagram/sales-engine.ts`
- Create: `src/lib/instagram/sales-playbook.ts`
- Modify: `src/lib/instagram/shadow.ts`
- Test: `tests/instagram-sales-engine.test.mjs`

**Interfaces:**
- Produces: `classifySalesStage`, `planNextSalesAction`, `shouldHandoff`, `mergeOrderPatch`.

- [ ] Write tests for discovery, recommendation, configuration, quote, payment pending and human-review branches.
- [ ] Add objection handling and newest-question-first rules.
- [ ] Add live payment-method policy and proof-request copy.
- [ ] Extend structured AI output with sales fields.
- [ ] Run `npm test` and commit.

### Task 3: Instagram Order Drafts and Production Data

**Files:**
- Create: `supabase/add-instagram-sales-crm.sql`
- Create: `src/lib/instagram/order-drafts.ts`
- Modify: `supabase/functions/instagram-webhook/index.ts`
- Test: `tests/instagram-order-drafts.test.mjs`

**Interfaces:**
- Produces: order-draft upsert, item reconciliation, totals, production summary.

- [ ] Add lead, order draft, order item, event and CRM sync-queue tables.
- [ ] Link contacts, conversations and final orders.
- [ ] Persist sales stage and order patch from every AI/human turn.
- [ ] Add views for bagels by flavor, revenue, delivery and payment state.
- [ ] Run migrations and tests, then commit.

### Task 4: GHL Pipeline and Sync Contract

**Files:**
- Create: `docs/instagram-ghl-crm-map.md`
- Create: `src/lib/instagram/ghl-sync.ts`
- Test: `tests/instagram-ghl-sync.test.mjs`

**Interfaces:**
- Produces: contact upsert payload, opportunity upsert payload and stage mapping.

- [ ] Create the Bagelito pipeline in RikMarketing.
- [ ] Define contact and opportunity fields.
- [ ] Implement idempotency keys and retry state.
- [ ] Add sync worker contract and mapping documentation.
- [ ] Verify no duplicate opportunity is created on repeated events.

### Task 5: Controlled End-to-End Validation

**Files:**
- Modify: `tests/instagram-shadow-agent.test.mjs`
- Modify: `docs/instagram-inbox-agent.md`

**Interfaces:**
- Consumes all prior tasks.

- [ ] Replay representative historical conversations.
- [ ] Test safe inquiry through order draft and payment request.
- [ ] Test custom request and sensitive handoff.
- [ ] Test media deduplication and human takeover.
- [ ] Keep production in `test_auto` until all gates pass.
- [ ] Run `npm test`, `npm run lint`, and `npm run build`.