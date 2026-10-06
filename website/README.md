# www.mxwl.work

The website for **mxwl the editor**. A standalone Astro site with an Omarchy-inspired visual direction, charcoal and lime branding, real product captures, and a complete manual.

The source lives in `website/` in the `KerryRitter/mxwl-editor` repository. This directory has its own package, build, and deployment commands.

## Run it

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4321. The site is pre-rendered HTML with a little JavaScript for the mobile navigation, persistent theme, command copying, and screenshot viewer. Fonts and images are served locally.

```sh
npm run verify                         # typecheck, production build, link/asset/anchor checks
npx playwright install chromium       # first time, if using Playwright's bundled browser
npm run qa                             # desktop/mobile accessibility and interaction checks
MXWL_CHROME_PATH=/usr/bin/google-chrome npm run qa  # use an installed Chrome instead
```

QA images and results are in the ignored `.qa/` directory. Set `MXWL_SITE_URL` to test a different origin, including a production preview.

## Content

- Home, product tour, GitHub, agents, remote work, Tailscale, plugins, downloads, and the project story.
- A 16-guide manual with setup, GitHub issues and pull requests, Tailscale and phone access, browser sandboxes, agent control, plugin authoring/API/recipes/testing/security, alpha status, security, and the changelog.
- Current package downloads and the Linux installer point to `KerryRitter/mxwl-editor`.
- A sitemap, canonical URLs, page metadata, and a custom 404.
- Product screenshots use disposable demo projects. No unrelated products or customer data.

The release version and URLs live in `src/data/product.ts`. Guide metadata lives in `src/data/guides.json`.

The editor source is in the parent directory. Sync its documentation, brand assets, screenshots, and release version:

```sh
npm run assets:sync
# Or use another editor checkout:
npm run assets:sync -- /path/to/mxwl-editor
```

This copies documentation into the site and rewrites relative links to site guides or their upstream GitHub source. The site builds independently afterward. The custom full-workspace capture is kept when assets are synced.

To regenerate the branded workspace, review, fleet, host, and Tailscale screenshots, build the editor first, then run the capture script from this directory on a Linux desktop with a display:

```sh
npm --prefix .. run build
node scripts/capture-editor-screenshots.mjs
```

The capture uses temporary repositories, a temporary Electron profile, a local demo page, and the editor's ACP test fixture. It never reads the developer's saved workspaces or launches a paid provider. Native window capture includes the embedded Chromium view. Tailscale discovery is fed clearly labeled demo devices; it does not read the developer's tailnet. Brand and reference screenshots originate in the MIT-licensed editor repository.

## Deploy to mxwl.work

The canonical origin is **https://www.mxwl.work**. `mxwl.work` redirects there, preserving paths and query strings. The `website/` directory owns the editor's website. The previous orchestration application is a separate project.

`wrangler.jsonc` deploys the static Astro build to the **www-mxwl-work** Cloudflare Worker, with routes for `mxwl.work/*` and `www.mxwl.work/*` in the existing zone. Wrangler uses your local Cloudflare login; no credentials are stored in this checkout.

```sh
npm ci
npx wrangler login                      # if not already authenticated
npm run deploy:check                    # verify and inspect the upload without publishing
npm run deploy                          # verify, upload assets, publish Worker and routes
MXWL_SITE_URL=https://www.mxwl.work MXWL_CHROME_PATH=/usr/bin/google-chrome npm run qa
```

The asset service handles directory indexes, trailing slashes, and a custom `404.html` with HTTP 404 status. `_headers` sets response headers and immutable caching for fingerprinted assets. The small Worker handles the apex/HTTPS redirect, then delegates to static assets.

The existing DNS and origin were retained. To restore the previous origin, remove only the two routes belonging to `www-mxwl-work` in Cloudflare's Worker settings. To roll back a later update of this website, use Cloudflare's Worker deployment history or `npx wrangler rollback`.

## Other static hosts

Build with `npm ci && npm run verify`, then serve **`dist/`** as the document root. Use directory index routing, preserve individual `/docs/.../` URLs, and serve `404.html` for missing routes. For a static hosting provider, the build command is `npm run build` and output directory is `dist`.

For a server using Caddy, adapt `deploy/Caddyfile.example` to the real checkout path and validate it before including it in the server's configuration. For a container behind an existing proxy:

```sh
docker build -t www-mxwl-work .
docker run --rm -p 127.0.0.1:8080:8080 www-mxwl-work
```

Point the reverse proxy at port 8080.

## License

MIT. See `LICENSE`.
