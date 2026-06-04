import assert from "node:assert/strict";
import worker from "../../workers/worker.js";

let fetchedUrl;

globalThis.fetch = async (url) => {
  fetchedUrl = url.toString();
  return new Response("ok", { status: 200 });
};

async function assertCardResponse(path, headers, expectedContentType, expectedFetchedUrl) {
  fetchedUrl = null;

  const response = await worker.fetch(new Request(`https://speedshop.co${path}`, { headers }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), expectedContentType);
  assert.equal(fetchedUrl, expectedFetchedUrl);
}

await assertCardResponse(
  "/card",
  { Accept: "text/html" },
  "text/html",
  "http://www.speedshop.co.s3-website-us-east-1.amazonaws.com/card/card.html"
);

await assertCardResponse(
  "/card/yuki",
  { Accept: "application/json" },
  "application/json",
  "http://www.speedshop.co.s3-website-us-east-1.amazonaws.com/card/yuki/card.json"
);

await assertCardResponse(
  "/card/yuki.vcf",
  {},
  "text/vcard",
  "http://www.speedshop.co.s3-website-us-east-1.amazonaws.com/card/yuki/card.vcf"
);

await assertCardResponse(
  "/card/card.html",
  {},
  "text/html",
  "http://www.speedshop.co.s3-website-us-east-1.amazonaws.com/card/card.html"
);

const unknownResponse = await worker.fetch(new Request("https://speedshop.co/card/unknown"));
assert.equal(unknownResponse.status, 404);
assert.match(await unknownResponse.text(), /Unknown business card: unknown/);

const helpResponse = await worker.fetch(new Request("https://speedshop.co/card?format=help"));
assert.equal(helpResponse.status, 200);
assert.match(await helpResponse.text(), /\/card\/yuki/);
