# Culqi merchant review window — no payments

On this production deployment, BAGELITO_MERCHANT_REVIEW_ONLY=true **must be set before a batch is publicly opened**. It makes public reservation APIs reject writes with HTTP 503 while enabling the four-step checkout's **visual preview**.

The ten bagel photos are the same as the catalog, sourced from /public/images. A separate checkout terms checkbox starts unchecked. The payment UI is an illustration with clickable method tabs and a simulate-only completion action; it contains no card, CVV, phone, OTP or bank inputs and cannot create an order/charge. Never describe it as a live Culqi checkout or successful capture.

The merchant review window uses a new batch, leaving historical batches/orders unchanged. The requested expiration of one year refers ONLY to the review/order window close date, **not an offer of one-year delivery delay**. Delivery date should remain null until an actual production window is announced. Do not enable real Culqi, generate live links or move a batch into real fulfillment until the merchant is approved and schedule/capacity are reviewed.

Before merchant go-live: replace preview with tested SDK checkout (PR #23), install coordinated legal migration, validate live configuration and external webhook delivery, disable the review-only env flag, set an actual delivery date and orders-close time for the commercial drop, and only then enable payments. This is not a bypass for Culqi approval.
