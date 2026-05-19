// Netlify Function: appointments
// Handles all booking operations using Netlify Blobs for storage
import { getStore } from "@netlify/blobs";

// ============ CONFIG ============
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "barber123";
const TIMEZONE = "America/Chicago";
// Open days: 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
const OPEN_DAYS = [2, 3, 4, 5, 6];
// Slots: 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00 (last appt ends 17:30)
const SLOT_TIMES = ["13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];
const BOOKING_WINDOW_DAYS = 30;

// ============ HELPERS ============
const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Get today's date (YYYY-MM-DD) in Houston TZ
function todayInTZ() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

// Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD date
function dayOfWeek(dateStr) {
  // Parse as if it were UTC, but day-of-week is the same regardless of TZ for a calendar date
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Validate date format and that it's within booking window and on an open day
function isValidBookingDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = todayInTZ();
  if (dateStr < today) return false;

  // Check within 30 days
  const [ty, tm, td] = today.split("-").map(Number);
  const todayUTC = Date.UTC(ty, tm - 1, td);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  const dateUTC = Date.UTC(dy, dm - 1, dd);
  const daysOut = (dateUTC - todayUTC) / 86400000;
  if (daysOut > BOOKING_WINDOW_DAYS) return false;

  return OPEN_DAYS.includes(dayOfWeek(dateStr));
}

function isValidSlot(time) {
  return SLOT_TIMES.includes(time);
}

function normalizePhone(phone) {
  return (phone || "").replace(/\D/g, "");
}

// Sanitize string input (basic)
function clean(str, maxLen = 50) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLen);
}

// ============ STORAGE ============
// Store structure: key = `${date}` (YYYY-MM-DD)
// Value = { slots: { "13:30": {type:"booking", firstName, lastName, phone, id, createdAt} | {type:"blocked"} } }
function getAppointmentsStore() {
  // Workaround for MissingBlobsEnvironmentError: pass siteID and token explicitly
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
  if (siteID && token) {
    return getStore({ name: "appointments", consistency: "strong", siteID, token });
  }
  return getStore({ name: "appointments", consistency: "strong" });
}

async function getDay(store, date) {
  const data = await store.get(date, { type: "json" });
  return data || { slots: {} };
}

async function setDay(store, date, data) {
  await store.setJSON(date, data);
}

// ============ HANDLERS ============
async function handleGetAvailability(params) {
  const { date } = params;
  if (!isValidBookingDate(date)) {
    return json(400, { error: "Invalid or unavailable date" });
  }
  const store = getAppointmentsStore();
  const day = await getDay(store, date);

  // Return only which slots are taken (no PII)
  const taken = {};
  for (const time of SLOT_TIMES) {
    if (day.slots[time]) {
      taken[time] = day.slots[time].type; // "booking" or "blocked"
    }
  }
  return json(200, { date, slots: SLOT_TIMES, taken });
}

async function handleBook(body) {
  const firstName = clean(body.firstName, 40);
  const lastName = clean(body.lastName, 40);
  const phone = normalizePhone(body.phone);
  const date = body.date;
  const time = body.time;

  if (!firstName || !lastName) {
    return json(400, { error: "First and last name are required" });
  }
  if (phone.length < 10) {
    return json(400, { error: "Please enter a valid phone number" });
  }
  if (!isValidBookingDate(date)) {
    return json(400, { error: "Invalid date" });
  }
  if (!isValidSlot(time)) {
    return json(400, { error: "Invalid time slot" });
  }

  const store = getAppointmentsStore();
  const day = await getDay(store, date);

  if (day.slots[time]) {
    return json(409, { error: "That time slot is no longer available" });
  }

  const id = `${date}-${time}-${Date.now().toString(36)}`;
  day.slots[time] = {
    type: "booking",
    firstName,
    lastName,
    phone,
    id,
    createdAt: new Date().toISOString(),
  };
  await setDay(store, date, day);

  return json(200, {
    success: true,
    appointment: { id, date, time, firstName, lastName },
  });
}

async function handleLookup(body) {
  const phone = normalizePhone(body.phone);
  if (phone.length < 10) {
    return json(400, { error: "Please enter a valid phone number" });
  }

  const store = getAppointmentsStore();
  const today = todayInTZ();
  const results = [];

  // List all blobs (one per date)
  const { blobs } = await store.list();
  for (const b of blobs) {
    if (b.key < today) continue; // skip past dates
    const day = await getDay(store, b.key);
    for (const [time, slot] of Object.entries(day.slots)) {
      if (slot.type === "booking" && slot.phone === phone) {
        results.push({
          id: slot.id,
          date: b.key,
          time,
          firstName: slot.firstName,
          lastName: slot.lastName,
        });
      }
    }
  }
  results.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return json(200, { appointments: results });
}

async function handleCancel(body) {
  const phone = normalizePhone(body.phone);
  const date = body.date;
  const time = body.time;

  if (phone.length < 10 || !date || !time) {
    return json(400, { error: "Missing information" });
  }

  const store = getAppointmentsStore();
  const day = await getDay(store, date);
  const slot = day.slots[time];

  if (!slot || slot.type !== "booking") {
    return json(404, { error: "Appointment not found" });
  }
  if (slot.phone !== phone) {
    return json(403, { error: "Phone number does not match" });
  }

  delete day.slots[time];
  await setDay(store, date, day);
  return json(200, { success: true });
}

// ============ ADMIN ============
function checkAdmin(body) {
  return body && body.password === ADMIN_PASSWORD;
}

async function handleAdminList(body) {
  if (!checkAdmin(body)) return json(401, { error: "Unauthorized" });

  const store = getAppointmentsStore();
  const today = todayInTZ();
  const all = [];
  const { blobs } = await store.list();
  for (const b of blobs) {
    if (b.key < today) continue;
    const day = await getDay(store, b.key);
    for (const [time, slot] of Object.entries(day.slots)) {
      all.push({ date: b.key, time, ...slot });
    }
  }
  all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return json(200, { entries: all });
}

async function handleAdminBlock(body) {
  if (!checkAdmin(body)) return json(401, { error: "Unauthorized" });
  const { date, time } = body;
  if (!isValidBookingDate(date) || !isValidSlot(time)) {
    return json(400, { error: "Invalid date or time" });
  }
  const store = getAppointmentsStore();
  const day = await getDay(store, date);
  if (day.slots[time]) {
    return json(409, { error: "Slot already taken or blocked" });
  }
  day.slots[time] = { type: "blocked", createdAt: new Date().toISOString() };
  await setDay(store, date, day);
  return json(200, { success: true });
}

async function handleAdminUnblock(body) {
  if (!checkAdmin(body)) return json(401, { error: "Unauthorized" });
  const { date, time } = body;
  const store = getAppointmentsStore();
  const day = await getDay(store, date);
  const slot = day.slots[time];
  if (!slot) return json(404, { error: "Nothing to remove" });
  delete day.slots[time];
  await setDay(store, date, day);
  return json(200, { success: true });
}

async function handleAdminBlockDay(body) {
  if (!checkAdmin(body)) return json(401, { error: "Unauthorized" });
  const { date } = body;
  if (!isValidBookingDate(date)) {
    return json(400, { error: "Invalid date" });
  }
  const store = getAppointmentsStore();
  const day = await getDay(store, date);
  let blocked = 0;
  for (const time of SLOT_TIMES) {
    if (!day.slots[time]) {
      day.slots[time] = { type: "blocked", createdAt: new Date().toISOString() };
      blocked++;
    }
  }
  await setDay(store, date, day);
  return json(200, { success: true, blocked });
}

// ============ ROUTER ============
export const handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path.split("/").pop();

  try {
    if (method === "GET" && path === "availability") {
      return await handleGetAvailability(event.queryStringParameters || {});
    }

    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      switch (path) {
        case "book":          return await handleBook(body);
        case "lookup":        return await handleLookup(body);
        case "cancel":        return await handleCancel(body);
        case "admin-list":    return await handleAdminList(body);
        case "admin-block":   return await handleAdminBlock(body);
        case "admin-unblock": return await handleAdminUnblock(body);
        case "admin-block-day": return await handleAdminBlockDay(body);
      }
    }
    return json(404, { error: "Not found" });
  } catch (err) {
    console.error("Function error:", err);
    return json(500, { error: "Server error" });
  }
};

