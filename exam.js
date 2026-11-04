/***********************
  exam.js (COMPLETE + FIXED)
  ✅ Keeps: tab-switch + (optional) blur proctoring, image modal zoom,
           palette states, save state, submit to Apps Script
  ✅ Includes: IST header + start/end lock + shuffle questions ONLY
  ✅ FIX: iOS Safari radio delay -> palette updates instantly
  ✅ FIX: Submit “Network error: Load failed” -> use text/plain (no CORS preflight)
  ✅ FIX: Result undefined -> compute & send score/correct/wrong/unattempted/timeTakenSec
  ✅ FIX: iPhone Fullscreen overlay should NOT count as violation
  ✅ FIX: Wrong answers marking (MARKS_WRONG = -1 works correctly)
  ✅ FIX: Login/refresh should NOT reset timer or violations (per-candidate+window key)
  ✅ FIX: startedAt / endedAt sent as exact Indian time using Asia/Kolkata
  ✅ FIX: violations are posted to Apps Script and saved in Violations sheet
***********************/

function safeParse(s){ try{ return JSON.parse(s) }catch{ return null } }

// ====== Candidate session ======
const cand = safeParse(localStorage.getItem("neet_candidate") || "");
if(!cand || !cand.token){
  location.replace("login.html");
}

// ✅ HARD STOP: if already submitted, do not load exam
if(localStorage.getItem("neet_submitted") === "yes"){
  location.replace("result.html");
}

// ====== iOS fullscreen/overlay violation suppression ======
let suppressVioUntil = 0;
function suppressViolations(ms = 2500){
  suppressVioUntil = Date.now() + ms;
}
function canCountViolation(){
  return Date.now() > suppressVioUntil;
}
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// ====== Exact Indian Time helper ======
function formatIndianTime(dateOrMs = Date.now()){
  const d = typeof dateOrMs === "number" ? new Date(dateOrMs) : dateOrMs;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).formatToParts(d);

  const get = (type) => parts.find(p => p.type === type)?.value || "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  const dayPeriod = (get("dayPeriod") || "").toUpperCase();

  return `${day}-${month}-${year} ${hour}:${minute}:${second} ${dayPeriod}`;
}

// ====== IST Header (clock + schedule) ======
const istClock   = document.getElementById("istClock");
const examStartEl= document.getElementById("examStartIST");
const examEndEl  = document.getElementById("examEndIST");

if (istClock && window.formatIST) {
  const tickIST = () => { istClock.textContent = window.formatIST(Date.now()); };
  tickIST();
  setInterval(tickIST, 1000);
} else if (istClock) {
  const tickIST = () => { istClock.textContent = formatIndianTime(Date.now()); };
  tickIST();
  setInterval(tickIST, 1000);
}

if (examStartEl && Number.isFinite(window.EXAM_START_MS) && window.formatIST) {
  examStartEl.textContent = window.formatIST(window.EXAM_START_MS);
} else if (examStartEl && Number.isFinite(window.EXAM_START_MS)) {
  examStartEl.textContent = formatIndianTime(window.EXAM_START_MS);
} else if (examStartEl) {
  examStartEl.textContent = "--";
}

if (examEndEl && Number.isFinite(window.EXAM_END_MS) && window.formatIST) {
  examEndEl.textContent = window.formatIST(window.EXAM_END_MS);
} else if (examEndEl && Number.isFinite(window.EXAM_END_MS)) {
  examEndEl.textContent = formatIndianTime(window.EXAM_END_MS);
} else if (examEndEl) {
  examEndEl.textContent = "--";
}

// ====== Exam Window Lock (IST) ======
function inWindow(now = Date.now()){
  if (typeof window.isWithinExamWindow !== "function") return true;
  return window.isWithinExamWindow(now);
}

if(!inWindow()){
  alert("Exam is not live now (check start/end time).");
  location.replace("instructions.html");
}

// ====== Questions (from questions.js) ======
const RAW = window.questions || [];

// ====== Shuffle helpers (seeded) ======
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seedStr) {
  const seed = xmur3(seedStr)();
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ✅ Build runtime questions with shuffle (QUESTIONS ONLY)
const seedKey = (cand?.candidateId || cand?.id || "guest") + "|" + (cand?.token || "t");

let Q = RAW.map((q, idx) => ({
  ...q,
  id: q.id ?? (idx + 1),
  options: [...(q.options || [])]
}));

Q = seededShuffle(Q, "Q|" + seedKey);
const totalQ = Q.length;

// ====== Elements ======
const elTime   = document.getElementById("timeLeft");
const elVio    = document.getElementById("vio");
const pal      = document.getElementById("pal");
const qTitle   = document.getElementById("qTitle");
const qText    = document.getElementById("qText");
const qImgWrap = document.getElementById("qImgWrap");
const opts     = document.getElementById("opts");

const prevBtn   = document.getElementById("prevBtn");
const nextBtn   = document.getElementById("nextBtn");
const clearBtn  = document.getElementById("clearBtn");
const markBtn   = document.getElementById("markBtn");
const submitBtn = document.getElementById("submitBtn");

// ==============================
// ✅ STORAGE KEY (Per candidate + exam window)
// ==============================
function buildStateKey(){
  const cid = String(cand?.candidateId || cand?.id || "guest");
  const startMs = Number.isFinite(window.EXAM_START_MS) ? window.EXAM_START_MS : 0;
  const endMs   = Number.isFinite(window.EXAM_END_MS) ? window.EXAM_END_MS : 0;
  return `neet_exam_state_${cid}_${startMs}_${endMs}`;
}

const KEY = buildStateKey();
const LEGACY_KEY = "neet_exam_state";

const defaultState = () => ({
  startedAt: Date.now(),
  current: 0,
  answers: {},
  marked: {},
  violations: 0
});

// Load state (new key)
let state = safeParse(localStorage.getItem(KEY) || "");

// One-time migrate if needed (ONLY if not submitted)
if(!state && localStorage.getItem("neet_submitted") !== "yes"){
  const legacy = safeParse(localStorage.getItem(LEGACY_KEY) || "");
  if(legacy && typeof legacy === "object" && Number.isFinite(legacy.startedAt)){
    localStorage.setItem(KEY, JSON.stringify(legacy));
    state = legacy;
  }
}

if(!state) state = defaultState();

// Hardening
if(!Number.isFinite(state.startedAt)) state.startedAt = Date.now();
if(!Number.isFinite(state.violations)) state.violations = 0;
if(!state.answers || typeof state.answers !== "object") state.answers = {};
if(!state.marked  || typeof state.marked  !== "object") state.marked  = {};
if (!Number.isFinite(state.current) || state.current < 0) state.current = 0;
if (state.current >= totalQ) state.current = Math.max(0, totalQ - 1);

const durationMs = (window.EXAM_DURATION_MIN || 60) * 60 * 1000;

function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function pad2(n){ return String(n).padStart(2,"0"); }

let submitted = false;

// ====== Scoring ======
function calcResult(){
  let correct = 0, wrong = 0, unattempted = 0;
  for(const q of Q){
    const picked = state.answers[q.id];
    if(picked === undefined){ unattempted++; continue; }
    if(Number(picked) === Number(q.answerIndex)) correct++;
    else wrong++;
  }
  const plus = Number.isFinite(window.MARKS_CORRECT) ? Number(window.MARKS_CORRECT) : 4;
  let wrongMark = Number.isFinite(window.MARKS_WRONG) ? Number(window.MARKS_WRONG) : -1;
  if (wrongMark > 0) wrongMark = -wrongMark;

  const score = (correct * plus) + (wrong * wrongMark);
  const timeTakenSec = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  return { score, correct, wrong, unattempted, timeTakenSec };
}

function updateTimer(){
  if (submitted) return;

  if(!inWindow()){
    submitExam(true, "TIME_WINDOW_ENDED");
    return;
  }

  const elapsed = Date.now() - state.startedAt;
  const left = Math.max(0, durationMs - elapsed);

  const totalSec = Math.floor(left / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;

  if (elTime) elTime.textContent = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;

  if(left <= 0) submitExam(true, "DURATION_ENDED");
}

function palClass(qid){
  const a = state.answers[qid];
  const m = !!state.marked[qid];
  if(a === undefined && !m) return "pbtn unanswered";
  if(a !== undefined && !m) return "pbtn answered";
  if(a === undefined && m) return "pbtn review";
  return "pbtn ansreview";
}

function renderPalette(){
  if(!pal) return;
  pal.innerHTML = "";
  Q.forEach((q, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = idx + 1;
    b.className = palClass(q.id) + (idx===state.current ? " current":"");
    b.addEventListener("click", () => {
      state.current = idx;
      save();
      render();
    });
    pal.appendChild(b);
  });
}

/* =======================
   IMAGE MODAL (ZOOM)
======================= */
const imgModal    = document.getElementById("imgModal");
const imgModalPic = document.getElementById("imgModalPic");
const imgCloseBtn = document.getElementById("imgCloseBtn");
const imgFullBtn  = document.getElementById("imgFullBtn");

function openImgModal(src){
  if(!imgModal || !imgModalPic) return;
  imgModalPic.src = src;
  imgModal.classList.add("show");
  imgModal.setAttribute("aria-hidden", "false");
}
function closeImgModal(){
  if(!imgModal) return;
  imgModal.classList.remove("show");
  imgModal.setAttribute("aria-hidden", "true");
}
if(imgCloseBtn) imgCloseBtn.addEventListener("click", closeImgModal);
if(imgModal){
  imgModal.addEventListener("click", (e) => {
    if (e.target === imgModal) closeImgModal();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeImgModal();
});
if(imgFullBtn){
  imgFullBtn.addEventListener("click", async () => {
    suppressViolations(4000);
    try{
      if (imgModalPic && imgModalPic.requestFullscreen) await imgModalPic.requestFullscreen();
      else if (imgModal && imgModal.requestFullscreen) await imgModal.requestFullscreen();
      else alert("Fullscreen not supported on this device/browser.");
    }catch(err){
      alert("Fullscreen blocked: " + err.message);
    }
  });
}

// ====== Answer helpers ======
function setAnswer(qid, idx){
  state.answers[qid] = idx;
  save();
  renderPalette();
}
function clearAnswer(qid){
  delete state.answers[qid];
  save();
  renderPalette();
}
function toggleMark(qid){
  state.marked[qid] = !state.marked[qid];
  save();
  renderPalette();
}

// ====== Render ======
function render(){
  const q = Q[state.current];
  if(!q) return;

  if(qTitle) qTitle.textContent = `Question ${state.current+1} of ${totalQ}`;
  if(qText) qText.textContent = q.question || "";

  if(qImgWrap){
    qImgWrap.innerHTML = "";
    if (q.image) {
      const img = document.createElement("img");
      img.src = q.image;
      img.alt = "Question image";
      img.title = "Tap to zoom";
      img.addEventListener("click", () => openImgModal(q.image));
      qImgWrap.appendChild(img);
    }
  }

  if(opts){
    opts.innerHTML = "";
    const picked = state.answers[q.id];

    (q.options || []).forEach((text, i) => {
      const row = document.createElement("label");
      row.className = "opt";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "opt";
      radio.value = String(i);
      radio.checked = (picked === i);

      const span = document.createElement("span");
      span.className = "optText";
      span.textContent = text;

      const choose = (e) => {
        e.preventDefault();
        radio.checked = true;
        setAnswer(q.id, i);
      };

      row.addEventListener("pointerdown", choose, {passive:false});
      row.addEventListener("touchstart", choose, {passive:false});
      row.addEventListener("click", () => {
        if (picked !== i) setAnswer(q.id, i);
      });

      row.appendChild(radio);
      row.appendChild(span);
      opts.appendChild(row);
    });
  }

  if(elVio) elVio.textContent = String(state.violations || 0);

  if(prevBtn) prevBtn.disabled = state.current <= 0;
  if(nextBtn) nextBtn.disabled = state.current >= totalQ - 1;

  if(markBtn){
    const isMarked = !!state.marked[q.id];
    markBtn.textContent = isMarked ? "Unmark" : "Mark for Review";
  }

  renderPalette();
}

// ====== Controls ======
if(prevBtn){
  prevBtn.addEventListener("click", () => {
    if(state.current > 0){
      state.current -= 1;
      save();
      render();
    }
  });
}
if(nextBtn){
  nextBtn.addEventListener("click", () => {
    if(state.current < totalQ - 1){
      state.current += 1;
      save();
      render();
    }
  });
}
if(clearBtn){
  clearBtn.addEventListener("click", () => {
    const q = Q[state.current];
    if(!q) return;
    clearAnswer(q.id);
    render();
  });
}
if(markBtn){
  markBtn.addEventListener("click", () => {
    const q = Q[state.current];
    if(!q) return;
    toggleMark(q.id);
    render();
  });
}
if(submitBtn){
  submitBtn.addEventListener("click", () => {
    if(confirm("Submit exam now?")){
      submitExam(false, "MANUAL_SUBMIT");
    }
  });
}

// ====== API helpers ======
async function postAPI(payload){
  const API_URL = window.API_URL || window.EXAM_API_URL || "";
  if(!API_URL) throw new Error("API_URL not set in config.js");

  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 15000);

  try{
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: ctrl.signal
    });

    const txt = await res.text();
    let data = {};
    try{ data = JSON.parse(txt); }catch{ data = { ok:false, error:"Bad JSON", raw:txt }; }

    if(!res.ok) throw new Error((data && (data.error||data.message)) || ("HTTP " + res.status));
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function postViolation(type, details = ""){
  try{
    await postAPI({
      action: "violation",
      token: cand.token,
      candidateId: cand.candidateId || cand.id || "",
      type,
      details
    });
  }catch(err){
    console.log("Violation log failed:", err);
  }
}

// ====== Proctoring ======
function addViolation(reason){
  if(!canCountViolation()) return;

  state.violations = (state.violations || 0) + 1;
  save();
  if(elVio) elVio.textContent = String(state.violations);

  postViolation(reason, `Violation detected during exam. Count=${state.violations}`);

  if(window.PROCTOR_BLUR === true){
    document.body.classList.add("proctor-blur");
    setTimeout(() => document.body.classList.remove("proctor-blur"), 1500);
  }

  const maxV = Number.isFinite(window.MAX_VIOLATIONS) ? window.MAX_VIOLATIONS : null;
  if(maxV && state.violations >= maxV){
    submitExam(true, "MAX_VIOLATIONS");
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") addViolation("TAB_SWITCH");
});
window.addEventListener("blur", () => {
  if(IS_IOS) return;
  addViolation("WINDOW_BLUR");
});

// ====== Submit ======
async function submitExam(isAuto=false, reason="SUBMIT"){
  if(submitted) return;
  submitted = true;

  try{
    if(submitBtn) submitBtn.disabled = true;
    if(prevBtn) prevBtn.disabled = true;
    if(nextBtn) nextBtn.disabled = true;
    if(clearBtn) clearBtn.disabled = true;
    if(markBtn) markBtn.disabled = true;
  }catch{}

  const candidateId = cand.candidateId || cand.id || "";
  const r = calcResult();

  const payload = {
    action: "submit",
    token: cand.token,
    candidateId,
    payload: {
      name: cand.name || "",
      phone: cand.phone || "",
      email: cand.email || "",
      score: r.score,
      correct: r.correct,
      wrong: r.wrong,
      unattempted: r.unattempted,
      timeTakenSec: r.timeTakenSec,
      startedAt: formatIndianTime(state.startedAt),
      endedAt: formatIndianTime(Date.now()),
      durationMin: (window.EXAM_DURATION_MIN || 60),
      reason,
      isAuto: !!isAuto,
      violations: state.violations || 0,
      answers: state.answers || {},
      marked: state.marked || {},
      qOrder: Q.map(x => x.id),
      userAgent: navigator.userAgent || ""
    }
  };

  try{
    const data = await postAPI(payload);

    if(data.ok === false){
      alert(data.error || data.message || "Submit failed");
      submitted = false;
      try{ if(submitBtn) submitBtn.disabled = false; }catch{}
      return;
    }

    localStorage.setItem("neet_submitted", "yes");
    localStorage.setItem("neet_result", JSON.stringify({
      name: cand.name || "",
      candidateId,
      score: r.score,
      correct: r.correct,
      wrong: r.wrong,
      unattempted: r.unattempted,
      timeTakenSec: r.timeTakenSec,
      violations: state.violations || 0,
      startedAt: formatIndianTime(state.startedAt),
      endedAt: formatIndianTime(Date.now())
    }));

    try{ localStorage.removeItem(KEY); }catch{}
    try{ localStorage.removeItem(LEGACY_KEY); }catch{}

    location.replace("result.html");

  }catch(err){
    alert("Network error: " + (err && err.message ? err.message : err));
    submitted = false;
    try{ if(submitBtn) submitBtn.disabled = false; }catch{}
  }
}

// ====== Start ======
(function init(){
  if(!Array.isArray(Q) || Q.length === 0){
    alert("Questions not loaded. Check questions.js link in exam.html");
    return;
  }
  updateTimer();
  setInterval(updateTimer, 1000);
  render();
})();
