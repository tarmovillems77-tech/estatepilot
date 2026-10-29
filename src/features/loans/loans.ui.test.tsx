// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/renderApp';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rowOf = (text: string) => {
  const row = screen.getAllByText(text)[0]?.closest('tr');
  if (!row) throw new Error(`row for ${text} missing`);
  return row;
};

describe('loans page', () => {
  it('shows DSCR and LTV per property, portfolio loans and the total', async () => {
    renderApp('/laenud');
    expect(
      await screen.findByRole('heading', { name: 'DSCR ja LTV objektide kaupa' }),
    ).toBeTruthy();
    expect(within(rowOf('Portfelli tasandi laenud')).getAllByText(/€/).length).toBeGreaterThan(0);
    const total = rowOf('Portfell kokku');
    expect(within(total).getByText(/×$/)).toBeTruthy();
    expect(within(total).getByText(/%$/)).toBeTruthy();
  });

  it('marks actual and calculated balances in the loan list', async () => {
    renderApp('/laenud');
    const parna = (await screen.findByText('NP-2021-0417')).closest('tr');
    expect(parna && within(parna).getByText('Tegelik')).toBeTruthy();
    expect(within(rowOf('DP-23-778')).getByText('Arvutuslik')).toBeTruthy();
    expect(within(rowOf('NP-2024-PORTF')).getByText('Portfelli laen')).toBeTruthy();
    // Euribor and margin shown separately.
    expect(
      within(rowOf('NP-2019-0102')).getByText(/3M Euribor .* \+ marginaal .* = /),
    ).toBeTruthy();
  });

  it('applies a new 6-month Euribor to all 6M loans', async () => {
    const user = userEvent.setup();
    renderApp('/laenud');
    const label = await screen.findByText('6 kuu Euribor');
    const input = label.closest('label')?.querySelector('input');
    if (!input) throw new Error('rate input missing');
    await user.clear(input);
    await user.type(input, '3');
    // The rate input and its button sit side by side in one row.
    const group = input.closest('label')?.parentElement;
    if (!group) throw new Error('rate group missing');
    await user.click(within(group).getByRole('button', { name: 'Rakenda' }));
    expect(await screen.findByText('Määr uuendatud 2 laenul.')).toBeTruthy();
    await vi.waitFor(() =>
      expect(within(rowOf('NP-2024-PORTF')).getByText(/Euribor 3,00%/)).toBeTruthy(),
    );
  });

  it('creates a portfolio-level loan with a 19-year term', async () => {
    const user = userEvent.setup();
    renderApp('/laenud');
    await user.click(await screen.findByRole('button', { name: 'Lisa laen' }));
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Salvesta' }));
    expect(within(dialog).getAllByText('Kohustuslik väli').length).toBeGreaterThan(0);

    await user.selectOptions(within(dialog).getByLabelText('Objekt'), 'Portfell (kõik objektid)');
    await user.type(within(dialog).getByLabelText('Laenuandja'), 'Näidis Liising AS');
    await user.type(within(dialog).getByLabelText('Lepingu number'), 'NL-19');
    await user.type(within(dialog).getByLabelText('Laenusumma'), '50 000');
    await user.selectOptions(within(dialog).getByLabelText('Laenuperiood'), '19 a');
    await user.type(within(dialog).getByLabelText('Euribor (praegu)'), '2,1');
    await user.type(within(dialog).getByLabelText('Pangamarginaal'), '2,5');
    await user.click(within(dialog).getByRole('button', { name: 'Salvesta' }));

    const row = await vi.waitFor(() => rowOf('NL-19'));
    expect(within(row).getByText('19 a')).toBeTruthy();
    expect(within(row).getByText('Portfelli laen')).toBeTruthy();
    expect(within(row).getByText('Arvutuslik')).toBeTruthy();
  });
});

describe('loan detail page', () => {
  it('separates the bank balance from the calculation and compares terms', async () => {
    const user = userEvent.setup();
    renderApp('/laenud');
    const link = (await screen.findByText('NP-2021-0417')).closest('tr')?.querySelector('a');
    if (!link) throw new Error('loan link missing');
    await user.click(link);

    expect(await screen.findByRole('heading', { name: 'Laenujääk' })).toBeTruthy();
    expect(screen.getAllByText('Tegelik').length).toBeGreaterThan(0);
    expect(screen.getByText('Erinevus panga jäägist')).toBeTruthy();
    expect(screen.getByText(/Graafiku järgi oleks/)).toBeTruthy();

    const terms = screen
      .getByRole('heading', { name: 'Laenuperioodi võrdlus' })
      .closest('div')?.parentElement;
    if (!terms) throw new Error('term comparison missing');
    for (const years of ['19 a', '20 a', '24 a', '25 a']) {
      expect(within(terms).getByText(years)).toBeTruthy();
    }
    expect(within(terms).getByText('(praegune)')).toBeTruthy();
  });

  it('runs a refinancing scenario and shows the schedule by month', async () => {
    const user = userEvent.setup();
    renderApp('/laenud');
    const link = (await screen.findByText('NP-2019-0102')).closest('tr')?.querySelector('a');
    if (!link) throw new Error('loan link missing');
    await user.click(link);

    const heading = await screen.findByRole('heading', { name: 'Refinantseerimise stsenaarium' });
    const card = heading.parentElement;
    if (!card) throw new Error('refinance card missing');
    expect(within(card).getByText('Jääk refinantseerimisel')).toBeTruthy();
    expect(within(card).getByText(/Kokkuhoid|Lisakulu/)).toBeTruthy();

    // A lower margin over a term close to the remaining one is cheaper.
    const margin = within(card).getByLabelText('Uus marginaal');
    await user.clear(margin);
    await user.type(margin, '0,5');
    await user.selectOptions(within(card).getByLabelText('Uus periood'), '10 a');
    expect(within(card).getByText(/Kokkuhoid laenu lõpuni/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Kuude kaupa' }));
    expect(screen.getByText('sh Euribor')).toBeTruthy();
    expect(screen.getByText('sh marginaal')).toBeTruthy();
  });
});
