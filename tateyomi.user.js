// ==UserScript==
// @name         なろう縦組みリーダー
// @namespace    https://github.com/tetsuya4869/tateyomi
// @version      1.1.0
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

  const HEADER_H = 44; // px
  const FOOTER_H = 48; // px

  // ---- CSS ----
  GM_addStyle(`
    :root {
      --tate-header-h: ${HEADER_H}px;
      --tate-footer-h: ${FOOTER_H}px;
    }

    #tate-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: #faf8f3; color: #1a1a1a;
      display: flex;
      flex-direction: row;
      overflow-x: scroll;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      /* ヘッダー・フッター分の余白を上下に確保 */
      padding-top: var(--tate-header-h);
      padding-bottom: var(--tate-footer-h);
      box-sizing: border-box;
      font-family: "Hiragino Mincho ProN", "Yu Mincho", "游明朝", serif;
      font-size: 18px;
      line-height: 1.9;
    }

    .tate-page {
      flex: 0 0 100vw;
      height: 100%;
      scroll-snap-align: start;
      scroll-snap-stop: always;
      writing-mode: vertical-rl;
      overflow: hidden;
      padding-top: max(env(safe-area-inset-top), 0.75rem);
      padding-bottom: max(env(safe-area-inset-bottom), 0.75rem);
      padding-left: max(env(safe-area-inset-left), 1rem);
      padding-right: max(env(safe-area-inset-right), 1rem);
      box-sizing: border-box;
    }

    .tate-page--overflow {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    /* 前書き・後書きページの区別スタイル */
    .tate-page--note {
      background: #f5f0e8;
      font-size: 0.9em;
    }
    .tate-page--note::before {
      content: attr(data-label);
      display: block;
      font-size: 0.7em;
      opacity: 0.5;
      margin-bottom: 0.5em;
      writing-mode: vertical-rl;
    }

    .tcy { text-combine-upright: all; -webkit-text-combine: horizontal; }
    ruby { ruby-align: center; }
    rt { font-size: 0.5em; }

    /* ヘッダー */
    #tate-header {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: var(--tate-header-h);
      padding-top: env(safe-area-inset-top, 0);
      z-index: 2147483648;
      background: rgba(30, 25, 20, 0.88);
      color: #e8e0d5;
      display: flex;
      align-items: center;
      font-family: -apple-system, sans-serif;
      box-sizing: border-box;
      transition: transform 0.25s ease;
    }
    #tate-header.hidden { transform: translateY(-100%); }

    #tate-series-title {
      font-size: 10px;
      opacity: 0.55;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 0.5rem;
      min-width: 0;
      flex: 0 1 auto;
    }
    #tate-episode-title {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1 1 0;
      text-align: center;
      padding: 0 0.25rem;
    }
    #tate-btn-close {
      flex: 0 0 auto;
      background: none;
      border: none;
      color: #e8e0d5;
      font-size: 18px;
      padding: 0 0.75rem;
      cursor: pointer;
      line-height: var(--tate-header-h);
      -webkit-tap-highlight-color: transparent;
    }

    /* フッター */
    #tate-footer {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: calc(var(--tate-footer-h) + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0);
      z-index: 2147483648;
      background: rgba(30, 25, 20, 0.88);
      color: #e8e0d5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: -apple-system, sans-serif;
      box-sizing: border-box;
      transition: transform 0.25s ease;
    }
    #tate-footer.hidden { transform: translateY(100%); }

    #tate-footer button {
      background: none;
      border: 1px solid rgba(255,255,255,0.3);
      color: #e8e0d5;
      padding: 0.3rem 0.7rem;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      margin: 0 0.5rem;
      -webkit-tap-highlight-color: transparent;
      white-space: nowrap;
    }
    #tate-footer button:disabled {
      opacity: 0.3;
      pointer-events: none;
    }
    #tate-page-indicator {
      font-size: 12px;
      opacity: 0.7;
      flex: 1;
      text-align: center;
    }

    /* FAB */
    #tate-fab {
      position: fixed;
      bottom: max(env(safe-area-inset-bottom), 1rem);
      right: 1rem;
      z-index: 2147483646;
      background: rgba(30,25,20,0.88);
      color: #e8e0d5;
      border: none;
      border-radius: 50%;
      width: 48px; height: 48px;
      font-size: 16px;
      font-family: "Hiragino Mincho ProN", serif;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      -webkit-tap-highlight-color: transparent;
    }
  `);

  // ---- サイトアダプタ ----
  const ADAPTERS = [
    {
      test: h => /ncode\.syosetu\.com$/.test(h),
      selectors: ['.p-novel__body', '#novel_honbun', '.novel_view'],
      paraTag: 'p',
      titleSel:  ['.p-novel__subtitle', '.novel_subtitle'],
      seriesSel: ['.p-novel__series-title', '#novel_title'],
      beforeSel: ['.p-novel__text--before', '#novel_p'],
      afterSel:  ['.p-novel__text--after',  '#novel_a'],
      prevSel:   ['.p-novel__foot--prev a', '.novel_bn a:first-child'],
      nextSel:   ['.p-novel__foot--next a', '.novel_bn a:last-child'],
    },
    {
      test: h => /novel18\.syosetu\.com$/.test(h),
      selectors: ['.p-novel__body', '#novel_honbun', '.novel_view'],
      paraTag: 'p',
      titleSel:  ['.p-novel__subtitle', '.novel_subtitle'],
      seriesSel: ['.p-novel__series-title', '#novel_title'],
      beforeSel: ['.p-novel__text--before', '#novel_p'],
      afterSel:  ['.p-novel__text--after',  '#novel_a'],
      prevSel:   ['.p-novel__foot--prev a', '.novel_bn a:first-child'],
      nextSel:   ['.p-novel__foot--next a', '.novel_bn a:last-child'],
    },
    {
      test: h => /kakuyomu\.jp$/.test(h),
      selectors: ['.widget-episodeBody.js-episode-body', '.widget-episodeBody'],
      paraTag: 'p',
      titleSel:  ['.widget-episode-header-wrapper h1', '.widget-episodeTitle'],
      seriesSel: ['.widget-workCard-titleLabel', '.widget-work-information h1'],
      beforeSel: [],
      afterSel:  [],
      prevSel:   ['a[href*="/episodes/"][aria-label*="前"]'],
      nextSel:   ['a[href*="/episodes/"][aria-label*="次"]'],
    },
  ];

  function first(sels, scope = document) {
    for (const sel of sels) {
      const el = scope.querySelector(sel);
      if (el) return el;
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

  // ---- ページ分割 ----
  // probeの高さ = 100svh - header - footer。CSSで設定済みなので clientHeight で取れる。
  function splitIntoPages(paraGroups, overlayEl) {
    const probe = document.createElement('div');
    probe.className = 'tate-page';
    probe.style.cssText = 'visibility:hidden;position:absolute;top:0;left:0;pointer-events:none;flex-shrink:0;';
    overlayEl.appendChild(probe);

    const pages = [];
    let buf = [];
    let currentNoteClass = '';

    function flush(noteClass) {
      if (!buf.length) return;
      const pg = document.createElement('div');
      pg.className = 'tate-page' + (noteClass ? ' tate-page--note' : '');
      if (noteClass) pg.dataset.label = noteClass;
      for (const p of buf) pg.appendChild(p.cloneNode(true));
      pages.push(pg);
      buf = [];
    }

    function overflows(arr) {
      probe.innerHTML = '';
      for (const p of arr) probe.appendChild(p.cloneNode(true));
      return probe.scrollWidth > probe.clientWidth;
    }

    for (const { paras, noteClass } of paraGroups) {
      if (noteClass !== currentNoteClass) {
        flush(currentNoteClass);
        currentNoteClass = noteClass;
      }

      for (const srcPara of paras) {
        const para = transformPara(srcPara);
        probe.innerHTML = '';
        probe.appendChild(para.cloneNode(true));

        if (probe.scrollWidth > probe.clientWidth) {
          flush(currentNoteClass);
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
              buf = [cp]; flush(currentNoteClass);
              start += lo;
            }
          } else {
            const pg = document.createElement('div');
            pg.className = 'tate-page tate-page--overflow' + (noteClass ? ' tate-page--note' : '');
            if (noteClass) pg.dataset.label = noteClass;
            pg.appendChild(para.cloneNode(true));
            pages.push(pg);
          }
          continue;
        }

        if (overflows([...buf, para])) {
          flush(currentNoteClass);
          buf = [para];
        } else {
          buf.push(para);
        }
      }
    }
    flush(currentNoteClass);
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

  // ---- 有効化 ----
  let active = false;
  let resizeTimer = null;
  let uiVisible = true;

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

    // 元サイトの各要素を取得
    const episodeTitle = first(adapter.titleSel)?.textContent?.trim() ?? '';
    const seriesTitle  = first(adapter.seriesSel)?.textContent?.trim() ?? '';
    const prevHref     = first(adapter.prevSel)?.href ?? '';
    const nextHref     = first(adapter.nextSel)?.href ?? '';

    // 前書き・本文・後書きの段落グループを構築
    const paraGroups = [];

    if (adapter.beforeSel.length) {
      const beforeEl = first(adapter.beforeSel);
      if (beforeEl) {
        const paras = [...beforeEl.querySelectorAll(adapter.paraTag)].filter(p => p.textContent.trim());
        if (paras.length) paraGroups.push({ paras, noteClass: '前書き' });
      }
    }

    const bodyParas = [...bodyEl.querySelectorAll(adapter.paraTag)].filter(p => {
      // 前書き・後書き要素内の p は除外
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

    // 一時オーバーレイで測定
    const tmp = document.createElement('div');
    tmp.id = 'tate-overlay';
    tmp.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1;padding-top:' + HEADER_H + 'px;padding-bottom:' + FOOTER_H + 'px;display:flex;flex-direction:row;';
    document.body.appendChild(tmp);
    const pages = splitIntoPages(paraGroups, tmp);
    document.body.removeChild(tmp);

    if (!pages.length) { restoreViewport(); return; }

    // 本番オーバーレイ
    const overlay = document.createElement('div');
    overlay.id = 'tate-overlay';
    for (const pg of pages) overlay.appendChild(pg);
    document.body.appendChild(overlay);

    // ヘッダー
    const header = document.createElement('div');
    header.id = 'tate-header';
    header.innerHTML = `
      <span id="tate-series-title">${escHtml(seriesTitle)}</span>
      <span id="tate-episode-title">${escHtml(episodeTitle)}</span>
      <button id="tate-btn-close" title="閉じる">✕</button>
    `;
    document.body.appendChild(header);

    // フッター
    const footer = document.createElement('div');
    footer.id = 'tate-footer';
    footer.innerHTML = `
      <button id="tate-btn-prev" ${prevHref ? '' : 'disabled'}>← 前の話</button>
      <span id="tate-page-indicator">1 / ${pages.length}</span>
      <button id="tate-btn-next" ${nextHref ? '' : 'disabled'}>次の話 →</button>
    `;
    document.body.appendChild(footer);

    document.getElementById('tate-fab')?.remove();

    // ページインジケータ更新
    overlay.addEventListener('scroll', () => {
      const pg = Math.round(overlay.scrollLeft / window.innerWidth);
      const ind = document.getElementById('tate-page-indicator');
      if (ind) ind.textContent = `${pg + 1} / ${pages.length}`;
    }, { passive: true });

    // タップゾーン
    overlay.addEventListener('click', e => {
      const x = e.clientX, w = window.innerWidth;
      if (x < w * 0.33) {
        // 左1/3: 前ページ
        overlay.scrollBy({ left: -w, behavior: 'smooth' });
      } else if (x > w * 0.67) {
        // 右1/3: 次ページ
        overlay.scrollBy({ left: w, behavior: 'smooth' });
      } else {
        // 中央: UI表示切り替え
        uiVisible = !uiVisible;
        header.classList.toggle('hidden', !uiVisible);
        footer.classList.toggle('hidden', !uiVisible);
      }
    });

    // 閉じる
    document.getElementById('tate-btn-close')?.addEventListener('click', e => {
      e.stopPropagation(); deactivate();
    });

    // 前/次の話
    document.getElementById('tate-btn-prev')?.addEventListener('click', e => {
      e.stopPropagation();
      if (prevHref) location.href = prevHref;
    });
    document.getElementById('tate-btn-next')?.addEventListener('click', e => {
      e.stopPropagation();
      if (nextHref) location.href = nextHref;
    });

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);
    active = true;
    uiVisible = true;
  }

  function deactivate() {
    if (!active) return;
    document.getElementById('tate-overlay')?.remove();
    document.getElementById('tate-header')?.remove();
    document.getElementById('tate-footer')?.remove();
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

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
