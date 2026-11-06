import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const configPath = "workers/preview-wrangler.toml";
const config = unstable_readConfig({ config: configPath });
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is missing; run mise run preview:deploy to load it from 1Password.");
if (!config.account_id || !config.name) throw new Error("The preview Worker needs an account ID and name.");
if (config.workers_dev !== true || config.preview_urls !== false || config.routes?.length || config.route) {
  throw new Error("The private preview must use only workers.dev with versioned preview URLs disabled.");
}

async function cloudflare(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(`Cloudflare API ${path} failed (${response.status}): ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

async function list(path) {
  const results = [];
  for (let page = 1; ; page += 1) {
    const items = await cloudflare(`${path}?per_page=50&page=${page}`);
    if (!Array.isArray(items)) throw new Error(`Cloudflare API ${path} did not return a list.`);
    results.push(...items);
    if (items.length < 50) return results;
  }
}

const accountPath = `/accounts/${config.account_id}`;
const subdomain = await cloudflare(`${accountPath}/workers/subdomain`);
if (!subdomain.subdomain) throw new Error("The Cloudflare account has no workers.dev subdomain.");
const hostname = `${config.name}.${subdomain.subdomain}.workers.dev`;
const applications = await list(`${accountPath}/access/apps`);
const application = applications.find(app => app.type === "self_hosted" && app.domain === hostname);
if (!application) throw new Error(`No Access application protects ${hostname}. Apply the speedshop/infra preview configuration first.`);

const policies = await list(`${accountPath}/access/apps/${application.id}/policies`);
const emailGated = policies.length > 0 && policies.every(policy =>
  policy.decision === "allow" && policy.include?.length > 0 &&
  policy.include.every(rule => Object.keys(rule).length === 1 && (rule.email?.email || rule.email_domain?.domain)) &&
  policy.require?.some(rule => rule.login_method?.id)
);
if (!emailGated) throw new Error(`Access policies for ${hostname} must allow only invited emails or domains and require an identity provider.`);
console.log(`Verified email-gated Access application: ${hostname}`);

const deployment = spawnSync("./node_modules/.bin/wrangler", ["deploy", "--config", configPath], { stdio: "inherit" });
if (deployment.error) throw deployment.error;
if (deployment.status !== 0) process.exit(deployment.status ?? 1);

for (const path of ["/", "/assets/css/threadpilot.css"]) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await fetch(`https://${hostname}${path}`, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location && new URL(location, `https://${hostname}`).hostname.endsWith(".cloudflareaccess.com")) break;
    if (response.status !== 404 || attempt === 12) {
      throw new Error(`Signed-out request to ${path} did not redirect to Cloudflare Access (HTTP ${response.status}).`);
    }
    console.log(`Waiting for ${hostname}${path} to propagate (HTTP 404; attempt ${attempt}/12).`);
    await setTimeout(5_000);
  }
}
console.log(`Private Threadpilot preview deployed: https://${hostname}/`);
