/************************************************************
 * login.js - ZENITH NEET CBT
 * Candidate session isolation fix.
 *
 * - Always show login form; do not auto-route using an old session.
 * - Keep the currently signed-in candidate in sessionStorage
 *   (isolated per browser tab).
 * - Keep submitted/result data candidate + exam-window scoped
 *   in localStorage.
 * - Never delete another candidate's saved attempt or result.
 ************************************************************/
'use strict';

const msgEl = document.getElementById('msg');
const loginBtn = document.querySelector('.form > button');

function setMsg(message, ok = false) {
  if (!msgEl) return;
  msgEl.textContent = String(message || '');
  msgEl.style.color = ok ? '#1b5e20' : '#c62828';
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

function togglePassword() {
  const field = document.getElementById('pwd');

  if (!field) return;

  field.type = field.type === 'password' ? 'text' : 'password';
}

function clearLegacyGlobalSessionKeys() {
  // Compatibility cleanup only.
  // Do not clear candidate-scoped keys.

  [
    'neet_candidate',
    'neet_submitted',
    'neet_result',
    'candidateId',
    'token',
    'candidateName',
    'candidatePhone',
    'candidateEmail',
    'neet_pending_submission'
  ].forEach(key => {
    localStorage.removeItem(key);
  });
}

// Kept for compatibility with any existing page that calls this function.
// This only logs out the current tab.
// It does not erase server attempts, candidate-specific results,
// or other candidates' saved exam states.

function startNewAttempt() {
  sessionStorage.removeItem('neet_candidate');

  clearLegacyGlobalSessionKeys();

  location.replace('login.html?v=' + Date.now());
}

async function login() {
  const fullName = String(
    document.getElementById('fullName')?.value || ''
  ).trim();

  const phone = String(
    document.getElementById('phone')?.value || ''
  ).trim();

  const email = String(
    document.getElementById('email')?.value || ''
  ).trim();

  const candidateId = String(
    document.getElementById('cid')?.value || ''
  ).trim();

  const password = String(
    document.getElementById('pwd')?.value || ''
  ).trim();

  const apiUrl = String(
    window.API_URL || window.SCRIPT_URL || ''
  ).trim();

  if (!fullName || !phone || !email || !candidateId || !password) {
    setMsg('Please fill in all fields.');
    return;
  }

  if (!apiUrl) {
    setMsg('API_URL is missing. Please check config.js.');
    return;
  }

  if (loginBtn) {
    loginBtn.disabled = true;
  }

  setMsg('Verifying candidate details...', true);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',

      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },

      body: JSON.stringify({
        action: 'login',
        name: fullName,
        phone: phone,
        email: email,
        candidateId: candidateId,
        password: password
      }),

      cache: 'no-store'
    });

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error('Invalid response from login server.');
    }

    if (!response.ok || data.ok === false || !data.token) {
      throw new Error(
        data.error || data.message || 'Login failed.'
      );
    }

    const verifiedCandidateId = String(
      data.candidateId || candidateId
    ).trim();

    if (verifiedCandidateId !== candidateId) {
      throw new Error(
        'Candidate ID returned by server does not match the entered ID.'
      );
    }

    // Remove obsolete shared flags from the old implementation.
    // Candidate-specific keys are intentionally retained.

    clearLegacyGlobalSessionKeys();

    const candidateSession = {
      token: String(data.token),
      candidateId: verifiedCandidateId,
      name: String(data.name || fullName),
      phone: String(data.phone || phone),
      email: String(data.email || email)
    };

    // sessionStorage is scoped to this browser tab,
    // unlike localStorage.

    sessionStorage.setItem(
      'neet_candidate',
      JSON.stringify(candidateSession)
    );

    setMsg(
      'Login successful. Opening instructions...',
      true
    );

    location.replace('instructions.html?v=20261110a');

  } catch (error) {
    setMsg(
      error && error.message
        ? error.message
        : 'Login failed. Please try again.'
    );

    if (loginBtn) {
      loginBtn.disabled = false;
    }
  }
}
