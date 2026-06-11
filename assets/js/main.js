// Main entry point for site JavaScript
// Uses ES modules for tree-shaking with esbuild

import Pjax from 'pjax';
import { listen as quicklinkListen } from 'quicklink';
import { boot as vizBoot } from './viz/core.js';

function init() {
  // Initialize PJAX for smooth page transitions
  // CSS is purged per-page, so the inline style must be swapped along with the body.
  new Pjax({
    selectors: ["style#inline-css", "body"],
    cacheBust: false,
  });

  // Fallback to full navigation on PJAX errors (e.g., 404 responses).
  document.addEventListener("pjax:error", function (event) {
    var href = event && event.triggerElement && event.triggerElement.href;
    if (href) {
      window.location = href;
    }
  });

  var resetQuicklink = null;

  function isCurrentPageLink(uri) {
    var url = new URL(uri, window.location.href);
    return url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search;
  }

  function initQuicklink() {
    if (resetQuicklink) {
      resetQuicklink();
    }

    resetQuicklink = quicklinkListen({
      ignores: [isCurrentPageLink],
    });
  }

  // Initialize quicklink for prefetching
  initQuicklink();

  // Re-initialize quicklink after PJAX navigation
  document.addEventListener('pjax:complete', initQuicklink);

  // Signup popup functionality
  function signup() {
    var cookieRegex = /(?:(?:^|.*;\s*)nateberkopecShowSignup\s*=\s*([^;]*).*$)|^.*$/;

    setTimeout(function(){
      if (document.cookie.match(cookieRegex, "$1")[1] !== "true") {
        showSignup();
      }
    }, 60000);

    function showSignup(){
      var el = document.getElementById("innocuous");
      if (el) {
        el.style.display = "block";
      }
    }
  }

  signup();

  document.addEventListener('pjax:complete', function () {
    signup();
  });

  function viz() {
    var desktop = matchMedia('(min-width: 769px)');
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var inst = null;

    function listenMedia(q, f) {
      if (q.addEventListener) {
        q.addEventListener('change', f);
      } else {
        q.addListener(f);
      }
    }

    function update() {
      inst.resize();
      if (desktop.matches && document.visibilityState !== 'hidden') {
        inst.start(reduced.matches);
      } else {
        inst.stop();
      }
    }

    function mount() {
      var canvas = document.getElementById('sslogocanvas');
      if (!canvas || canvas.dataset.viz || !window.vizLoad || !desktop.matches) {
        return;
      }
      canvas.dataset.viz = '1';
      var moduleP = window.vizP || window.vizLoad();
      window.vizP = null;
      vizBoot(canvas, moduleP, function () {
        canvas.style.opacity = 1;
      }).then(function (engine) {
        if (!engine || !document.contains(canvas)) {
          return;
        }
        inst = engine;
        update();
      });
    }

    function sync() {
      if (inst) {
        update();
      } else {
        mount();
      }
    }

    listenMedia(desktop, sync);
    listenMedia(reduced, sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('pagehide', function () {
      if (inst) {
        inst.stop();
      }
    });
    document.addEventListener('pjax:send', function () {
      if (inst) {
        inst.stop();
        inst = null;
      }
    });
    document.addEventListener('pjax:complete', sync);
    mount();
  }

  viz();

  document.documentElement.addEventListener('click', function (event) {
    if (event.target.id === "innocuous-close") {
      document.getElementById("innocuous").style.display = "none";
      document.cookie = "nateberkopecShowSignup=true; expires=Fri, 31 Dec 9999 23:59:59 GMT;SameSite=Strict";
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
