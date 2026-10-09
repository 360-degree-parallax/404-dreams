# 404 DREAMS / GitHub → Cloudflare

GitHub stores this project. Cloudflare Workers serves both the interface and `/api` at `https://404dreams.xyz`. D1 stores guestbook text, likes, analytics and hashed passwords. R2 stores the processed images shared to the guestbook. The front end already calls `/api` on its own origin; no separate API URL or cross-domain cookie setup is needed.

## Account setup

1. Put this source in your GitHub repository. Never commit local preview data, API tokens, or passwords.
2. Add `404dreams.xyz` to your Cloudflare account and make its DNS zone active. If necessary, change the domain's nameservers at the registrar to those assigned by Cloudflare. The domain must already be registered to you.
3. Create the Worker named `404-dreams`, the D1 database `404-dreams-db`, and the R2 bucket `404-dreams-media` in that account.
4. Copy the actual D1 database ID into `wrangler.json`. The included value is an explicit placeholder, so deployment stops until it is replaced.
5. Add an encrypted Worker secret named `ADMIN_INITIAL_PASSWORD` with a unique password of at least 8 characters. This external hosting configuration blocks initial admin setup while this secret is missing. The first admin login still requires a password change. Do not put the secret in GitHub or in the config file.
6. Connect that Worker to your GitHub repository using Cloudflare's Git integration. Use `main` as the production branch, the repository root as the root directory, and `node scripts/deploy-cloudflare.mjs` as the deploy command. No front-end build is required: the Worker serves `public/` directly.

The deploy script applies the checked-in SQL migrations before deploying the Worker. The custom-domain route connects `404dreams.xyz` to the Worker. Application bindings are `DB` for D1 and `MEDIA` for R2.

## Existing data

The managed test site's database and image bucket do not transfer automatically to your Cloudflare account. A fresh deployment starts with an empty database and the initial admin password set above. If existing analytics must be retained, migrate the database and shared images before switching the public domain; do not commit database exports to the repository.

## References

- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- https://developers.cloudflare.com/d1/wrangler-commands/
- https://developers.cloudflare.com/r2/buckets/create-buckets/

## If the dashboard reports assets-only

The repository root contains the standard `wrangler.json` with `main: worker/index.js`. In Worker Settings > Builds, connect this repository with the root directory left at the repository root, no build command, and deploy command `node scripts/deploy-cloudflare.mjs`. Do not point the root directory to `public` or use an assets-only upload. Retry the build on the latest main commit. Only a successful server deployment enables runtime secrets and the API. Check bindings DB and MEDIA after deployment. If migrations fail for permission reasons, give the build's deployment token access to D1 in this account; never place that token in the repository.
