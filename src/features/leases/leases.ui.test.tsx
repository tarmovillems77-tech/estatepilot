// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/renderApp';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Table row containing `text`. */
const rowOf = (text: string) => {
  const row = screen.getByText(text).closest('tr');
  if (!row) throw new Error(`row for ${text} missing`);
  return row;
};

describe('tenants and leases page', () => {
  it('shows expiry alerts and vacant units', async () => {
    renderApp('/uurnikud');
    const alerts = (await screen.findByRole('heading', { name: 'Lõppevad lepingud' })).closest(
      'section',
    );
    if (!alerts) throw new Error('alerts missing');
    // Äripind 101 ends at the end of next month in the demo data.
    expect(within(alerts).getByText('Rabapiiga Kohvik OÜ')).toBeTruthy();
    expect(within(alerts).getAllByText(/päeva pärast|lõpeb täna/).length).toBeGreaterThan(0);

    const vacant = screen.getByRole('heading', { name: 'Vabad pinnad' }).closest('section');
    expect(vacant && within(vacant).getByText('Korter 4')).toBeTruthy();
  });

  it('lists current leases with their effective indexation', async () => {
    renderApp('/uurnikud');
    await screen.findByText('Kati Karu');
    expect(within(rowOf('Kati Karu')).getByText('0% (üür ei muutu)')).toBeTruthy();
    expect(within(rowOf('Liisa Lepp')).getByText('Stsenaariumi järgi')).toBeTruthy();
    expect(within(rowOf('Sinilille Disain OÜ')).getByText('2,5% (lepingus)')).toBeTruthy();
    // The ended lease is hidden by the default "Kehtivad" filter.
    expect(screen.queryByText('Toomas Tuul')).toBeNull();
  });

  it('filters ended leases', async () => {
    const user = userEvent.setup();
    renderApp('/uurnikud');
    await screen.findByText('Kati Karu');
    await user.selectOptions(screen.getByLabelText('Staatus'), 'ended');
    expect(within(rowOf('Toomas Tuul')).getByText('Lõppenud')).toBeTruthy();
    expect(screen.queryByText('Kati Karu')).toBeNull();
  });

  it('creates a lease together with a new tenant for a vacant unit', async () => {
    const user = userEvent.setup();
    renderApp('/uurnikud');
    await screen.findByText('Kati Karu');

    await user.click(screen.getByRole('button', { name: 'Lisa leping' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Üksus'), 'Korter 4 (vaba)');
    // Market rent is suggested.
    expect((within(dialog).getByLabelText('Üür kuus') as HTMLInputElement).value).toBe('560');
    await user.selectOptions(within(dialog).getByLabelText('Üürnik'), '+ Uus üürnik…');
    await user.type(within(dialog).getByLabelText('Nimi'), 'Mari Mänd');
    await user.type(within(dialog).getByLabelText('Lõpp'), '2027-12-31');
    await user.type(within(dialog).getByLabelText('Üüri indekseerimine aastas'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Salvesta' }));

    const row = await vi.waitFor(() => rowOf('Mari Mänd'));
    expect(within(row).getByText('Korter 4')).toBeTruthy();
    expect(within(row).getByText('0% (üür ei muutu)')).toBeTruthy();
    expect(within(row).getByText(/560\s€/)).toBeTruthy();
  });

  it('refuses a lease that overlaps an existing one', async () => {
    const user = userEvent.setup();
    renderApp('/uurnikud');
    await screen.findByText('Kati Karu');

    await user.click(screen.getByRole('button', { name: 'Lisa leping' }));
    const dialog = screen.getByRole('dialog');
    // Pärna Korter 1 is let to Kati Karu (open-ended).
    await user.selectOptions(within(dialog).getByLabelText('Üksus'), 'Korter 1');
    await user.selectOptions(within(dialog).getByLabelText('Üürnik'), 'Jaan Jänes');
    await user.click(within(dialog).getByRole('button', { name: 'Salvesta' }));

    expect((await within(dialog).findByRole('alert')).textContent).toMatch(
      /samal perioodil juba leping/,
    );
  });

  it('manages tenants and protects tenants with leases', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderApp('/uurnikud?vaade=uurnikud');
    await screen.findByText('Kuukiire Tarkvara OÜ');

    await user.click(
      within(rowOf('Kati Karu')).getByRole('button', { name: 'Kustuta: Kati Karu' }),
    );
    expect((await screen.findByRole('alert')).textContent).toMatch(/ei saa kustutada/);

    await user.click(screen.getByRole('button', { name: 'Lisa üürnik' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Liik'), 'company');
    await user.type(within(dialog).getByLabelText('Nimi'), 'Näidis Ehitus OÜ');
    await user.type(within(dialog).getByLabelText('Registrikood'), '10000000');
    await user.click(within(dialog).getByRole('button', { name: 'Salvesta' }));

    const row = await vi.waitFor(() => rowOf('Näidis Ehitus OÜ'));
    expect(within(row).getByText(/Ettevõte · 10000000/)).toBeTruthy();
    expect(within(row).getByText('Kehtivaid lepinguid pole')).toBeTruthy();

    await user.click(within(row).getByRole('button', { name: 'Kustuta: Näidis Ehitus OÜ' }));
    await vi.waitFor(() => expect(screen.queryByText('Näidis Ehitus OÜ')).toBeNull());
  });
});

describe('leases on the property page', () => {
  it('starts a lease for a vacant unit with the unit preselected', async () => {
    const user = userEvent.setup();
    renderApp('/kinnisvara');
    // Tests in this file share one database; Kesk 3 units stay vacant throughout.
    await user.click(await screen.findByRole('link', { name: 'Kesk 3 korterelamu' }));
    await screen.findByText('Korter 2');

    await user.click(screen.getByRole('button', { name: 'Lisa leping: Korter 2' }));
    const dialog = screen.getByRole('dialog');
    const unit = within(dialog).getByLabelText('Üksus') as HTMLSelectElement;
    expect(unit.selectedOptions[0]?.textContent).toBe('Korter 2 (vaba)');
    expect(
      within(dialog).getByText(/Tühi = objekti vaikimisi \(Stsenaariumi järgi\)/),
    ).toBeTruthy();
  });

  it('shows the lease term next to the tenant', async () => {
    renderApp('/kinnisvara');
    await userEvent.click(await screen.findByRole('link', { name: 'Pärna 14 korterid' }));
    const row = (await screen.findByText('Kati Karu')).closest('tr');
    expect(row && within(row).getByText(/– tähtajatu/)).toBeTruthy();
  });
});
