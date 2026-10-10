# Website data snapshots

The website consumes one public JSON snapshot rather than checking out or executing `client_notes`. The producer validates the projection before uploading it to R2. Upload is publication; website validation is a second safety boundary, not a confidentiality boundary.

## Contract

Version 1 contains exactly `version`, `generated_at`, `sla`, `availability`, `holidays`, `archive`, and `reply_histogram`.

- SLA: date coverage and daily status enums.
- Availability: the next three months and availability enums, without client identities, contracts, workload weights, or remaining capacity.
- Holidays: public names and dates.
- Archive: released numbered Markdown from canonical `YYYY_MM_DD.md` newsletter files, without editorial notes or future issues.
- Histogram: numeric bins, counts, maximum, and percentiles, without individual inbox timestamps.

The producer checks exact fields, coverage, dates, enums, text limits, control characters, histogram consistency, and a 5 MiB serialized-size limit before emitting the upload file. Missing released newsletters or holidays abort generation. A failed generation or validation never reaches the upload step.

These checks catch unintended fields and malformed projections. They do not prove that every permitted text field is free of private information. Producer code retains automatic publication authority; it must never serialize raw client records or credentials into allowed text fields.

The website independently validates the downloaded data and renders sanitized newsletter HTML, numeric histogram SVG, and escaped calendar text. Malformed JSON errors do not quote input into public logs. Production refuses snapshots older than 24 hours or more than five minutes in the future, and refuses fixture mode. Failed builds leave the deployed site unchanged. Generation time is not a claim that every underlying business record was recently edited.

## Storage and access

`speedshop-website-exports` publishes at `https://website-data.speedshop.co/snapshot.json` through an R2 custom domain. The development `r2.dev` domain remains disabled. Uploads set `Content-Type: application/json` and `Cache-Control: no-store` and replace the complete object atomically.

Only the producer needs an R2 credential: Object Read & Write restricted to this bucket. Standard R2 permissions are not write-only. Store its S3 key pair in `speedshop/client_notes` Actions secrets:

- `WEBSITE_EXPORT_R2_ACCESS_KEY_ID`
- `WEBSITE_EXPORT_R2_SECRET_ACCESS_KEY`

Producer Actions variables:

- `WEBSITE_EXPORT_R2_ENDPOINT`: the authenticated S3-compatible endpoint from Terraform.
- `WEBSITE_EXPORT_R2_BUCKET`: `speedshop-website-exports`.

The website needs no R2 credentials. Its only snapshot setting is the Actions variable `WEBSITE_SNAPSHOT_URL`, containing the public HTTPS URL. Downloading uses bounded HTTPS requests; building holds no deployment credentials. Deployment uses a validated artifact in a separate job.

Producer publication runs on `main` pushes and daily at 23:17 UTC. Website deployment runs daily at 00:00 UTC. Publication requires no human approval. Concurrent exports can publish in completion order, and GitHub schedules are not guaranteed; the freshness gate is authoritative.

## Cutover

1. Before enabling the custom domain, inspect the existing bucket. It must be empty or contain only an independently validated, public-intended `snapshot.json`. A custom domain exposes the bucket's objects; do not expose unknown staging content. Do not delete unknown objects automatically.
2. Review and merge the infrastructure custom-domain PR. HCP Terraform applies on merge to `main`; do not apply locally. Confirm DNS/TLS and the `website_exports.public_url` output.
3. Configure only the producer's scoped upload credentials and variables. Configure `WEBSITE_SNAPSHOT_URL` in the website repository. No reader credential is needed.
4. Merge the producer changes, publish the initial validated snapshot, and verify an unauthenticated HTTPS download passes the website's production validation.
5. Merge the website cutover, confirm the first production deployment succeeds, and remove `CLIENT_NOTES_PAT`. Retire any website-only R2 reader secrets and S3 endpoint/bucket variables from the previous design.

The new website cache namespaces do not restore toolchains or gem caches from the old private-repository execution pipeline. Deployment credentials remain confined to deployment steps.

## Local builds

Use `mise run build` or `mise run dev` for explicit, non-production fixtures. Browser tests use the same anonymized snapshot fixture.

For a real production build:

```fish
curl --fail --proto '=https' --max-filesize 5242880 --output tmp/website-snapshot.json https://website-data.speedshop.co/snapshot.json
set -lx WEBSITE_SNAPSHOT_PATH tmp/website-snapshot.json
set -lx JEKYLL_ENV production
bundle exec rake site:build_and_validate
```

```fish
mise run test:website-snapshot
```

The system tests cover fresh, stale, future, missing, malformed, and unexpected-field snapshots, sanitized rendering, payload-free diagnostics, and refusal of production fixture mode.
