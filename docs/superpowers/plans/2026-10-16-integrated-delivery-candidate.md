# Integrated Delivery Candidate Implementation Plan

> **For agentic workers:** Execute natively in this session using the existing isolated-worktree workflow. No additional agents or deployment are needed.

**Goal:** Combine the reviewed PR4/PR6/PR7 heads in one reviewable candidate without merging their PRs or changing main/Preview.

**Architecture:** Start from operator head afdb0ae (which descends from Culqi80233bc), merge attribution145001f with history preserved, retain both admin import sets and every branch deployment exclusion. Extend the existing isolated operator fixture with a dump/restore mode, then run all existing application/SQL/HTTP checks and local synthetic browser scenarios.

**Tech Stack:** Existing locked Next15.5.27/Node24, PostgreSQL17.11 pinned container, local Python Playwright/Chromium. No product dependency or migration changes.

**Spec:** The delegated user request to prepare an integrated candidate from commits80233bc,145001f andafdb0ae, with full isolated regression, migration/backup/rollback compatibility and a draft PR/CI; no hosted QA/production, payments, deployment, credential or support action.

## Global Constraints

- Preserve all three original commits/branch heads and main/Preview refs.
- Disable automatic deployment of integration/delivery-candidate-20261016 before first push.
- Use only disposable local synthetic databases and loopback app transport.
- No new provider calls, hosted reservation/payment, replay, support message, credentials or permissions.
- Do not treat unresolved webhook400 or old-main incompatibility as release-ready.

## Review Focus

- Combined admin page retains both diagnostic gating and decoded attribution.
- Delivery exports remain current-batch scoped; legacy/full backups keep their contracts.
- UTM validation, consent and languages survive alongside current payment dependencies.
- Restore preserves rows/dates/sequence/ACLs/core functions; current operator code runs on restored schema.
- Core replay rejects destructive changes; closed intake continues settling in-flight fixture payments.

## Task 1: History-preserving integration

- [x] Inspect exact remote heads and worktree state.
- [x] Create isolated candidate fromafdb0ae; merge145001f without rewriting history.
- [x] Resolve admin imports and deployment exclusions by retaining both inputs; verify all heads are ancestors.

## Task 2: Restored-code compatibility

Files: tests/operator-flow-http.mjs, new tests/fixtures/operator-backup-restore.mjs.

- [x] Add a fixture-only --backup-restore profile that requires an actual PostgreSQL custom dump and clean restore.
- [x] Compare synthetic rows, timestamps, sequence state and relevant catalog/ACL/trigger/function contracts before/after.
- [x] Run the existing complete native operator journey against the restored database.

## Task 3: Integrated verification

- [x] npm test, lint and build/types.
- [x] Existing native diagnostic/reconciliation/status/admin HTTP checks and restored operator journey.
- [x] Existing core-only and full SQL suites in networkless PostgreSQL17.11 containers.
- [x] Local attribution browser scenarios with intercepted POSTs/external requests blocked.

## Task 4: Candidate review package

Files: .github/workflows/integrated-delivery.yml, docs/integrated-delivery-candidate.md.

- [x] Document immutable inputs, isolated evidence, release blockers and compatible rollback limits.
- [ ] Publish only the candidate branch and a draft PR; verify exact-head CI and zero deployments. Final status and run links belong in the delivery evidence report after publication.
