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