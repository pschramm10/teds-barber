// ============================================
// Ted's Barber — Admin dashboard
// ============================================

const TIMEZONE = "America/Chicago";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const OPEN_DAYS = [2, 3, 4, 5, 6];

let adminPassword = sessionStorage.getItem("ted_admin_pw") || null;

function todayInTZ() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
  });
  return fmt.format(new Date());
}

function dateParts(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return {
    day: DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
    num: d,
    month: MONTH_NAMES[m - 1],
  };
}

function format12h(time24) {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function prettyDate(yyyymmdd) {
  const p = dateParts(yyyymmdd);
  return `${p.day}, ${p.month} ${p.num}`;
}

function formatPhone(p) {
  const d = (p || "").replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}

// ============ AUTH FLOW ============
function showDash() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("dash-view").classList.remove("hidden");
  loadDashboard();
}

function showLogin() {
  document.getElementById("dash-view").classList.add("hidden");
  document.getElementById("login-view").classList.remove("hidden");
}

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const pw = document.getElementById("password").value;
  const msg = document.getElementById("login-msg");
  msg.className = "form-msg";
  msg.textContent = "Checking…";

  try {
    const res = await fetch("/api/admin-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.status === 401) {
      msg.className = "form-msg error";
      msg.textContent = "Incorrect password.";
      return;
    }
    if (!res.ok) throw new Error("Server error");
    adminPassword = pw;
    sessionStorage.setItem("ted_admin_pw", pw);
    showDash();
  } catch (err) {
    msg.className = "form-msg error";
    msg.textContent = err.message;
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  adminPassword = null;
  sessionStorage.removeItem("ted_admin_pw");
  document.getElementById("password").value = "";
  document.getElementById("login-msg").textContent = "";
  showLogin();
});

// ============ DASHBOARD ============
async function loadDashboard() {
  const list = document.getElementById("admin-list");
  list.innerHTML = `<p class="muted" style="text-align:center;padding:1rem;"><span class="spinner"></span> &nbsp; Loading…</p>`;

  try {
    const res = await fetch("/api/admin-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    if (res.status === 401) {
      sessionStorage.removeItem("ted_admin_pw");
      adminPassword = null;
      showLogin();
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    renderEntries(data.entries);
  } catch (err) {
    list.innerHTML = `<p class="muted" style="color:var(--oxblood)">${err.message}</p>`;
  }
}

function renderEntries(entries) {
  const list = document.getElementById("admin-list");
  list.innerHTML = "";

  if (!entries.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">○</div><p>No upcoming appointments or blocks.</p></div>`;
    return;
  }

  // Group by date
  const byDate = {};
  for (const e of entries) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }

  for (const date of Object.keys(byDate).sort()) {
    const header = document.createElement("div");
    header.className = "date-group-header";
    header.textContent = prettyDate(date);
    list.appendChild(header);

    for (const e of byDate[date]) {
      const div = document.createElement("div");
      div.className = "admin-entry" + (e.type === "blocked" ? " blocked-entry" : "");

      if (e.type === "booking") {
        div.innerHTML = `
          <div class="admin-entry-info">
            <div class="entry-when">
              <span class="entry-tag tag-booking">Booking</span>
              <span class="entry-time">${format12h(e.time)}</span>
              <span class="entry-name">· ${e.firstName} ${e.lastName}</span>
            </div>
            <div class="entry-detail">${formatPhone(e.phone)}</div>
          </div>
          <button class="danger-btn">Cancel</button>
        `;
        div.querySelector(".danger-btn").addEventListener("click", () => removeEntry(e, "Cancel this booking?"));
      } else {
        div.innerHTML = `
          <div class="admin-entry-info">
            <div class="entry-when">
              <span class="entry-tag tag-blocked">Blocked</span>
              <span class="entry-time">${format12h(e.time)}</span>
            </div>
          </div>
          <button class="danger-btn">Unblock</button>
        `;
        div.querySelector(".danger-btn").addEventListener("click", () => removeEntry(e, "Unblock this slot?"));
      }
      list.appendChild(div);
    }
  }
}

async function removeEntry(entry, confirmMsg) {
  if (!confirm(confirmMsg)) return;
  try {
    const res = await fetch("/api/admin-unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: adminPassword,
        date: entry.date,
        time: entry.time,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// ============ BLOCKING ============
document.getElementById("refresh-btn").addEventListener("click", loadDashboard);

document.getElementById("block-slot-btn").addEventListener("click", async () => {
  const date = document.getElementById("block-date").value;
  const time = document.getElementById("block-time").value;
  const msg = document.getElementById("block-msg");
  msg.className = "form-msg";

  if (!date || !time) {
    msg.className = "form-msg error";
    msg.textContent = "Pick a date and a time.";
    return;
  }

  try {
    const res = await fetch("/api/admin-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword, date, time }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    msg.className = "form-msg success";
    msg.textContent = `Blocked ${format12h(time)} on ${prettyDate(date)}.`;
    loadDashboard();
  } catch (err) {
    msg.className = "form-msg error";
    msg.textContent = err.message;
  }
});

document.getElementById("block-day-btn").addEventListener("click", async () => {
  const date = document.getElementById("block-date").value;
  const msg = document.getElementById("block-msg");
  msg.className = "form-msg";

  if (!date) {
    msg.className = "form-msg error";
    msg.textContent = "Pick a date.";
    return;
  }
  if (!confirm(`Block off the entire day on ${prettyDate(date)}? Existing bookings on that day are NOT cancelled — only open slots will be blocked.`)) return;

  try {
    const res = await fetch("/api/admin-block-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword, date }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    msg.className = "form-msg success";
    msg.textContent = `Blocked ${data.blocked} slot(s) on ${prettyDate(date)}.`;
    loadDashboard();
  } catch (err) {
    msg.className = "form-msg error";
    msg.textContent = err.message;
  }
});

// Set min date on date picker
const dateInput = document.getElementById("block-date");
if (dateInput) {
  const today = todayInTZ();
  dateInput.min = today;
  dateInput.value = today;
}

// ============ INIT ============
if (adminPassword) {
  showDash();
} else {
  showLogin();
}
