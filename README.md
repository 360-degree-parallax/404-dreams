# 404 DREAMS

A minimal image and video distortion lab with stable random effect combinations, person/background masks, pixel effects, MP4 exports, guestbook sharing, anonymous one-way likes, and a password-protected admin dashboard.

## Local preview

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Preview data stays in the ignored `.preview-data/` directory.

## Production

GitHub contains the source. Cloudflare Workers serves the interface and API at `404dreams.xyz`. D1 stores posts, likes, analytics and password hashes. R2 stores processed images shared in the guestbook.

Follow [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md). The database ID must be filled in and the administrator bootstrap secret must be configured before deployment. Do not store credentials or user database exports in this repository.

The original default reference photograph is included with the owner's explicit permission for public distribution. User uploads and user database exports are not included.

## Checks

```sh
node scripts/check-client.mjs
node scripts/check-guestbook.mjs
node scripts/check-auth.mjs
npm run build
```
