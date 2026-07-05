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

/**
 * Sprint 7.2.2F Final Register Flow
 *
 * ไม่ใช้ liff.getFriendship()
 * ไม่บังคับ Friend Check ฝั่ง LIFF
 * แสดงการ์ด "เพิ่มเพื่อน LINE OA" บนหน้า Register
 * ผู้ใช้สามารถลงทะเบียนต่อได้ทันที
 *
 * Sprint 7.2.2G:
 * - ใช้ Webhook follow/unfollow
 * - บันทึก IsFriend
 * - Approval Engine ตรวจ IsFriend ก่อนอนุมัติ
 */
function ensureAddFriendCard() {
  let card = document.getElementById("addFriendCard");
  if (card) return card;

  card = document.createElement("div");
  card.id = "addFriendCard";
  card.className = "hidden";
  card.innerHTML = `
    <div class="card" style="border-left:5px solid #06C755;margin-bottom:16px;">
      <h2 style="margin-top:0;">รับการแจ้งเตือนจาก TSNS</h2>
      <p>
        เพื่อรับผลการอนุมัติและการแจ้งเตือนจากระบบ
        กรุณาเพิ่ม <b>TSNS Notification</b> เป็นเพื่อน
      </p>

      <a href="${TSNS_LINE_OA_URL}"
         target="_blank"
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

      <div style="font-size:13px;color:#666;margin-top:10px;">
        * คุณสามารถลงทะเบียนต่อได้ทันที หากยังไม่ได้เพิ่มเพื่อน อาจไม่ได้รับข้อความแจ้งผลอนุมัติ
      </div>
    </div>
  `;

  const registerBox = document.getElementById("registerBox");
  if (registerBox && registerBox.parentNode) {
    registerBox.parentNode.insertBefore(card, registerBox);
  } else {
    document.body.appendChild(card);
  }

  return card;
}

function showRegisterWithAddFriendCard() {
  ensureAddFriendCard();
  showBox("addFriendCard");
  showBox("registerBox");
}

async function startLauncher() {
  try {
    ensureAddFriendCard();
    hideBox("addFriendCard");

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

      ensureAddFriendCard();
      showBox("addFriendCard");
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

      showRegisterWithAddFriendCard();
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

    ensureAddFriendCard();
    showBox("addFriendCard");
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
