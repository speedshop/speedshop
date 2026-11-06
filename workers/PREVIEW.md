# Private Threadpilot preview

The preview serves only the rendered Threadpilot page and static assets at
`https://threadpilot-preview.speedshop.workers.dev/`. It does not upload to S3 or
change the production deployment. The `workers.dev` hostname avoids needing a
new DNS record. Versioned and aliased Worker preview URLs are disabled.

## Access

Cloudflare Access configuration lives in `speedshop/infra`, in `apps/speedshop/`.
The application protects the whole hostname, including assets. Speedshop staff
sign in with the existing Google identity provider; invited external guests use
an emailed one-time code. Preview sessions last 24 hours.

The initial guest is `rohan@basicsystems.dev`. Add or remove guests through the
`speedshop_preview_guest_emails` variable in the infra repository. The benchmark
dashboard's existing Google-only policy is unchanged.

## First deployment

1. Apply the reviewed infrastructure change through the `TheSpeedshop/speedshop-infra`
   HCP Terraform workspace before deploying any preview assets. Confirm the
   `Threadpilot design preview` Access application protects the exact hostname
   above and has the staff and invited-guest policies.
2. Install dependencies with `bundle install` and `npm ci`.
3. Sign in to 1Password, then build and deploy with:

   ```fish
   mise run preview:deploy
   ```

The task builds the artifact, loads the API token, and verifies that an Access
application and email-restricted policies protect the hostname before uploading.
After deployment it checks that signed-out requests for both the page and a
static asset redirect to Access login. For transient 404 responses it makes up to
12 attempts, with five seconds between checks. Publicly accessible responses still
fail immediately.

The API token is resolved at runtime from the existing Threadpilot vault's
`Cloudflare` item. Do not put its value in `.env` or source files.

Check the page and a direct asset URL in a signed-out browser. Both must require
Access login. Confirm a Speedshop Google login works, then have the designer
request their own email code. Do not send a login code to the designer as part
of deployment testing.

## Updating the preview

Run `mise run preview:deploy` again. The URL stays the same. Use
`mise run preview:build` to build the artifact without deploying. Do not enable `preview_urls` or add another public hostname
without protecting it through Access first.

The build uses website-data fixtures and skips PDF, EPUB, and Markdown
conversion. Only the Threadpilot HTML and assets are packaged; unrelated pages,
sitemaps, source configuration, and website snapshots are not deployed.
