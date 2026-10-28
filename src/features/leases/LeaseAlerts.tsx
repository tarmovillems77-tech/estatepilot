import { AlertTriangle, DoorOpen } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { daysBetween } from '@/domain/dates';
import { isLeaseActive, isLeaseEndingSoon, LEASE_ALERT_DAYS } from '@/domain/leases';
import type { Lease, Property, Tenant, Unit } from '@/domain/types';
import { formatCurrency, formatDate } from '@/i18n/format';
import { et } from '@/i18n/et';

const text = et.leases;

/** Leases ending within LEASE_ALERT_DAYS and vacant units of owned properties. */
export function LeaseAlerts({
  properties,
  units,
  leases,
  tenants,
  today,
}: {
  properties: Property[];
  units: Unit[];
  leases: Lease[];
  tenants: Tenant[];
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

  return (
    <Card>
      <div className="grid gap-6 md:grid-cols-2">
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
      </div>
    </Card>
  );
}
