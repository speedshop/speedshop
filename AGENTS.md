# Speedshop

Ruby on Rails performance consultancy website. Jekyll static site hosted on S3 with Cloudflare CDN and Workers.

## Stack

- **Site**: Jekyll 4.3.3, Markdown content
- **Hosting**: S3 static hosting + Cloudflare CDN
- **Workers**: Cloudflare Workers for content negotiation and card endpoint
- **CI/CD**: GitHub Actions → S3 deploy → Cloudflare cache purge

## Testing

Run all tests with mise:

```bash
mise run test          # Full suite: lint, ruby, browser, links, integration (with local workers)
mise run test:ci       # CI suite: lint, ruby, browser, links (no local workers)
```

Individual test suites:

```bash
mise run lint                    # StandardRB linter
mise run test:ruby               # Ruby unit tests (test/ruby/)
mise run test:browser            # Playwright browser tests (test/browser/)
mise run test:links              # Link integrity checks over built site
mise run test:integration        # Integration tests with local Cloudflare worker
mise run test:integration:prod   # Integration tests against production
```

### Local Cloudflare Worker Development

The integration tests spin up local servers automatically, but for manual testing:

```bash
# Terminal 1: Static file server (HTTPS + HTTP/2)
npm run dev:static

# Terminal 2: Cloudflare Worker (wrangler)
npm run dev:worker

# Static site: https://localhost:4000
# Worker: http://localhost:8787
# Worker origin proxy: http://localhost:4001
```

## Project Structure

```
_posts/           # Blog posts (Markdown)
_plugins/         # Jekyll plugins (Ruby)
_site/            # Generated output (git-ignored)
test/
  ruby/           # Unit tests for plugins
  browser/        # Playwright E2E tests
  integration/    # HTTP integration tests
workers/agent-worker.js   # Cloudflare Worker for content negotiation
workers/worker.js         # Cloudflare Worker for /card endpoint
```

## Agent-Ready Documentation

This site implements the [Mintlify agent-ready pattern](https://www.mintlify.com/blog/context-for-agents):

- `/llms.txt` - Index of all content with markdown links
- `/llms-full.txt` - Full text of all blog posts
- `Accept: text/markdown` header returns markdown instead of HTML
- `Link: </llms.txt>; rel="llms-txt"` header on all responses

## Key Files

- `mise.toml` - Task runner configuration
- `workers/wrangler.toml` - Cloudflare Worker local dev config
- `infra/main.tf` - Terraform infrastructure (S3, Cloudflare)
- `_config.yml` - Jekyll configuration
