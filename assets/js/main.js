// Main entry point for site JavaScript
// Uses ES modules for tree-shaking with esbuild

import Pjax from 'pjax';
import { listen as quicklinkListen } from 'quicklink';

function init() {
  // Initialize PJAX for smooth page transitions
  new Pjax({
    selectors: ["body"],
  });

  // Fallback to full navigation on PJAX errors (e.g., 404 responses).
  document.addEventListener("pjax:error", function (event) {
    var href = event && event.triggerElement && event.triggerElement.href;
    if (href) {
      window.location = href;
    }
  });

  // Initialize quicklink for prefetching
  quicklinkListen();

  // Re-initialize quicklink after PJAX navigation
  document.addEventListener('pjax:complete', function () {
    quicklinkListen();
  });

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
