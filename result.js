
/* result.js — ZENITH HIGH / DAMS Trivandrum CBT result page
   Reads candidate and result data saved by the login/exam pages.
   Does not calculate marks or access the private AnswerKey.
*/

(function () {
  "use strict";

  function parseJSON(value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  function firstValue() {
    for (var i = 0; i < arguments.length; i++) {
      var value = arguments[i];

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return null;
  }

  function setText(id, value, fallback) {
    var element = document.getElementById(id);

    if (!element) return;

    element.textContent =
      value === null ||
      value === undefined ||
      value === ""
        ? (fallback === undefined ? "-" : fallback)
        : String(value);
  }

  function formatTime(value) {
    var seconds = Number(value);

    if (!Number.isFinite(seconds) || seconds < 0) {
      return "-";
    }

    seconds = Math.floor(seconds);

    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var secs = seconds % 60;

    if (hours > 0) {
      return hours + " hr " + minutes +
        " min " + secs + " sec";
    }

    if (minutes > 0) {
      return minutes + " min " + secs + " sec";
    }

    return secs + " sec";
  }

  function readCandidate() {
    var candidate =
      parseJSON(
        localStorage.getItem("neet_candidate")
      ) || {};

    return {
      name: firstValue(
        candidate.name,
        candidate.fullName,
        localStorage.getItem("candidateName")
      ),

      candidateId: firstValue(
        candidate.candidateId,
        candidate.id,
        localStorage.getItem("candidateId")
      ),

      email: firstValue(
        candidate.email,
        localStorage.getItem("candidateEmail")
      ),

      phone: firstValue(
        candidate.phone,
        localStorage.getItem("candidatePhone")
      )
    };
  }

  function readResult() {
    return (
      parseJSON(
        localStorage.getItem("neet_result")
      ) || {}
    );
  }

  function showStatus(message, isError) {
    var element =
      document.getElementById("statusNote");

    if (!element) return;

    element.textContent = message;

    element.classList.toggle(
      "error",
      !!isError
    );
  }

  function render(candidate, result) {
    setText(
      "candName",
      firstValue(result.name, candidate.name)
    );

    setText(
      "candId",
      firstValue(
        result.candidateId,
        candidate.candidateId
      )
    );

    setText(
      "candEmail",
      firstValue(result.email, candidate.email)
    );

    setText(
      "candPhone",
      firstValue(result.phone, candidate.phone)
    );

    setText(
      "score",
      firstValue(
        result.score,
        result.marks,
        result.totalScore
      )
    );

    setText(
      "correct",
      firstValue(
        result.correct,
        result.correctCount
      )
    );

    setText(
      "wrong",
      firstValue(
        result.wrong,
        result.wrongCount
      )
    );

    setText(
      "unattempted",
      firstValue(
        result.unattempted,
        result.unanswered
      )
    );

    setText(
      "timeTaken",
      formatTime(
        firstValue(
          result.timeTakenSec,
          result.timeTaken
        )
      )
    );

    setText(
      "violations",
      firstValue(
        result.violations,
        result.violationCount
      ),
      "0"
    );

    var hasResult =
      firstValue(
        result.score,
        result.marks,
        result.totalScore
      ) !== null;

    if (hasResult) {
      showStatus(
        "Exam result loaded successfully.",
        false
      );
    } else {
      showStatus(
        "No submitted result was found in this browser. " +
        "If the exam was submitted, contact the administrator " +
        "to retrieve the saved result.",
        true
      );
    }
  }

  function clearExamStorage() {
    [
      "neet_candidate",
      "neet_submitted",
      "neet_result",
      "neet_pending_submission",
      "candidateId",
      "token",
      "candidateName",
      "candidatePhone",
      "candidateEmail"
    ].forEach(function (key) {
      localStorage.removeItem(key);
    });

    var keysToRemove = [];

    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);

      if (
        key &&
        (
          key.indexOf("neet_exam_state_") === 0 ||
          key.indexOf("neet_question_order_") === 0
        )
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(function (key) {
      localStorage.removeItem(key);
    });
  }

  // Logout and Back to Login buttons
  window.backToLogin = function () {
    clearExamStorage();

    window.location.replace(
      "login.html?v=" + Date.now()
    );
  };

  document.addEventListener(
    "DOMContentLoaded",
    function () {
      var candidate = readCandidate();
      var result = readResult();

      // Display saved result.
      // Do not automatically redirect if data is missing.
      render(candidate, result);
    }
  );

})();
