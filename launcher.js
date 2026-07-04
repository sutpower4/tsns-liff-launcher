let tsnsProfile = null;
let tsnsLoginResult = null;

const TSNS_LINE_OA_URL = "https://line.me/R/ti/p/@793baems";

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

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch (e) {
    logStep("API RETURNED NON-JSON", {
      status: res.status,
      preview: text.slice(0, 300)
    });
    throw new Error("API did not return JSON. Check GAS_API_URL/action.");
  }
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

function ensureAddFriendBox() {
  let box = document.getElementById("addFriendBox");
  if (box) return box;

  box = document.createElement("div");
  box.id = "addFriendBox";
  box.className = "hidden";
  box.innerHTML = `
    <div class="card" style="border-left:5px solid #06C755;">
      <h2>เพิ่มเพื่อนก่อนลงทะเบียน</h2>
      <p>
        กรุณาเพิ่ม <b>TSNS Notification</b> เป็นเพื่อนก่อนลงทะเบียน
        เพื่อรับผลการอนุมัติและการแจ้งเตือนจากระบบ
      </p>

      <a href="${TSNS_LINE_OA_URL}"
         style="
           display:block;
           background:#06C755;
           color:white;
           text-align:center;
           padding:14px;
           border-radius:10px;
           text-decoration:none;
           margin-top:18px;
           font-weight:bold;">
        เพิ่มเพื่อน LINE OA
      </a>

      <button onclick="location.reload()"
              style="
                width:100%;
                margin-top:12px;
                padding:12px;
                border-radius:10px;
                border:1px solid #ccc;
                background:white;
                font-weight:bold;">
        ตรวจสอบอีกครั้ง
      </button>
    </div>
  `;

  const registerBox = document.getElementById("registerBox");
  if (registerBox && registerBox.parentNode) {
    registerBox.parentNode.insertBefore(box, registerBox);
  } else {
    document.body.appendChild(box);
  }

  return box;
}

/**
 * Sprint 7.2.2F
 * Force Add Friend before registration.
 *
 * Important:
 * This version DOES NOT bypass "no login bot linked".
 * If LINE Login Channel is not linked to Messaging API Bot/OA,
 * liff.getFriendship() will fail and this function will keep showing Add Friend page.
 */
async function TSNS_CheckFriendBeforeRegister_() {
  try {
    logStep("CHECK LINE OA FRIENDSHIP");

    if (typeof liff === "undefined") {
      logStep("FRIEND CHECK FAILED: LIFF undefined");
      ensureAddFriendBox();
      hideBox("registerBox");
      showBox("addFriendBox");
      return false;
    }

    if (!liff.isLoggedIn()) {
      logStep("FRIEND CHECK FAILED: LIFF not logged in");
      hideBox("registerBox");
      showBox("loginButton");
      return false;
    }

    const friendship = await liff.getFriendship();
    logStep("FRIENDSHIP RESULT", friendship);

    if (friendship && friendship.friendFlag === true) {
      logStep("FRIENDSHIP OK");
      hideBox("addFriendBox");
      return true;
    }

    logStep("FRIENDSHIP REQUIRED");
    ensureAddFriendBox();
    hideBox("registerBox");
    showBox("addFriendBox");
    return false;

  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    logStep("FRIEND CHECK ERROR: " + msg);

    logStep("FRIENDSHIP REQUIRED");
    ensureAddFriendBox();
    hideBox("registerBox");
    showBox("addFriendBox");
    return false;
  }
}

async function startLauncher() {
  try {
    ensureAddFriendBox();
    hideBox("addFriendBox");

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
      setProgress(78);
      logStep("REGISTRATION CHECK");

      setText("lineDisplayName", tsnsProfile.displayName || "");
      setText("lineUserIdPreview", tsnsProfile.userId || "");

      if (tsnsLoginResult.rejectReason) {
        setText("rejectReason", tsnsLoginResult.rejectReason);
        showBox("rejectBox");
      }

      const canRegister = await TSNS_CheckFriendBeforeRegister_();
      if (!canRegister) return;

      setProgress(80);
      logStep("REGISTRATION REQUIRED");
      hideBox("addFriendBox");
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

  const canRegister = await TSNS_CheckFriendBeforeRegister_();
  if (!canRegister) return;

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
    hideBox("addFriendBox");
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
