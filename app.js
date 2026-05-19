// ============================================
// Ted's Barber — Customer booking app
// ============================================

const TIMEZONE = "America/Chicago";
const OPEN_DAYS = [2, 3, 4, 5, 6]; // Tue-Sat
const BOOKING_DAYS = 30;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const state = {
  selectedDate: null,
  selectedTime: null,
  availability: null, // { slots: [...], taken: {...} }
};

// ============ TZ HELPERS ============
function todayInTZ() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
  });
  return fmt.format(new Date());
}

function addDays(yyyymmdd, days) {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function dayOfWeek(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function dateParts(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return {
    day: DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
    num: d,
    month: MONTH_NAMES[m - 1],
    year: y,
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

// ============ TABS ============
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("panel-book").classList.toggle("hidden", tab !== "book");
    document.getElementById("panel-cancel").classList.toggle("hidden", tab !== "cancel");
  });
});

// ============ DATE PICKER ============
function renderDatePicker() {
  const container = document.getElementById("date-picker");
  container.innerHTML = "";
  const today = todayInTZ();

  for (let i = 0; i <= BOOKING_DAYS; i++) {
    const date = addDays(today, i);
    if (!OPEN_DAYS.includes(dayOfWeek(date))) continue;

    const p = dateParts(date);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "date-tile";
    tile.dataset.date = date;
    tile.innerHTML = `
      <div class="date-day">${p.day}</div>
      <div class="date-num">${p.num}</div>
      <div class="date-month">${p.month}</div>
    `;
    tile.addEventListener("click", () => selectDate(date));
    container.appendChild(tile);
  }
}

function setSlotPickerEmpty(message) {
  document.getElementById("slot-picker").innerHTML =
    `<p class="slot-empty">${message}</p>`;
}

async function selectDate(date) {
  state.selectedDate = date;
  state.selectedTime = null;
  document.querySelectorAll(".date-tile").forEach(t => {
    t.classList.toggle("selected", t.dataset.date === date);
  });
  document.getElementById("slot-picker").innerHTML = `<p class="slot-empty"><span class="spinner"></span> &nbsp; Loading times…</p>`;
  updateSubmitState();

  try {
    const res = await fetch(`/api/availability?date=${date}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load times");
    state.availability = data;
    renderSlots();
  } catch (err) {
    setSlotPickerEmpty(`Could not load times: ${err.message}`);
  }
}

function renderSlots() {
  const container = document.getElementById("slot-picker");
  container.innerHTML = "";
  const { slots, taken } = state.availability;

  let availableCount = 0;
  for (const time of slots) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.dataset.time = time;
    btn.textContent = format12h(time);
    if (taken[time]) {
      btn.disabled = true;
      btn.title = taken[time] === "blocked" ? "Unavailable" : "Booked";
    } else {
      availableCount++;
      btn.addEventListener("click", () => selectTime(time));
    }
    container.appendChild(btn);
  }

  if (availableCount === 0) {
    const p = document.createElement("p");
    p.className = "slot-empty";
    p.textContent = "Fully booked. Please try another day.";
    container.appendChild(p);
  }
}

function selectTime(time) {
  state.selectedTime = time;
  document.querySelectorAll(".slot-btn").forEach(b => {
    b.classList.toggle("selected", b.dataset.time === time);
  });
  updateSubmitState();
}

function updateSubmitState() {
  const btn = document.getElementById("book-submit");
  const txt = document.getElementById("book-btn-text");
  if (state.selectedDate && state.selectedTime) {
    btn.disabled = false;
    txt.textContent = `Reserve ${format12h(state.selectedTime)} on ${prettyDate(state.selectedDate)}`;
  } else {
    btn.disabled = true;
    txt.textContent = "Reserve the chair";
  }
}

// ============ BOOK SUBMISSION ============
document.getElementById("book-form").addEventListener("submit", async e => {
  e.preventDefault();
  if (!state.selectedDate || !state.selectedTime) return;

  const form = e.target;
  const msg = document.getElementById("book-msg");
  msg.className = "form-msg";
  msg.textContent = "Reserving…";

  const submitBtn = document.getElementById("book-submit");
  submitBtn.disabled = true;

  try {
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.firstName.value,
        lastName: form.lastName.value,
        phone: form.phone.value,
        date: state.selectedDate,
        time: state.selectedTime,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Booking failed");

    msg.className = "form-msg success";
    msg.innerHTML = `Confirmed for <strong>${prettyDate(state.selectedDate)} at ${format12h(state.selectedTime)}</strong>. See you in the chair.`;
    form.reset();
    state.selectedTime = null;
    // Refresh availability
    await selectDate(state.selectedDate);
  } catch (err) {
    msg.className = "form-msg error";
    msg.textContent = err.message;
  } finally {
    updateSubmitState();
  }
});

// ============ CANCEL / LOOKUP ============
document.getElementById("lookup-form").addEventListener("submit", async e => {
  e.preventDefault();
  const phone = e.target.phone.value;
  const results = document.getElementById("lookup-results");
  results.innerHTML = `<p class="muted" style="text-align:center;padding:1rem;"><span class="spinner"></span> &nbsp; Looking…</p>`;

  try {
    const res = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lookup failed");

    if (data.appointments.length === 0) {
      results.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">○</div>
          <p>No upcoming appointments found for that number.</p>
        </div>`;
      return;
    }

    results.innerHTML = "";
    for (const appt of data.appointments) {
      const card = document.createElement("div");
      card.className = "appt-card";
      card.innerHTML = `
        <div class="appt-info">
          <div class="appt-when">${prettyDate(appt.date)} · ${format12h(appt.time)}</div>
          <div class="appt-who">${appt.firstName} ${appt.lastName}</div>
        </div>
        <button class="cancel-btn">Cancel</button>
      `;
      card.querySelector(".cancel-btn").addEventListener("click", async () => {
        if (!confirm(`Cancel your ${format12h(appt.time)} appointment on ${prettyDate(appt.date)}?`)) return;
        try {
          const r = await fetch("/api/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, date: appt.date, time: appt.time }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Cancel failed");
          card.remove();
          if (!results.children.length) {
            results.innerHTML = `<div class="empty-state"><div class="empty-state-icon">○</div><p>All appointments cancelled.</p></div>`;
          }
        } catch (err) {
          alert(err.message);
        }
      });
      results.appendChild(card);
    }
  } catch (err) {
    results.innerHTML = `<p class="form-msg error" style="justify-content:center;">${err.message}</p>`;
  }
});

// ============ INIT ============
renderDatePicker();
