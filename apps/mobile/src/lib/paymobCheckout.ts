const DEFAULT_CHECKOUT_ORIGIN = 'https://accept.paymob.com';

export function buildPaymobCheckoutUrl(publicKey: string, clientSecret: string): string {
  const params = new URLSearchParams({
    publicKey,
    clientSecret,
  });
  return `${DEFAULT_CHECKOUT_ORIGIN}/unifiedcheckout/?${params.toString()}`;
}

/**
 * Paymob's unified checkout page can render wider than the WebView viewport,
 * making its content overflow horizontally. Force a device-width viewport
 * and clamp horizontal overflow inside the page.
 */
export const PAYMOB_CHECKOUT_VIEWPORT_FIX = `
(function () {
  function apply() {
    if (!document.head) return false;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    if (!document.getElementById('rn-checkout-fit')) {
      var style = document.createElement('style');
      style.id = 'rn-checkout-fit';
      style.innerHTML = 'html, body { overflow-x: hidden !important; max-width: 100vw !important; } iframe { max-width: 100vw !important; }';
      document.head.appendChild(style);
    }
    return true;
  }
  if (!apply()) {
    document.addEventListener('DOMContentLoaded', apply);
  }
  // Re-assert after focus: iOS re-evaluates zoom when inputs focus.
  document.addEventListener('focusin', apply, true);

  // The keyboard opening/closing changes window.innerHeight; Paymob lays
  // out against whatever it measures at that moment and doesn't recover
  // when the keyboard hides. Re-nudge around every focus change.
  function scheduleNudges() {
    [120, 450, 900].forEach(function (ms) {
      setTimeout(function () {
        try {
          window.dispatchEvent(new Event('resize'));
          if (window.visualViewport) {
            window.visualViewport.dispatchEvent(new Event('resize'));
          }
        } catch (e) { /* noop */ }
      }, ms);
    });
  }
  document.addEventListener('focusin', scheduleNudges, true);
  document.addEventListener('focusout', scheduleNudges, true);

  // Paymob's sheet measures window.innerHeight once when it binds and never
  // re-measures. The RN WebView's frame can settle to a smaller size right
  // after mount, leaving the sheet laid out for the stale, taller viewport
  // (content pushed below the visible area). Nudge it to re-measure.
  function nudgeResize() {
    try {
      window.dispatchEvent(new Event('resize'));
      if (window.visualViewport) {
        window.visualViewport.dispatchEvent(new Event('resize'));
      }
    } catch (e) { /* noop */ }
  }
  function debugReport(tag) {
    if (!window.ReactNativeWebView) return;
    try {
      var frames = document.querySelectorAll('iframe');
      var info = [];
      for (var i = 0; i < frames.length; i++) {
        var f = frames[i];
        var inner = -1;
        var innerH = -1;
        try {
          if (f.contentDocument && f.contentDocument.body) {
            inner = f.contentDocument.body.children.length;
            innerH = f.contentDocument.body.scrollHeight;
          }
        } catch (x) { inner = -2; }
        var cs = window.getComputedStyle(f);
        info.push({
          src: f.getAttribute('srcdoc') ? 'srcdoc' : (f.src || '').slice(0, 60),
          w: f.offsetWidth,
          h: f.offsetHeight,
          disp: cs.display,
          vis: cs.visibility,
          kids: inner,
          innerH: innerH,
          parentH: f.parentElement ? f.parentElement.offsetHeight : -1,
        });
      }
      var txt = document.body ? document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160) : '';
      window.ReactNativeWebView.postMessage(JSON.stringify({
        dbg: tag,
        url: location.href.slice(0, 100),
        bodyH: document.body ? document.body.scrollHeight : -1,
        winH: window.innerHeight,
        inputs: document.querySelectorAll('input').length,
        text: txt,
        iframes: info,
      }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ dbg: tag, err: String(e) }));
    }
  }
  window.addEventListener('error', function (e) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ dbg: 'js-error', msg: String(e.message).slice(0, 300) }));
    }
  });
  var tries = 0;
  var timer = setInterval(function () {
    nudgeResize();
    if (tries === 4 || tries === 16) debugReport('t' + tries);
    if (++tries > 20) clearInterval(timer);
  }, 500);
})();
true;
`;
