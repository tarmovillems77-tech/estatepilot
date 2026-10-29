// @vitest-environment jsdom
// Must come before @/data: the database is created when that module loads.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/data';
import { renderApp } from '@/test/renderApp';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Text and label queries only: role queries are too slow in jsdom on a page with this many
// inputs and table cells.
const heading = (title: string) => screen.getByText(title, { selector: 'h2, h3' });
const button = (name: string) => screen.getByText(name, { selector: 'button' });

const card = (title: string) => {
  const h = heading(title);
  // Chart cards are sections; other cards are the rounded Card container.
  const container = h.closest('section') ?? h.closest('.rounded-xl');
  if (!container) throw new Error(`${title} missing`);
  return container as HTMLElement;
};

/** Text of the base scenario's KPI value for a label. */
const baseKpi = (label: string) => {
  const title = screen.getAllByText('Baasstsenaarium', { selector: 'h3' })[0]!;
  const baseCard = title.closest('div')!.parentElement!;
  return within(baseCard).getByText(label).nextElementSibling?.textContent;
};

const annualRow = (label: string) => {
  const table = card('Aastane prognoos');
  const row = within(table).getByText(label, { selector: 'th' }).closest('tr');
  if (!row) throw new Error(`row ${label} missing`);
  return [...row.querySelectorAll('td')].map((c) => c.textContent ?? '');
};

async function openForecast(path = '/prognoos') {
  const view = renderApp(path);
  await screen.findByText('Aastane prognoos', { selector: 'h2' });
  return view;
}

describe('forecast page', () => {
  it('shows all three scenarios, a five-year table with formulas and the comparison chart', async () => {
    await openForecast();
    for (const name of ['Baasstsenaarium', 'Pessimistlik', 'Optimistlik']) {
      expect(screen.getAllByText(name, { selector: 'h3' }).length).toBeGreaterThan(0);
    }
    const noi = annualRow('= NOI');
    expect(noi).toHaveLength(6); // five years + formula
    expect(noi.at(-1)).toBe('üüritulu − tegevuskulud − hooldusreserv');
    expect(annualRow('Kogunenud vaba rahavoog').at(-1)).toMatch(/ei lisata omakapitalile/);
    expect(
      annualRow('Laenuintress')
        .slice(0, 5)
        .every((v) => /€$/.test(v)),
    ).toBe(true);
    expect(
      annualRow('Põhiosa tagasimakse')
        .slice(0, 5)
        .every((v) => /€$/.test(v)),
    ).toBe(true);
    expect(card('Stsenaariumite võrdlus')).toBeTruthy();
  });

  it('recalculates when an assumption changes and can revert', async () => {
    const user = userEvent.setup();
    await openForecast();
    const before = baseKpi('NOI aastas');

    const vacancy = screen.getByLabelText('Vakantsus: Baasstsenaarium');
    await user.clear(vacancy);
    await user.type(vacancy, '20');
    expect(baseKpi('NOI aastas')).not.toBe(before);
    expect(screen.getByText('Muudetud, salvestamata')).toBeTruthy();
    // The default set cannot be overwritten.
    expect(screen.queryByText('Salvesta', { selector: 'button' })).toBeNull();

    await user.click(button('Tühista muudatused'));
    expect(baseKpi('NOI aastas')).toBe(before);
    expect(screen.queryByText('Muudetud, salvestamata')).toBeNull();
  });

  it('marks an invalid value without applying it', async () => {
    const user = userEvent.setup();
    await openForecast();
    const before = baseKpi('NOI aastas');
    const vacancy = screen.getByLabelText('Vakantsus: Baasstsenaarium');
    await user.clear(vacancy);
    await user.type(vacancy, '150');
    expect(vacancy.getAttribute('aria-invalid')).toBe('true');
    expect(baseKpi('NOI aastas')).not.toBe(undefined);
    await user.clear(vacancy);
    await user.type(vacancy, '5');
    expect(baseKpi('NOI aastas')).toBe(before);
  });

  it('applies a property’s own indexation without changing stored data', async () => {
    const user = userEvent.setup();
    const { router } = await openForecast();
    const parna = (await store.properties.list()).find((p) => p.name.startsWith('Pärna'))!;
    await user.selectOptions(screen.getByLabelText('Vaade'), 'Pärna 14 korterid');
    expect(router.state.location.search).toContain(`objekt=${parna.id}`);

    const indexation = screen.getByLabelText('Indekseerimine prognoosis: Pärna 14 korterid');
    await user.type(indexation, '0');
    const rent = annualRow('Potentsiaalne üüritulu').slice(0, 5);
    expect(new Set(rent).size).toBe(1); // flat for five years

    expect((await store.properties.get(parna.id))?.rentIndexation).toBe(parna.rentIndexation);
  });

  it('compares refinancing and can switch it off', async () => {
    const user = userEvent.setup();
    await openForecast();
    const refinance = card('Refinantseerimine 5 aasta pärast');
    expect(within(refinance).getByText('Refinantseeritav jääk')).toBeTruthy();
    expect(within(refinance).getAllByText('Refinantseeritud').length).toBe(3);
    await user.click(within(refinance).getByLabelText('Arvesta refinantseerimist'));
    expect(within(refinance).getByText('Refinantseerimist ei arvestata.')).toBeTruthy();
  });
});

describe('saved scenario sets', () => {
  it('saves a copy, compares it and deletes it without touching the original', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { router } = await openForecast();

    const margin = screen.getByLabelText('Marginaali muutus (pp): Pessimistlik');
    await user.clear(margin);
    await user.type(margin, '1');
    await user.type(screen.getByLabelText('Komplekti nimi'), 'Marginaal +1 pp');
    await user.click(button('Salvesta uuena'));

    await vi.waitFor(() => expect(router.state.location.search).toMatch(/komplekt=/));
    // The workspace is re-created for the saved set: look the select up again each time.
    await vi.waitFor(() => {
      const select = screen.getByLabelText('Stsenaariumikomplekt') as HTMLSelectElement;
      expect(select.selectedOptions[0]?.textContent).toBe('Marginaal +1 pp');
    });
    const saved = (await store.scenarioSets.list()).find((s) => s.name === 'Marginaal +1 pp');
    expect(saved?.scenarios.pessimistic.marginChange).toBeCloseTo(0.01, 10);
    expect(saved?.scenarios.base.marginChange).toBe(0);

    // The demo example set is offered for comparison.
    const comparison = card('Salvestatud komplektide võrdlus');
    expect(within(comparison).getByLabelText('Kõrge Euribor (näide)')).toBeTruthy();

    await user.click(button('Kustuta komplekt'));
    await vi.waitFor(async () =>
      expect((await store.scenarioSets.list()).some((s) => s.name === 'Marginaal +1 pp')).toBe(
        false,
      ),
    );
    expect((await store.scenarioSets.list()).map((s) => s.name)).toEqual(['Kõrge Euribor (näide)']);
  });
});
