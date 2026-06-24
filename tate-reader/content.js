/* ==== なろう縦組みリーダー content.js ==== */
(function () {
  'use strict';

  // ---- サイトアダプタ定義 ----
  const ADAPTERS = [
    {
      test: h => /ncode\.syosetu\.com$/.test(h),
      selectors: ['.p-novel__body', '#novel_honbun', '.novel_view'],
      paraTag: 'p',
      nextSel: '.p-novel__foot--next a, a[href*="/"][href$="/next"], .novel_bn a:last-child',
    },
    {
      test: h => /novel18\.syosetu\.com$/.test(h),
      selectors: ['.p-novel__body', '#novel_honbun', '.novel_view'],
      paraTag: 'p',
      nextSel: '.p-novel__foot--next a, .novel_bn a:last-child',
    },
    {
      test: h => /kakuyomu\.jp$/.test(h),
      selectors: ['.widget-episodeBody.js-episode-body', '.widget-episodeBody'],
      paraTag: 'p',
      nextSel: 'a[href*="/episodes/"][aria-label*="次"]',
    },
  ];

  // ---- 縦中横 変換 ----
  // テキストノードに対してのみ適用し、ルビ等は素通し
  function applyTCY(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (['RUBY', 'RT', 'RP'].includes(node.tagName)) return node.cloneNode(true);
      const clone = node.cloneNode(false);
      for (const child of node.childNodes) clone.appendChild(applyTCY(child));
      return clone;
    }
    if (node.nodeType !== Node.TEXT_NODE) return node.cloneNode(true);

    const text = node.textContent;
    // 2桁数字 or !!/?? など2連約物
    const pattern = /(\d{2}|[!?！？]{2})/g;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'tcy';
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    // fragを返すためwrapper divは呼び出し側で処理
    const wrapper = document.createElement('span');
    wrapper.appendChild(frag);
    return wrapper;
  }

  // 段落要素を縦中横適用済みのクローン段落に変換
  function transformPara(srcPara) {
    const p = document.createElement('p');
    for (const child of srcPara.childNodes) p.appendChild(applyTCY(child));
    return p;
  }

  // ---- ページ分割 ----
  function splitIntoPages(paras, overlayEl) {
    // 測定用の隠しページ
    const probe = document.createElement('div');
    probe.className = 'tate-page';
    probe.style.cssText = 'visibility:hidden;position:absolute;top:0;left:0;pointer-events:none;';
    overlayEl.appendChild(probe);

    const pages = [];
    let currentPageParas = [];

    function flushPage(overflow = false) {
      if (currentPageParas.length === 0) return;
      const pg = document.createElement('div');
      pg.className = 'tate-page' + (overflow ? ' tate-page--overflow' : '');
      for (const p of currentPageParas) pg.appendChild(p.cloneNode(true));
      pages.push(pg);
      currentPageParas = [];
    }

    function probeParas(parasToTest) {
      probe.innerHTML = '';
      for (const p of parasToTest) probe.appendChild(p.cloneNode(true));
      return probe.scrollWidth > probe.clientWidth;
    }

    for (const srcPara of paras) {
      const para = transformPara(srcPara);

      // 段落単体でも1ページに入らない場合は分割 or fallback
      probe.innerHTML = '';
      probe.appendChild(para.cloneNode(true));
      if (probe.scrollWidth > probe.clientWidth) {
        // まず現在のバッファをフラッシュ
        flushPage();

        // 平文のみか判断（childNodesがテキスト or spanのみ）
        const isPlain = [...para.childNodes].every(
          n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'SPAN')
        );

        if (isPlain) {
          // 二分探索で分割
          const fullText = para.textContent;
          let start = 0;
          while (start < fullText.length) {
            let lo = 1, hi = fullText.length - start;
            while (lo < hi) {
              const mid = Math.ceil((lo + hi) / 2);
              const testP = document.createElement('p');
              testP.textContent = fullText.slice(start, start + mid);
              probe.innerHTML = '';
              probe.appendChild(testP);
              if (probe.scrollWidth > probe.clientWidth) hi = mid - 1;
              else lo = mid;
            }
            const chunk = fullText.slice(start, start + lo);
            const chunkP = document.createElement('p');
            chunkP.textContent = chunk;
            currentPageParas = [chunkP];
            flushPage();
            start += lo;
          }
        } else {
          // ルビ等含む複雑段落: そのページのみ横スクロール fallback
          const pg = document.createElement('div');
          pg.className = 'tate-page tate-page--overflow';
          pg.appendChild(para.cloneNode(true));
          pages.push(pg);
        }
        continue;
      }

      // 既存バッファ + 今の段落が収まるか試す
      const trial = [...currentPageParas, para];
      if (probeParas(trial)) {
        // 収まらない → バッファをフラッシュして新ページに
        flushPage();
        currentPageParas = [para];
      } else {
        currentPageParas.push(para);
      }
    }
    flushPage();

    overlayEl.removeChild(probe);
    return pages;
  }

  // ---- オーバーレイ構築 ----
  function buildOverlay(pages) {
    const overlay = document.createElement('div');
    overlay.id = 'tate-overlay';

    for (const pg of pages) overlay.appendChild(pg);

    // コントロールバー
    const ctrl = document.createElement('div');
    ctrl.id = 'tate-ctrl';
    ctrl.innerHTML = `
      <button id="tate-btn-prev">◀ 戻る</button>
      <span class="tate-page-indicator" id="tate-indicator">1 / ${pages.length}</span>
      <button id="tate-btn-close">閉じる</button>
    `;
    ctrl.classList.add('hidden');
    document.body.appendChild(ctrl);
    document.body.appendChild(overlay);

    // ページインジケータ更新
    let currentPage = 0;
    const indicator = document.getElementById('tate-indicator');

    overlay.addEventListener('scroll', () => {
      const vh = window.innerHeight;
      currentPage = Math.round(overlay.scrollTop / vh);
      if (indicator) indicator.textContent = `${currentPage + 1} / ${pages.length}`;
    }, { passive: true });

    // タップゾーン処理
    overlay.addEventListener('click', e => {
      const x = e.clientX;
      const w = window.innerWidth;
      const ctrlEl = document.getElementById('tate-ctrl');

      if (x < w * 0.33) {
        // 左1/3: 次ページへ（縦書きで「進む」）
        overlay.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        if (ctrlEl && !ctrlEl.classList.contains('hidden')) ctrlEl.classList.add('hidden');
      } else if (x > w * 0.67) {
        // 右1/3: 前ページへ（「戻る」）
        overlay.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
        if (ctrlEl && !ctrlEl.classList.contains('hidden')) ctrlEl.classList.add('hidden');
      } else {
        // 中央: コントロールトグル
        if (ctrlEl) ctrlEl.classList.toggle('hidden');
      }
    });

    // 前ページボタン
    document.getElementById('tate-btn-prev')?.addEventListener('click', e => {
      e.stopPropagation();
      overlay.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
    });

    // 閉じるボタン
    document.getElementById('tate-btn-close')?.addEventListener('click', e => {
      e.stopPropagation();
      deactivate();
    });

    return overlay;
  }

  // ---- viewport-fit=cover 適用 ----
  let origViewport = null;
  function enableViewportCover() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      origViewport = meta.getAttribute('content');
      meta.setAttribute('content', origViewport.includes('viewport-fit')
        ? origViewport.replace(/viewport-fit=[^,]*/, 'viewport-fit=cover')
        : origViewport + ', viewport-fit=cover');
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
    if (origViewport === '__created__') {
      meta.remove();
    } else if (origViewport !== null) {
      meta.setAttribute('content', origViewport);
    }
    origViewport = null;
  }

  // ---- 有効・無効化 ----
  let active = false;

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
    if (paras.length === 0) return;

    enableViewportCover();

    // CSS 注入
    if (!document.getElementById('tate-overlay-css')) {
      const style = document.createElement('style');
      style.id = 'tate-overlay-css';
      style.textContent = OVERLAY_CSS;
      document.head.appendChild(style);
    }

    // 一時オーバーレイを作って分割処理
    const tempOverlay = document.createElement('div');
    tempOverlay.id = 'tate-overlay';
    tempOverlay.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1;';
    document.body.appendChild(tempOverlay);
    const pages = splitIntoPages(paras, tempOverlay);
    document.body.removeChild(tempOverlay);

    buildOverlay(pages);
    active = true;

    // 画面回転対応
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);
  }

  function deactivate() {
    if (!active) return;
    document.getElementById('tate-overlay')?.remove();
    document.getElementById('tate-ctrl')?.remove();
    restoreViewport();
    window.removeEventListener('orientationchange', handleOrientationChange);
    window.removeEventListener('resize', handleResize);
    active = false;
  }

  let resizeTimer = null;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (active) { deactivate(); activate(); }
    }, 300);
  }
  function handleOrientationChange() {
    setTimeout(() => { if (active) { deactivate(); activate(); } }, 400);
  }

  // ---- storage (content-script 環境では browser.storage、userscript 環境では GM_getValue) ----
  async function getAlwaysOn() {
    if (typeof GM_getValue !== 'undefined') return GM_getValue('alwaysOn', false);
    if (typeof browser !== 'undefined') return (await browser.storage.local.get('alwaysOn')).alwaysOn || false;
    return false;
  }
  async function setAlwaysOn(val) {
    if (typeof GM_setValue !== 'undefined') { GM_setValue('alwaysOn', val); return; }
    if (typeof browser !== 'undefined') { await browser.storage.local.set({ alwaysOn: val }); return; }
  }

  // ---- エントリポイント ----
  (async () => {
    const adapter = ADAPTERS.find(a => a.test(location.hostname));
    if (!adapter) return;

    const alwaysOn = await getAlwaysOn();
    if (alwaysOn) activate();

    // popup / toolbar からのメッセージ（Web Extension 版）
    if (typeof browser !== 'undefined') {
      browser.runtime.onMessage.addListener(msg => {
        if (msg.type === 'toggle') {
          if (active) deactivate(); else activate();
        }
        if (msg.type === 'setAlwaysOn') setAlwaysOn(msg.value);
      });
    }
  })();

  // content.js が単体で読み込まれる場合に window.tateReader として公開
  window.tateReader = { activate, deactivate, get active() { return active; } };

  // OVERLAY_CSS は userscript 統合時に置き換え。単体 content.js では外部CSSに依存。
  const OVERLAY_CSS = '/* injected via overlay.css */';
})();
