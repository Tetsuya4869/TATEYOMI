// ==UserScript==
// @name         なろう縦組みリーダー
// @namespace    https://github.com/tetsuya4869/tateyomi
// @version      1.0.0
// @description  なろう・カクヨムの本文を全画面縦書きオーバーレイで表示する
// @author       tetsuya4869
// @match        https://ncode.syosetu.com/n*/*
// @match        https://novel18.syosetu.com/n*/*
// @match        https://kakuyomu.jp/works/*/episodes/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---- CSS ----
  GM_addStyle(`
    #tate-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: #faf8f3; color: #1a1a1a;
      overflow-y: scroll; overflow-x: hidden;
      scroll-snap-type: y mandatory;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      font-family: "Hiragino Mincho ProN", "Yu Mincho", "游明朝", serif;
      font-size: 18px; line-height: 1.9;
    }
    .tate-page {
      height: 100svh; width: 100vw;
      scroll-snap-align: start; scroll-snap-stop: always;
      writing-mode: vertical-rl;
      overflow: hidden;
      padding-top: max(env(safe-area-inset-top), 1rem);
      padding-bottom: max(env(safe-area-inset-bottom), 1rem);
      padding-left: max(env(safe-area-inset-left), 1rem);
      padding-right: max(env(safe-area-inset-right), 1rem);
      box-sizing: border-box; position: relative;
    }
    .tate-page--overflow {
      overflow-x: auto; -webkit-overflow-scrolling: touch;
    }
    .tcy { text-combine-upright: all; -webkit-text-combine: horizontal; }
    ruby { ruby-align: center; } rt { font-size: 0.5em; }

    #tate-ctrl {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 2147483648;
      background: rgba(0,0,0,0.75); color: #fff;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.6rem max(env(safe-area-inset-right),1rem)
               max(calc(env(safe-area-inset-bottom)+0.6rem),0.6rem)
               max(env(safe-area-inset-left),1rem);
      font-family: -apple-system, sans-serif; font-size: 14px;
      transition: transform 0.25s ease;
    }
    #tate-ctrl.hidden { transform: translateY(100%); }
    #tate-ctrl button {
      background: none; border: 1px solid rgba(255,255,255,0.4); color: #fff;
      padding: 0.35rem 0.8rem; border-radius: 6px; font-size: 14px;
      cursor: pointer; -webkit-tap-highlight-color: transparent;
    }
    .tate-page-indicator { font-size: 13px; opacity: 0.8; }

    #tate-fab {
      position: fixed; bottom: max(env(safe-area-inset-bottom), 1rem); right: 1rem;
      z-index: 2147483646;
      background: rgba(30,30,30,0.85); color: #fff;
      border: none; border-radius: 50%; width: 44px; height: 44px;
      font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      -webkit-tap-highlight-color: transparent;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
  `);

  // ---- サイトアダプタ ----
  const ADAPTERS = [
    {
      test: h => /ncode\.syosetu\.com$/.test(h),
      selectors: ['.p-novel__body', '#novel_honbun', '.novel_view'],
      paraTag: 'p',
      nextSel: '.p-novel__foot--next a',
    },
    {
      test: h => /novel18\.syosetu\.com$/.test(h),
      selectors: ['.p-novel__body', '#novel_honbun', '.novel_view'],
      paraTag: 'p',
      nextSel: '.p-novel__foot--next a',
    },
    {
      test: h => /kakuyomu\.jp$/.test(h),
      selectors: ['.widget-episodeBody.js-episode-body', '.widget-episodeBody'],
      paraTag: 'p',
      nextSel: 'a[href*="/episodes/"][aria-label*="次"]',
    },
  ];

  // ---- 縦中横 ----
  function applyTCY(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (['RUBY', 'RT', 'RP'].includes(node.tagName)) return node.cloneNode(true);
      const clone = node.cloneNode(false);
      for (const child of node.childNodes) clone.appendChild(applyTCY(child));
      return clone;
    }
    if (node.nodeType !== Node.TEXT_NODE) return node.cloneNode(true);
    const text = node.textContent;
    const pattern = /(\d{2}|[!?！？]{2})/g;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = pattern.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'tcy';
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    const w = document.createElement('span');
    w.appendChild(frag);
    return w;
  }

  function transformPara(srcPara) {
    const p = document.createElement('p');
    for (const child of srcPara.childNodes) p.appendChild(applyTCY(child));
    return p;
  }

  // ---- ページ分割 ----
  function splitIntoPages(paras, overlayEl) {
    const probe = document.createElement('div');
    probe.className = 'tate-page';
    probe.style.cssText = 'visibility:hidden;position:absolute;top:0;left:0;pointer-events:none;';
    overlayEl.appendChild(probe);

    const pages = [];
    let buf = [];

    function flush(overflow) {
      if (!buf.length) return;
      const pg = document.createElement('div');
      pg.className = 'tate-page' + (overflow ? ' tate-page--overflow' : '');
      for (const p of buf) pg.appendChild(p.cloneNode(true));
      pages.push(pg);
      buf = [];
    }

    function overflows(arr) {
      probe.innerHTML = '';
      for (const p of arr) probe.appendChild(p.cloneNode(true));
      return probe.scrollWidth > probe.clientWidth;
    }

    for (const srcPara of paras) {
      const para = transformPara(srcPara);
      probe.innerHTML = '';
      probe.appendChild(para.cloneNode(true));

      if (probe.scrollWidth > probe.clientWidth) {
        flush(false);
        const isPlain = [...para.childNodes].every(
          n => n.nodeType === Node.TEXT_NODE ||
               (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'SPAN')
        );
        if (isPlain) {
          const fullText = para.textContent;
          let start = 0;
          while (start < fullText.length) {
            let lo = 1, hi = fullText.length - start;
            while (lo < hi) {
              const mid = Math.ceil((lo + hi) / 2);
              const tp = document.createElement('p');
              tp.textContent = fullText.slice(start, start + mid);
              probe.innerHTML = ''; probe.appendChild(tp);
              if (probe.scrollWidth > probe.clientWidth) hi = mid - 1; else lo = mid;
            }
            const cp = document.createElement('p');
            cp.textContent = fullText.slice(start, start + lo);
            buf = [cp]; flush(false);
            start += lo;
          }
        } else {
          const pg = document.createElement('div');
          pg.className = 'tate-page tate-page--overflow';
          pg.appendChild(para.cloneNode(true));
          pages.push(pg);
        }
        continue;
      }

      if (overflows([...buf, para])) {
        flush(false);
        buf = [para];
      } else {
        buf.push(para);
      }
    }
    flush(false);
    overlayEl.removeChild(probe);
    return pages;
  }

  // ---- viewport-fit=cover ----
  let origViewport = null;
  function enableViewportCover() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      origViewport = meta.getAttribute('content');
      meta.setAttribute('content',
        origViewport.includes('viewport-fit')
          ? origViewport.replace(/viewport-fit=[^,]*/, 'viewport-fit=cover')
          : origViewport + ', viewport-fit=cover'
      );
    } else {
      const m = document.createElement('meta');
      m.name = 'viewport';
      m.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
      document.head.appendChild(m);
      origViewport = '__created__';
    }
  }

  function restoreViewport() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    if (origViewport === '__created__') meta.remove();
    else if (origViewport !== null) meta.setAttribute('content', origViewport);
    origViewport = null;
  }

  // ---- オーバーレイ構築 ----
  let active = false;
  let resizeTimer = null;

  function activate() {
    if (active) return;
    const adapter = ADAPTERS.find(a => a.test(location.hostname));
    if (!adapter) return;

    let bodyEl = null;
    for (const sel of adapter.selectors) {
      bodyEl = document.querySelector(sel);
      if (bodyEl) break;
    }
    if (!bodyEl) return;

    const paras = [...bodyEl.querySelectorAll(adapter.paraTag)].filter(p => p.textContent.trim());
    if (!paras.length) return;

    enableViewportCover();

    // 一時オーバーレイで測定
    const tmp = document.createElement('div');
    tmp.id = 'tate-overlay';
    tmp.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1;';
    document.body.appendChild(tmp);
    const pages = splitIntoPages(paras, tmp);
    document.body.removeChild(tmp);

    // 本番オーバーレイ
    const overlay = document.createElement('div');
    overlay.id = 'tate-overlay';
    for (const pg of pages) overlay.appendChild(pg);
    document.body.appendChild(overlay);

    // FABを非表示
    document.getElementById('tate-fab')?.remove();

    // コントロールバー
    const ctrl = document.createElement('div');
    ctrl.id = 'tate-ctrl';
    ctrl.classList.add('hidden');
    const alwaysOn = GM_getValue('alwaysOn', false);
    ctrl.innerHTML = `
      <button id="tate-btn-prev">◀ 戻る</button>
      <span class="tate-page-indicator" id="tate-ind">1 / ${pages.length}</span>
      <span style="display:flex;gap:0.5rem;align-items:center;">
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" id="tate-always" ${alwaysOn ? 'checked' : ''}> 自動ON
        </label>
        <button id="tate-btn-close">閉じる</button>
      </span>
    `;
    document.body.appendChild(ctrl);

    document.getElementById('tate-always')?.addEventListener('change', e => {
      GM_setValue('alwaysOn', e.target.checked);
    });

    overlay.addEventListener('scroll', () => {
      const pg = Math.round(overlay.scrollTop / window.innerHeight);
      const ind = document.getElementById('tate-ind');
      if (ind) ind.textContent = `${pg + 1} / ${pages.length}`;
    }, { passive: true });

    overlay.addEventListener('click', e => {
      const x = e.clientX, w = window.innerWidth;
      const c = document.getElementById('tate-ctrl');
      if (x < w * 0.33) {
        overlay.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        c?.classList.add('hidden');
      } else if (x > w * 0.67) {
        overlay.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
        c?.classList.add('hidden');
      } else {
        c?.classList.toggle('hidden');
      }
    });

    document.getElementById('tate-btn-prev')?.addEventListener('click', e => {
      e.stopPropagation();
      overlay.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
    });

    document.getElementById('tate-btn-close')?.addEventListener('click', e => {
      e.stopPropagation();
      deactivate();
    });

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);
    active = true;
  }

  function deactivate() {
    if (!active) return;
    document.getElementById('tate-overlay')?.remove();
    document.getElementById('tate-ctrl')?.remove();
    restoreViewport();
    window.removeEventListener('orientationchange', handleOrientationChange);
    window.removeEventListener('resize', handleResize);
    active = false;
    injectFAB();
  }

  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (active) { deactivate(); activate(); } }, 300);
  }
  function handleOrientationChange() {
    setTimeout(() => { if (active) { deactivate(); activate(); } }, 400);
  }

  // ---- FAB（フローティングボタン）----
  function injectFAB() {
    if (document.getElementById('tate-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'tate-fab';
    fab.title = '縦書きで読む';
    fab.textContent = '縦';
    fab.addEventListener('click', activate);
    document.body.appendChild(fab);
  }

  // ---- エントリポイント ----
  const adapter = ADAPTERS.find(a => a.test(location.hostname));
  if (adapter) {
    const alwaysOn = GM_getValue('alwaysOn', false);
    if (alwaysOn) {
      activate();
    } else {
      injectFAB();
    }
  }
})();
