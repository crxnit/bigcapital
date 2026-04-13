# Changes from Upstream

This fork is based on [bigcapitalhq/bigcapital](https://github.com/bigcapitalhq/bigcapital) at commit `98713f8`. All modifications are listed below per AGPL v3 Section 5(a).

## Bug Fixes

### Bulk Activate/Inactivate Accounts (2026-04-13)

**Problem:** Selecting accounts and clicking "Inactivate" or "Activate" in the accounts list crashed with `TypeError: l is not a function`. The bulk alert components called functions (`requestBulkInactiveAccounts` / `requestBulkActivateAccounts`) that were never injected. The `withAccountsActions` HOC was commented out in `AccountBulkInactivateAlert.tsx`, and `AccountBulkActivateAlert.tsx` had an explicit `TODO` comment acknowledging the missing implementation. No backend bulk endpoint exists.

**Fix:** Rewrote both components to use the existing single-account React Query hooks (`useInactivateAccount` / `useActivateAccount`) with `Promise.all()` over selected IDs. Also fixed the confirm button count (was hardcoded to `0`, now shows actual selection count).

**Files changed:**
- `packages/webapp/src/containers/Alerts/Accounts/AccountBulkInactivateAlert.tsx`
- `packages/webapp/src/containers/Alerts/Accounts/AccountBulkActivateAlert.tsx`

**Upstream status:** Bug report drafted, pending filing.

## Deployment Customizations

### ARM64 Docker Support

Custom Dockerfiles and a production compose file (`docker-compose.production.yml`) for self-hosted ARM64 deployment behind Traefik. See `DEPLOYMENT.md` for the full deployment guide.

- `docker/migration/Dockerfile.prod` — Migration container based on locally-built server image
- `packages/webapp/Dockerfile` — Multi-stage webapp build (builder + nginx)

### Configuration Files

- `CLAUDE.md` — Development and deployment reference for AI-assisted development
- `DEPLOYMENT.md` — Step-by-step production deployment guide

## Known Upstream Issues (Not Fixed in This Fork)

These are documented in `CLAUDE.md` under "Upstream Quirks" for awareness but are not patched here:

- `SIGNUP_EMAIL_CONFIRMATION` is a dead knob due to flipped Ramda `defaultTo` arguments
- `Mail.module.ts` breaks all no-auth SMTP relays by unconditionally passing `auth` to nodemailer
- Mail templates use wrong config key `baseURL` instead of `app.baseUrl` (fixed upstream in #966, workaround applied via compose env var)
- Frontend invite/verification routes point to non-existent backend paths (#969 / PR #972)
- User deletion fails with FK violation on `USER_INVITES` (no cascade delete)
- `/api/system_db` healthcheck endpoint returns 404 (controller never registered in any module)
