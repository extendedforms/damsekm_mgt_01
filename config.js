
// ==============================
// config.js - SECURE CBT
// ==============================

// Google Apps Script Web App URL
window.API_URL =
  "https://script.google.com/macros/s/AKfycbzwgEOh1fYnKiWXXjtYpcX4TS4aPACApijXsh1u5FZIJj-JjMrya9CEM54JqdgjLLW65w/exec";

window.SCRIPT_URL = window.API_URL;

// ==============================
// EXAM SETTINGS
// Display settings only.
// Backend controls actual scoring.
// ==============================

window.EXAM_DURATION_MIN = 180;
window.EXAM_DURATION_SECONDS = 10800;

window.MARKS_CORRECT = 4;
window.MARKS_WRONG = -1;

// ==============================
// EXAM SCHEDULE - IST
// Display only.
// Apps Script must enforce schedule.
// ==============================

window.EXAM_TZ = "Asia/Kolkata";

window.EXAM_START_IST = "2026-10-27T10:00:00+05:30";
window.EXAM_END_IST   = "2026-11-27T13:30:00+05:30";

window.EXAM_START_MS = Date.parse(window.EXAM_START_IST);
window.EXAM_END_MS = Date.parse(window.EXAM_END_IST);

// ==============================
// IST FORMATTER
// ==============================

window.formatIST = function(dateOrMs = Date.now()) {
  const d = typeof dateOrMs === "number"
    ? new Date(dateOrMs)
    : dateOrMs;

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
// DISPLAY-ONLY EXAM WINDOW
// ==============================

window.isWithinExamWindow = function(nowMs = Date.now()) {
  return Number.isFinite(window.EXAM_START_MS) &&
         Number.isFinite(window.EXAM_END_MS) &&
         nowMs >= window.EXAM_START_MS &&
         nowMs <= window.EXAM_END_MS;
};

window.getExamStatus = function(nowMs = Date.now()) {
  if (!Number.isFinite(window.EXAM_START_MS) ||
      !Number.isFinite(window.EXAM_END_MS)) {
    return "invalid_schedule";
  }

  if (nowMs < window.EXAM_START_MS) return "not_started";
  if (nowMs > window.EXAM_END_MS) return "closed";

  return "open";
};

// ==============================
// CACHE VERSION
// ==============================

window.CACHE_VERSION = "20261108a";
