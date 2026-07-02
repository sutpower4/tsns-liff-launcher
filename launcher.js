let tsnsProfile = null;
let tsnsLoginResult = null;

function logStep(message, data) {
  const now = new Date().toLocaleTimeString();
  const line = `[${now}] ${message}`;
  const log = document.getElementById('log');
  log.textContent += line + (data ? "\n" + JSON.stringify(data, null, 2) : "") + "\n";
  document.getElementById('status').textContent = message;
}

function setProgress(percent) {
  document.getElementById('bar').style.width = percent + "%";
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
      document.getElementById("loginButton").classList.remove("hidden");
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

    if (!tsnsLoginResult.ok && tsnsLoginResult.needBind) {
      setProgress(80);
      logStep("BIND REQUIRED");
      document.getElementById("bindBox").classList.remove("hidden");
      return;
    }

    if (!tsnsLoginResult.ok) {
      setProgress(80);
      logStep("LOGIN FAILED", tsnsLoginResult);
      return;
    }

    setProgress(100);
    logStep("LOGIN SUCCESS");

    sessionStorage.setItem("TSNS_CURRENT_USER", JSON.stringify(tsnsLoginResult.currentUser));
    sessionStorage.setItem("TSNS_SESSION", JSON.stringify(tsnsLoginResult.session || {}));

    document.getElementById("openDashboardButton").classList.remove("hidden");
    setTimeout(openDashboard, 900);

  } catch (e) {
    logStep("ERROR: " + e.message);
    document.getElementById("loginButton").classList.remove("hidden");
  }
}

function manualLogin() {
  liff.login();
}

async function bindLine() {
  const employeeId = document.getElementById("employeeId").value.trim();
  if (!employeeId) {
    logStep("Employee ID required");
    return;
  }

  if (!tsnsProfile) {
    logStep("LINE profile missing");
    return;
  }

  logStep("CALL BIND API");
  const res = await callApi("LINE_BIND", { employeeId, profile: tsnsProfile });
  logStep("BIND RESPONSE", res);

  if (res.ok) {
    document.getElementById("bindBox").classList.add("hidden");
    tsnsLoginResult = await callApi("LINE_LOGIN", { profile: tsnsProfile });
    logStep("LOGIN AFTER BIND", tsnsLoginResult);

    if (tsnsLoginResult.ok) {
      sessionStorage.setItem("TSNS_CURRENT_USER", JSON.stringify(tsnsLoginResult.currentUser));
      sessionStorage.setItem("TSNS_SESSION", JSON.stringify(tsnsLoginResult.session || {}));
      openDashboard();
    }
  }
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
