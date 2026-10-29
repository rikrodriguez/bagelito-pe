# Bagelito Guided Playable Commerce — Architecture v1

## Product principle
Bagelito Store is a guided playable commerce experience: it feels like a small first-person game, but every commercial path is governed by an explicit funnel state machine.

The player is POV / first-person. No visible gendered avatar is required.

## Experience state machine
explore
→ choose category at totem or contextual vitrina prompt
→ configure Packs / Combos / Schmears
→ physically approach required station
→ select products in-world
→ contextual cross-sell/downsell
→ cashier
→ Culqi
→ receipt prints from POS
→ Bagelito Club / Wallet
→ staff hands over bag
→ exit / goodbye

Free exploration never changes order state. Commerce state changes only from explicit interactions.

## Technical layers

### 1. Commerce shell
- TanStack Start + React 19
- Supabase remains source of truth for batch, inventory, reservations, orders, customer profiles and loyalty
- Culqi remains payment processor
- Payment success is server authoritative; never trust a 3D animation, browser redirect or client state
- GHL receives derived CRM events only

### 2. Realtime world
- React Three Fiber / Three.js
- Rapier kinematic character controller
- First-person camera, desktop WASD + mouse/touch look
- Mobile joystick plus tap-to-move later
- World zones: entrance, totem, production, bagel vitrina, schmear station, cashier, seating, pickup
- NPC system: staff production loops, queue, dine-in customers,���q�^