(() => {
  const mobile = matchMedia("(max-width: 639px)");

  function load() {
    for (const frame of document.querySelectorAll(".threadpilot-fold-word iframe")) {
      if (!frame.getClientRects().length) continue;
      const src = (mobile.matches && frame.dataset.mobileSrc) || frame.dataset.src;
      if (frame.getAttribute("src") !== src) frame.src = src;
    }
  }

  load();
  mobile.addEventListener("change", load);
})();
