(() => {
  const headings = [...document.querySelectorAll(".threadpilot-fold-pitch h2, .threadpilot-page h2, .threadpilot-page h3, .threadpilot-page h4")];
  const states = new Map();

  function render(heading, entry) {
    const state = states.get(heading);
    const density = window.devicePixelRatio || 1;
    const style = getComputedStyle(heading);
    const bounds = heading.getBoundingClientRect();
    const box = entry?.devicePixelContentBoxSize?.[0];
    const width = Math.round((entry?.contentRect.width ?? bounds.width) * density);
    const height = Math.round((entry?.contentRect.height ?? bounds.height) * density);
    const canvas = state.canvas;
    canvas.width = Math.max(1, box && Math.abs(box.inlineSize - width) <= 1 ? box.inlineSize : width);
    canvas.height = Math.max(1, box && Math.abs(box.blockSize - height) <= 1 ? box.blockSize : height);
    canvas.style.width = `${canvas.width / density}px`;
    canvas.style.height = `${canvas.height / density}px`;
    canvas.style.left = "0px";
    canvas.style.top = "0px";
    const origin = canvas.getBoundingClientRect();
    const left = Math.round((origin.left + scrollX) * density) / density - scrollX;
    const top = Math.round((origin.top + scrollY) * density) / density - scrollY;
    canvas.style.left = `${left - origin.left}px`;
    canvas.style.top = `${top - origin.top}px`;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.font = `${style.fontStyle} ${style.fontWeight} ${parseFloat(style.fontSize) * density}px ${style.fontFamily}`;
    context.fillStyle = state.color;
    const spacing = parseFloat(style.letterSpacing) || 0;
    if ("letterSpacing" in context) context.letterSpacing = `${spacing * density}px`;
    const metrics = context.measureText("Mg");
    const ascent = metrics.fontBoundingBoxAscent / density;
    const lines = [];
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (let index = 0; index < node.length; index += 1) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        let line = lines.at(-1);
        if (!line || Math.abs(line.top - rect.top) > 1) {
          line = { top: rect.top, glyphs: [] };
          lines.push(line);
        }
        line.glyphs.push({ text: node.textContent[index], left: rect.left });
      }
    }
    for (const line of lines) {
      while (line.glyphs.length && /\s/.test(line.glyphs[0].text)) line.glyphs.shift();
      while (line.glyphs.length && /\s/.test(line.glyphs.at(-1).text)) line.glyphs.pop();
      if (!line.glyphs.length) continue;
      const baseline = Math.round((line.top + ascent - top) * density);
      if ("letterSpacing" in context) {
        context.fillText(line.glyphs.map(glyph => glyph.text).join(""), Math.round((line.glyphs[0].left - left) * density), baseline);
      } else {
        for (const glyph of line.glyphs) {
          context.fillText(glyph.text, Math.round((glyph.left - left) * density), baseline);
        }
      }
    }
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const color = state.color.match(/[\d.]+/g).slice(0, 3).map(Number);
    for (let index = 0; index < image.data.length; index += 4) {
      const opaque = image.data[index + 3] >= 128;
      image.data[index] = opaque ? color[0] : 0;
      image.data[index + 1] = opaque ? color[1] : 0;
      image.data[index + 2] = opaque ? color[2] : 0;
      image.data[index + 3] = opaque ? 255 : 0;
    }
    context.putImageData(image, 0, 0);
    heading.classList.add("threadpilot-raster-heading");
  }

  function renderAll() {
    for (const heading of headings) render(heading);
  }

  document.fonts.ready.then(() => {
    for (const heading of headings) {
      const canvas = document.createElement("canvas");
      canvas.className = "threadpilot-heading-canvas";
      canvas.setAttribute("aria-hidden", "true");
      states.set(heading, { canvas, color: getComputedStyle(heading).color });
      heading.append(canvas);
      heading.classList.add("threadpilot-positioned-heading");
    }
    renderAll();
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) render(entry.target, entry);
    });
    for (const heading of headings) {
      try {
        observer.observe(heading, { box: "device-pixel-content-box" });
      } catch {
        observer.observe(heading);
      }
    }
    new ResizeObserver(renderAll).observe(document.body);
    window.addEventListener("resize", renderAll);
    document.fonts.addEventListener("loadingdone", renderAll);
  });
})();
