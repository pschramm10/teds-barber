# Ted's Barber

Simple appointment booking website for Ted's Barber, deployable to Netlify.

## Features

- **Customer booking**: Tue–Sat, 1:30–5:30 PM, 30-minute slots, up to 30 days out
- **Customer cancellation**: Look up appointments by phone number and cancel
- **Admin dashboard** (password-protected):
  - View all upcoming bookings and blocked slots
  - Block individual time slots
  - Block entire days (vacation, sickness, etc.)
  - Cancel any booking or unblock slots
- **Server-side storage** via Netlify Blobs (no separate database needed)
- **Time zone**: America/Chicago (Houston)

## Deploy to Netlify

### Option 1: Drag-and-drop (fastest)

1. Sign up / log in at https://netlify.com
2. Run `npm install` locally to install dependencies into `node_modules`
3. Drag the entire project folder onto Netlify's deploy area
4. Once deployed, go to **Site Settings → Environment Variables** and add:
   - Key: `ADMIN_PASSWORD`
   - Value: *(your chosen password — see security note below)*
5. Trigger a redeploy so the env var takes effect

### Option 2: Git deploy (recommended for ongoing changes)

1. Push this folder to a GitHub repo
2. In Netlify: **Add new site → Import from Git → pick the repo**
3. Netlify auto-detects `netlify.toml`. Click **Deploy**.
4. Add the `ADMIN_PASSWORD` environment variable as in Option 1.

## Configuration

Edit constants at the top of `netlify/functions/appointments.mjs`:

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_PASSWORD` | `barber123` | **Change this via env var, NOT in code** |
| `OPEN_DAYS` | `[2,3,4,5,6]` | 0=Sun..6=Sat |
| `SLOT_TIMES` | `13:30..17:00` | Available 30-min slots |
| `BOOKING_WINDOW_DAYS` | `30` | How far out customers can book |
| `TIMEZONE` | `America/Chicago` | IANA tz |

If you change `OPEN_DAYS` or `SLOT_TIMES`, also update the matching arrays in `public/app.js` and the time `<select>` in `public/admin.html`.

## Security notes

- **Set `ADMIN_PASSWORD` via Netlify env vars**. The default `barber123` in code is only a fallback for local testing.
- The admin password is checked server-side in the Netlify Function — it is never exposed to the browser.
- Customer phone numbers are stored in Netlify Blobs. Treat the admin password as a real secret.
- This is a small-business booking site, not a high-security system. For higher volume, move to Supabase/Firebase + add SMS confirmations via Twilio.

## Local development

```bash
npm install
npm install -g netlify-cli   # if not already
netlify dev
```

Open http://localhost:8888

## File structure

```
.
├── netlify.toml                          # Netlify config
├── package.json                          # @netlify/blobs dependency
├── netlify/functions/appointments.mjs    # All booking API logic
└── public/
    ├── index.html                        # Customer booking + cancel
    ├── admin.html                        # Staff dashboard
    ├── styles.css                        # Vintage barbershop theme
    ├── app.js                            # Customer JS
    └── admin.js                          # Admin JS
```

## What you might want next

- **SMS confirmations & reminders** — sign up for Twilio, add a `sendSMS()` call inside `handleBook` and a scheduled function for reminders
- **Email confirmations** — SendGrid or Resend
- **Recurring closures** (e.g., closed every July 4th) — extend the blocking logic to support recurring rules
- **Service types & duration** — currently every appt is 30 min; add a service picker if you offer different cuts
- **Multiple barbers** — if you hire help, slots would need a barber dimension
