/* Water — shared app behaviour for every page.
   1) registers the service worker (installable + offline)
   2) offers to install ONLY after 33s of real interest, accrued across pages */
(function () {
  'use strict';

  // ---- service worker: install + offline ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  // ---- the soft install invite, earned by attention ----
  var THRESHOLD = 33000;                       // ms of engaged time before we offer
  var IDLE_AFTER = 15000;                       // pause counting after this long without a touch
  var TIME_KEY = 'water.engaged.ms';           // accrued engagement, shared across pages
  var DISMISS_KEY = 'water.install.dismissed.v1';

  // already on a home screen, or already waved away? then never ask.
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) {}
  if (standalone || dismissed) return;

  var engaged = 0;
  try { engaged = parseInt(localStorage.getItem(TIME_KEY), 10) || 0; } catch (e) {}

  var lastTouch = Date.now();   // start with a little grace
  var lastTick = Date.now();
  var shown = false;
  var deferred = null;          // captured beforeinstallprompt
  var el = null;

  // iOS Safari has no install prompt — we show the manual gesture instead.
  var ua = navigator.userAgent || '';
  var iosSafari = (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)) &&
                  /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

  function persist() { try { localStorage.setItem(TIME_KEY, String(engaged)); } catch (e) {} }

  function build() {
    if (el) return el;
    var css = document.createElement('style');
    css.textContent =
      '.water-install{position:fixed;left:50%;bottom:max(1.1rem,env(safe-area-inset-bottom));' +
      'transform:translate(-50%,1.4rem);z-index:99999;display:none;align-items:center;gap:.5rem;' +
      'padding:.6rem .9rem .6rem 1rem;border-radius:999px;background:rgba(4,20,30,.82);' +
      'border:1px solid rgba(125,243,223,.30);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'box-shadow:0 18px 50px -24px rgba(0,0,0,.75);opacity:0;' +
      'transition:opacity 1s ease,transform 1s cubic-bezier(.2,.8,.2,1);max-width:calc(100vw - 1.6rem);' +
      "font-family:Georgia,'Times New Roman',serif}" +
      '.water-install.show{display:flex;opacity:1;transform:translate(-50%,0)}' +
      '.water-install .wi-drop{font-size:1rem;line-height:1;filter:drop-shadow(0 0 6px rgba(125,243,223,.5))}' +
      '.water-install .wi-say{background:none;border:none;cursor:pointer;text-align:left;color:#dff6f2;' +
      'font:inherit;font-size:.86rem;letter-spacing:.02em;line-height:1.3}' +
      '.water-install .wi-say b{color:#7df3df;font-weight:400;font-style:italic;font-size:.92rem}' +
      '.water-install .wi-ios{display:block;color:rgba(223,246,242,.6);font-size:.74rem;margin-top:.1rem}' +
      '.water-install .wi-close{background:none;border:none;cursor:pointer;color:rgba(223,246,242,.4);' +
      'font-size:1.15rem;line-height:1;padding:.1rem .4rem;flex:none}' +
      '.water-install .wi-close:hover{color:#7df3df}' +
      '@media(prefers-reduced-motion:reduce){.water-install{transition:opacity .2s ease}}';
    document.head.appendChild(css);

    el = document.createElement('div');
    el.className = 'water-install';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Install Water');
    el.innerHTML =
      '<span class="wi-drop" aria-hidden="true">💧</span>' +
      '<button class="wi-say" type="button"><b>keep the water with you</b>' +
      '<span class="wi-ios"' + (iosSafari ? '' : ' hidden') + '>tap Share, then “Add to Home Screen”</span></button>' +
      '<button class="wi-close" type="button" aria-label="not now">×</button>';
    document.body.appendChild(el);

    el.querySelector('.wi-say').addEventListener('click', function () {
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.finally(function () { deferred = null; settle(true); });
      }
    });
    el.querySelector('.wi-close').addEventListener('click', function () { settle(true); });
    return el;
  }

  function reveal() {
    if (shown) return;
    shown = true;
    var node = build();
    requestAnimationFrame(function () { node.classList.add('show'); });
  }

  function settle(remember) {
    if (el) el.classList.remove('show');
    if (remember) { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {} }
  }

  function maybeReveal() {
    if (shown || engaged < THRESHOLD) return;
    if (deferred || iosSafari) reveal();   // only offer when install is actually possible
  }

  // any of these mean the person is here and interested — keep the clock running
  function touch() { lastTouch = Date.now(); }
  ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart', 'touchmove', 'input', 'change', 'click']
    .forEach(function (ev) { window.addEventListener(ev, touch, { passive: true }); });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    maybeReveal();
  });
  window.addEventListener('appinstalled', function () { settle(true); });

  // accrue engaged time: only while visible and recently interacted
  setInterval(function () {
    var now = Date.now();
    var dt = now - lastTick;
    lastTick = now;
    var visible = document.visibilityState !== 'hidden';
    var active = (now - lastTouch) < IDLE_AFTER;
    if (visible && active && dt > 0 && dt < 4000) {   // dt guard: skip sleeps/tab switches
      engaged += dt;
      maybeReveal();
      if (engaged % 1000 < 300) persist();
    }
  }, 250);

  ['pagehide', 'beforeunload'].forEach(function (ev) { window.addEventListener(ev, persist); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') persist();
  });
})();
