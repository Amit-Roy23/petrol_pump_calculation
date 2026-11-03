import { RoundingMode } from '@petrolpump/shared';
import type { AppData, Machine, Settings } from './types';
import { uid } from './util';

function machine(id: string, name: string, readings: string[] = ['', '', '', '']): Machine {
  return {
    id,
    name,
    attendant: '',
    active: true,
    nozzles: [
      { id: `${id}-n1`, label: 'N1', productId: 'petrol', initialReading: readings[0] },
      { id: `${id}-n2`, label: 'N2', productId: 'petrol', initialReading: readings[1] },
      { id: `${id}-n3`, label: 'N3', productId: 'diesel', initialReading: readings[2] },
      { id: `${id}-n4`, label: 'N4', productId: 'diesel', initialReading: readings[3] },
    ],
  };
}

export function defaultSettings(): Settings {
  return {
    stationName: 'My Fuel Station',
    products: [
      { id: 'petrol', name: 'Petrol', nameBn: 'পেট্রোল', tone: 'petrol', ratePaise: 10045 },
      { id: 'diesel', name: 'Diesel', nameBn: 'ডিজেল', tone: 'diesel', ratePaise: 11415 },
    ],
    machines: [machine('m219', '219'), machine('m285', '285')],
    roundingMode: RoundingMode.TRUNCATE,
    tolerancePaise: 1000,
    language: 'en',
    theme: 'system',
  };
}

export function emptyData(): AppData {
  return { version: 1, settings: defaultSettings(), days: {}, customers: [], receipts: [] };
}

const amounts = (list: number[]) => list.map((a) => ({ id: uid(), amountPaise: a * 100 }));

/**
 * The two notebook pages the client shared (19/06/2026), entered exactly as written.
 * Machine 219 → short ₹4.30, Machine 285 → short ₹7.54, drawer cash balances to ₹66,460.
 */
export function sampleData(current?: AppData): AppData {
  const settings = defaultSettings();
  if (current) {
    settings.language = current.settings.language;
    settings.theme = current.settings.theme;
  }
  settings.stationName = 'Demo Fuel Station';
  settings.machines = [
    machine('m219', '219', ['2127209.495', '1566447.455', '209343.220', '440779.120']),
    machine('m285', '285', ['2101128.148', '1727476.473', '379571.089', '270753.198']),
  ];

  const customerId = uid();
  const date = '2026-06-19';

  return {
    version: 1,
    settings,
    customers: [{ id: customerId, name: 'Ghosh Transport', phone: '', vehicle: 'WB-11 truck', openingDuePaise: 0 }],
    receipts: [],
    days: {
      [date]: {
        date,
        rates: { petrol: 10045, diesel: 11415 },
        locked: false,
        updatedAt: new Date().toISOString(),
        sheets: {
          m219: {
            machineId: 'm219',
            attendant: '',
            remark: 'P.T.M closed 6:44',
            readings: {
              'm219-n1': { opening: '2127209.495', closing: '2127216.665', testing: '' },
              'm219-n2': { opening: '1566447.455', closing: '1566562.055', testing: '' },
              'm219-n3': { opening: '209343.220', closing: '209353.040', testing: '' },
              'm219-n4': { opening: '440779.120', closing: '440908.700', testing: '' },
            },
            cashPaise: 2252500,
            online: amounts([1160, 114, 500, 210, 220, 200, 100, 20, 888, 120, 100, 1200, 350, 100]),
            card: amounts([333]),
            dues: [],
          },
          m285: {
            machineId: 'm285',
            attendant: '',
            remark: 'P.T.M closed 5:28',
            readings: {
              'm285-n1': { opening: '2101128.148', closing: '2101384.468', testing: '' },
              'm285-n2': { opening: '1727476.473', closing: '1727701.973', testing: '' },
              'm285-n3': { opening: '379571.089', closing: '379646.739', testing: '' },
              'm285-n4': { opening: '270753.198', closing: '270788.978', testing: '' },
            },
            cashPaise: 4388500,
            online: amounts([520, 110, 14, 60, 230, 40, 200, 150, 101, 350, 100, 200, 3700]),
            card: [],
            dues: [{ id: uid(), amountPaise: 1145100, customerId, note: '' }],
          },
        },
        closing: {
          denominations: { '500': 92, '200': 35, '100': 133, '20': 6, '10': 4 },
          otherCash: [{ id: uid(), label: 'Other', amountPaise: 5000 }],
          expenses: [],
        },
      },
    },
  };
}
