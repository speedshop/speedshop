/**
 * Agent-ready content negotiation worker
 *
 * Implements Mintlify's agent-ready documentation pattern:
 * - Serves markdown when Accept: text/markdown header is present
 * - Adds Link header advertising llms.txt on all responses
 * - Adds X-Robots-Tag: noindex, nofollow on markdown responses
 *
 * https://www.mintlify.com/blog/context-for-agents
 */

const SITE_URL = "https://www.speedshop.co";

function wantsMarkdown(request) {
  const accept = request.headers.get("Accept") || "";
  return accept.includes("text/markdown");
}

function getMarkdownPath(pathname) {
  // /blog/slug/ -> /blog/slug/index.md
  // /retainer.html -> /retainer.md
  // /blog/slug -> /blog/slug.md (bare path)
  if (pathname.endsWith("/")) {
    return pathname + "index.md";
  }
  if (pathname.endsWith(".html")) {
    return pathname.replace(/\.html$/, ".md");
  }
  return pathname + ".md";
}

function addAgentHeaders(response, isMarkdown = false) {
  const headers = new Headers(response.headers);

  // Advertise llms.txt on all responses
  headers.set("Link", `<${SITE_URL}/llms.txt>; rel="llms-txt"`);
  headers.set("X-Llms-Txt", "/llms.txt");

  // Prevent search engines from indexing markdown variants
  if (isMarkdown) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Content-Type", "text/markdown; charset=utf-8");
  }

  // Vary by Accept header for proper caching
  const existingVary = headers.get("Vary");
  if (existingVary) {
    if (!existingVary.includes("Accept")) {
      headers.set("Vary", existingVary + ", Accept");
    }
  } else {
    headers.set("Vary", "Accept");
  }

  return headers;
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/card") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".gif") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".ttf") ||
    pathname.endsWith(".pdf") ||
    pathname.endsWith(".epub") ||
    pathname.endsWith(".md") ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt"
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Skip content negotiation for static assets and already-markdown files
    if (isStaticAsset(pathname)) {
      const response = await fetch(request);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: addAgentHeaders(response, pathname.endsWith(".md"))
      });
    }

    // Content negotiation: serve markdown if requested
    if (wantsMarkdown(request)) {
      const mdPath = getMarkdownPath(pathname);
      const mdUrl = new URL(mdPath, url.origin);

      try {
        // Fetch the markdown version from origin, bypassing cache/worker loops
        const mdResponse = await fetch(mdUrl.toString(), {
          cf: {
            // Bypass cache to go directly to origin
            cacheTtl: 0,
            cacheEverything: false
          }
        });

        if (mdResponse.ok) {
          return new Response(mdResponse.body, {
            status: 200,
            headers: addAgentHeaders(mdResponse, true)
          });
        }
      } catch (e) {
        // Fall through to HTML if markdown fetch fails
      }
    }

    // Default: serve HTML with agent headers
    const response = await fetch(request);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: addAgentHeaders(response, false)
    });
  }
};
