# Petrol Pump Daily Sales & Collection Software

A production-grade forecourt daily sales and collection management platform built to replace physical station notebook accounting sheets with precision financial and meter calculation.

---

## Architecture Overview

- **Monorepo:** Turborepo + pnpm workspaces + TypeScript (strict mode)
- **Backend API (`apps/api`):** Node.js 22, Express, Mongoose 8, JWT auth (access + rotating refresh tokens), role-based access control, in-memory replica set testing with MongoDB Memory Server.
- **Shared Package (`packages/shared`):** Zod schemas, TypeScript enums, Indian currency & number formatters, integer milli-unit and paise helpers, and a single source of truth **Calculation Engine** (`packages/shared/src/calc/`).
- **Web App (`apps/web`) — "Fuel Ledger":** React 19, Vite, TailwindCSS. The complete daily calculation app. See *Web App* below.
- **Vercel API (`api/`):** Serverless functions (`/api/health`, `/api/login`, `/api/data`) that store the web app's data in MongoDB. The web app and API deploy together as **one Vercel project** — see *Deploy on Vercel*.
- **Mobile Forecourt App (`apps/mobile`):** React Native, Expo SDK 52, Expo Router, `eas.json` preview profile configured for direct Android `.apk` builds.
- **Shared Config (`packages/config`):** Base, Node, and React tsconfig presets.

---

## Core Financial & Business Rules

1. **No JavaScript Floating-Point Drift:**
   - Meter readings stored as integer thousandths (milli-units: `2127209.495` → `2127209495`).
   - Rates and amounts stored as integer paise (₹`100.45` → `10045`).
   - Pure arbitrary-precision math using Decimal.js with exact Indian numbering format (`12,231.79`, `1,23,456.00`).
2. **Client Notebook Rounding Rule:**
   - Litres per nozzle = `closing - opening - testingLitres`, rounded to 2 decimals.
   - Product litres = sum of nozzle litres.
   - Product amount = `truncate(litres * rate, 2)` by default (configurable per station to `ROUND_HALF_UP`).
3. **Reconciliation & Denomination Balancing:**
   - Total Collected = `Cash + Online (P.T.M / UPI) + Card + Due (Credit)`.
   - Attendant Short/Excess = `Total Collected - Total Sale Amount`.
   - Day Closing Denominations (`500 × 92 + 200 × 35 + 100 × 133 + 20 × 6 + 10 × 4 = 66,460.00`) directly balances against sheet cash and adjustments.

---

## Real Client Seed Data (19/06/2026)

- **Product A (Petrol):** ₹100.45 / L
- **Product B:** ₹114.15 / L
- **Machine 219 (Dispenser 1):**
  - Product A: 121.77 L = ₹12,231.79
  - Product B: 139.40 L = ₹15,912.51
  - Sheet Total: ₹28,144.30
  - Collections: Cash ₹22,525.00 + Online ₹5,282.00 + Card ₹333.00 = ₹28,140.00 → **Short ₹4.30**
- **Machine 285 (Dispenser 2):**
  - Product A: 481.82 L = ₹48,398.81
  - Product B: 111.43 L = ₹12,719.73
  - Sheet Total: ₹61,118.54
  - Collections: Cash ₹43,885.00 + Online ₹5,775.00 + Due ₹11,451.00 = ₹61,111.00 → **Short ₹7.54**
- **Day Closing:**
  - Online Total: ₹11,057.00
  - Expected Cash: ₹43,885.00 + ₹22,525.00 + ₹50.00 (Other) = ₹66,460.00
  - Denomination Count: ₹66,460.00 → **Cash Difference: ₹0.00 (Balanced)**

---

## Web App (`apps/web`)

The web app replaces the notebook page directly. Deployed on Vercel, it stores data in MongoDB and syncs across devices (see *Deploy on Vercel*). Run without a backend, it works fully on one device (localStorage), with JSON backup/restore.

| Screen | What it does |
|---|---|
| **Today** | Day's total sale in a dispenser-style display, petrol/diesel litres, collected, short/excess per machine, cash-in-drawer check, outstanding dues, last 7 days. |
| **Meter Sheet** | One tab per machine (219, 285 …). Each nozzle: opening (auto-carried from yesterday's closing), closing, optional test litres → litres. Per product `litres × rate = amount` (notebook rounding), machine total. Collections: cash, P.T.M/UPI slips, card slips, due (credit) per customer, remark. Live short/excess. Lock a finished day. Print. |
| **Shifts & Staff** | Each machine's day can have 2–3 worker shifts (Meter Sheet → *Add shift*). Each shift has its own worker, timing, readings, money and short/excess; a shift's closing reading becomes the next shift's opening automatically. The **Staff** page shows who is on duty, a monthly attendance grid (shifts per day, litres, short/excess per worker), shift history and CSV export. Shift timings are set in Settings. |
| **LPG business** | Switch **Petrol ⇄ LPG** at the top. The LPG daily sheet follows the client's printed form: Refilling (A), Product sale (B: oven, hose, DPR…), New connection / TV in (C), TV return refunds and Cost (D). Enter qty × rate plus PhonePe and due amounts – cash is calculated. Summary: final amount (A+B+C−TV−D), online (a+b+c), cash (d+e+f), due, net cash in hand, current/EDFS account amounts and final balance. Cylinder stock (full/empty/defective per type) carries forward day to day. LPG reports with CSV. LPG days sync to MongoDB collection `lpg_days`. |
| **Day Closing** | Note counter (₹2000…₹1 + coins) vs expected cash (machine cash + due received in cash + other cash − expenses). Total online (P.T.M). Day summary table per machine. |
| **Dues** | Credit customers with running balance (opening due + credit given on sheets − payments received), payment receipt (cash/online), full ledger. |
| **Reports** | Date range (7d / 30d / month / all / custom), totals, daily sales chart, product share, day-wise table, CSV export, print. |
| **Settings** | Station name, products & default rates, machines & nozzles (any count, product per nozzle, starting reading), rounding rule, tolerance, English/বাংলা, light/dark/system theme, backup/restore, sample data, reset. |

Things that speed up entry or catch mistakes:

- Amount fields take notebook-style sums: `20000+2525` and `500x92` both work. In the P.T.M or card box, typing `1160+114+500` and pressing Enter adds three separate slips.
- Opening readings carry forward. If an opening doesn't match the previous closing you get a warning with one-click fix.
- A closing reading lower than the opening is flagged. So is any nozzle that shows more than 5,000 L in a day.
- Short/excess colours: green when it balances exactly, amber within the tolerance you set, red beyond it.
- Changing the rate on the latest day also updates the default rate for the days after it. Each day keeps its own rate history.
- Fully responsive: a side menu on desktop, a bottom tab bar on phones, and print-friendly pages.

```bash
pnpm --filter @petrolpump/web dev      # http://localhost:5173
pnpm --filter @petrolpump/web test     # notebook-page regression tests
pnpm --filter @petrolpump/web build    # static files in apps/web/dist (host anywhere)
```

On first launch choose **Explore with sample data** to load the two notebook pages from 19/06/2026 (Machine 219 short ₹4.30, Machine 285 short ₹7.54, cash drawer ₹66,460 balanced).

---

## Deploy on Vercel (frontend + backend in one project)

The repo root is the Vercel project. `vercel.json` builds the web app into static files and deploys `api/*.ts` as serverless functions on the same domain, so there's no CORS to configure and nothing else to host.

```
https://your-app.vercel.app/            → web app (apps/web/dist)
https://your-app.vercel.app/api/health  → status / configuration check
https://your-app.vercel.app/api/login   → POST { password } → token (30 days)
https://your-app.vercel.app/api/data    → GET snapshot / PUT changes (needs token)
```

**1. MongoDB Atlas**
- Create a free cluster and a database user.
- Under *Network Access*, allow `0.0.0.0/0`. Vercel functions don't have fixed IP addresses.
- Copy the connection string (`mongodb+srv://…`).

**2. Vercel project**
- *Add New → Project*, then import this GitHub repo.
- Leave **Root Directory** empty (the repo root) and **Framework Preset** as *Other*. Install, build and output settings come from `vercel.json`, so don't override them.
- Under *Environment Variables*, add:

| Name | Required | Value |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string. `MONGO_URI` / `MONGO_URL` / `DATABASE_URL` also work. |
| `APP_PASSWORD` | yes | The password staff type to open the ledger. Changing it signs everyone out. |
| `MONGODB_DB` | no | Database name if it isn't in the URI (default `fuel_ledger`). |
| `AUTH_SECRET` | no | Separate secret for signing login tokens. |

- Click **Deploy**. If you add or change variables later, use *Redeploy*.

If a variable is missing, the site shows a "Server setup needed" page that names it. You can also open `/api/health`.

**How data works once deployed**
- Each device signs in once with `APP_PASSWORD`. All devices then share the same data.
- Edits upload in the background, under a second after you stop typing. A cloud icon shows *Synced / Saving… / Offline*.
- With no internet, entries are kept on the device and upload when the connection returns.
- Other devices pick up changes when the tab regains focus, and every 30 seconds.
- Language and theme are per-device settings. Everything else is shared.
- MongoDB layout: collection `days` holds one document per date. Collection `kv` holds `settings`, `customers`, `receipts` and a `meta` revision counter.
- *Settings → Download backup* still exports everything as JSON.

**Run the same thing locally**

```bash
# repo-root .env.local
APP_PASSWORD=dev-password
# MONGODB_URI=mongodb+srv://...   (omit to use an in-memory database)
```

```bash
pnpm --filter @petrolpump/web dev   # http://localhost:5173 — web app + /api
pnpm test:api                       # API tests
```

Without `APP_PASSWORD` in `.env.local`, the dev server runs the app in device-only mode, which is the original offline behaviour.

> The older Express API (`apps/api`) and the Expo app (`apps/mobile`) are not part of the Vercel deployment; `vercel.json` installs only the web app, the shared package and the root API dependencies.

---

## How to Run

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Start Local MongoDB Replica Set (Docker)
```bash
docker compose up -d
```

### 3. Run Automated Tests
```bash
# Run shared calculation engine tests (all section 9 test cases)
pnpm --filter @petrolpump/shared test

# Run API foundation integration tests (including MongoDB transactions & seed verification)
pnpm --filter @petrolpump/api test
```

### 4. Seed Database with Real Notebook Data
```bash
pnpm seed
```

### 5. Start Development Servers
```bash
# Starts API server on port 5000 and Web frontend on port 5173
pnpm dev
```

---

## Open Questions & TODOs for Client Confirmation

- [ ] **Product B Identity:** Confirm if the second product (rate ₹114.15) is Diesel or Premium Petrol (seeded as "Product B", renameable in master).
- [ ] **Machine vs Attendant Numbers:** Confirm if "219" and "285" refer strictly to physical dispenser machines, or shift/attendant book identifiers.
- [ ] **Shift Frequency:** Confirm if sheets are closed strictly once per day or per shift (e.g., Morning/Evening).
- [ ] **Bank Settlement:** Confirm if card swipe amounts are reconciled with physical bank batch settlement slips later.
- [ ] **Tank Stock Tracking:** Confirm if dip reading / underground tank stock tracking is required in subsequent phases.

