let tsnsProfile = null;
let tsnsLoginResult = null;

function logStep(message, data) {
  const now = new Date().toLocaleTimeString();
  const line = `[${now}] ${message}`;
  const log = document.getElementById('log');
  if (log) log.textContent += line + (data ? "\n" + JSON.stringify(data, null, 2) : "") + "\n";
  const status = document.getElementById('status');
  if (status) status.textContent = message;
}

function setProgress(percent) {
  const bar = document.getElementById('bar');
  if (bar) bar.style.width = percent + "%";
}

async function callApi(action, payload) {
  const url = TSNS_CONFIG.GAS_API_URL + "?action=" + encodeURIComponent(action);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload || {})
  });
  return await res.json();
}

function showBox(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function hideBox(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || "";
}

async function startLauncher() {
  try {
    setProgress(10);
    logStep("LIFF INIT");
    await liff.init({ liffId: TSNS_CONFIG.LIFF_ID });

    setProgress(30);
    logStep("LIFF READY");

    if (!liff.isLoggedIn()) {
      setProgress(40);
      logStep("LOGIN REQUIRED");
      showBox("loginButton");
      liff.login();
      return;
    }

    setProgress(55);
    logStep("GET LINE PROFILE");
    tsnsProfile = await liff.getProfile();

    logStep("PROFILE RECEIVED", {
      userId: tsnsProfile.userId,
      displayName: tsnsProfile.displayName
    });

    setProgress(70);
    logStep("CALL TSNS IAM API");
    tsnsLoginResult = await callApi("LINE_LOGIN", { profile: tsnsProfile });
    logStep("API RESPONSE", tsnsLoginResult);

    if (tsnsLoginResult.ok) {
      setProgress(100);
      logStep("LOGIN SUCCESS");
      sessionStorage.setItem("TSNS_CURRENT_USER", JSON.stringify(tsnsLoginResult.currentUser));
      sessionStorage.setItem("TSNS_SESSION", JSON.stringify(tsnsLoginResult.session || {}));
      showBox("openDashboardButton");
      setTimeout(openDashboard, 900);
      return;
    }

    if (tsnsLoginResult.needApproval || tsnsLoginResult.route === "PENDING") {
      setProgress(85);
      logStep("PENDING APPROVAL", tsnsLoginResult);
      setText("pendingRequestId", tsnsLoginResult.requestId || "");
      showBox("pendingBox");
      return;
    }

    if (tsnsLoginResult.needRegister || tsnsLoginResult.route === "REGISTER") {
      setProgress(80);
      logStep("REGISTRATION REQUIRED");
      setText("lineDisplayName", tsnsProfile.displayName || "");
      setText("lineUserIdPreview", tsnsProfile.userId || "");
      if (tsnsLoginResult.rejectReason) {
        setText("rejectReason", tsnsLoginResult.rejectReason);
        showBox("rejectBox");
      }
      showBox("registerBox");
      return;
    }

    setProgress(80);
    logStep("LOGIN FAILED", tsnsLoginResult);
    showBox("loginButton");

  } catch (e) {
    logStep("ERROR: " + e.message);
    showBox("loginButton");
  }
}

function manualLogin() {
  liff.login();
}

async function submitRegistration() {
  if (!tsnsProfile) {
    logStep("LINE profile missing");
    return;
  }

  const employeeId = document.getElementById("employeeId").value.trim();
  const fullName = document.getElementById("fullName").value.trim();
  const departmentId = document.getElementById("departmentId").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const remark = document.getElementById("remark").value.trim();

  if (!employeeId) return logStep("Employee ID required");
  if (!fullName) return logStep("Full Name required");

  setProgress(90);
  logStep("SUBMIT REGISTRATION");

  const res = await callApi("LINE_REGISTER", {
    employeeId,
    fullName,
    departmentId,
    email,
    phone,
    remark,
    registerSource: "LIFF",
    device: navigator.userAgent || "",
    profile: tsnsProfile
  });

  logStep("REGISTRATION RESPONSE", res);

  if (res.ok && (res.route === "PENDING" || res.status === "PENDING_APPROVAL")) {
    hideBox("registerBox");
    setText("pendingRequestId", res.requestId || "");
    showBox("pendingBox");
    setProgress(100);
    return;
  }

  logStep("REGISTRATION FAILED", res);
}

function openDashboard() {
  const payload = encodeURIComponent(JSON.stringify({
    loginMethod: "LINE",
    user: tsnsLoginResult ? tsnsLoginResult.currentUser : null,
    session: tsnsLoginResult ? tsnsLoginResult.session : null
  }));
  window.location.href = TSNS_CONFIG.DASHBOARD_URL + "?source=liff&payload=" + payload;
}

document.addEventListener("DOMContentLoaded", startLauncher);
