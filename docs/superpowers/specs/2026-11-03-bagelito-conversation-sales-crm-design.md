# Bagelito Conversation, Sales and CRM Design

## Intent
Build an Instagram sales operator that sounds and behaves like Dawn, converts routine DMs into structured Bagelito orders, and writes every lead and order into CRM while escalating sensitive cases to a human.

## Priority
1. Dawn Voice & Conversation Intelligence
2. Bagelito Sales Engine
3. CRM, orders and GHL synchronization

## Goals
- Learn structure, spacing, tone, emoji use, media timing and conversational rhythm from real Dawn messages.
- Measure historical signals for inquiry, quote, payment request and confirmed order.
- Use a dynamic sales state machine rather than a rigid script.
- Answer the newest customer question before resuming the sales flow.
- Capture order lines, delivery details, total, payment state and handoff reason as structured data.
- Use Supabase as operational source of truth and GHL as the human-facing pipeline.

## Non-goals
- Automatically resolve complaints, refunds, allergies, food-safety issues, payment disputes or custom-order feasibility.
- Treat historical prices, promotions or dates as current truth.
- Copy Dawn's typos deliberately.
- Open full AUTO before voice, sales and CRM gates pass.

## Architecture

### Dawn Voice DNA
A versioned profile records observable behavior: language mode, greetings, bubble splitting, paragraph spacing, line length, emoji placement, first-person wording, CTA phrasing, media timing, order-summary layout and recovery patterns. A scoring rubric evaluates replies before AUTO.

### Sales Engine
The model returns structured fields: `sales_stage`, `buyer_signal`, `next_best_action`, `missing_fields`, `objection_type`, `order_patch`, `handoff_reason`, `proposed_messages` and `proposed_media`.

The deterministic policy decides whether to send, ask one question, quote, provide the current live payment method, hold for review or hand off. The model never decides payment truth or custom feasibility.

Stages: `new_inquiry`, `menu_discovery`, `recommendation`, `order_configuration`, `details_collection`, `quote_ready`, `payment_pending`, `payment_evidence_received`, `confirmed`, `production`, `delivery`, `completed`, `lost`, `human_review`.

Objections follow: acknowledge, clarify, answer from live facts, check resolution, resume the smallest next step.

### CRM and orders
Supabase remains authoritative for messages, order drafts, order items, payment evidence and production totals. GHL stores contacts and opportunities for the sales/operations view. A sync queue makes GHL writes idempotent and retryable.

Proposed GHL stages: New Instagram DM; Menu / Discovery; Configuring Order; Details Missing; Quote Sent; Payment Pending; Voucher Received; Payment Confirmed; In Production; Ready for Delivery; Delivered; Human Review; Lost / No Response.

## Human handoff
Handoff for complaints, refunds, missing/damaged orders, allergy or food-safety questions, payment disputes, custom feasibility, conflicting data, customer request for a human, repeated misunderstanding or low confidence. When Dawn replies manually, AI pauses and her final reply becomes evaluation evidence.

## Payment
For a complete verified quote, the agent may provide the current live Bagelito payment method and request proof. It must not mark payment confirmed until the operational source verifies it. Later, the order draft will generate a pre-filled checkout link and payment webhooks will update the order and pipeline.

## Success gates
- Voice score passes held-out real conversations.
- No stale price, date or promotion use.
- Latest customer question is answered first.
- No duplicate catalog media unless requested.
- Order totals reconcile with items.
- GHL sync is idempotent.
- AUTO remains limited until safe-intent and order-flow tests pass.