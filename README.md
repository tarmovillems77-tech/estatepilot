# EstatePilot

EstatePilot – real estate investment analysis and property management. The user interface is in Estonian.

## Requirements

- Node.js 22.12+ (24 LTS recommended) with npm

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Scripts

| Command              | Purpose                            |
| -------------------- | ---------------------------------- |
| `npm run dev`        | Start the development server       |
| `npm run build`      | Type-check and build to `dist/`    |
| `npm run preview`    | Serve the production build locally |
| `npm test`           | Run unit tests once (Vitest)       |
| `npm run test:watch` | Run unit tests in watch mode       |
| `npm run lint`       | Lint with ESLint                   |
| `npm run typecheck`  | Type-check without building        |
| `npm run format`     | Format all files with Prettier     |

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Dexie (IndexedDB), Zod, Vitest.

## Data

- Data is stored locally in the browser (IndexedDB via Dexie). Components read through
  `src/data/hooks.ts` and write through `store` (`src/data/index.ts`), which implements the
  backend-agnostic `DataStore` interface in `src/data/store.ts`. A cloud backend only needs a
  new `DataStore` implementation and new hooks.
- Zod schemas in `src/domain/schemas.ts` validate every write (and later forms and imports).
- On first launch the database is filled with a fictional demo portfolio (`src/data/demo.ts`).
  Settings → "Taasta näidisandmed" restores it; "Kustuta kõik andmed" empties the database.
- Expenses fall into three groups (src/domain/categories.ts): operating expenses reduce NOI;
  capital expenditure and loan payments come after NOI. Debt service always comes from the loan
  schedules; recorded loan payments are only shown for reconciliation.
- Rent payments link to a lease (and so to a tenant) and a rent month; expected vs. received
  rent and arrears are computed in src/domain/rent.ts.
- Transaction CSV format (src/io/transactionsCsv.ts): ';' separator, decimal comma, dd.mm.yyyy,
  UTF-8 with BOM, signed amounts. Used for export now and for bank/accounting imports later.
- Money is EUR excluding VAT; rates are decimal ratios (0.045 = 4.5 %); dates are ISO strings.

## Project structure

```
src/
  app/            router, layout, navigation
  components/     shared UI components (components/ui = primitives)
  features/       one folder per module (dashboard, properties, …)
  domain/         types, validation schemas, finance calculations
  data/           database, repositories, demo data
  i18n/           Estonian UI strings (et.ts) and EUR / date formatters
```

## Conventions

- All UI text lives in `src/i18n/et.ts`; components never hard-code strings.
- Money, numbers and dates are formatted through `src/i18n/format.ts` (`et-EE`, EUR, `dd.mm.yyyy`).
- Demo data is fictional only — no real companies, people or tenants.
