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
  },
  common: {
    comingSoon: 'Tuleb peagi',
    comingSoonDescription: 'See moodul valmib järgmistes arendusetappides.',
    noData: 'Andmed puuduvad',
  },
} as const;
