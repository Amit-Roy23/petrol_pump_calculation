# Petrol Pump Daily Sales & Collection Software

A production-grade forecourt daily sales and collection management platform built to replace physical station notebook accounting sheets with precision financial and meter calculation.

---

## Architecture Overview

- **Monorepo:** Turborepo + pnpm workspaces + TypeScript (strict mode)
- **Backend API (`apps/api`):** Node.js 22, Express, Mongoose 8, JWT auth (access + rotating refresh tokens), role-based access control, in-memory replica set testing with MongoDB Memory Server.
- **Shared Package (`packages/shared`):** Zod schemas, TypeScript enums, Indian currency & number formatters, integer milli-unit and paise helpers, and a single source of truth **Calculation Engine** (`packages/shared/src/calc/`).
- **Web Dashboard (`apps/web`):** React 19, Vite, TailwindCSS, Lucide icons, responsive layout with station overview and notebook emulation screens.
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

