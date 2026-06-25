# Bagelito.pe

Source repository for the Bagelito.pe website.

Production site: https://bagelito.pe/

## Overview

Bagelito.pe is positioned as the monthly bagel drop in Lima: customers reserve packs during a batch window, payment is reviewed manually, and confirmed paid orders enter production.

## Stack

- Next.js App Router
- TypeScript
- Tailwind-style global CSS
- Framer Motion
- lucide-react
- Supabase schema and reservation/admin CRM code
- Vercel deployment

## Guardrails

- Do not commit secrets, `.env` files, credentials, wallets, or private keys.
- Keep `payment-proofs` private in Supabase Storage.
- Payment proof screenshots must be viewed through signed URLs only.
- Production summary should count only payment-confirmed/production/delivery statuses.

## Operations

- [Runbook operativo](docs/runbook-operativo.md): batch management, payment review, production, delivery, received status, archive/delete, exports, WhatsApp, and closeout.
- [Rutina de backups y Supabase](docs/supabase-backups-rutina.md): plan backups, weekly CSV export, voucher Storage checks, and delete safety.
- [Busqueda y crecimiento](docs/busqueda-crecimiento.md): Search Console, indexing, Instagram/WhatsApp funnel, UTM links, and OG testing.

## Production

Current Vercel URL:

https://bagelito.pe/
