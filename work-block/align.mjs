import { chromium, devices } from "@playwright/test";
import fs from "node:fs";
const trim = "text-box: trim-both cap alphabetic;";
const V = {
  "0 · Now: number on the name's baseline": "",
  "A · Number baseline on the bar's bottom": `
    .work-count { grid-row: 1 / span 2; align-self: end; ${trim} margin-bottom: calc(0.5em / 1.7); }
    .work-name { align-self: start; }`,
  "B · Number fills name + bar (cap top to bar bottom)": `
    .work-count { grid-row: 1 / span 2; align-self: start; ${trim} }
    .work-name { align-self: start; ${trim} }
    .work-track { margin-top: 0.4em; }`,
  "C · Number at the end of the bar": `
    .work-categories, .work-categories-expanded { column-gap: 0; }
    .work-count { grid-column: 2; grid-row: 2; font-size: 1em; ${trim} align-self: end; justify-self: start; margin-bottom: calc(0.5em); }
    .work-track { background: none; display: flex; align-items: flex-end; padding-right: 2.6em; }
    .work-track .work-count { background: none; height: auto; display: block; flex: none; }
    .work-name { grid-column: 2; }`,
  "D · Name left, number right, bar underneath": `
    .work-categories, .work-categories-expanded { column-gap: 0; }
    .work-count { grid-column: 2; font-size: 1.1em; justify-self: end; }
    .work-name { grid-column: 2; }`,
  "E · Number and name on one line, bar under both": `
    .work-track { grid-column: 1 / 3; }
    .work-description { grid-column: 1 / 3; }`,
};
const b = await chromium.launch();
const shots = [];
for (const [w, ctx] of [["desktop", { viewport: { width: 1280, height: 900 } }], ["phone", devices["iPhone 13"]]]) {
  const c = await b.newContext(ctx);
  for (const [name, css] of Object.entries(V)) {
    const p = await c.newPage();
    await p.goto("http://localhost:4107/retainer.html", { waitUntil: "networkidle" });
    if (css) await p.addStyleTag({ content: css });
    const metrics = await p.evaluate(async (name) => {
      await document.fonts.ready;
      const cats = [...document.querySelectorAll(".work-category")];
      if (name.startsWith("B")) for (const cat of cats) {
        const n = cat.querySelector(".work-count"), top = cat.querySelector(".work-name").getBoundingClientRect().top, bot = cat.querySelector(".work-track").getBoundingClientRect().bottom;
        const cs = parseFloat(getComputedStyle(n).fontSize); n.style.fontSize = (cs * (bot - top) / n.getBoundingClientRect().height) + "px";
      }
      if (name.startsWith("C")) for (const cat of cats) { const n = cat.querySelector(".work-count"), t = cat.querySelector(".work-track"); t.style.height = "auto"; t.firstElementChild.style.height = "0.28em"; n.style.marginLeft = "0.4em"; n.style.marginBottom = "0"; t.appendChild(n); }
      const cat = cats[1];
      const n = cat.querySelector(".work-count").getBoundingClientRect(), t = cat.querySelector(".work-track").getBoundingClientRect();
      return { numBottom: Math.round(n.bottom), barBottom: Math.round(t.bottom) };
    }, name);
    const box = await p.locator(".work-categories").boundingBox();
    const file = `tmp/align-${w}-${name[0]}.png`;
    const height = w === "phone" ? 330 : 300;
    await p.screenshot({ path: file, clip: { x: Math.max(box.x - 8, 0), y: box.y + (await p.evaluate(() => scrollY)), width: w === "phone" ? box.width + 8 : 640, height }, fullPage: true });
    console.log(w, name[0], JSON.stringify(metrics));
    shots.push({ w, name, file });
    await p.close();
  }
  await c.close();
}
const html = `<html><body style="font:16px -apple-system,sans-serif;margin:20px;background:#f4f4f4">` +
  Object.keys(V).map(name => `<div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:28px"><div style="width:230px;font-weight:600">${name}</div>` +
    shots.filter(s => s.name === name).map(s => `<img src="file://${process.cwd()}/${s.file}" style="background:#fff;border:1px solid #ccc;width:${s.w === "phone" ? 330 : 640}px">`).join("") + "</div>").join("") + "</body></html>";
fs.writeFileSync("tmp/align-sheet.html", html);
const p = await b.newPage({ viewport: { width: 1300, height: 800 } });
await p.goto(`file://${process.cwd()}/tmp/align-sheet.html`);
await p.screenshot({ path: "tmp/align-sheet.png", fullPage: true });
await b.close();
