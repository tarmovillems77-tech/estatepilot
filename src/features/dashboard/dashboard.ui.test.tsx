// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '@/test/renderApp';

afterEach(cleanup);

/** The chart card (section) with the given title. */
const chartCard = (title: string) => {
  const section = screen.getByRole('heading', { name: title }).closest('section');
  if (!section) throw new Error(`chart ${title} missing`);
  return section;
};

/** Switches a chart card to its table view and returns the table rows' cell texts. */
async function tableOf(title: string) {
  const card = chartCard(title);
  await userEvent.click(within(card).getByRole('button', { name: 'Tabel' }));
  return within(card)
    .getAllByRole('row')
    .map((row) =>
      within(row)
        .queryAllByRole('cell')
        .map((cell) => cell.textContent ?? ''),
    )
    .filter((cells) => cells.length > 0);
}

describe('dashboard charts', () => {
  it('renders all five charts with legends', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Arengud' });
    for (const title of [
      'Rahavoog, viimased 12 kuud',
      'Laenujääk 5 aasta jooksul',
      'LTV 5 aasta jooksul',
      'DSCR trend',
      'Turuväärtus ja omakapital',
    ]) {
      expect(chartCard(title)).toBeTruthy();
    }
    expect(within(chartCard('DSCR trend')).getByText('Miinimum 1,20')).toBeTruthy();
    expect(within(chartCard('Rahavoog, viimased 12 kuud')).getByText('Vaba rahavoog')).toBeTruthy();
  });

  it('shows 12 months of NOI, loan payments and free cash flow from the database', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Arengud' });
    const rows = await tableOf('Rahavoog, viimased 12 kuud');
    expect(rows).toHaveLength(12);
    for (const [, noi, debt, fcf] of rows) {
      expect(noi).toMatch(/€$/);
      expect(debt).toMatch(/€$/);
      expect(fcf).toMatch(/€$/);
    }
  });

  it('projects five years after today for loan balance, LTV and DSCR', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Arengud' });
    const balance = await tableOf('Laenujääk 5 aasta jooksul');
    expect(balance.map((r) => r[0]?.split(' ')[0])).toEqual([
      'Praegu',
      '+1',
      '+2',
      '+3',
      '+4',
      '+5',
    ]);
    const amounts = balance.map((r) => Number((r[1] ?? '').replace(/\D/g, '')));
    expect(amounts.at(-1)).toBeLessThan(amounts[0] ?? 0);

    const dscr = await tableOf('DSCR trend');
    expect(dscr[0]).toHaveLength(4); // period + three scenarios
    expect(dscr.every((r) => r.slice(1).every((v) => /×$/.test(v)))).toBe(true);
  });

  it('shows property value as loan balance plus equity', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Arengud' });
    const rows = await tableOf('Turuväärtus ja omakapital');
    const euros = (text = '') => Number(text.replace(/[^\d-−]/g, '').replace('−', '-'));
    for (const [, value, loan, equity] of rows) {
      expect(Math.abs(euros(value) - euros(loan) - euros(equity))).toBeLessThanOrEqual(1);
    }
  });
});

describe('dashboard alerts', () => {
  it('lists overdue rent, ending leases, negative cash flow and vacancies', async () => {
    renderApp('/');
    const panel = (await screen.findByRole('heading', { name: 'Tähelepanu' })).parentElement;
    if (!panel) throw new Error('alerts missing');
    expect(within(panel).getByText(/Rabapiiga Kohvik OÜ: tasumata üür/)).toBeTruthy();
    expect(within(panel).getByText(/Jaan Jänes \(Korter 2\): leping lõpeb/)).toBeTruthy();
    expect(within(panel).getByText(/Vaba rahavoog oli negatiivne/)).toBeTruthy();
    expect(within(panel).getByText(/vaba üksust/)).toBeTruthy();
    expect(within(panel).getAllByText('Kriitiline').length).toBeGreaterThan(0);
  });
});

describe('dashboard filter', () => {
  it('scopes KPIs, charts, alerts and the table to one property', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Arengud' });
    const portfolioValue = screen.getByText('Portfelli väärtus').parentElement?.textContent;

    await user.selectOptions(screen.getByLabelText('Vaade'), 'Pärna 14 korterid');
    expect(router.state.location.search).toMatch(/^\?objekt=/);
    const propertyValue = screen.getByText('Portfelli väärtus').parentElement?.textContent;
    expect(propertyValue).toMatch(/565\s000\s€/);
    expect(propertyValue).not.toBe(portfolioValue);

    // The overview table and alerts follow the filter.
    expect(screen.queryByRole('link', { name: 'Tähe 27 ärimaja' })).toBeNull();
    const panel = screen.getByRole('heading', { name: 'Tähelepanu' }).parentElement!;
    expect(within(panel).queryByText(/Rabapiiga/)).toBeNull();
    // Jaan Jänes has both overdue rent and an ending lease.
    expect(within(panel).getAllByText(/Jaan Jänes/)).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText('Vaade'), 'Kogu portfell');
    expect(router.state.location.search).toBe('');
  });
});
