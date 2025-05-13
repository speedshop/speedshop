/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const FORMATS = {
  json:    { key: "card.json",  type: "application/json" },
  html:    { key: "card.html",  type: "text/html" },
  vcard:   { key: "card.vcf",   type: "text/vcard" },
  xml:     { key: "card.xml",   type: "application/xml" },
  yaml:    { key: "card.yaml",  type: "application/x-yaml" },
  qrcode:  { key: "card.svg",   type: "image/svg+xml" },
  jpeg:    { key: "card.jpg",   type: "image/jpeg" },
  wav:     { key: "card.wav",   type: "audio/wav" },
  help:    { key: null,         type: "text/plain" },
  default: { key: "card.txt",   type: "text/plain" }
};

const S3_BASE_URL = "https://www.speedshop.co";

const COMMON_HEADERS = {
  "Cache-Control": "public, max-age=3600",
  "Vary": "Accept"
};

function determineFormat(request) {
  const formatParam = new URL(request.url).searchParams.get("format");
  const accept = request.headers.get("Accept") || "";

  if (formatParam && FORMATS[formatParam]) return formatParam;
  if (accept.includes("application/json")) return "json";
  if (accept.includes("text/html")) return "html";
  if (accept.includes("text/vcard") || accept.includes("text/x-vcard")) return "vcard";
  if (accept.includes("application/xml")) return "xml";
  if (accept.includes("application/x-yaml") || accept.includes("text/yaml")) return "yaml";
  if (accept.includes("image/svg+xml")) return "qrcode";
  if (accept.includes("image/jpeg")) return "jpeg";
  if (accept.includes("audio/wav")) return "wav";
  return "default";
}

function handleOptionsRequest() {
  const supportedTypes = [
    "application/json",
    "text/html",
    "text/vcard",
    "text/x-vcard",
    "application/xml",
    "application/x-yaml",
    "text/yaml",
    "image/svg+xml",
    "image/jpeg",
    "audio/wav",
    "text/plain"
  ];

  return new Response(null, {
    status: 204,
    headers: {
      ...COMMON_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept",
      "Access-Control-Max-Age": "86400",
      "Accept": supportedTypes.join(", ")
    }
  });
}

function handleHelpRequest() {
  const helpText = `Available formats:
/card                (text)
/card?format=json    (JSON)
/card?format=html    (HTML)
/card?format=vcard   (vCard)
/card?format=wav     (Audio)
/card?format=qrcode  (QR Code)
/card?format=xml     (XML)
/card?format=yaml    (YAML)`;

  return new Response(helpText, {
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "text/plain"
    }
  });
}

async function handleWavRequest(key) {
  const res = await fetch(`${S3_BASE_URL}/${key}`);
  const audio = await res.arrayBuffer();

  return new Response(audio, {
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "audio/wav",
      "Content-Encoding": "identity",
      "Accept-Ranges": "bytes"
    }
  });
}

async function handleStandardRequest(key, contentType) {
  const response = await fetch(`${S3_BASE_URL}/${key}`);
  if (!response.ok) throw new Error(`Upstream ${response.status}`);
  const body = await response.text();

  return new Response(body, {
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": contentType
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname === "/card") {
      return handleOptionsRequest();
    }

    const format = determineFormat(request);
    const { key, type } = FORMATS[format];

    try {
      if (format === "help") {
        return handleHelpRequest();
      }

      if (format === "wav") {
        return handleWavRequest(key);
      }

      return await handleStandardRequest(key, type);
    } catch (err) {
      return new Response(`Error loading business card format (${format}): ${err.message}`, {
        status: 500,
        headers: {
          ...COMMON_HEADERS,
          "Content-Type": "text/plain"
        }
      });
    }
  }
}
