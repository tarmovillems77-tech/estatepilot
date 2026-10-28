import { AlertTriangle, CircleAlert, DoorOpen } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { addMonths, daysBetween, fromIsoDate, toIsoDate } from '@/domain/dates';
import { isLeaseActive, isLeaseEndingSoon, LEASE_ALERT_DAYS } from '@/domain/leases';
import { arrears, monthOf, monthsBetween, rentLines } from '@/domain/rent';
import type { Lease, Property, Tenant, Transaction, Unit } from '@/domain/types';
import { formatCurrency, formatDate } from '@/i18n/format';
import { et } from '@/i18n/et';

const text = et.leases;

/**
 * Leases ending within LEASE_ALERT_DAYS, vacant units of owned properties and — when
 * transactions are given — overdue rent of the last 12 months.
 */
export function LeaseAlerts({
  properties,
  units,
  leases,
  tenants,
  transactions,
  today,
}: {
  properties: Property[];
  units: Unit[];
  leases: Lease[];
  tenants: Tenant[];
  /** Needed for the arrears section; omitted = section hidden. */
  transactions?: Transaction[];
  today: string;
}) {
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));

  const ending = leases
    .filter((l) => isLeaseEndingSoon(l, today))
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));

  const leased = new Set(leases.filter((l) => isLeaseActive(l, today)).map((l) => l.unitId));
  const vacant = units.filter(
    (u) => !leased.has(u.id) && propertyById.get(u.propertyId)?.status === 'owned',
  );

  const overdue = transactions
    ? arrears(
        rentLines(
          leases,
          transactions,
          monthsBetween(monthOf(toIsoDate(addMonths(fromIsoDate(today), -12))), monthOf(today)),
          today,
        ),
        today,
      )
    : null;
  const overdueByTenant = new Map<string, number>();
  for (const line of overdue ?? []) {
    overdueByTenant.set(
      line.tenantId,
      (overdueByTenant.get(line.tenantId) ?? 0) + line.outstanding,
    );
  }

  return (
    <Card>
      <div className={`grid gap-6 md:grid-cols-2 ${overdue ? 'xl:grid-cols-3' : ''}`}>
        <section aria-labelledby="ending-leases">
          <h2 id="ending-leases" className="flex items-center gap-2 font-semibold text-slate-900">
            <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
            {text.alertsTitle}
          </h2>
          {ending.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{text.noAlerts(LEASE_ALERT_DAYS)}</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-slate-500">{text.alertsIntro(LEASE_ALERT_DAYS)}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {ending.map((lease) => {
                  const unit = unitById.get(lease.unitId);
                  const property = unit && propertyById.get(unit.propertyId);
                  const end = lease.endDate ?? today;
                  return (
                    <li key={lease.id} className="rounded-lg bg-amber-50 px-3 py-2">
                      <p className="font-medium text-slate-900">
                        {tenantName.get(lease.tenantId) ?? '—'}
                      </p>
                      <p className="text-slate-600">
                        {property ? (
                          <Link
                            to={`/kinnisvara/${property.id}`}
                            className="hover:text-brand-700 hover:underline"
                          >
                            {property.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {unit && ` · ${unit.name}`}
                      </p>
                      <p className="text-xs font-medium text-amber-800">
                        {text.endsIn(formatDate(end), daysBetween(today, end))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="vacant-units">
          <h2 id="vacant-units" className="flex items-center gap-2 font-semibold text-slate-900">
            <DoorOpen className="size-4 text-slate-500" aria-hidden="true" />
            {text.vacantTitle}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {text.vacantLine(
              vacant.length,
              formatCurrency(
                vacant.reduce((sum, u) => sum + u.marketRent, 0),
                { whole: true },
              ),
            )}
          </p>
          {vacant.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {vacant.map((unit) => {
                const property = propertyById.get(unit.propertyId);
                return (
                  <li key={unit.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="font-medium text-slate-900">{unit.name}</p>
                    <p className="text-slate-600">
                      {property && (
                        <Link
                          to={`/kinnisvara/${property.id}`}
                          className="hover:text-brand-700 hover:underline"
                        >
                          {property.name}
                        </Link>
                      )}
                      {' · '}
                      {formatCurrency(unit.marketRent, { whole: true })}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {overdue && (
          <section aria-labelledby="rent-arrears">
            <h2 id="rent-arrears" className="flex items-center gap-2 font-semibold text-slate-900">
              <CircleAlert className="size-4 text-red-600" aria-hidden="true" />
              {et.ledger.rent.arrearsTitle}
            </h2>
            {overdueByTenant.size === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{et.ledger.rent.noArrears}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  {et.ledger.rent.arrearsTotal(
                    formatCurrency(
                      overdue.reduce((sum, l) => sum + l.outstanding, 0),
                      { whole: true },
                    ),
                  )}
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {[...overdueByTenant].map(([tenantId, amount]) => (
                    <li
                      key={tenantId}
                      className="flex justify-between gap-3 rounded-lg bg-red-50 px-3 py-2"
                    >
                      <span className="font-medium text-slate-900">
                        {tenantName.get(tenantId) ?? '—'}
                      </span>
                      <span className="tabular font-semibold text-red-700">
                        {formatCurrency(amount, { whole: true })}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/tulud-kulud"
                  className="text-brand-700 mt-2 inline-block text-xs font-medium hover:underline"
                >
                  {et.ledger.tabs.rent} →
                </Link>
              </>
            )}
          </section>
        )}
      </div>
    </Card>
  );
}
