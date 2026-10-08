(() => {
  'use strict';

  const STORAGE_KEY = 'quiz-prelanding:state';
  const UTM_KEY = 'quiz-prelanding:utm';
  const OFFER_URL = '#';
  const TOTAL_STEPS = 4;
  const FINAL_STEP = 5;
  const LOADER_MS = 3000;
  const TRANSITION_MS = 250;
  const GOAL_TITLES = {
    passive: 'Пассивный доход',
    growth: 'Быстрый рост капитала',
    learn: 'Изучить с нуля'
  };
  const UTM_PATTERN = /^(utm_[a-z_]+|subid\d*|sub\d+|click_?id|gclid|fbclid)$/i;

  const clamp = n => Math.min(FINAL_STEP, Math.max(1, n));

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Number.isInteger(saved.step)) {
        return {
          step: clamp(saved.step),
          answers: saved.answers && typeof saved.answers === 'object' ? saved.answers : {}
        };
      }
    } catch (_) {}
    return { step: 1, answers: {} };
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function captureUtm() {
    const incoming = {};
    new URLSearchParams(location.search).forEach((value, key) => {
      if (UTM_PATTERN.test(key) && value) incoming[key] = value.slice(0, 200);
    });
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(UTM_KEY)) || {}; } catch (_) {}
    if (Object.keys(incoming).length) {
      stored = { ...stored, ...incoming };
      try { localStorage.setItem(UTM_KEY, JSON.stringify(stored)); } catch (_) {}
    }
    return stored;
  }

  function buildOfferUrl() {
    if (OFFER_URL === '#') return '#';
    try {
      const url = new URL(OFFER_URL, location.href);
      Object.entries(utm).forEach(([key, value]) => {
        if (!url.searchParams.has(key)) url.searchParams.set(key, value);
      });
      return url.toString();
    } catch (_) {
      return OFFER_URL;
    }
  }

  const root = document.documentElement;
  const screens = Array.from(document.querySelectorAll('[data-step]'));
  const progressBar = document.querySelector('.progress');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const backBtn = document.getElementById('backBtn');
  const loaderFill = document.getElementById('loaderFill');
  const loaderPct = document.getElementById('loaderPct');
  const goalText = document.getElementById('goalText');
  const cta = document.getElementById('cta');

  let state = readState();
  let utm = {};
  let historyDepth = 0;
  let locked = false;
  let unlockTimer = null;
  let loaderTimer = null;
  let loaderRaf = null;

  function render(direction) {
    screens.forEach(screen => {
      const active = Number(screen.dataset.step) === state.step;
      screen.hidden = !active;
      screen.classList.remove('enter-fwd', 'enter-back');
      if (active && direction) {
        void screen.offsetWidth;
        screen.classList.add(direction === 'back' ? 'enter-back' : 'enter-fwd');
      }
    });

    const shown = Math.min(state.step, TOTAL_STEPS);
    progressFill.style.width = `${(shown / TOTAL_STEPS) * 100}%`;
    progressLabel.textContent = `${shown} из ${TOTAL_STEPS}`;
    progressBar.setAttribute('aria-valuenow', String(shown));
    progressBar.setAttribute('aria-valuetext', `${shown} из ${TOTAL_STEPS}`);

    backBtn.hidden = state.step === 1;

    document.querySelectorAll('[data-field]').forEach(option => {
      const selected = state.answers[option.dataset.field] === option.dataset.value;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });

    if (state.step === FINAL_STEP) {
      goalText.textContent = GOAL_TITLES[state.answers.goal] || 'стартовый план';
    }
    cta.href = buildOfferUrl();

    if (direction) {
      const heading = document.querySelector(`[data-step="${state.step}"] .title`);
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  function go(step, { mode = 'push', direction = 'fwd' } = {}) {
    state.step = clamp(step);
    saveState();

    const entry = { step: state.step };
    if (mode === 'push') {
      history.pushState(entry, '', location.href);
      historyDepth += 1;
    } else if (mode === 'replace') {
      history.replaceState(entry, '', location.href);
    }

    if (state.step === 4) startLoader(); else stopLoader();

    locked = true;
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => { locked = false; }, TRANSITION_MS);

    render(mode === 'none' ? null : direction);
  }

  function goBack() {
    if (locked) return;
    if (historyDepth > 0) {
      history.back();
    } else {
      const prev = state.step === FINAL_STEP ? 3 : state.step - 1;
      go(prev, { mode: 'replace', direction: 'back' });
    }
  }

  window.addEventListener('popstate', event => {
    let target = event.state && Number.isInteger(event.state.step)
      ? clamp(event.state.step)
      : clamp(state.step - 1);
    if (target === 4) target = 3;

    const direction = target < state.step ? 'back' : 'fwd';
    if (direction === 'back') historyDepth = Math.max(0, historyDepth - 1);
    else historyDepth += 1;

    go(target, { mode: 'none', direction });
  });

  function startLoader() {
    stopLoader();
    loaderFill.style.width = '0%';
    loaderPct.textContent = '0%';

    const startedAt = performance.now();
    const tick = now => {
      const ratio = Math.min(1, (now - startedAt) / LOADER_MS);
      const pct = Math.round(ratio * 100);
      loaderFill.style.width = `${pct}%`;
      loaderPct.textContent = `${pct}%`;
      if (ratio < 1) loaderRaf = requestAnimationFrame(tick);
    };
    loaderRaf = requestAnimationFrame(tick);
    loaderTimer = setTimeout(finishLoader, LOADER_MS);
  }

  function stopLoader() {
    clearTimeout(loaderTimer);
    cancelAnimationFrame(loaderRaf);
    loaderTimer = null;
    loaderRaf = null;
  }

  function finishLoader() {
    stopLoader();
    go(FINAL_STEP, { mode: 'replace', direction: 'fwd' });
  }

  document.addEventListener('click', event => {
    const option = event.target.closest('[data-field]');
    if (option) {
      if (locked) return;
      locked = true;
      state.answers[option.dataset.field] = option.dataset.value;
      saveState();
      render(null);
      setTimeout(() => go(state.step + 1, { mode: 'push', direction: 'fwd' }), 180);
      return;
    }

    if (event.target.closest('#backBtn')) goBack();
  });

  cta.addEventListener('click', event => {
    if (cta.getAttribute('href') === '#') event.preventDefault();
  });
  
  root.classList.remove('no-js');
  utm = captureUtm();
  history.replaceState({ step: state.step }, '', location.href);
  go(state.step, { mode: 'none', direction: null });
})();
