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

describe('rent tracking', () => {
  it('compares expected and received rent for the current month', async () => {
    renderApp('/tulud-kulud');
    expect(await screen.findByText('Oodatav üür')).toBeTruthy();
    // Demo data: Jaan Jänes has not paid this month's rent.
    const jaan = rowOf('Jaan Jänes');
    expect(within(jaan).getByText(/Maksmata|Tähtaeg ees/)).toBeTruthy();
    expect(within(rowOf('Kati Karu')).getByText('Makstud')).toBeTruthy();
  });

  it('lists overdue rent including the partial payment', async () => {
    renderApp('/tulud-kulud');
    const heading = await screen.findByRole('heading', { name: 'Võlgnevused' });
    const card = heading.closest('div')?.parentElement;
    if (!card) throw new Error('arrears card missing');
    expect(within(card).getAllByText('Rabapiiga Kohvik OÜ').length).toBeGreaterThan(0);
    expect(within(card).getByText('Osaliselt makstud')).toBeTruthy();
  });

  it('records a payment and updates the status', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderApp('/tulud-kulud');
    await screen.findByText('Oodatav üür');

    const row = rowOf('Jaan Jänes');
    await user.click(within(row).getByRole('button', { name: 'Märgi laekunuks: Jaan Jänes' }));
    await vi.waitFor(() => expect(within(rowOf('Jaan Jänes')).getByText('Makstud')).toBeTruthy());
  });
});

describe('transactions', () => {
  it('filters capital expenditure and shows the group', async () => {
    const user = userEvent.setup();
    renderApp('/tulud-kulud?vaade=tehingud');
    await screen.findByRole('button', { name: 'Ekspordi CSV' });
    // Demo capex may fall into last year; look at all years that have data.
    const yearSelect = screen.getByLabelText('Aasta') as HTMLSelectElement;
    const years = [...yearSelect.options].map((o) => o.value);
    await user.selectOptions(screen.getByLabelText('Tüüp'), 'capital');

    const found: string[] = [];
    for (const year of years) {
      await user.selectOptions(yearSelect, year);
      found.push(
        ...screen
          .queryAllByText(/Trepikoja remont|Ventilatsiooni uuendamine/)
          .map((e) => e.textContent ?? ''),
      );
    }
    expect(found.sort()).toEqual(['Trepikoja remont', 'Ventilatsiooni uuendamine']);
  });

  it('adds an expense with an Estonian amount', async () => {
    const user = userEvent.setup();
    renderApp('/tulud-kulud?vaade=tehingud');
    await user.click(await screen.findByRole('button', { name: 'Lisa tehing' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Kategooria'), 'repairs');
    await user.selectOptions(within(dialog).getByLabelText('Objekt'), 'Pärna 14 korterid');
    await user.type(within(dialog).getByLabelText('Summa'), '1 234,50');
    await user.type(within(dialog).getByLabelText('Kirjeldus'), 'Katuse parandus');
    await user.click(within(dialog).getByRole('button', { name: 'Salvesta' }));

    const row = await vi.waitFor(() => rowOf('Katuse parandus'));
    expect(within(row).getByText('Remont')).toBeTruthy();
    expect(within(row).getByText(/1\s234,50\s€/)).toBeTruthy();
  });

  it('explains how loan payments are treated', async () => {
    const user = userEvent.setup();
    renderApp('/tulud-kulud?vaade=tehingud');
    await user.click(await screen.findByRole('button', { name: 'Lisa tehing' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Kategooria'), 'loan_payment');
    expect(within(dialog).getByText(/kasutatakse laenugraafikut/)).toBeTruthy();
  });
});

describe('summary', () => {
  it('shows monthly statements, NOI per property and expense groups', async () => {
    renderApp('/tulud-kulud?vaade=kokkuvote');
    expect(await screen.findByRole('heading', { name: 'Kuude kaupa' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Objektide lõikes' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Tähe 27 ärimaja' }).length).toBeGreaterThan(0);
    for (const group of ['Tegevuskulud', 'Kapitalikulud', 'Laenumaksed']) {
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Tehingutes kajastatud laenumaksed/)).toBeTruthy();
  });
});
