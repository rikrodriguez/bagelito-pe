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

## Conservative historical re-analysis — 2026-11-04

A second pass over the complete exported corpus used a deliberately stricter heuristic than the first audit.

- 537 conversation files
- 521 conversations with a meaningful customer opening
- 114 conversations with a likely conversion signal under the stricter rule
- 66 with a stronger sequence signal involving order + payment evidence hint + fulfillment

Directional associations:

| First-response behavior | With | Without |
| --- | ---: | ---: |
| Clear next-step language | 38.1% | 16.7% |
| Decision-moving question | 32.2% | 20.6% |
| Warm opener | 24.4% | 15.3% |
| Multiline / breathing room | 28.0% | 17.0% |
| Media in initial burst | 20.4% | 22.2% |

Initial text-burst length:

- 1 text: 24.9%
- 2 texts: 20.5%
- 3 texts: 16.7%
- 5+ texts: 0% in a tiny sample

The media result matters: media is useful for uncertainty reduction and product presentation, but sending more media is not itself a conversion strategy. Relevance, timing and non-duplication matter more.

Intent-level heuristic conversion signals:

- how-to-order: 44.4% (n=9)
- menu/flavors: 29.7% (n=37)
- availability/timing: 25.0% (n=16)
- delivery: 24.0% (n=25)
- price: 15.9% (n=69)
- custom: 17.2% (n=29)

These are small/uneven samples and must not be treated as causal performance benchmarks.

### External architecture review added 2026-11-04

Public systems reviewed as architecture references:

- Nea (kevinrivm/nea-agent): one question per message, CRM as source of truth, deterministic handoff/stall behavior, channel-agnostic brain.
- Pilot (getpilot/pilot): intent/context over rigid trees, CRM stages/lead scoring, Human Response Needed guardrails.
- DeskcommCRM (melgarafael/DeskcommCRM): AI sales operations embedded in CRM and channel workflows.

External sales guidance that matched Bagelito evidence:

- Gong: avoid objection monologues, clarify the real blocker, keep back-and-forth, secure a next step.
- HubSpot: the right next question should follow from what the customer just said; objection handling should pause/probe/provide/proceed.
- Zendesk conversational messaging: customers should not have to repeat themselves and automation should collect useful context progressively.

The implementation therefore prioritizes context → one next decision → structured state → deterministic safety gate, not a long static script.
## Full-export transition analysis v3 — 2026-11-04

This is a separate methodology from the earlier conversation-level heuristic, so the figures below must not be blended as if they were the same metric.

Dataset:
- 537 conversation files
- 522 conversations with a meaningful customer opener
- 2,660 Dawn-to-customer transitions

Conversation-level directional associations:
- clear next-step language: 62.3% likely-conversion signal vs 30.6% without
- decision-moving question: 52.9% vs 33.3%
- warm opener: 42.6% vs 31.0%
- multiline / breathing room: 46.1% vs 30.8%
- media in the initial burst: 31.0% vs 35.6%

Transition-level immediate progression:
- ask quantity: n=99, 54.5% immediate advance vs 21.8% baseline
- ask flavors: n=64, 43.8% vs 22.5%
- ask operational details: n=395, 42.3% vs 19.7%
- clear next-step phrase: n=428, 32.9% vs 21.1%

Question-count signal:
- 0 questions: 21.5% immediate advance
- 1 question: 34.0%
- 2 questions: 25.0%
- 3+ questions: 0% in a tiny sample

This supports the rule **one sales decision per turn**. It does not prohibit a compact operational bundle such as name + phone + district + address after the product order is already configured.

Commercial follow-ups detected after a meaningful period of silence:
- 57 candidate historical follow-ups
- 0.5–2 h: ~45% response
- 2–4 h: ~50%
- 4–8 h: 46.2% within 24 h / 53.8% within 7 days
- 8–23 h: ~50%

Because this is observational and the sample is small/noisy, follow-up remains **shadow-only** until prospective measurement confirms timing and copy.

### Important historical traps found

The export contains old promos, one-off discounts, free-delivery exceptions, alternative payment methods, rush promises, four-unit exceptions and experimental products. These are useful examples of how Dawn converses, but **none are current operational truth**. The agent must only use live facts for price, availability, payment, delivery and exceptions.

The mini-bagel review found a concrete historical failure mode: a customer explicitly corrected Bagelito after a mini order was interpreted as regular. This is why mini/minis is now a deterministic order-size signal rather than a purely model-inferred field.
