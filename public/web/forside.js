/* Forsiden: filmen i hero (uden lyd, tryk for lyd), branchefanerne og funktionerne. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hero-filmen kører uden lyd i baggrunden. "Slå lyd til" starter den forfra med lyd.
  var hero = document.querySelector('.fh'), v = hero && hero.querySelector('video'), sb = hero && hero.querySelector('.fh-sound');
  if (v && sb) {
    var lbl = sb.querySelector('.fh-lbl');
    var big = window.matchMedia('(min-width: 761px)').matches;
    if (reduce) { v.removeAttribute('autoplay'); v.pause(); }
    else { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    var set = function (on) {
      sb.setAttribute('aria-pressed', on ? 'true' : 'false');
      lbl.textContent = on ? 'Slå lyd fra' : 'Slå lyd til';
      hero.classList.toggle('sound', on);
    };
    sb.addEventListener('click', function () {
      var on = sb.getAttribute('aria-pressed') !== 'true';
      if (on) {
        // Med lyd: forfra, i fuld kvalitet på store skærme, og uden at gentage sig.
        if (big && v.currentSrc.indexOf('hero-1080') < 0) { v.src = '/web/video/hero-1080.mp4'; }
        v.loop = false; v.currentTime = 0; v.muted = false;
      } else { v.muted = true; v.loop = true; }
      var q = v.play(); if (q && q.catch) q.catch(function () {});
      set(on);
    });
    // Uden lyd kører et udsnit i ring (uden de første sekunders titelbokse og slutlogoet).
    var BG_FROM = 4, BG_TO = 64;
    v.addEventListener('loadedmetadata', function () { if (v.muted && v.currentTime < BG_FROM) v.currentTime = BG_FROM; });
    v.addEventListener('timeupdate', function () { if (v.muted && (v.currentTime < BG_FROM || v.currentTime > BG_TO)) v.currentTime = BG_FROM; });
    v.addEventListener('ended', function () { v.muted = true; v.loop = true; v.currentTime = BG_FROM; v.play(); set(false); });
  }

  // Branchefanerne: skifter selv hvert 9. sekund, indtil man selv vælger (eller holder musen over).
  var bar = document.querySelector('.bt');
  if (bar) {
    var tabs = [].slice.call(bar.querySelectorAll('[role=tab]')), timer = null, stopped = reduce;
    var show = function (t, focus) {
      tabs.forEach(function (x) {
        var on = x === t, pn = document.getElementById(x.getAttribute('aria-controls'));
        x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1;
        if (pn) pn.hidden = !on;
      });
      if (focus) t.focus();
      if (!stopped) { bar.classList.remove('stopped'); void t.offsetWidth; }
    };
    var stop = function () { stopped = true; bar.classList.add('stopped'); clearInterval(timer); };
    if (stopped) bar.classList.add('stopped');
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { stop(); show(t); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (n === null) return; e.preventDefault(); stop(); show(tabs[(n + tabs.length) % tabs.length], true);
      });
    });
    var sec = document.getElementById('brancher');
    sec.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') stop(); });
    var next = function () { var i = tabs.findIndex(function (x) { return x.getAttribute('aria-selected') === 'true'; }); show(tabs[(i + 1) % tabs.length]); };
    if (!stopped && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          clearInterval(timer);
          if (e.isIntersecting && !stopped) { show(tabs.filter(function (x) { return x.getAttribute('aria-selected') === 'true'; })[0]); timer = setInterval(next, 9000); }
        });
      }, { threshold: .35 }).observe(sec);
    }
  }

  // Funktionernes små animationer starter, når man ser dem.
  var grid = document.querySelector('.fp-grid');
  if (grid) {
    if (!('IntersectionObserver' in window)) grid.classList.add('seen');
    else new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { grid.classList.add('seen'); o.disconnect(); } }, { threshold: .25 }).observe(grid);
  }
})();
