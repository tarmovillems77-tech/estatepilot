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

React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Vitest. Data will be stored locally in the browser (IndexedDB via Dexie, added in step 2) behind a repository layer so a cloud backend can be added later.

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
