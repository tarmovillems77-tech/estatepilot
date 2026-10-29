import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import type { Alert, AlertSeverity, DashboardData } from '@/domain/finance/dashboard';
import { formatCurrency, formatDate, formatMonth, formatMultiple } from '@/i18n/format';
import { et } from '@/i18n/et';

const a = et.dashboard.alerts;
const eur = (value: number) => formatCurrency(value, { whole: true });

const severityStyle: Record<
  AlertSeverity,
  { icon: typeof CircleAlert; className: string; iconClass: string }
> = {
  critical: { icon: CircleAlert, className: 'bg-red-50', iconClass: 'text-red-600' },
  warning: { icon: TriangleAlert, className: 'bg-amber-50', iconClass: 'text-amber-600' },
  info: { icon: Info, className: 'bg-slate-50', iconClass: 'text-slate-500' },
};

/** Status is carried by icon + label + text, never by colour alone. */
export function AlertsPanel({ alerts, data }: { alerts: Alert[]; data: DashboardData }) {
  const tenantName = new Map(data.tenants.map((t) => [t.id, t.name]));
  const unitName = new Map(data.units.map((u) => [u.id, u.name]));
  const propertyName = new Map(data.properties.map((p) => [p.id, p.name]));
  const subject = (propertyId: string | null) =>
    propertyId === null ? a.portfolio : (propertyName.get(propertyId) ?? a.portfolio);

  const describe = (alert: Alert): { text: string; link: string; linkLabel: string } => {
    switch (alert.kind) {
      case 'overdueRent':
        return {
          text: a.overdueRent(
            tenantName.get(alert.tenantId) ?? '—',
            eur(alert.amount),
            alert.months.map(formatMonth).join(', '),
          ),
          link: '/tulud-kulud',
          linkLabel: a.links.rent,
        };
      case 'leaseEnding':
        return {
          text: a.leaseEnding(
            tenantName.get(alert.tenantId) ?? '—',
            unitName.get(alert.unitId) ?? '—',
            formatDate(alert.endDate),
            alert.days,
          ),
          link: '/uurnikud',
          linkLabel: a.links.leases,
        };
      case 'negativeCashFlow':
        return {
          text: a.negativeCashFlow(alert.months.length, eur(alert.total)),
          link: '/tulud-kulud?vaade=kokkuvote',
          linkLabel: a.links.ledger,
        };
      case 'negativeCashFlowForecast':
        return {
          text: a.negativeCashFlowForecast(
            et.dashboard.charts.scenario[alert.scenario],
            a.forecastYears(alert.years),
          ),
          link: '/laenud',
          linkLabel: a.links.loans,
        };
      case 'lowDscr':
        return {
          text:
            alert.basis === 'trailing'
              ? a.lowDscrTrailing(subject(alert.propertyId), formatMultiple(alert.dscr))
              : a.lowDscrForecast(
                  subject(alert.propertyId),
                  et.dashboard.charts.scenario[alert.basis],
                  formatMultiple(alert.dscr),
                  alert.year ?? 0,
                ),
          link: '/laenud',
          linkLabel: a.links.loans,
        };
      case 'vacantUnits':
        return {
          text: a.vacant(alert.unitIds.length, eur(alert.marketRent)),
          link: '/kinnisvara',
          linkLabel: a.links.properties,
        };
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{a.title}</h2>
      {alerts.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{a.none}</p>
      ) : (
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">
          {alerts.map((alert, index) => {
            const style = severityStyle[alert.severity];
            const Icon = style.icon;
            const { text, link, linkLabel } = describe(alert);
            return (
              <li
                key={`${alert.kind}-${index}`}
                className={`flex gap-3 rounded-lg px-3 py-2 text-sm ${style.className}`}
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${style.iconClass}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    {a.severity[alert.severity]}
                  </p>
                  <p className="text-slate-900">{text}</p>
                  <Link to={link} className="text-brand-700 text-xs font-medium hover:underline">
                    {linkLabel} →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
