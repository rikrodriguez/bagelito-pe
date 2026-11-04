# Bagelito Instagram Sales Research

Research date: 2026-11-03

This document records the external patterns used to shape the Bagelito sales engine. It does not override Bagelito's live menu, prices, delivery rules or Dawn's observed voice.

## Sales conversation references

### HubSpot objection handling

HubSpot's objection-handling guidance emphasizes active listening, restating the concern, validating it, asking follow-up questions and proceeding only after the real concern is understood. Its LAER-style sequence is compatible with Bagelito's desired flow:

1. listen;
2. acknowledge;
3. explore;
4. respond;
5. advance one small next step.

Reference: https://blog.hubspot.com/sales/handling-common-sales-objections

### Gong conversation research

Gong's published analysis warns against immediately answering the first stated objection. Stronger sellers clarify and probe, then close the loop before returning to the next sales step. For Bagelito this means a short question is preferred over a defensive paragraph when the blocker is ambiguous.

References:
- https://www.gong.io/blog/handling-sales-objections
- https://www.gong.io/blog/sales-process

## CRM and workflow references

### HighLevel opportunity fields

HighLevel supports contact and opportunity custom fields, pipeline-card visibility, workflow conditions and reporting. Opportunity fields are suitable for order-specific data; contact fields are suitable for reusable customer data. Conditional display can simplify the human UI, but API writes still require application-side validation.

References:
- https://help.gohighlevel.com/support/solutions/articles/155000000521
- https://help.gohighlevel.com/support/solutions/articles/155000008427
- https://help.gohighlevel.com/support/solutions/articles/155000008031

## Repository patterns reviewed

The implementation reviewed public state-machine and CRM projects for architecture patterns, not for copy-pasting business logic:

- `langchain-ai/langgraph`: explicit graph/state transitions and interruptible agent workflows;
- `relaticle/relaticle`: structured CRM entities and pipeline-oriented records;
- `customermates/customermates`: customer conversation and CRM-style organization;
- `dylanmeyford/radiant-ai-crm-oss`: AI-assisted CRM patterns;
- `the-forgotten-polymath/deskcomm-whatsapp-crm-agent`: messaging plus CRM synchronization concerns.

The chosen Bagelito architecture deliberately remains smaller: a deterministic TypeScript state machine, Supabase order drafts and an idempotent GHL sync queue. No external agent framework is required for the first production version.

## Bagelito-specific conclusions

1. The agent must diagnose before it persuades.
2. The latest question interrupts the script.
3. One useful next question is preferable to a full intake form.
4. Objection handling follows acknowledge → clarify → answer from live facts → check → resume.
5. Custom feasibility, complaints, refunds, allergies, food safety, payment disputes and exceptions are not automated.
6. Payment proof moves the order to verification; it never confirms payment by itself.
7. Supabase owns operational truth; GHL owns the human pipeline view.
8. Every CRM write uses a stable idempotency key.
