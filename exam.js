
/***********************
 * exam.js - SECURE SERVER-SCORED VERSION
 *
 * Preserves the existing CBT UI element IDs, palette, image zoom,
 * local answer save, IST display and client-side violation detection.
 * Questions/options are fetched from Apps Script. No answer key or
 * client-side scoring is present in this file.
 ***********************/

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

const cand = safeParse(localStorage.getItem('neet_candidate') || '');

if (!cand || !cand.token) {
  location.replace('login.html');
  throw new Error('Candidate session missing; redirecting to login.');
}

if (localStorage.getItem('neet_submitted') === 'yes') {
  location.replace('result.html');
  throw new Error('This candidate has already submitted; redirecting to result.');
}

let Q = [];
let totalQ = 0;
let state = null;
let submitted = false;
let serverEndsAtMs = 0;
let serverStartedAtMs = 0;
let serverClockOffsetMs = 0;
let attemptReady = false;
let suppressVioUntil = 0;

function suppressViolations(ms = 2500) {
  suppressVioUntil = Date.now() + ms;
}

function canCountViolation() {
  return Date.now() > suppressVioUntil;
}

const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

function formatIndianTime(dateOrMs = Date.now()) {
  const d = typeof dateOrMs === 'number'
    ? new Date(dateOrMs)
    : dateOrMs;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).formatToParts(d);

  const get = t => parts.find(p => p.type === t)?.value || '';

  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')} ${(get('dayPeriod') || '').toUpperCase()}`;
}

// IST header/schedule are display-only.
// Server time is authoritative for the attempt.

const istClock = document.getElementById('istClock');
const examStartEl = document.getElementById('examStartIST');
const examEndEl = document.getElementById('examEndIST');

if (istClock) {
  const tick = () => {
    istClock.textContent = window.formatIST
      ? window.formatIST(Date.now())
      : formatIndianTime(Date.now());
  };

  tick();
  setInterval(tick, 1000);
}

if (examStartEl) {
  examStartEl.textContent = Number.isFinite(window.EXAM_START_MS)
    ? (window.formatIST
        ? window.formatIST(window.EXAM_START_MS)
        : formatIndianTime(window.EXAM_START_MS))
    : '--';
}

if (examEndEl) {
  examEndEl.textContent = Number.isFinite(window.EXAM_END_MS)
    ? (window.formatIST
        ? window.formatIST(window.EXAM_END_MS)
        : formatIndianTime(window.EXAM_END_MS))
    : '--';
}

const elTime = document.getElementById('timeLeft');
const elVio = document.getElementById('vio');
const pal = document.getElementById('pal');
const qTitle = document.getElementById('qTitle');
const qText = document.getElementById('qText');
const qImgWrap = document.getElementById('qImgWrap');
const opts = document.getElementById('opts');

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const clearBtn = document.getElementById('clearBtn');
const markBtn = document.getElementById('markBtn');
const submitBtn = document.getElementById('submitBtn');

const imgModal = document.getElementById('imgModal');
const imgModalPic = document.getElementById('imgModalPic');
const imgCloseBtn = document.getElementById('imgCloseBtn');
const imgFullBtn = document.getElementById('imgFullBtn');

function buildStateKey() {
  const cid = String(cand?.candidateId || cand?.id || 'guest');

  const startMs = Number.isFinite(window.EXAM_START_MS)
    ? window.EXAM_START_MS
    : 0;

  const endMs = Number.isFinite(window.EXAM_END_MS)
    ? window.EXAM_END_MS
    : 0;

  return `neet_exam_state_${cid}_${startMs}_${endMs}`;
}

const KEY = buildStateKey();
const LEGACY_KEY = 'neet_exam_state';

function defaultState() {
  return {
    startedAt: serverStartedAtMs,
    current: 0,
    answers: {},
    marked: {},
    violations: 0
  };
}

function save() {
  if (state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

async function postAPI(payload) {
  const API_URL = window.API_URL || window.EXAM_API_URL || '';

  if (!API_URL) {
    throw new Error('API_URL not set in config.js');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: ctrl.signal
    });

    const txt = await res.text();

    let data;

    try {
      data = JSON.parse(txt);
    } catch (e) {
      throw new Error(
        'Apps Script returned an invalid response. Check the web-app deployment.'
      );
    }

    if (!res.ok || data.ok === false) {
      throw new Error(
        data.error || data.message || ('HTTP ' + res.status)
      );
    }

    return data;

  } finally {
    clearTimeout(timer);
  }
}

function loadLocalState() {
  // Do not migrate the old global state key into a server-managed attempt.
  // It may contain answers from a different exam or question ordering.

  let loaded = safeParse(localStorage.getItem(KEY) || '');

  if (!loaded || typeof loaded !== 'object') {
    loaded = defaultState();
  }

  if (!loaded.answers || typeof loaded.answers !== 'object') {
    loaded.answers = {};
  }

  if (!loaded.marked || typeof loaded.marked !== 'object') {
    loaded.marked = {};
  }

  if (!Number.isFinite(loaded.current) || loaded.current < 0) {
    loaded.current = 0;
  }

  if (loaded.current >= totalQ) {
    loaded.current = Math.max(0, totalQ - 1);
  }

  if (!Number.isFinite(loaded.violations)) {
    loaded.violations = 0;
  }

  loaded.startedAt = serverStartedAtMs;

  // Keep only this server-issued attempt's question IDs
  // and valid option IDs.

  const allowedIds = new Set(Q.map(q => String(q.id)));

  Object.keys(loaded.answers).forEach(id => {
    if (
      !allowedIds.has(String(id)) ||
      !['A', 'B', 'C', 'D'].includes(
        String(loaded.answers[id]).toUpperCase()
      )
    ) {
      delete loaded.answers[id];
    } else {
      loaded.answers[id] = String(loaded.answers[id]).toUpperCase();
    }
  });

  Object.keys(loaded.marked).forEach(id => {
    if (!allowedIds.has(String(id))) {
      delete loaded.marked[id];
    } else {
      loaded.marked[id] = loaded.marked[id] === true;
    }
  });

  state = loaded;
  save();

  // Remove the obsolete shared key.
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {}
}

function palClass(qid) {
  const a = state.answers[qid];
  const m = !!state.marked[qid];

  if (a === undefined && !m) return 'pbtn unanswered';
  if (a !== undefined && !m) return 'pbtn answered';
  if (a === undefined && m) return 'pbtn review';

  return 'pbtn ansreview';
}

function renderPalette() {
  if (!pal || !state) return;

  pal.innerHTML = '';

  Q.forEach((q, idx) => {
    const b = document.createElement('button');

    b.type = 'button';
    b.textContent = idx + 1;
    b.className = palClass(q.id) +
      (idx === state.current ? ' current' : '');

    b.addEventListener('click', () => {
      state.current = idx;
      save();
      render();
    });

    pal.appendChild(b);
  });
}

function openImgModal(src) {
  if (!imgModal || !imgModalPic) return;

  imgModalPic.src = src;
  imgModal.classList.add('show');
  imgModal.setAttribute('aria-hidden', 'false');
}

function closeImgModal() {
  if (!imgModal) return;

  imgModal.classList.remove('show');
  imgModal.setAttribute('aria-hidden', 'true');

  if (imgModalPic) {
    imgModalPic.removeAttribute('src');
  }
}

if (imgCloseBtn) {
  imgCloseBtn.addEventListener('click', closeImgModal);
}

if (imgModal) {
  imgModal.addEventListener('click', e => {
    if (e.target === imgModal) closeImgModal();
  });
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeImgModal();
});

if (imgFullBtn) {
  imgFullBtn.addEventListener('click', async () => {
    suppressViolations(4000);

    try {
      if (imgModalPic && imgModalPic.requestFullscreen) {
        await imgModalPic.requestFullscreen();
      } else if (imgModal && imgModal.requestFullscreen) {
        await imgModal.requestFullscreen();
      } else {
        alert('Fullscreen not supported on this device/browser.');
      }
    } catch (err) {
      alert('Fullscreen blocked: ' + err.message);
    }
  });
}

function setAnswer(qid, optionId) {
  if (!state) return;

  state.answers[qid] = String(optionId).toUpperCase();

  save();
  renderPalette();
}

function clearAnswer(qid) {
  delete state.answers[qid];

  save();
  renderPalette();
}

function toggleMark(qid) {
  state.marked[qid] = !state.marked[qid];

  save();
  renderPalette();
}

function render() {
  if (!state) return;

  const q = Q[state.current];

  if (!q) return;

  if (qTitle) {
    qTitle.textContent = `Question ${state.current + 1} of ${totalQ}`;
  }

  if (qText) {
    qText.textContent = q.question || '';
  }

  if (qImgWrap) {
    qImgWrap.innerHTML = '';

    if (q.image) {
      const img = document.createElement('img');

      img.src = q.image;
      img.alt = 'Question image';
      img.title = 'Tap to zoom';

      img.addEventListener('click', () => openImgModal(q.image));

      qImgWrap.appendChild(img);
    }
  }

  if (opts) {
    opts.innerHTML = '';

    const picked = state.answers[q.id];

    (q.options || []).forEach(option => {
      const row = document.createElement('label');
      row.className = 'opt';

      const radio = document.createElement('input');

      radio.type = 'radio';
      radio.name = 'opt';
      radio.value = option.id;
      radio.checked = (picked === option.id);

      const span = document.createElement('span');

      span.className = 'optText';
      span.textContent = option.text;

      const choose = e => {
        e.preventDefault();
        radio.checked = true;
        setAnswer(q.id, option.id);
      };

      row.addEventListener('pointerdown', choose, {
        passive: false
      });

      row.addEventListener('touchstart', choose, {
        passive: false
      });

      row.addEventListener('click', () => {
        if (state.answers[q.id] !== option.id) {
          setAnswer(q.id, option.id);
        }
      });

      row.appendChild(radio);
      row.appendChild(span);

      opts.appendChild(row);
    });
  }

  if (elVio) {
    elVio.textContent = String(state.violations || 0);
  }

  if (prevBtn) {
    prevBtn.disabled = state.current <= 0;
  }

  if (nextBtn) {
    nextBtn.disabled = state.current >= totalQ - 1;
  }

  if (markBtn) {
    markBtn.textContent = state.marked[q.id]
      ? 'Unmark'
      : 'Mark for Review';
  }

  renderPalette();
}

if (prevBtn) {
  prevBtn.addEventListener('click', () => {
    if (state && state.current > 0) {
      state.current--;
      save();
      render();
    }
  });
}

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    if (state && state.current < totalQ - 1) {
      state.current++;
      save();
      render();
    }
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    const q = Q[state?.current];

    if (q) {
      clearAnswer(q.id);
      render();
    }
  });
}

if (markBtn) {
  markBtn.addEventListener('click', () => {
    const q = Q[state?.current];

    if (q) {
      toggleMark(q.id);
      render();
    }
  });
}

if (submitBtn) {
  submitBtn.addEventListener('click', () => {
    if (confirm('Submit exam now?')) {
      submitExam(false, 'MANUAL_SUBMIT');
    }
  });
}

async function postViolation(type, details = '') {
  if (!attemptReady) return;

  try {
    const data = await postAPI({
      action: 'violation',
      token: cand.token,
      candidateId: cand.candidateId || cand.id || '',
      type,
      details
    });

    if (Number.isFinite(Number(data.violationCount))) {
      state.violations = Number(data.violationCount);
    }

    save();

    if (elVio) {
      elVio.textContent = String(state.violations || 0);
    }

  } catch (err) {
    console.warn('Violation log failed:', err);
  }
}

function addViolation(reason) {
  if (!canCountViolation() || !state || !attemptReady) return;

  state.violations = (state.violations || 0) + 1;

  save();

  if (elVio) {
    elVio.textContent = String(state.violations);
  }

  postViolation(
    reason,
    `Visibility/focus event during exam. Local count=${state.violations}`
  );

  if (window.PROCTOR_BLUR === true) {
    document.body.classList.add('proctor-blur');

    setTimeout(() => {
      document.body.classList.remove('proctor-blur');
    }, 1500);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    addViolation('TAB_SWITCH');
  }
});

window.addEventListener('blur', () => {
  if (!IS_IOS) {
    addViolation('WINDOW_BLUR');
  }
});

function updateTimer() {
  if (submitted || !attemptReady) return;

  const estimatedServerNow = Date.now() + serverClockOffsetMs;
  const left = Math.max(0, serverEndsAtMs - estimatedServerNow);

  const secs = Math.floor(left / 1000);
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;

  if (elTime) {
    elTime.textContent =
      `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }

  if (left <= 0) {
    submitExam(true, 'SERVER_DEADLINE_REACHED');
  }
}

async function submitExam(isAuto = false, reason = 'SUBMIT') {
  if (submitted || !attemptReady || !state) return;

  submitted = true;

  [submitBtn, prevBtn, nextBtn, clearBtn, markBtn].forEach(b => {
    if (b) b.disabled = true;
  });

  try {
    // Only selected option IDs and review markers leave the browser.

    const data = await postAPI({
      action: 'submit',
      token: cand.token,
      candidateId: cand.candidateId || cand.id || '',
      answers: state.answers || {},
      marked: state.marked || {},
      reason,
      isAuto: !!isAuto,
      userAgent: navigator.userAgent || ''
    });

    const result = {
      name: data.name || cand.name || '',
      candidateId: data.candidateId ||
        cand.candidateId || cand.id || '',
      score: data.score,
      correct: data.correct,
      wrong: data.wrong,
      unattempted: data.unattempted,
      totalQuestions: data.totalQuestions,
      timeTakenSec: data.timeTakenSec,
      violations: (
        data.violations !== undefined
          ? data.violations
          : (
              data.violationCount !== undefined
                ? data.violationCount
                : (state.violations || 0)
            )
      ),
      startedAt: data.startedAt ||
        formatIndianTime(serverStartedAtMs),
      endedAt: data.endedAt ||
        formatIndianTime(Date.now())
    };

    localStorage.setItem('neet_submitted', 'yes');
    localStorage.setItem('neet_result', JSON.stringify(result));

    try {
      localStorage.removeItem(KEY);
    } catch (e) {}

    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {}

    location.replace('result.html');

  } catch (err) {
    alert(
      'Submission failed: ' +
      (err && err.message ? err.message : err)
    );

    submitted = false;

    [submitBtn, prevBtn, nextBtn, clearBtn, markBtn].forEach(b => {
      if (b) b.disabled = false;
    });
  }
}

async function init() {
  try {
    const data = await postAPI({
      action: 'startExam',
      token: cand.token,
      candidateId: cand.candidateId || cand.id || ''
    });

    if (data.alreadySubmitted) {
      localStorage.setItem('neet_submitted', 'yes');
      localStorage.setItem('neet_result', JSON.stringify(data));

      location.replace('result.html');
      return;
    }

    if (!Array.isArray(data.questions) || !data.questions.length) {
      throw new Error(
        'No questions were returned by the secure question service.'
      );
    }

    Q = data.questions;
    totalQ = Q.length;

    serverStartedAtMs = new Date(data.startedAtISO).getTime();

    serverClockOffsetMs = data.serverNowISO
      ? new Date(data.serverNowISO).getTime() - Date.now()
      : 0;

    serverEndsAtMs = new Date(data.endsAtISO).getTime();

    if (
      !Number.isFinite(serverStartedAtMs) ||
      !Number.isFinite(serverEndsAtMs) ||
      serverEndsAtMs <= serverStartedAtMs
    ) {
      throw new Error(
        'Invalid exam timing received from server.'
      );
    }

    loadLocalState();

    state.violations = Math.max(
      Number(state.violations) || 0,
      Number(data.violationCount) || 0
    );

    attemptReady = true;

    save();

    if (!inExamWindowDisplayOnly()) {
      console.warn(
        'Local schedule differs from server schedule; server schedule is authoritative.'
      );
    }

    updateTimer();

    setInterval(updateTimer, 1000);

    render();

  } catch (err) {
    alert(
      'Unable to start examination: ' +
      (err && err.message ? err.message : err)
    );

    if (submitBtn) {
      submitBtn.disabled = true;
    }
  }
}

function inExamWindowDisplayOnly() {
  // Informational only. Apps Script enforces the real schedule.

  if (typeof window.isWithinExamWindow !== 'function') {
    return true;
  }

  return window.isWithinExamWindow(Date.now());
}

init();
