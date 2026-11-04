/***************
 NEET-PG CBT ENGINE + BASIC PROCTORING + GOOGLE SHEET SUBMIT
****************/

const API_URL = "https://script.google.com/macros/s/AKfycbwyFqjWYNDeC6H2TAbwSO0wld-9-DgsU-Kq7UGYzSoj4-2gYrr0Yu8tipL1uEPm2Ybnkw/exec";

// ===== Candidate gate (must be logged in) =====
function safeJsonParse(str){ try { return JSON.parse(str); } catch { return null; } }
function getCandidate(){ return safeJsonParse(localStorage.getItem("neet_candidate") || ""); }

const candidate = getCandidate();
if (!candidate || !candidate.token || !candidate.id) window.location.href = "login.html";

// ====== CONFIG ======
const EXAM = {
  durationSec: 3 * 60 * 60,
  plusMarks: 4,
  minusMarks: 1,
  maxViolations: 3,
  blockBack: true
};

const LS_KEY = "neet_cbt_state_v2";
let state = null;

const el = (id) => document.getElementById(id);
function nowMs(){ return Date.now(); }

function nowIST(){
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function initState() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    const parsed = safeJsonParse(saved);
    if (parsed && parsed.questionsHash === QUESTIONS.length && !parsed.submitted) return parsed;
  }

  const start = nowMs();
  return {
    questionsHash: QUESTIONS.length,
    startedAt: start,
    endsAt: start + EXAM.durationSec * 1000,
    currentIndex: 0,
    violations: 0,
    violationShots: [],  // local only
    _lastViolationAt: 0,
    submitted: false,
    _uploaded: false,
    result: null,
    q: QUESTIONS.map(() => ({
      visited: false,
      marked: false,
      selectedIndex: null,
      status: "NotVisited"
    }))
  };
}

function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

function formatTime(sec){
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function remainingSeconds(){
  const rem = state.endsAt - nowMs();
  return Math.max(0, Math.floor(rem/1000));
}

function updateTimerUI(){
  const rem = remainingSeconds();
  if (el("timeLeft")) el("timeLeft").textContent = formatTime(rem);
  if (rem <= 0 && !state.submitted) submitExam("Time Up");
}

function computeStatus(i){
  const q = state.q[i];
  if (!q.visited) return "NotVisited";
  const hasAns = q.selectedIndex !== null;
  if (q.marked && hasAns) return "AnsweredMarked";
  if (q.marked && !hasAns) return "MarkedNoAns";
  if (!q.marked && hasAns) return "Answered";
  return "NotAnswered";
}

function refreshStatuses(){ state.q.forEach((_,i)=> state.q[i].status = computeStatus(i)); }

function renderPalette(){
  const grid = el("paletteGrid");
  if (!grid) return;
  grid.innerHTML = "";

  for (let i=0;i<QUESTIONS.length;i++){
    const b = document.createElement("button");
    b.className = "pal-btn";
    b.textContent = i+1;

    const st = state.q[i].status;
    if (st === "NotVisited") b.classList.add("pal-gray");
    if (st === "NotAnswered") b.classList.add("pal-red");
    if (st === "Answered") b.classList.add("pal-green");
    if (st === "AnsweredMarked") b.classList.add("pal-purple");
    if (st === "MarkedNoAns") b.classList.add("pal-orange");
    if (i === state.currentIndex) b.classList.add("pal-current");

    b.addEventListener("click", ()=> goTo(i));
    grid.appendChild(b);
  }
}

function renderQuestion(){
  const i = state.currentIndex;
  const qObj = QUESTIONS[i];
  const qs = state.q[i];
  qs.visited = true;

  if (el("qNo")) el("qNo").textContent = `Question ${i+1}`;
  if (el("questionText")) el("questionText").textContent = qObj.text;

  const wrap = el("options");
  if (!wrap) return;
  wrap.innerHTML = "";

  qObj.options.forEach((opt, idx) => {
    const label = document.createElement("label");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "opt";
    radio.value = idx;
    if (qs.selectedIndex === idx) radio.checked = true;

    radio.addEventListener("change", () => {
      qs.selectedIndex = idx;
      refreshStatuses();
      renderPalette();
      saveState();
    });

    const span = document.createElement("div");
    span.className = "optText";
    span.textContent = `${String.fromCharCode(65+idx)}. ${opt}`;

    label.appendChild(radio);
    label.appendChild(span);
    wrap.appendChild(label);
  });

  refreshStatuses();
  renderPalette();
  saveState();
}

function goTo(i){
  if (i<0 || i>=QUESTIONS.length) return;
  state.currentIndex = i;
  renderQuestion();
}

function prev(){ if (state.currentIndex>0) goTo(state.currentIndex-1); }

function clearResponse(){
  state.q[state.currentIndex].selectedIndex = null;
  refreshStatuses();
  renderQuestion();
}

function toggleMarkForReview(){
  const qs = state.q[state.currentIndex];
  qs.marked = !qs.marked;
  refreshStatuses();
  renderPalette();
  saveState();
}

function saveAndNext(){
  refreshStatuses();
  saveState();
  if (state.currentIndex < QUESTIONS.length-1) goTo(state.currentIndex+1);
}

/*************** PROCTORING ***************/
function updateViolationUI(){
  if (el("violationsCount")) el("violationsCount").textContent = String(state.violations);
}

async function captureScreenshot(){
  // optional: include html2canvas in index.html if you want screenshots
  try{
    if (typeof html2canvas === "undefined") return;
    const canvas = await html2canvas(document.body, {useCORS:true, logging:false, scale:1});
    const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
    state.violationShots.push({ at: nowIST(), dataUrl });
    saveState();
  }catch{}
}

async function addViolation(reason){
  if (state.submitted) return;
  const t = nowMs();
  if (t - (state._lastViolationAt || 0) < 900) return;
  state._lastViolationAt = t;

  state.violations++;
  updateViolationUI();

  if (el("proctorNote")) {
    el("proctorNote").textContent =
      `⚠️ Proctoring Alert: ${reason}. Violations: ${state.violations}/${EXAM.maxViolations}`;
  }

  await captureScreenshot();
  saveState();

  if (state.violations >= EXAM.maxViolations) submitExam(`Auto-submitted: ${state.violations} violations`);
}

function setupProctoring(){
  document.addEventListener("contextmenu",(e)=>e.preventDefault());
  document.addEventListener("copy",(e)=>e.preventDefault());
  document.addEventListener("cut",(e)=>e.preventDefault());
  document.addEventListener("paste",(e)=>e.preventDefault());

  document.addEventListener("visibilitychange",()=>{ if (document.hidden) addViolation("Tab/App switched"); });
  window.addEventListener("blur",()=> addViolation("Left exam window"));

  if (EXAM.blockBack) {
    history.pushState(null, "", location.href);
    window.addEventListener("popstate", () => {
      addViolation("Back button pressed");
      history.pushState(null, "", location.href);
    });
  }
}

/*************** SCORING & SUBMIT ***************/
function scoreExam(){
  let correct=0, wrong=0, unattempted=0;
  state.q.forEach((qs,i)=>{
    const key = QUESTIONS[i].correctIndex;
    if (qs.selectedIndex === null) unattempted++;
    else if (qs.selectedIndex === key) correct++;
    else wrong++;
  });
  const marks = (correct * EXAM.plusMarks) - (wrong * EXAM.minusMarks);
  const total = QUESTIONS.length * EXAM.plusMarks;
  return { correct, wrong, unattempted, marks, total };
}

async function postResultToSheet(){
  try{
    const cand = getCandidate();
    if (!cand) return;

    const payload = {
      action: "submit",
      token: cand.token,
      id: cand.id,
      name: cand.name || "",
      result: state.result,
      userAgent: navigator.userAgent
    };

    const res = await fetch(API_URL, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    const data = safeJsonParse(text);

    state._uploaded = !!(data && data.ok === true && (data.status === "saved" || data.status === "already_submitted"));
    saveState();
  }catch{
    state._uploaded = false;
    saveState();
  }
}

async function submitExam(reason="Submitted"){
  if (state.submitted) return;

  refreshStatuses();
  const result = scoreExam();

  state.submitted = true;
  state.result = {
    reason,
    ...result,
    submittedAt: nowIST(),
    violations: state.violations
  };

  saveState();
  await postResultToSheet();
  window.location.href = "result.html";
}

/*************** UI BIND ***************/
function bindUI(){
  el("btnPrev")?.addEventListener("click", prev);
  el("btnClear")?.addEventListener("click", clearResponse);
  el("btnMark")?.addEventListener("click", toggleMarkForReview);
  el("btnSaveNext")?.addEventListener("click", saveAndNext);
  el("btnSubmit")?.addEventListener("click", ()=> submitExam("Manual Submit"));
}

/*************** BOOT ***************/
(function boot(){
  if (!Array.isArray(window.QUESTIONS) || QUESTIONS.length === 0) {
    alert("QUESTIONS not loaded. Check questions.js script link in index.html.");
    return;
  }
  state = initState();
  updateViolationUI();
  bindUI();
  setupProctoring();

  updateTimerUI();
  setInterval(updateTimerUI, 1000);

  goTo(state.currentIndex);
})();
