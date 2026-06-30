// ==UserScript==
// @name         なろう縦組みリーダー
// @namespace    https://github.com/tetsuya4869/tateyomi
// @version      1.4.0
// @description  なろう・カクヨムの本文を縦書きにする。画面固定・フォントサイズ調整・次話ボタン
// @author       tetsuya4869
// @match        https://ncode.syosetu.com/n*/*
// @match        https://novel18.syosetu.com/n*/*
// @match        https://kakuyomu.jp/works/*/episodes/*
// @run-at       document-end
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ===== 設定（ここだけ変えればOK） =====
  const INCLUDE_PREFACE_AFTERWORD = false; // 前書き・後書きも縦書きにするか
  const APPLY_TCY = true;                  // 縦中横（2桁数字・!!など）を適用
  const SHOW_CONTROLS = true;              // 画面隅の操作パネルを出す
  const DEFAULT_FONT_SIZE = 1.05;          // 文字サイズ（rem）
  const DEFAULT_LINE_HEIGHT = 1.9;         // 行間（列間）

  const DEFAULT_LOCKED = true;             // 起動時に本文を画面固定するか
  const TOP_RATIO = '14%';                 // 上端にあける割合（なろうヘッダー＋ステータスバー）
  const BOTTOM_RATIO = '5%';              // 下端にあける割合（セーフエリア用）
  const PANE_HEIGHT = '82svh';             // 非固定時の読書エリアの高さ

  const SHOW_NAV_BUTTONS = true;           // 次/前の話フローティングボタンを出す
  const NAV_SIDE = 'right';                // 'right' | 'left' | 'center'（パネルは自動で反対側）
  const NAV_OFFSET_X = '2%';              // ボタンの横方向オフセット（端からの距離）
  const NAV_OFFSET_Y = '15%';             // ボタンの縦方向オフセット（下からの距離）
  const NEXT_KEYWORDS = ['次へ', '次の話', '次のエピソード', '次ページ', '次話'];
  const PREV_KEYWORDS = ['前へ', '前の話', '前のエピソード', '前ページ', '前話'];

  // ===== セレクタ =====
  const BODY_SELECTORS = [
    // なろう新UI
    '.p-novel__text:not(.p-novel__text--preface):not(.p-novel__text--afterword)',
    // なろう旧UI
    '#novel_honbun',
    // カクヨム
    '.widget-episodeBody.js-episode-body',
    '.widget-episodeBody',
  ];
  const NOTE_SELECTORS = [
    '.p-novel__text--preface', '.p-novel__text--afterword',
    '#novel_p', '#novel_a',
  ];
  const FALLBACK_SELECTORS = ['.p-novel__body', '#novel_color'];

  const STORAGE_KEY = 'tate-reader-settings';
  const VERTICAL_CLASS = 'tg-vertical';
  const ROOT_ON_CLASS = 'tg-on';
  const ROOT_LOCK_CLASS = 'tg-locked';

  const NAV_SIDE_SAFE = ['right', 'center', 'left'].includes(NAV_SIDE) ? NAV_SIDE : 'right';
  const PANEL_SIDE = NAV_SIDE_SAFE === 'left' ? 'right' : 'left';

  // ===== 設定の保存/読み込み =====
  const loadSettings = () => {
    const fallback = {
      vertical: true,
      locked: DEFAULT_LOCKED,
      fontSize: DEFAULT_FONT_SIZE,
      lineHeight: DEFAULT_LINE_HEIGHT,
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch { return fallback; }
  };

  const saveSettings = (s) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  };

  // ===== 対象要素の収集 =====
  const collectTargets = () => {
    const selectors = INCLUDE_PREFACE_AFTERWORD
      ? [...BODY_SELECTORS, ...NOTE_SELECTORS]
      : BODY_SELECTORS;
    const found = selectors.flatMap(sel => [...document.querySelectorAll(sel)]);
    return found.length > 0
      ? found
      : FALLBACK_SELECTORS.flatMap(sel => [...document.querySelectorAll(sel)]);
  };

  // ===== ナビリンクの取得 =====
  const normalizeLabel = (text) => (text || '').replace(/[\s«»‹›<>＜＞]/g, '');

  const findNavUrl = (kind) => {
    const rel = kind === 'next' ? 'next' : 'prev';
    const relEl = document.querySelector(`link[rel="${rel}"], a[rel="${rel}"]`);
    if (relEl?.href) return relEl.href;
    const keywords = kind === 'next' ? NEXT_KEYWORDS : PREV_KEYWORDS;
    const anchors = [...document.querySelectorAll('a[href]')];
    const hit = anchors.find(a => keywords.some(kw => normalizeLabel(a.textContent).includes(kw)));
    return hit?.href ?? null;
  };

  // 目次URLをページURLから導出
  const getTocUrl = () => {
    const h = location.hostname;
    if (/syosetu\.com$/.test(h)) {
      const parts = location.pathname.split('/').filter(Boolean);
      return parts.length >= 1 ? `${location.origin}/${parts[0]}/` : '';
    }
    if (/kakuyomu\.jp$/.test(h)) {
      const m = location.pathname.match(/^(\/works\/[^/]+)/);
      return m ? `${location.origin}${m[1]}` : '';
    }
    return '';
  };

  // ===== 縦中横（TCY） =====
  let tcyApplied = false;

  const processTCY = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (['RUBY', 'RT', 'RP', 'SCRIPT', 'STYLE'].includes(node.tagName)) return;
      if (node.classList?.contains('tcy')) return;
      for (const child of [...node.childNodes]) processTCY(child);
      return;
    }
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent;
    const pat = /(\d{2}|[!?！？]{2})/g;
    if (!pat.test(text)) return;
    pat.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = pat.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'tcy';
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  };

  const applyTCYToTargets = (targets) => {
    if (tcyApplied) return;
    tcyApplied = true;
    targets.forEach(el => processTCY(el));
  };

  // ===== スタイル注入 =====
  const injectStyle = () => {
    if (document.getElementById('tg-style')) return;
    const style = document.createElement('style');
    style.id = 'tg-style';
    style.textContent = `
      :root {
        --tg-font-size: ${DEFAULT_FONT_SIZE}rem;
        --tg-line-height: ${DEFAULT_LINE_HEIGHT};
        --tg-height: ${PANE_HEIGHT};
        --tg-top: ${TOP_RATIO};
        --tg-bottom: ${BOTTOM_RATIO};
        --tg-bg: #faf8f3;
        --tg-nav-x: ${NAV_OFFSET_X};
        --tg-nav-y: ${NAV_OFFSET_Y};
      }

      /* なろうの幅制限を解除（非固定時） */
      html.${ROOT_ON_CLASS}:not(.${ROOT_LOCK_CLASS}) main:has(.p-novel__body),
      html.${ROOT_ON_CLASS}:not(.${ROOT_LOCK_CLASS}) .p-novel,
      html.${ROOT_ON_CLASS}:not(.${ROOT_LOCK_CLASS}) .p-novel__body,
      html.${ROOT_ON_CLASS}:not(.${ROOT_LOCK_CLASS}) #novel_contents,
      html.${ROOT_ON_CLASS}:not(.${ROOT_LOCK_CLASS}) #novel_color {
        max-width: none !important;
        width: auto !important;
      }

      /* 縦書き共通 */
      .${VERTICAL_CLASS} {
        writing-mode: vertical-rl;
        -webkit-writing-mode: vertical-rl;
        text-orientation: mixed;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
        box-sizing: border-box;
        font-size: var(--tg-font-size);
        line-height: var(--tg-line-height);
        letter-spacing: 0.05em;
        font-family: "Hiragino Mincho ProN", "Yu Mincho",
                     "Noto Serif CJK JP", "Noto Serif JP", serif;
      }
      .${VERTICAL_CLASS} p { margin: 0; }
      .${VERTICAL_CLASS}::-webkit-scrollbar { height: 6px; }
      .${VERTICAL_CLASS}::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,.22); border-radius: 3px;
      }
      .tcy { text-combine-upright: all; -webkit-text-combine: horizontal; }
      ruby { ruby-align: center; }
      rt { font-size: 0.5em; }

      /* 非固定：ページ内に埋め込み */
      html:not(.${ROOT_LOCK_CLASS}) .${VERTICAL_CLASS} {
        height: var(--tg-height);
        max-height: var(--tg-height);
        width: 100%;
        padding: 0.75rem max(env(safe-area-inset-right), 0.75rem)
                 0.75rem max(env(safe-area-inset-left), 0.75rem);
      }

      /* 固定：画面に固定 */
      html.${ROOT_LOCK_CLASS} .${VERTICAL_CLASS} {
        position: fixed;
        top: var(--tg-top);
        bottom: calc(var(--tg-bottom) + 3px);
        left: 0; right: 0;
        width: auto; height: auto;
        max-width: none; max-height: none;
        margin: 0;
        padding: 0.75rem max(env(safe-area-inset-right), 1rem)
                 0.75rem max(env(safe-area-inset-left), 1rem);
        background: var(--tg-bg);
        z-index: 9998;
      }

      /* 進捗バー（常時表示） */
      #tg-progress-bar {
        position: fixed; bottom: 0; left: 0;
        height: 3px; width: 0%;
        background: linear-gradient(to right, #c8a96e, #e8c880);
        z-index: 99999;
        transition: width 0.15s ease;
        pointer-events: none;
      }

      /* 操作パネル */
      #tg-panel {
        position: fixed;
        z-index: 99999;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 6px;
        border-radius: 10px;
        background: rgba(20, 16, 12, 0.80);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
      }
      #tg-panel.tg-pos-left {
        left: max(env(safe-area-inset-left), 8px);
        bottom: max(env(safe-area-inset-bottom), 8px);
      }
      #tg-panel.tg-pos-right {
        right: max(env(safe-area-inset-right), 8px);
        bottom: max(env(safe-area-inset-bottom), 8px);
      }
      #tg-panel button {
        min-width: 42px; height: 38px;
        border: none; border-radius: 6px;
        background: rgba(255,255,255,0.12);
        color: #e8e0d5;
        font-size: 13px; line-height: 1;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.12s;
      }
      #tg-panel button:active { background: rgba(255,255,255,0.25); }
      #tg-panel button:disabled { opacity: 0.35; pointer-events: none; }

      /* 次/前の話ボタン */
      #tg-nav {
        position: fixed;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      #tg-nav.tg-pos-right {
        right: var(--tg-nav-x);
        bottom: var(--tg-nav-y);
      }
      #tg-nav.tg-pos-left {
        left: var(--tg-nav-x);
        bottom: var(--tg-nav-y);
      }
      #tg-nav.tg-pos-center {
        left: 50%; transform: translateX(-50%);
        bottom: var(--tg-nav-y);
        flex-direction: row;
      }
      #tg-nav a, #tg-nav span {
        display: inline-flex; align-items: center; justify-content: center;
        text-decoration: none; border-radius: 999px;
        font-family: -apple-system, sans-serif;
        -webkit-tap-highlight-color: transparent;
        transition: filter .12s, transform .12s;
      }
      #tg-nav a:active { filter: brightness(.88); transform: translateY(1px); }
      #tg-nav .tg-prev {
        height: 44px; padding: 0 16px;
        font-size: 13px; font-weight: 600;
        color: #c8a96e;
        background: rgba(20, 16, 12, 0.80);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(200,169,110,0.4);
        box-shadow: 0 2px 8px rgba(0,0,0,.28);
      }
      #tg-nav .tg-next {
        height: 52px; padding: 0 22px;
        font-size: 16px; font-weight: 700;
        color: #e8e0d5;
        background: rgba(20, 16, 12, 0.90);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.15);
        box-shadow: 0 4px 16px rgba(0,0,0,.38);
      }
      #tg-nav .tg-disabled { opacity: .4; pointer-events: none; }
    `;
    document.head.appendChild(style);
  };

  // ===== CSS変数の更新 =====
  const setCssVar = (name, value) =>
    document.documentElement.style.setProperty(name, value);

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const resolveBackground = () => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const transparent = !bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)';
    return transparent ? '#faf8f3' : bg;
  };

  // ===== 適用/解除 =====
  const applyVertical = (targets, on) => {
    document.documentElement.classList.toggle(ROOT_ON_CLASS, on);
    targets.forEach(el => el.classList.toggle(VERTICAL_CLASS, on));
    if (on && APPLY_TCY) applyTCYToTargets(targets);
  };

  const applyLock = (on) =>
    document.documentElement.classList.toggle(ROOT_LOCK_CLASS, on);

  // ===== 進捗バー =====
  let progressBar = null;

  const buildProgressBar = () => {
    progressBar = document.createElement('div');
    progressBar.id = 'tg-progress-bar';
    document.body.appendChild(progressBar);
  };

  const watchProgress = (targets) => {
    targets.forEach(el => {
      el.addEventListener('scroll', () => {
        const max = el.scrollWidth - el.clientWidth;
        if (max <= 0 || !progressBar) return;
        progressBar.style.width = `${el.scrollLeft / max * 100}%`;
      }, { passive: true });
    });
  };

  // ===== 操作パネル =====
  const buildPanel = (state) => {
    const panel = document.createElement('div');
    panel.id = 'tg-panel';
    panel.classList.add(`tg-pos-${PANEL_SIDE}`);

    const makeBtn = (label, onClick) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      return btn;
    };

    const toggleBtn = makeBtn(state.settings.vertical ? '横' : '縦', () => {
      const next = !state.settings.vertical;
      state.settings = { ...state.settings, vertical: next };
      applyVertical(state.targets, next);
      toggleBtn.textContent = next ? '横' : '縦';
      saveSettings(state.settings);
    });

    const lockBtn = makeBtn(state.settings.locked ? '解除' : '固定', () => {
      const next = !state.settings.locked;
      state.settings = { ...state.settings, locked: next };
      applyLock(next);
      lockBtn.textContent = next ? '解除' : '固定';
      saveSettings(state.settings);
    });

    const changeFont = (delta) => {
      const next = Number(clamp(state.settings.fontSize + delta, 0.7, 2.2).toFixed(2));
      state.settings = { ...state.settings, fontSize: next };
      setCssVar('--tg-font-size', `${next}rem`);
      saveSettings(state.settings);
    };

    const changeLine = (delta) => {
      const next = Number(clamp(state.settings.lineHeight + delta, 1.2, 3.0).toFixed(2));
      state.settings = { ...state.settings, lineHeight: next };
      setCssVar('--tg-line-height', String(next));
      saveSettings(state.settings);
    };

    const tocUrl = getTocUrl();
    const tocBtn = makeBtn('目次', () => { if (tocUrl) location.href = tocUrl; });
    if (!tocUrl) tocBtn.disabled = true;

    panel.append(
      toggleBtn,
      lockBtn,
      makeBtn('字＋', () => changeFont(0.1)),
      makeBtn('字－', () => changeFont(-0.1)),
      makeBtn('間＋', () => changeLine(0.15)),
      makeBtn('間－', () => changeLine(-0.15)),
      tocBtn,
    );
    document.body.appendChild(panel);
  };

  // ===== 次/前の話ボタン =====
  const buildNav = () => {
    const prevUrl = findNavUrl('prev');
    const nextUrl = findNavUrl('next');
    if (!prevUrl && !nextUrl) return;

    const nav = document.createElement('div');
    nav.id = 'tg-nav';
    nav.classList.add(`tg-pos-${NAV_SIDE_SAFE}`);

    const makeNavItem = (cls, label, url) => {
      const el = document.createElement(url ? 'a' : 'span');
      el.className = url ? cls : `${cls} tg-disabled`;
      el.textContent = label;
      if (url) el.href = url;
      return el;
    };

    nav.append(
      makeNavItem('tg-next', '次の話 ›', nextUrl),
      makeNavItem('tg-prev', '‹ 前の話', prevUrl),
    );
    document.body.appendChild(nav);
  };

  // ===== 初期化 =====
  const init = () => {
    const targets = collectTargets();
    if (targets.length === 0) return; // 目次など本文なしページでは何もしない

    injectStyle();

    const settings = loadSettings();
    setCssVar('--tg-font-size', `${settings.fontSize}rem`);
    setCssVar('--tg-line-height', String(settings.lineHeight));
    setCssVar('--tg-bg', resolveBackground());

    applyVertical(targets, settings.vertical);
    applyLock(settings.locked);

    buildProgressBar();
    watchProgress(targets);

    if (SHOW_CONTROLS) buildPanel({ targets, settings });
    if (SHOW_NAV_BUTTONS) buildNav();
  };

  init();
})();
