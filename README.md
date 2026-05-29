# Bagelito.pe

Source repository for the Bagelito.pe website.

Production site: https://bagelito-pe.vercel.app/

## Current status

The current production deployment was created directly on Vercel from a temporary local folder. That source folder is no longer available, so this repository is now the permanent source of truth going forward.

Before connecting this repository to production, rebuild or restore the exact Next.js source and verify it in a preview deployment.

## Guardrails

- Do not commit secrets, `.env` files, credentials, wallets, or private keys.
- Keep production unchanged until a preview matches the current live site.
- Use Vercel for deployment.
