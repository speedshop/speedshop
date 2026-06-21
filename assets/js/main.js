// Main entry point for site JavaScript
// Uses ES modules for tree-shaking with esbuild

import Pjax from 'pjax';
import { boot as vizBoot } from './viz/core.js';

function init() {
  // Initialize PJAX for smooth page transitions
  // CSS is purged per-page, so the inline style must be swapped along with the body.
  var pjaxSelectors = ["style#inline-css", "body"];
  var pjax = new Pjax({
    selectors: pjaxSelectors,
    cacheBust: false,
  });
  var nativeDoRequest = pjax.doRequest.bind(pjax);
  // Browser-level <link rel="prefetch"> still forces a PJAX XHR on click.
  // Store PJAX-compatible responses so clicks can reuse the prefetched HTML directly.
  var prefetchedPages = new Map();

  // Fallback to full navigation on PJAX errors (e.g., 404 responses).
  document.addEventListener("pjax:error", function (event) {
    var href = event && event.triggerElement && event.triggerElement.href;
    if (href) {
      window.location = href;
    }
  });

  function normalizePrefetchUrl(uri) {
    var url = new URL(uri, window.location.href);
    url.hash = '';
    return url.href;
  }

  function pjaxHeaders() {
    return {
      'X-Requested-With': 'XMLHttpRequest',
      'X-PJAX': 'true',
      'X-PJAX-Selectors': JSON.stringify(pjaxSelectors),
    };
  }

  function prefetchPage(uri) {
    var url = normalizePrefetchUrl(uri);
    if (prefetchedPages.has(url)) {
      return prefetchedPages.get(url);
    }

    var promise = fetch(url, {
      credentials: 'same-origin',
      headers: pjaxHeaders(),
      priority: 'low',
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Prefetch failed for ' + url);
      }

      return response.text().then(function (html) {
        return {
          html: html,
          responseURL: response.url,
          headers: response.headers,
        };
      });
    }).catch(function (error) {
      prefetchedPages.delete(url);
      throw error;
    });

    prefetchedPages.set(url, promise);
    return promise;
  }

  function shouldPrefetchLink(link) {
    if (!link.href || link.protocol !== window.location.protocol || link.host !== window.location.host) {
      return false;
    }

    if (link.download || (link.target && link.target !== '_self')) {
      return false;
    }

    var url = new URL(link.href);
    return url.pathname !== window.location.pathname || url.search !== window.location.search;
  }

  function requestIdle(callback) {
    if (window.requestIdleCallback) {
      return window.requestIdleCallback(callback, { timeout: 2000 });
    }

    return window.setTimeout(callback, 1);
  }

  function cancelIdle(id) {
    if (window.cancelIdleCallback) {
      window.cancelIdleCallback(id);
    } else {
      window.clearTimeout(id);
    }
  }

  var resetQuicklink = null;

  function initQuicklink() {
    if (resetQuicklink) {
      resetQuicklink();
    }

    if (
      !window.fetch ||
      !window.IntersectionObserver ||
      !("isIntersecting" in IntersectionObserverEntry.prototype)
    ) {
      resetQuicklink = function () {};
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }

        observer.unobserve(entry.target);
        prefetchPage(entry.target.href).catch(function () {});
      });
    });

    var idleId = requestIdle(function () {
      Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (link) {
        if (shouldPrefetchLink(link)) {
          observer.observe(link);
        }
      });
    });

    resetQuicklink = function () {
      cancelIdle(idleId);
      observer.disconnect();
    };
  }

  pjax.doRequest = function (location, options, callback) {
    var prefetchedPage = prefetchedPages.get(normalizePrefetchUrl(location));
    if (!prefetchedPage) {
      return nativeDoRequest(location, options, callback);
    }

    var aborted = false;
    var request = {
      readyState: 1,
      responseURL: null,
      status: 0,
      getResponseHeader: function () {
        return null;
      },
      abort: function () {
        aborted = true;
        request.readyState = 4;
        if (request.innerRequest) {
          request.innerRequest.abort();
        }
      },
    };

    function fallbackToNetwork() {
      if (!aborted) {
        request.innerRequest = nativeDoRequest(location, options, callback);
      }
    }

    prefetchedPage.then(function (page) {
      if (aborted) {
        return;
      }

      request.readyState = 4;
      request.responseURL = page.responseURL;
      request.status = 200;
      request.getResponseHeader = function (name) {
        return page.headers.get(name);
      };
      callback(page.html, request, location, options);
    }).catch(fallbackToNetwork);

    return request;
  };

  // Initialize quicklink-style prefetching
  initQuicklink();

  // Re-initialize prefetching after PJAX navigation
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
