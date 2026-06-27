// ==UserScript==
// @name         なろう縦組みリーダー
// @namespace    https://github.com/tetsuya4869/tateyomi
// @version      1.3.0
// @description  なろう・カクヨムの本文を全画面縦書きで表示する
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

  GM_addStyle(`
    :root {
      --tate-header-h: 44px;
      --tate-footer-h: 48px;
    }

    #tate-overlay {
      position: fixed; inset: 0; z-index: 2147483645;
      background: #faf8f3; color: #1a1a1a;
      padding-top: var(--tate-header-h);
      padding-bottom: var(--tate-footer-h);
      box-sizing: border-box;
    }

    #tate-reading-area {
      width: 100%; height: 100%;
      writing-mode: vertical-rl;
      overflow-x: scroll;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
      padding: 0.75rem max(env(safe-area-inset-right), 1rem)
               0.75rem max(env(safe-area-inset-left), 1rem);
      box-sizing: border-box;
      font-family: "Hiragino Mincho ProN", "Yu Mincho", "游明朝", serif;
      font-size: 18px;
      line-height: 1.9;
      letter-spacing: 0.05em;
    }

    .tate-section-label {
      font-size: 0.7em;
      opacity: 0.4;
      margin: 0 1em;
      letter-spacing: 0.2em;
    }

    .tcy { text-combine-upright: all; -webkit-text-combine: horizontal; }
    ruby { ruby-align: center; }
    rt { font-size: 0.5em; }

    /* ヘッダー */
    #tate-header {
      position: fixed; top: 0; left: 0; right: 0;
      height: var(--tate-header-h);
      padding-top: env(safe-area-inset-top, 0);
      z-index: 2147483647;
      background: rgba(20, 16, 12, 0.70);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: #e8e0d5;
      display: flex; align-items: center;
      font-family: -apple-system, sans-serif;
      box-sizing: border-box;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #tate-header.hidden { transform: translateY(-100%); }

    #tate-series-title {
      font-size: 10px; opacity: 0.55;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      padding: 0 0.5rem; min-width: 0; flex: 0 1 auto;
    }
    #tate-episode-title {
      font-size: 12px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      flex: 1 1 0; text-align: center; padding: 0 0.25rem;
    }
    #tate-btn-close {
      flex: 0 0 auto; background: none; border: none; color: #e8e0d5;
      font-size: 18px; padding: 0 0.75rem; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    /* フッター */
    #tate-footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      height: calc(var(--tate-footer-h) + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0);
      z-index: 2147483647;
      background: rgba(20, 16, 12, 0.70);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: #e8e0d5;
      display: flex; align-items: center; justify-content: space-between;
      font-family: -apple-system, sans-serif;
      box-sizing: border-box;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #tate-footer.hidden { transform: translateY(100%); }

    #tate-footer button {
      background: none; border: 1px solid rgba(255,255,255,0.22); color: #e8e0d5;
      padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 12px;
      cursor: pointer; margin: 0 0.35rem;
      -webkit-tap-highlight-color: transparent; white-space: nowrap;
      transition: background 0.15s;
    }
    #tate-footer button:active { background: rgba(255,255,255,0.15); }
    #tate-footer button:disabled { opacity: 0.3; pointer-events: none; }
    #tate-progress { font-size: 11px; opacity: 0.6; min-width: 3em; text-align: center; }

    /* 読書進捗バー（フッターとは独立、常時表示） */
    #tate-progress-bar {
      position: fixed; bottom: 0; left: 0;
      height: 3px; width: 0%;
      background: linear-gradient(to right, #c8a96e, #e8c880);
      z-index: 2147483646;
      transition: width 0.15s ease;
      pointer-events: none;
    }

    /* FAB */
    #tate-fab {
      position: fixed;
      bottom: max(env(safe-area-inset-bottom), 1rem); right: 1rem;
      z-index: 2147483644;
      background: rgba(20, 16, 12, 0.85); color: #e8e0d5;
      border: none; border-radius: 50%; width: 52px; height: 52px;
      font-size: 16px; font-family: "Hiragino Mincho ProN", serif;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      -webkit-tap-highlight-color: transparent;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    #tate-fab:active { transform: scale(0.92); box-shadow: 0 2px 8px rgba(0,0,0,0.35); }
  `);

  // ---- サイトアダプタ ----
  const ADAPTERS = [
    {
      test: h => /ncode\.syosetu\.com$/.test(h),
      selectors:  ['.p-novel__body', '#novel_honbun', '.novel_view'],
      paraTag:    'p',
      titleSel:   ['.p-novel__subtitle', '.novel_subtitle'],
      seriesSel:  ['.p-novel__series-title', '#novel_title'],
      beforeSel:  ['.p-novel__text--before', '#novel_p'],
      afterSel:   ['.p-novel__text--after',  '#novel_a'],
      prevSel:    ['.p-novel__foot--prev a', '.novel_bn a:first-child'],
      nextSel:    ['.p-novel__foot--next a', '.novel_bn a:last-child'],
      prevPat:    [/前の話/, /前へ/, /前話/, /‹/, /←/],
      nextPat:    [/次の話/, /次へ/, /次話/, /›/, /→/],
      tocUrl: () => {
        const parts = location.pathname.split('/').filter(Boolean);
        return `${location.origin}/${parts[0]}/`;
      },
    },
    {
      test: h => /novel18\.syosetu\.com$/.test(h),
      selectors:  ['.p-novel__body', '#novel_honbun', '.novel_view'],
      paraTag:    'p',
      titleSel:   ['.p-novel__subtitle', '.novel_subtitle'],
      seriesSel:  ['.p-novel__series-title', '#novel_title'],
      beforeSel:  ['.p-novel__text--before', '#novel_p'],
      afterSel:   ['.p-novel__text--after',  '#novel_a'],
      prevSel:    ['.p-novel__foot--prev a', '.novel_bn a:first-child'],
      nextSel:    ['.p-novel__foot--next a', '.novel_bn a:last-child'],
      prevPat:    [/前の話/, /前へ/, /前話/, /‹/, /←/],
      nextPat:    [/次の話/, /次へ/, /次話/, /›/, /→/],
      tocUrl: () => {
        const parts = location.pathname.split('/').filter(Boolean);
        return `${location.origin}/${parts[0]}/`;
      },
    },
    {
      test: h => /kakuyomu\.jp$/.test(h),
      selectors:  ['.widget-episodeBody.js-episode-body', '.widget-episodeBody'],
      paraTag:    'p',
      titleSel:   ['.widget-episode-header-wrapper h1', '.widget-episodeTitle'],
      seriesSel:  ['.widget-workCard-titleLabel', '.widget-work-information h1'],
      beforeSel:  [],
      afterSel:   [],
      prevSel:    ['a[href*="/episodes/"][aria-label*="前"]', '.widget-toc-episode-titleLabel + a'],
      nextSel:    ['a[href*="/episodes/"][aria-label*="次"]'],
      prevPat:    [/前のエピソード/, /前へ/, /前の話/],
      nextPat:    [/次のエピソード/, /次へ/, /次の話/],
      tocUrl: () => {
        const m = location.pathname.match(/^(\/works\/[^/]+)/);
        return m ? `${location.origin}${m[1]}` : '';
      },
    },
  ];

  function first(sels, scope = document) {
    for (const sel of sels) {
      const el = scope.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // CSSセレクタで見つからなければリンクテキストで探すフォールバック
  function findNavLink(sels, patterns) {
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el?.href) return el;
    }
    if (!patterns?.length) return null;
    const allLinks = [...document.querySelectorAll('a[href]')];
    for (const pat of patterns) {
      const found = allLinks.find(a => pat.test(a.textContent.trim()));
      if (found?.href) return found;
    }
    return null;
  }

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

  // ---- 読書エリア構築 ----
  function buildReadingArea(paraGroups) {
    const area = document.createElement('div');
    area.id = 'tate-reading-area';
    for (const { paras, noteClass } of paraGroups) {
      if (noteClass) {
        const label = document.createElement('p');
        label.className = 'tate-section-label';
        label.textContent = `── ${noteClass} ──`;
        area.appendChild(label);
      }
      for (const srcPara of paras) {
        area.appendChild(transformPara(srcPara));
      }
    }
    return area;
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

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ---- UI 表示制御 ----
  let active = false;
  let uiVisible = false;
  let uiHideTimer = null;
  let resizeTimer = null;

  function showUI() {
    const h = document.getElementById('tate-header');
    const f = document.getElementById('tate-footer');
    h?.classList.remove('hidden');
    f?.classList.remove('hidden');
    uiVisible = true;
    clearTimeout(uiHideTimer);
    uiHideTimer = setTimeout(hideUI, 4000);
  }

  function hideUI() {
    const h = document.getElementById('tate-header');
    const f = document.getElementById('tate-footer');
    h?.classList.add('hidden');
    f?.classList.add('hidden');
    uiVisible = false;
    clearTimeout(uiHideTimer);
  }

  // ---- 有効化 ----
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

    const episodeTitle = first(adapter.titleSel)?.textContent?.trim() ?? '';
    const seriesTitle  = first(adapter.seriesSel)?.textContent?.trim() ?? '';
    const prevHref     = findNavLink(adapter.prevSel, adapter.prevPat)?.href ?? '';
    const nextHref     = findNavLink(adapter.nextSel, adapter.nextPat)?.href ?? '';
    const tocHref      = adapter.tocUrl ? adapter.tocUrl() : '';

    const paraGroups = [];

    if (adapter.beforeSel.length) {
      const beforeEl = first(adapter.beforeSel);
      if (beforeEl) {
        const paras = [...beforeEl.querySelectorAll(adapter.paraTag)].filter(p => p.textContent.trim());
        if (paras.length) paraGroups.push({ paras, noteClass: '前書き' });
      }
    }

    const bodyParas = [...bodyEl.querySelectorAll(adapter.paraTag)].filter(p => {
      const inBefore = adapter.beforeSel.some(s => p.closest(s));
      const inAfter  = adapter.afterSel.some(s => p.closest(s));
      return !inBefore && !inAfter && p.textContent.trim();
    });
    if (bodyParas.length) paraGroups.push({ paras: bodyParas, noteClass: '' });

    if (adapter.afterSel.length) {
      const afterEl = first(adapter.afterSel);
      if (afterEl) {
        const paras = [...afterEl.querySelectorAll(adapter.paraTag)].filter(p => p.textContent.trim());
        if (paras.length) paraGroups.push({ paras, noteClass: '後書き' });
      }
    }

    if (!paraGroups.length) return;

    enableViewportCover();

    const overlay = document.createElement('div');
    overlay.id = 'tate-overlay';
    const readingArea = buildReadingArea(paraGroups);
    overlay.appendChild(readingArea);
    document.body.appendChild(overlay);

    const header = document.createElement('div');
    header.id = 'tate-header';
    header.innerHTML = `
      <span id="tate-series-title">${escHtml(seriesTitle)}</span>
      <span id="tate-episode-title">${escHtml(episodeTitle)}</span>
      <button id="tate-btn-close" title="閉じる">✕</button>
    `;
    document.body.appendChild(header);

    const footer = document.createElement('div');
    footer.id = 'tate-footer';
    footer.innerHTML = `
      <button id="tate-btn-prev" ${prevHref ? '' : 'disabled'}>‹ 前の話</button>
      <button id="tate-btn-toc"  ${tocHref  ? '' : 'disabled'}>目次</button>
      <span id="tate-progress">0%</span>
      <button id="tate-btn-next" ${nextHref ? '' : 'disabled'}>次の話 ›</button>
    `;
    document.body.appendChild(footer);

    const progressBar = document.createElement('div');
    progressBar.id = 'tate-progress-bar';
    document.body.appendChild(progressBar);

    document.getElementById('tate-fab')?.remove();

    const progressEl = document.getElementById('tate-progress');
    readingArea.addEventListener('scroll', () => {
      const max = readingArea.scrollWidth - readingArea.clientWidth;
      if (max <= 0) return;
      const pct = Math.round(readingArea.scrollLeft / max * 100);
      if (progressEl) progressEl.textContent = `${pct}%`;
      progressBar.style.width = `${pct}%`;
      clearTimeout(uiHideTimer);
      if (uiVisible) uiHideTimer = setTimeout(hideUI, 4000);
    }, { passive: true });

    // タップで UI 表示切り替え（スクロールは自然なスワイプに任せる）
    readingArea.addEventListener('click', () => {
      if (uiVisible) hideUI();
      else showUI();
    });

    document.getElementById('tate-btn-close')?.addEventListener('click', e => {
      e.stopPropagation(); deactivate();
    });
    document.getElementById('tate-btn-prev')?.addEventListener('click', e => {
      e.stopPropagation(); if (prevHref) location.href = prevHref;
    });
    document.getElementById('tate-btn-next')?.addEventListener('click', e => {
      e.stopPropagation(); if (nextHref) location.href = nextHref;
    });
    document.getElementById('tate-btn-toc')?.addEventListener('click', e => {
      e.stopPropagation(); if (tocHref) location.href = tocHref;
    });

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);
    active = true;

    // 起動時にUIを表示し、4秒後に自動で隠す
    showUI();
  }

  function deactivate() {
    if (!active) return;
    clearTimeout(uiHideTimer);
    document.getElementById('tate-overlay')?.remove();
    document.getElementById('tate-header')?.remove();
    document.getElementById('tate-footer')?.remove();
    document.getElementById('tate-progress-bar')?.remove();
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

  // ---- FAB ----
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
    if (GM_getValue('alwaysOn', false)) {
      activate();
    } else {
      injectFAB();
    }
  }
})();
