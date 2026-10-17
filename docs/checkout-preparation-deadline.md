# Bound checkout preparation before opening Culqi

Base: PR12 `6a4a827a5ddf2a198fd1a4d763090a72f8441823`. The new branch `fix/checkout-preparation-deadline-20261017` disables its own automatic Vercel deployment before publication.

ReservationFlow bounded charge and status reads, but its reservation and local token-session preparation requests had no owned deadline. Stalled response headers or JSON on either request kept the actual checkout button preparing indefinitely. The SDK had not opened or submitted a payment at that point.

Preparation now shares one 20-second budget across both requests and their JSON bodies. Expiry aborts both transports and returns the existing localized preparation error/retry state. A Promise.race bounds even transports that ignore cancellation; abort and elapsed-time checks after each await prevent late reservation data from starting a session request, opening the SDK or advancing preparation, including a delayed browser timer. The owned timer clears on completion/failure.

Retry uses the existing checkout fingerprint/capability. It does not create a new UUID automatically, renew the server reservation deadline, write payment-recovery metadata or send a charge. A timed-out request may already have created an unpaid hold on the server: abort is not cancellation of that hold. Existing reservation idempotency, original expiry and server validation remain authoritative. Charge/status deadlines, financial transitions, webhook verification and storage policy are unchanged.

Five regressions execute the real ReservationFlow and CulqiCheckoutButton callbacks with synthetic transport/browser/SDK and a test-only clock. Four fail before the fix because the retry state never appears; a fifth fails without the elapsed-time guard because a delayed timer allows an overdue response to open the SDK. They cover reservation/session headers and bodies, 12 seconds spent on the first request before the second stalls, a further partial header/body budget, ignored AbortSignal, delayed browser timers, no late follow-on request or SDK mount, and safe retry of the same reference without a charge. The complete checkout suite still covers normal success, expiry, status recovery, 3DS and stale callbacks.

The 20-second limit is application policy, not a claim about a Culqi API requirement or remote certification. These isolated tests use no hosted database, credentials, real SDK or provider call. No deployment, merge, real reservation or charge is part of this change.
