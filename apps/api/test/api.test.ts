import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { runSeed } from '../src/scripts/seed.js';
import { env } from '../src/config/env.js';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri();
  await connectDB(uri);
  await runSeed(false);
}, 60000);

afterAll(async () => {
  await disconnectDB();
  if (replSet) {
    await replSet.stop();
  }
});

describe('API Foundation & Integration Tests', () => {
  let ownerToken: string;
  let stationId: string;

  it('GET /api/v1/health returns ok status and connected database', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
  });

  it('POST /api/v1/auth/login logs in owner with seed credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        phone: env.DEFAULT_OWNER_PHONE,
        password: env.DEFAULT_OWNER_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('OWNER');
    expect(res.body.user.phone).toBe(env.DEFAULT_OWNER_PHONE);

    ownerToken = res.body.accessToken;
    stationId = res.body.user.stationId;
  });

  it('POST /api/v1/auth/pin-login logs in with 4-digit PIN', async () => {
    const res = await request(app)
      .post('/api/v1/auth/pin-login')
      .send({
        phone: env.DEFAULT_OWNER_PHONE,
        pin: env.DEFAULT_OWNER_PIN,
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('OWNER');
  });

  it('GET /api/v1/rates/current returns active product rates', async () => {
    const res = await request(app)
      .get('/api/v1/rates/current')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(2);

    const petrol = res.body.rates.find((r: any) => r.shortCode === 'PETROL');
    const prodB = res.body.rates.find((r: any) => r.shortCode === 'PROD_B');

    expect(petrol.ratePaise).toBe(10045); // 100.45
    expect(prodB.ratePaise).toBe(11415); // 114.15
  });

  it('POST /api/v1/sheets/preview calculates live sheet preview without persisting', async () => {
    const res = await request(app)
      .post('/api/v1/sheets/preview')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nozzleReadings: [
          {
            nozzleId: '507f1f77bcf86cd799439011',
            productId: '507f1f77bcf86cd799439012',
            openingMilli: 2127209495,
            closingMilli: 2127216665,
            testingLitresCenti: 0,
            isMeterReset: false,
          },
        ],
        payments: [
          {
            mode: 'CASH',
            amountPaise: 72000,
          },
        ],
        rates: [
          {
            productId: '507f1f77bcf86cd799439012',
            ratePaise: 10045,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.preview.nozzleResults[0].litres).toBe('7.17');
    expect(res.body.preview.productTotals[0].amountRupees).toBe('720.22');
  });

  it('Verifies Section 1.1 seeded sheets and day closing values', async () => {
    // 1. Check Sheet 1 (Machine 219)
    const sheetsRes = await request(app)
      .get('/api/v1/sheets?date=2026-06-19')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(sheetsRes.status).toBe(200);
    expect(sheetsRes.body.sheets).toHaveLength(2);

    const sheet219 = sheetsRes.body.sheets.find((s: any) => s.machineId.number === '219');
    const sheet285 = sheetsRes.body.sheets.find((s: any) => s.machineId.number === '285');

    expect(sheet219).toBeDefined();
    expect(sheet219.totalAmountPaise).toBe(2814430); // 28,144.30
    expect(sheet219.totalCollectedPaise).toBe(2814000); // 28,140.00
    expect(sheet219.shortExcessPaise).toBe(-430); // Short -4.30

    expect(sheet285).toBeDefined();
    expect(sheet285.totalAmountPaise).toBe(6111854); // 61,118.54
    expect(sheet285.totalCollectedPaise).toBe(6111100); // 61,111.00
    expect(sheet285.shortExcessPaise).toBe(-754); // Short -7.54

    // 2. Check Day Closing for 2026-06-19
    const closingRes = await request(app)
      .get('/api/v1/day-closing/2026-06-19')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(closingRes.status).toBe(200);
    expect(closingRes.body.dayClosing.onlineTotalPaise).toBe(1105700); // 11,057.00
    expect(closingRes.body.dayClosing.denominationTotalPaise).toBe(6646000); // 66,460.00
    expect(closingRes.body.dayClosing.cashDifferencePaise).toBe(0); // Balanced match!
  });

  it('Creates a next-day sheet verifying opening reading auto-fill from previous closing', async () => {
    // Find machine 219 and attendant
    const machinesRes = await request(app)
      .get('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`);

    const m219 = machinesRes.body.machines.find((m: any) => m.number === '219');

    const staffRes = await request(app)
      .get('/api/v1/staff')
      .set('Authorization', `Bearer ${ownerToken}`);

    const staff1 = staffRes.body.staff[0];

    // Create sheet for next day (2026-06-20)
    const newSheetRes = await request(app)
      .post('/api/v1/sheets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        businessDate: '2026-06-20',
        shift: 'DAY',
        machineId: m219._id,
        staffId: staff1._id,
      });

    expect(newSheetRes.status).toBe(201);
    const newSheet = newSheetRes.body.sheet;

    // Verify each nozzle's opening matches previous closing:
    // Nozzle 1 opening must be 2127216665 (which was closing of 19/06)
    expect(newSheet.nozzleReadings[0].openingMilli).toBe(2127216665);
    expect(newSheet.nozzleReadings[1].openingMilli).toBe(1566562055);
    expect(newSheet.nozzleReadings[2].openingMilli).toBe(209353040);
    expect(newSheet.nozzleReadings[3].openingMilli).toBe(440908700);
  });
});

