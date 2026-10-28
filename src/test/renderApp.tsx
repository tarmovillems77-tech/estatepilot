import 'fake-indexeddb/auto';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/routes';
import { installEstonianErrors } from '@/i18n/validation';

/*
 * Renders the real app routes at `path` against an in-memory IndexedDB that is seeded with
 * the demo data on first open (each test file gets its own database).
 * Use in files marked with `// @vitest-environment jsdom`.
 */

installEstonianErrors();

// jsdom does not implement modal dialogs.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}
