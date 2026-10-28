# Bagelito Commerce — AI Studio import handoff

This branch is a root-level export of the validated TanStack Start Bagelito Store.

## Source

- Source PR: #37
- Export branch: `ai-studio/bagelito-commerce-root-20261027`
- Original validated source commit: `56fba5fe9b6fdb6d0e8efd94fa97a3aeefc8dc8e`
- Root export commit: `5c315eb8cd9c7f19fca2231ec5c1d1462a5416fe`

## Clean-clone proof

Executed from repository root in an isolated Vercel Sandbox:

```bash
npm install
npm run typecheck
npm run preview -- --host 127.0.0.1 --port 3000
```

Observed:
- install: PASS, 0 vulnerabilities
- client build: PASS
- SSR build: PASS
- TypeScript: PASS
- GET /: 200
- GET /api/catalog: 200
- GET /api/batch without Supabase secrets: 503 fail-closed
- bundled entry/product images: 200

## Target procedure

1. HighLevel AI Studio creates `Bagelito Commerce` and its private GitHub repository.
2. Preserve the generated baseline in a branch/tag.
3. Import this root tree into the AI Studio repo.
4. Keep checkout disabled.
5. Configure test-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in server-side project secrets.
6. Re-run build/typecheck and endpoint smoke tests in AI Studio preview.
7. Only then port reservation writes and Culqi sandbox.

Do not publish a production domain, send customer messages, or enable live Culqi charges from this export.
