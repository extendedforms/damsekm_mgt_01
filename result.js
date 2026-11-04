function safeParse(s){ try{return JSON.parse(s)}catch{return null} }

const r = safeParse(localStorage.getItem("neet_result") || "");
const cand = safeParse(localStorage.getItem("neet_candidate") || "");

// ✅ If no result, kick out
if(!r || !cand){
  location.replace("login.html");
}

// ✅ Prevent back navigation from result page
history.replaceState(null, "", location.href);
window.addEventListener("popstate", () => {
  location.replace("login.html");
});

const out = document.getElementById("out");
out.innerHTML = `
  <p><b>Name:</b> ${cand.name || "-"}</p>
  <p><b>Candidate ID:</b> ${(cand.candidateId || r.candidateId || "-")}</p>
  <hr/>
  <p><b>Score:</b> ${r.score}</p>
  <p><b>Correct:</b> ${r.correct}</p>
  <p><b>Wrong:</b> ${r.wrong}</p>
  <p><b>Unattempted:</b> ${r.unattempted}</p>
  <p><b>Time Taken:</b> ${Math.floor((r.timeTakenSec||0)/60)} min</p>
  <p><b>Violations:</b> ${r.violations}</p>
`;

document.getElementById("logout").onclick = () => {
  localStorage.removeItem("neet_candidate");
  localStorage.removeItem("neet_exam_state");
  localStorage.removeItem("neet_result");
  localStorage.removeItem("neet_submitted");

  // ✅ replace to prevent back
  location.replace("login.html");
};
