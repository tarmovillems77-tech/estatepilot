// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/renderApp';

afterEach(cleanup);

describe('property pages', () => {
  it('lists demo properties and filters by search', async () => {
    renderApp('/kinnisvara');
    expect(await screen.findByRole('link', { name: 'Pärna 14 korterid' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kesk 3 korterelamu' })).toBeTruthy();

    await userEvent.type(screen.getByPlaceholderText(/Otsi nime/), 'tartu');
    expect(screen.getByRole('link', { name: 'Tähe 27 ärimaja' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Pärna 14 korterid' })).toBeNull();
  });

  it('shows figures, the calculation breakdown and units of an owned property', async () => {
    const { router } = renderApp('/kinnisvara');
    await userEvent.click(await screen.findByRole('link', { name: 'Pärna 14 korterid' }));

    expect(await screen.findByRole('heading', { name: 'Pärna 14 korterid' })).toBeTruthy();
    expect(router.state.location.pathname).toMatch(/^\/kinnisvara\/[\w-]+$/);
    expect(await screen.findByText('Arvutuse käik')).toBeTruthy();
    expect(screen.getByText('= Puhas tegevustulu (NOI)', { exact: false })).toBeTruthy();
    expect(screen.getAllByText('NOI / laenumaksed', { exact: false }).length).toBeGreaterThan(0);

    const korter4 = screen.getByText('Korter 4').closest('tr');
    expect(korter4 && within(korter4).getByText('Vaba')).toBeTruthy();
    expect(screen.getByText('Prognoosi stsenaariumi järgi')).toBeTruthy();
  });

  it('shows an estimate for a prospect', async () => {
    renderApp('/kinnisvara');
    await userEvent.click(await screen.findByRole('link', { name: 'Kesk 3 korterelamu' }));
    expect(await screen.findByText('Küsitav hind')).toBeTruthy();
    expect(screen.getByText(/Hinnang turuüüride põhjal/)).toBeTruthy();
    expect(screen.getByText(/Tegevuskulud \(hinnang 15%/)).toBeTruthy();
  });

  it('validates and creates a property', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/kinnisvara/uus');
    await screen.findByRole('heading', { name: 'Uus kinnisvaraobjekt' });

    await user.click(screen.getByRole('button', { name: 'Salvesta' }));
    expect(screen.getAllByText('Kohustuslik väli').length).toBeGreaterThan(0);
    expect(screen.getByRole('alert').textContent).toBe('Palun paranda märgitud väljad.');

    await user.type(screen.getByLabelText('Nimetus'), 'Näidis 1 ridaelamu');
    await user.type(screen.getByLabelText('Aadress'), 'Näidise tn 1');
    await user.type(screen.getByLabelText('Linn või vald'), 'Viljandi');
    await user.type(screen.getByLabelText('Ostuhind'), '210 000');
    await user.type(screen.getByLabelText('Turuväärtus'), '215 000,50');
    await user.type(screen.getByLabelText('Üüri indekseerimine aastas'), '0');
    await user.click(screen.getByRole('button', { name: 'Salvesta' }));

    expect(await screen.findByRole('heading', { name: 'Näidis 1 ridaelamu' })).toBeTruthy();
    expect(router.state.location.pathname).not.toBe('/kinnisvara/uus');
    expect(screen.getByText('0% (üür ei muutu)')).toBeTruthy();
    // Market value is shown rounded to whole euros (KPI and details card).
    expect(screen.getAllByText(/215\s001\s€/).length).toBeGreaterThan(0);
  });

  it('adds, edits and deletes a unit', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderApp('/kinnisvara');
    await user.click(await screen.findByRole('link', { name: 'Mõisa tee 5 laohoone' }));
    await screen.findByText('Ladu A');

    await user.click(screen.getByRole('button', { name: 'Lisa üksus' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nimetus'), 'Ladu C');
    await user.selectOptions(within(dialog).getByLabelText('Liik'), 'warehouse');
    await user.type(within(dialog).getByLabelText('Pind (m²)'), '450');
    await user.type(within(dialog).getByLabelText('Turuüür kuus'), '2 000');
    await user.click(within(dialog).getByRole('button', { name: 'Salvesta' }));

    const row = (await screen.findByText('Ladu C')).closest('tr');
    if (!row) throw new Error('row missing');
    expect(within(row).getByText('Vaba')).toBeTruthy();
    // Four-digit amounts are not grouped in Estonian: "2000 €".
    expect(within(row).getByText(/^2000\s€$/)).toBeTruthy();

    await user.click(within(row).getByRole('button', { name: 'Muuda: Ladu C' }));
    const rent = within(screen.getByRole('dialog')).getByLabelText('Turuüür kuus');
    expect((rent as HTMLInputElement).value).toBe('2000');
    await user.clear(rent);
    await user.type(rent, '2100');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvesta' }));
    expect(await screen.findByText(/^2100\s€$/)).toBeTruthy();

    const updated = screen.getByText('Ladu C').closest('tr');
    if (!updated) throw new Error('row missing');
    await user.click(within(updated).getByRole('button', { name: 'Kustuta: Ladu C' }));
    await vi.waitFor(() => expect(screen.queryByText('Ladu C')).toBeNull());
  });
});
