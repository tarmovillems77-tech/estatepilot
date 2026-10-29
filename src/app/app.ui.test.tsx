// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '@/test/renderApp';

afterEach(cleanup);

describe('app shell', () => {
  it('renders the dashboard with portfolio figures from demo data', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Töölaud' })).toBeTruthy();
    const debtCard = (await screen.findByText('Laenujääk kokku')).parentElement;
    expect(debtCard && within(debtCard).getByText(/€$/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tähe 27 ärimaja' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tähelepanu' })).toBeTruthy();
  });

  it('renders the settings page with record counts', async () => {
    renderApp('/seaded');
    expect(await screen.findByText('Objekte')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Taasta näidisandmed' })).toBeTruthy();
  });

  it('shows a not-found page for unknown addresses', async () => {
    renderApp('/olematu');
    expect(await screen.findByRole('heading', { name: 'Lehte ei leitud' })).toBeTruthy();
  });
});
