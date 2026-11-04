// ==============================
// config.js
// ==============================

// ✅ Google Apps Script Web App URL
window.API_URL =
  "https://script.google.com/macros/s/AKfycbxvFcqf2Txf0cOVKL5t-e7T6tZdY6AL6WpMHmKyZiYEer-yyjWpe2spqCQpUTgQTkCX/exec";

// ✅ Backup name used by some pages
window.SCRIPT_URL = window.API_URL;

// ==============================
// ✅ Exam settings
// ==============================

window.EXAM_DURATION_MIN = 180;
window.EXAM_DURATION_SECONDS = window.EXAM_DURATION_MIN * 60;

window.MARKS_CORRECT = 4;
window.MARKS_WRONG = -1;

// ==============================
// ✅ EXAM SCHEDULE - IST
// ==============================

window.EXAM_TZ = "Asia/Kolkata";

// ✅ Fixed exam window in IST
window.EXAM_START_IST = "2026-08-27T10:00:00+05:30";
window.EXAM_END_IST   = "2026-09-27T13:30:00+05:30";

// ✅ Parsed milliseconds
window.EXAM_START_MS = Date.parse(window.EXAM_START_IST);
window.EXAM_END_MS   = Date.parse(window.EXAM_END_IST);

// ==============================
// ✅ Format date/time in IST
// ==============================

window.formatIST = function formatIST(dateOrMs = Date.now()) {
  const d = typeof dateOrMs === "number" ? new Date(dateOrMs) : dateOrMs;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: window.EXAM_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(d);
};

// ==============================
// ✅ Check exam window
// ==============================

window.isWithinExamWindow = function isWithinExamWindow(nowMs = Date.now()) {
  if (
    !Number.isFinite(window.EXAM_START_MS) ||
    !Number.isFinite(window.EXAM_END_MS)
  ) {
    return true;
  }

  return nowMs >= window.EXAM_START_MS && nowMs <= window.EXAM_END_MS;
};

// ==============================
// ✅ Useful status function
// ==============================

window.getExamStatus = function getExamStatus(nowMs = Date.now()) {
  if (nowMs < window.EXAM_START_MS) {
    return "not_started";
  }

  if (nowMs > window.EXAM_END_MS) {
    return "closed";
  }

  return "open";
};

// ==============================
// ✅ Cache version
// Change this whenever you update files
// ==============================

window.CACHE_VERSION = "20260709a";
