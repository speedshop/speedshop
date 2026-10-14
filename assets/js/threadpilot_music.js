(() => {
  const toggle = document.querySelector("#threadpilot-audio-toggle");
  const music = document.querySelector("#threadpilot-music");

  function update() {
    const label = music.paused ? "Unmute music" : "Mute music";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.dataset.muted = String(music.paused);
  }

  toggle.addEventListener("click", () => {
    if (!music.paused) return music.pause();
    if (!music.hasAttribute("src")) music.src = music.dataset.src;
    music.play().catch(error => console.error(error));
  });
  music.addEventListener("play", update);
  music.addEventListener("pause", update);
})();
