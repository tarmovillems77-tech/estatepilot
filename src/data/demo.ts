import type { ExpenseCategory } from '@/domain/categories';
import { addMonths, toIsoDate } from '@/domain/dates';
import { isLeaseActive } from '@/domain/leases';
import type {
  Lease,
  LeaseInput,
  Loan,
  LoanInput,
  Property,
  PropertyInput,
  Tenant,
  TenantInput,
  Transaction,
  TransactionInput,
  Unit,
  UnitInput,
} from '@/domain/types';
import { newMeta } from './meta';
import type { DataSnapshot } from './store';

/*
 * Fictional demo portfolio. All names, companies, banks and addresses are invented;
 * e-mail addresses use the reserved example.com domain.
 *
 * Dates are relative to `today`, so lease expiries and the last 12 months of income and
 * expenses always look current. Amounts use a seeded random generator, so the same day
 * always produces the same numbers.
 */
export function buildDemoData(today: Date): DataSnapshot {
  const now = today.toISOString();
  const random = mulberry32(20261028);
  const between = (min: number, max: number) => Math.round(min + random() * (max - min));

  /** First day (or `day`) of the month `offset` months from today, as ISO date. */
  const month = (offset: number, day = 1) =>
    toIsoDate(addMonths(new Date(today.getFullYear(), today.getMonth(), day), offset));
  /** Last day of the month `offset` months from today. */
  const monthEnd = (offset: number) =>
    toIsoDate(new Date(today.getFullYear(), today.getMonth() + offset + 1, 0));

  const withMeta = <T>(input: T) => ({ ...input, ...newMeta(now) });

  const properties: Property[] = [];
  const units: Unit[] = [];
  const tenants: Tenant[] = [];
  const leases: Lease[] = [];
  const loans: Loan[] = [];
  const transactions: Transaction[] = [];

  const property = (input: PropertyInput) => push(properties, withMeta(input));
  const unit = (owner: Property, input: Omit<UnitInput, 'propertyId'>) =>
    push(units, withMeta({ ...input, propertyId: owner.id }));
  const tenant = (input: TenantInput) => push(tenants, withMeta(input));
  const lease = (leased: Unit, by: Tenant, input: Omit<LeaseInput, 'unitId' | 'tenantId'>) =>
    push(leases, withMeta({ ...input, unitId: leased.id, tenantId: by.id }));
  const loan = (input: LoanInput) => push(loans, withMeta(input));
  const transaction = (input: TransactionInput) => push(transactions, withMeta(input));

  // --- Properties and units ---------------------------------------------------------------

  const parna = property({
    name: 'Pärna 14 korterid',
    type: 'residential',
    status: 'owned',
    address: 'Pärna tn 14',
    city: 'Tallinn',
    purchasePrice: 480_000,
    acquisitionCosts: 9_600,
    purchaseDate: month(-64),
    marketValue: 565_000,
    marketValueDate: month(-2),
    totalArea: 194,
    yearBuilt: 1936,
    notes: 'Renoveeritud puitmaja, 4 korterit.',
  });
  const parna1 = unit(parna, {
    name: 'Korter 1',
    type: 'apartment',
    area: 48,
    rooms: 2,
    floor: 1,
    marketRent: 760,
  });
  const parna2 = unit(parna, {
    name: 'Korter 2',
    type: 'apartment',
    area: 48,
    rooms: 2,
    floor: 2,
    marketRent: 780,
  });
  const parna3 = unit(parna, {
    name: 'Korter 3',
    type: 'apartment',
    area: 66,
    rooms: 3,
    floor: 2,
    marketRent: 980,
  });
  const parna4 = unit(parna, {
    name: 'Korter 4',
    type: 'apartment',
    area: 32,
    rooms: 1,
    floor: 3,
    marketRent: 560,
  });

  const tahe = property({
    name: 'Tähe 27 ärimaja',
    type: 'commercial',
    status: 'owned',
    address: 'Tähe tn 27',
    city: 'Tartu',
    purchasePrice: 920_000,
    acquisitionCosts: 18_400,
    purchaseDate: month(-92),
    marketValue: 1_080_000,
    marketValueDate: month(-5),
    totalArea: 470,
    yearBuilt: 2008,
  });
  const tahe201 = unit(tahe, {
    name: 'Büroo 201',
    type: 'office',
    area: 180,
    floor: 2,
    marketRent: 1_980,
  });
  const tahe202 = unit(tahe, {
    name: 'Büroo 202',
    type: 'office',
    area: 120,
    floor: 2,
    marketRent: 1_380,
  });
  const tahe101 = unit(tahe, {
    name: 'Äripind 101',
    type: 'retail',
    area: 95,
    floor: 1,
    marketRent: 1_650,
  });
  const taheParking = unit(tahe, {
    name: 'Parkimiskohad (6)',
    type: 'parking',
    area: 75,
    floor: 0,
    marketRent: 300,
  });

  const moisa = property({
    name: 'Mõisa tee 5 laohoone',
    type: 'commercial',
    status: 'owned',
    address: 'Mõisa tee 5',
    city: 'Rae vald',
    purchasePrice: 880_000,
    acquisitionCosts: 17_600,
    purchaseDate: month(-38),
    marketValue: 900_000,
    marketValueDate: month(-3),
    totalArea: 1_400,
    yearBuilt: 2016,
  });
  const moisaA = unit(moisa, { name: 'Ladu A', type: 'warehouse', area: 800, marketRent: 3_600 });
  const moisaB = unit(moisa, { name: 'Ladu B', type: 'warehouse', area: 600, marketRent: 2_700 });

  // A purchase under consideration: units with market rents, no leases or transactions.
  const kesk = property({
    name: 'Kesk 3 korterelamu',
    type: 'residential',
    status: 'prospect',
    address: 'Kesk tn 3',
    city: 'Pärnu',
    purchasePrice: 395_000,
    acquisitionCosts: 7_900,
    purchaseDate: null,
    marketValue: 395_000,
    marketValueDate: toIsoDate(today),
    totalArea: 175,
    yearBuilt: 1962,
    notes: 'Müügipakkumine, ülevaatus tegemata.',
  });
  unit(kesk, {
    name: 'Korter 1',
    type: 'apartment',
    area: 52,
    rooms: 2,
    floor: 1,
    marketRent: 620,
  });
  unit(kesk, {
    name: 'Korter 2',
    type: 'apartment',
    area: 52,
    rooms: 2,
    floor: 2,
    marketRent: 620,
  });
  unit(kesk, {
    name: 'Korter 3',
    type: 'apartment',
    area: 71,
    rooms: 3,
    floor: 3,
    marketRent: 800,
  });

  // --- Tenants and leases -----------------------------------------------------------------

  const person = (name: string, email: string) =>
    tenant({ kind: 'person', name, email: `${email}@example.com` });
  const company = (name: string, email: string) =>
    tenant({ kind: 'company', name, email: `${email}@example.com` });

  const kati = person('Kati Karu', 'kati.karu');
  const jaan = person('Jaan Jänes', 'jaan.janes');
  const liisa = person('Liisa Lepp', 'liisa.lepp');
  const toomas = person('Toomas Tuul', 'toomas.tuul');
  const kuukiir = company('Kuukiire Tarkvara OÜ', 'kuukiir');
  const sinilill = company('Sinilille Disain OÜ', 'sinilill');
  const rabapiiga = company('Rabapiiga Kohvik OÜ', 'rabapiiga');
  const tormilind = company('Tormilinnu Logistika OÜ', 'tormilind');
  const kaljukotkas = company('Kaljukotka Kaubandus OÜ', 'kaljukotkas');

  const residential = { paymentDay: 5, annualIndexation: 0 };
  lease(parna1, kati, {
    ...residential,
    startDate: month(-26),
    endDate: null,
    monthlyRent: 740,
    deposit: 740,
  });
  // Ends within 3 months → shows up as "ending soon".
  lease(parna2, jaan, {
    ...residential,
    startDate: month(-10),
    endDate: monthEnd(2),
    monthlyRent: 780,
    deposit: 1_560,
  });
  lease(parna3, liisa, {
    ...residential,
    startDate: month(-40),
    endDate: null,
    monthlyRent: 950,
    deposit: 950,
  });
  // Ended two months ago → Korter 4 is vacant.
  lease(parna4, toomas, {
    ...residential,
    startDate: month(-23),
    endDate: monthEnd(-3),
    monthlyRent: 540,
    deposit: 540,
  });

  const commercial = { paymentDay: 1 };
  lease(tahe201, kuukiir, {
    ...commercial,
    startDate: month(-50),
    endDate: monthEnd(22),
    monthlyRent: 1_980,
    deposit: 3_960,
    annualIndexation: 0.03,
  });
  lease(tahe202, sinilill, {
    ...commercial,
    startDate: month(-14),
    endDate: monthEnd(46),
    monthlyRent: 1_380,
    deposit: 2_760,
    annualIndexation: 0.025,
  });
  lease(tahe101, rabapiiga, {
    ...commercial,
    startDate: month(-30),
    endDate: monthEnd(1),
    monthlyRent: 1_650,
    deposit: 3_300,
    annualIndexation: 0.03,
  });
  lease(taheParking, kuukiir, {
    ...commercial,
    startDate: month(-50),
    endDate: null,
    monthlyRent: 300,
    deposit: 0,
    annualIndexation: 0,
  });
  lease(moisaA, tormilind, {
    ...commercial,
    startDate: month(-36),
    endDate: monthEnd(24),
    monthlyRent: 3_600,
    deposit: 7_200,
    annualIndexation: 0.02,
  });
  lease(moisaB, kaljukotkas, {
    ...commercial,
    startDate: month(-14),
    endDate: monthEnd(46),
    monthlyRent: 2_700,
    deposit: 5_400,
    annualIndexation: 0.02,
  });

  // --- Loans ------------------------------------------------------------------------------

  loan({
    propertyId: parna.id,
    lender: 'Näidispank AS',
    principal: 336_000,
    startDate: month(-64),
    termMonths: 300,
    repaymentType: 'annuity',
    rateType: 'euribor',
    margin: 0.0185,
    euribor: 0.021,
  });
  loan({
    propertyId: tahe.id,
    lender: 'Näidispank AS',
    principal: 552_000,
    startDate: month(-92),
    termMonths: 240,
    repaymentType: 'equal_principal',
    rateType: 'euribor',
    margin: 0.022,
    euribor: 0.021,
  });
  loan({
    propertyId: moisa.id,
    lender: 'Demopank AS',
    principal: 616_000,
    startDate: month(-38),
    termMonths: 240,
    repaymentType: 'annuity',
    rateType: 'fixed',
    fixedRate: 0.0495,
  });

  // --- Income and expenses for the last 12 full months ------------------------------------

  const unitById = new Map(units.map((u) => [u.id, u]));
  const income = (u: Unit, date: string, amount: number) =>
    transaction({
      kind: 'income',
      category: u.type === 'parking' ? 'parking' : 'rent',
      propertyId: u.propertyId,
      unitId: u.id,
      date,
      amount,
      description: `Üür – ${u.name}`,
    });
  const expense = (
    owner: Property,
    category: ExpenseCategory,
    date: string,
    amount: number,
    description: string,
  ) =>
    transaction({
      kind: 'expense',
      category,
      propertyId: owner.id,
      unitId: null,
      date,
      amount,
      description,
    });

  const costPlans: CostPlan[] = [
    {
      property: parna,
      monthly: [
        { category: 'management', amount: 120, description: 'Haldusteenus' },
        { category: 'utilities', amount: 90, description: 'Üldelekter ja vesi', seasonal: true },
        { category: 'cleaning', amount: 60, description: 'Trepikoja koristus' },
      ],
      repairs: { chance: 0.35, min: 80, max: 450 },
      insurance: { month: 0, amount: 420 },
      landTax: 180,
    },
    {
      property: tahe,
      monthly: [
        { category: 'management', amount: 350, description: 'Haldusteenus' },
        { category: 'utilities', amount: 400, description: 'Küte ja üldelekter', seasonal: true },
        { category: 'cleaning', amount: 220, description: 'Üldpindade koristus' },
      ],
      repairs: { chance: 0.5, min: 150, max: 900 },
      insurance: { month: 5, amount: 1_800 },
      landTax: 950,
    },
    {
      property: moisa,
      monthly: [
        { category: 'management', amount: 250, description: 'Haldusteenus' },
        { category: 'utilities', amount: 150, description: 'Õuevalgustus ja vesi', seasonal: true },
      ],
      repairs: { chance: 0.3, min: 200, max: 1_200 },
      insurance: { month: 8, amount: 2_400 },
      landTax: 1_600,
    },
  ];

  for (let offset = -12; offset <= -1; offset++) {
    for (const l of leases) {
      const due = month(offset, l.paymentDay);
      const leased = unitById.get(l.unitId);
      if (!leased || !isLeaseActive(l, due)) continue;
      income(leased, due, l.monthlyRent);
      // Office and retail tenants in Tähe 27 reimburse shared running costs (kõrvalkulud).
      if (leased.propertyId === tahe.id && leased.type !== 'parking') {
        transaction({
          kind: 'income',
          category: 'service_charges',
          propertyId: tahe.id,
          unitId: leased.id,
          date: due,
          amount: round2(leased.area * SERVICE_CHARGE_PER_M2),
          description: `Kõrvalkulud – ${leased.name}`,
        });
      }
    }

    const calendarMonth = addMonths(
      new Date(today.getFullYear(), today.getMonth(), 1),
      offset,
    ).getMonth();
    // Heating season costs more.
    const season = [10, 11, 0, 1, 2].includes(calendarMonth)
      ? 1.8
      : [3, 9].includes(calendarMonth)
        ? 1.2
        : 1;

    for (const plan of costPlans) {
      for (const cost of plan.monthly) {
        const amount = cost.seasonal
          ? round2(cost.amount * season * (0.9 + random() * 0.2))
          : cost.amount;
        expense(plan.property, cost.category, month(offset, 10), amount, cost.description);
      }
      if (random() < plan.repairs.chance) {
        const amount = between(plan.repairs.min, plan.repairs.max);
        expense(
          plan.property,
          'maintenance',
          month(offset, between(5, 25)),
          amount,
          'Jooksev remont',
        );
      }
      if (calendarMonth === plan.insurance.month) {
        expense(
          plan.property,
          'insurance',
          month(offset, 15),
          plan.insurance.amount,
          'Kindlustus (aastamakse)',
        );
      }
      if (calendarMonth === 2) {
        expense(plan.property, 'land_tax', month(offset, 28), plan.landTax, 'Maamaks');
      }
    }
  }

  // One-off items: capital expenditure (outside NOI) and marketing the vacant flat.
  expense(parna, 'capex', month(-5, 20), 6_400, 'Trepikoja remont');
  expense(tahe, 'capex', month(-8, 12), 12_500, 'Ventilatsiooni uuendamine');
  expense(parna, 'marketing', month(-2, 3), 150, 'Üürikuulutus – Korter 4');

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  return { properties, units, tenants, leases, transactions, loans };
}

/** Monthly service charge advance per m² for the office building's tenants. */
const SERVICE_CHARGE_PER_M2 = 2.2;

interface CostPlan {
  property: Property;
  monthly: { category: ExpenseCategory; amount: number; description: string; seasonal?: boolean }[];
  repairs: { chance: number; min: number; max: number };
  /** Calendar month (0 = January) of the yearly premium. */
  insurance: { month: number; amount: number };
  /** Paid yearly in March. */
  landTax: number;
}

function push<T>(list: T[], item: T): T {
  list.push(item);
  return item;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Small deterministic PRNG (0 ≤ n < 1). */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
