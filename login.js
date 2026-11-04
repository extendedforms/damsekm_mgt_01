// ==============================
// login.js (COMPLETE + FIXED)
// ==============================

const msgEl = document.getElementById("msg");

function setMsg(text, ok = false) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.color = ok ? "#1b5e20" : "#c62828";
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * ✅ Auto routing rules:
 * 1) If submitted => result.html
 * 2) Else if logged in => instructions.html
 * 3) Else stay on login
 */
(function autoRoute() {
  const submitted = localStorage.getItem("neet_submitted");
  if (submitted === "yes") {
    location.replace("result.html");
    return;
  }

  const existing = safeParse(localStorage.getItem("neet_candidate") || "");
  if (existing && existing.token) {
    location.replace("instructions.html");
    return;
  }
})();

// ✅ Toggle password (eye button)
function togglePassword() {
  const pwd = document.getElementById("pwd");
  if (!pwd) return;
  pwd.type = pwd.type === "password" ? "text" : "password";
}
window.togglePassword = togglePassword;

// ✅ Clear everything ONLY when you want a fresh attempt
function startNewAttempt() {
  localStorage.removeItem("neet_candidate");
  localStorage.removeItem("neet_submitted");
  localStorage.removeItem("neet_result");

  // Also clear any exam-state keys
  // (we used dynamic keys like neet_exam_state_<cid>_<start>_<end>)
  const keysToDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("neet_exam_state_")) keysToDelete.push(k);
  }
  keysToDelete.forEach(k => localStorage.removeItem(k));

  location.replace("login.html");
}
window.startNewAttempt = startNewAttempt;

// ✅ Main login function
async function login() {
  const fullName = document.getElementById("fullName")?.value.trim();
  const phone = document.getElementById("phone")?.value.trim();
  const email = document.getElementById("email")?.value.trim();
  const candidateId = document.getElementById("cid")?.value.trim();
  const password = document.getElementById("pwd")?.value.trim();

  if (!fullName || !phone || !email || !candidateId || !password) {
    return setMsg("Fill all fields.");
  }

  if (!window.API_URL) {
    return setMsg("API_URL missing (check config.js).");
  }

  setMsg("Checking...", true);

  try {
    const res = await fetch(window.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "login",
        name: fullName,
        phone,
        email,
        candidateId,
        password,
      }),
      cache: "no-store",
    });

    const raw = await res.text();
    const data = safeParse(raw);

    if (!data) return setMsg("Invalid server response. Check Apps Script output.");

    if (!data.ok) return setMsg(data.error || "Login failed.");

    // ✅ Save candidate session
    localStorage.setItem("neet_candidate", JSON.stringify({
      token: data.token,
      candidateId: data.candidateId || candidateId,
      name: data.name || fullName,
      phone: data.phone || phone,
      email: data.email || email,
    }));

    // ✅ IMPORTANT:
    // DO NOT clear neet_submitted or neet_result here.
    // If user already submitted, we should go to result.
    if (localStorage.getItem("neet_submitted") === "yes") {
      setMsg("Already submitted. Redirecting...", true);
      location.replace("result.html");
      return;
    }

    setMsg("Login success. Redirecting...", true);
    location.replace("instructions.html");

  } catch (e) {
    setMsg("Network error: " + e.message);
  }
}

window.login = login;
