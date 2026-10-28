import type { StoreErrorCode } from '@/data/store';
import type { ExpenseCategory, IncomeCategory } from '@/domain/categories';
import type {
  PropertyStatus,
  PropertyType,
  RateType,
  RepaymentType,
  TenantKind,
  UnitType,
} from '@/domain/schemas';

/**
 * All user-facing text. The UI is Estonian-only for now; keeping strings here
 * (instead of inline in components) makes a second language possible later.
 */
export const et = {
  app: {
    name: 'EstatePilot',
    tagline: 'Kinnisvarainvesteeringute analüüs',
    openMenu: 'Ava menüü',
    closeMenu: 'Sulge menüü',
    localDataNotice: 'Andmed salvestatakse ainult selles brauseris.',
  },
  nav: {
    dashboard: 'Töölaud',
    properties: 'Kinnisvara',
    tenants: 'Üürnikud ja lepingud',
    transactions: 'Tulud ja kulud',
    loans: 'Laenud',
    forecast: 'Prognoos',
    compare: 'Võrdlus',
    import: 'Andmete import',
    settings: 'Seaded',
  },
  pages: {
    dashboard: {
      title: 'Töölaud',
      description: 'Portfelli koondülevaade ja olulisemad näitajad.',
    },
    properties: {
      title: 'Kinnisvara',
      description: 'Elu- ja ärikinnisvara objektid ning nende üüripinnad.',
    },
    tenants: {
      title: 'Üürnikud ja lepingud',
      description: 'Üürnike andmed, üürilepingud ja lepingute tähtajad.',
    },
    transactions: {
      title: 'Tulud ja kulud',
      description: 'Üüritulude ja tegevuskulude arvestus.',
    },
    loans: {
      title: 'Laenud',
      description: 'Laenud, intressimäärad ja maksegraafikud.',
    },
    forecast: {
      title: 'Prognoos',
      description: '5 aasta prognoos erinevate Euribori, laenu ja üüritulu stsenaariumitega.',
    },
    compare: {
      title: 'Võrdlus',
      description: 'Investeerimisobjektide võrdlemine kõrvuti.',
    },
    import: {
      title: 'Andmete import',
      description: 'Andmete laadimine CSV- ja Exceli-failidest.',
    },
    settings: {
      title: 'Seaded',
      description: 'Rakenduse seaded ja andmete varundamine.',
    },
    notFound: {
      title: 'Lehte ei leitud',
      description: 'Otsitud lehte ei ole olemas.',
      backHome: 'Tagasi töölauale',
    },
  },
  kpi: {
    portfolioValue: 'Portfelli väärtus',
    totalDebt: 'Laenujääk kokku',
    ltv: 'LTV',
    monthlyNoi: 'NOI kuus',
    monthlyFreeCashFlow: 'Vaba rahavoog kuus',
    occupancy: 'Täituvus',
    ownedProperties: (count: number) => `${count} objekti portfellis`,
    leasedUnits: (leased: number, total: number) => `${leased} / ${total} üksust välja üüritud`,
    calculationPending: 'Arvutus lisandub peagi',
  },
  dashboard: {
    propertiesTitle: 'Kinnisvaraobjektid',
    columns: {
      name: 'Nimi',
      type: 'Liik',
      status: 'Staatus',
      city: 'Asukoht',
      units: 'Üksusi',
      occupancy: 'Täituvus',
      marketValue: 'Turuväärtus',
    },
    emptyPortfolio: 'Portfellis pole veel ühtegi objekti.',
  },
  settings: {
    dataTitle: 'Andmed',
    dataDescription:
      'Kõik andmed salvestatakse selle brauseri andmebaasi (IndexedDB). Andmed ei lahku sinu arvutist.',
    counts: {
      properties: 'Objekte',
      units: 'Üksusi',
      tenants: 'Üürnikke',
      leases: 'Üürilepinguid',
      transactions: 'Tehinguid',
      loans: 'Laene',
    },
    resetDemo: 'Taasta näidisandmed',
    resetDemoConfirm:
      'Kõik praegused andmed asendatakse näidisandmetega. Seda ei saa tagasi võtta. Kas jätkata?',
    resetDemoDone: 'Näidisandmed on taastatud.',
    clearAll: 'Kustuta kõik andmed',
    clearAllConfirm: 'Kõik andmed kustutatakse jäädavalt. Kas jätkata?',
    clearAllDone: 'Kõik andmed on kustutatud.',
    demoNotice: 'Näidisandmed on täielikult väljamõeldud: nimed, ettevõtted, pangad ja aadressid.',
  },
  labels: {
    propertyType: { residential: 'Elukinnisvara', commercial: 'Ärikinnisvara' },
    propertyStatus: { owned: 'Portfellis', prospect: 'Analüüsimisel' },
    unitType: {
      apartment: 'Korter',
      house: 'Maja',
      office: 'Büroo',
      retail: 'Äripind',
      warehouse: 'Ladu',
      parking: 'Parkimiskoht',
      other: 'Muu',
    },
    tenantKind: { person: 'Eraisik', company: 'Ettevõte' },
    transactionKind: { income: 'Tulu', expense: 'Kulu' },
    incomeCategory: {
      rent: 'Üür',
      service_charges: 'Kõrvalkulude hüvitis',
      parking: 'Parkimine',
      other_income: 'Muu tulu',
    },
    expenseCategory: {
      management: 'Haldus',
      maintenance: 'Hooldus ja remont',
      utilities: 'Kommunaalkulud',
      insurance: 'Kindlustus',
      land_tax: 'Maamaks',
      cleaning: 'Koristus',
      marketing: 'Turundus',
      other_expense: 'Muu kulu',
      capex: 'Kapitaalremont',
    },
    repaymentType: { annuity: 'Annuiteetmaksed', equal_principal: 'Võrdsed põhiosamaksed' },
    rateType: { fixed: 'Fikseeritud intress', euribor: 'Euribor + marginaal' },
  } satisfies {
    propertyType: Record<PropertyType, string>;
    propertyStatus: Record<PropertyStatus, string>;
    unitType: Record<UnitType, string>;
    tenantKind: Record<TenantKind, string>;
    transactionKind: Record<'income' | 'expense', string>;
    incomeCategory: Record<IncomeCategory, string>;
    expenseCategory: Record<ExpenseCategory, string>;
    repaymentType: Record<RepaymentType, string>;
    rateType: Record<RateType, string>;
  },
  errors: {
    notFound: 'Kirjet ei leitud.',
    tenantHasLeases: 'Üürnikku ei saa kustutada, sest tal on üürilepinguid.',
    unknown: 'Midagi läks valesti. Palun proovi uuesti.',
  } satisfies Record<StoreErrorCode | 'unknown', string>,
  common: {
    comingSoon: 'Tuleb peagi',
    comingSoonDescription: 'See moodul valmib järgmistes arendusetappides.',
    noData: 'Andmed puuduvad',
    loading: 'Laadimine…',
  },
} as const;
