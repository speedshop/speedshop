/**
 * Business card content negotiation worker.
 *
 * Serves different business card formats at /card and /card/:person.
 */

const FORMATS = {
  json: { ext: "json", type: "application/json" },
  html: { ext: "html", type: "text/html" },
  vcard: { ext: "vcf", type: "text/vcard" },
  xml: { ext: "xml", type: "application/xml" },
  yaml: { ext: "yaml", type: "application/x-yaml" },
  qrcode: { ext: "svg", type: "image/svg+xml" },
  jpeg: { ext: "jpeg", type: "image/jpeg" },
  wav: { ext: "wav", type: "audio/wav" },
  help: { ext: null, type: "text/plain" },
  default: { ext: "txt", type: "text/plain" }
};

const EXTENSION_FORMATS = {
  json: "json",
  html: "html",
  vcf: "vcard",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  svg: "qrcode",
  jpeg: "jpeg",
  jpg: "jpeg",
  wav: "wav",
  txt: "default"
};

const PEOPLE = {
  nate: { name: "Nate", path: "card" },
  yuki: { name: "Yuki", path: "card/yuki" }
};

const DEFAULT_PERSON = "nate";
const S3_BASE_URL = "http://www.speedshop.co.s3-website-us-east-1.amazonaws.com";

const COMMON_HEADERS = {
  "Cache-Control": "public, max-age=3600",
  "Vary": "Accept"
};

function parseCardRoute(request) {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/^\/card(?:\/([^/.]+))?(?:\.([a-z0-9]+))?\/?$/i);

  if (!match) return null;

  let person = (match[1] || DEFAULT_PERSON).toLowerCase();
  const extension = match[2]?.toLowerCase();

  if (person === "card" && extension) person = DEFAULT_PERSON;
  if (!PEOPLE[person]) return { person, formatFromExtension: null, validPerson: false };

  return {
    person,
    formatFromExtension: extension ? EXTENSION_FORMATS[extension] : null,
    validPerson: true
  };
}

function determineFormat(request, route) {
  const formatParam = new URL(request.url).searchParams.get("format");
  const accept = request.headers.get("Accept") || "";

  if (formatParam && FORMATS[formatParam]) return formatParam;
  if (route?.formatFromExtension) return route.formatFromExtension;
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

function keyFor(person, format) {
  const formatConfig = FORMATS[format];
  return `${PEOPLE[person].path}/card.${formatConfig.ext}`;
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
  const helpText = `Available people:
/card                 (Nate)
/card/yuki            (Yuki)

Available formats:
/card                 (text)
/card?format=json     (JSON)
/card?format=html     (HTML)
/card?format=vcard    (vCard)
/card?format=wav      (Audio)
/card?format=qrcode   (SVG)
/card?format=xml      (XML)
/card?format=yaml     (YAML)

Extensions also work:
/card.vcf
/card/yuki.vcf`;

  return new Response(helpText, {
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "text/plain"
    }
  });
}

async function handleCardRequest(person, format) {
  const { type } = FORMATS[format];
  const key = keyFor(person, format);
  const response = await fetch(`${S3_BASE_URL}/${key}`);
  if (!response.ok) throw new Error(`Upstream ${response.status}`);

  const headers = {
    ...COMMON_HEADERS,
    "Content-Type": type
  };

  if (format === "wav") {
    headers["Content-Encoding"] = "identity";
    headers["Accept-Ranges"] = "bytes";
  }

  return new Response(response.body, { headers });
}

export default {
  async fetch(request) {
    const route = parseCardRoute(request);

    if (!route) {
      return new Response("Not found", {
        status: 404,
        headers: {
          ...COMMON_HEADERS,
          "Content-Type": "text/plain"
        }
      });
    }

    if (!route.validPerson) {
      return new Response(`Unknown business card: ${route.person}`, {
        status: 404,
        headers: {
          ...COMMON_HEADERS,
          "Content-Type": "text/plain"
        }
      });
    }

    if (request.method === "OPTIONS") {
      return handleOptionsRequest();
    }

    const format = determineFormat(request, route);

    try {
      if (format === "help") {
        return handleHelpRequest();
      }

      return await handleCardRequest(route.person, format);
    } catch (err) {
      return new Response(`Error loading ${PEOPLE[route.person].name}'s business card format (${format}): ${err.message}`, {
        status: 500,
        headers: {
          ...COMMON_HEADERS,
          "Content-Type": "text/plain"
        }
      });
    }
  }
};
