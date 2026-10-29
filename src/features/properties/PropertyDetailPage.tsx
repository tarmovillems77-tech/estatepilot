import { ArrowLeft, FilePen, FilePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { store } from '@/data';
import {
  useLeases,
  useProperty,
  usePropertyLoans,
  usePropertyUnits,
  useTenants,
  useTransactionsInRange,
} from '@/data/hooks';
import { todayIso, trailingTwelveMonths } from '@/domain/dates';
import {
  defaultOpexRatio,
  defaultScenarios,
  forecast,
  forecastInputFor,
} from '@/domain/finance/forecast';
import { propertyPerformance } from '@/domain/finance/metrics';
import { isLeaseActive, leaseStatus, rentRoll } from '@/domain/leases';
import type { Lease, Property, Tenant, Unit } from '@/domain/types';
import {
  formatArea,
  formatCurrency,
  formatDate,
  formatMultiple,
  formatNumber,
  formatPercent,
} from '@/i18n/format';
import { et } from '@/i18n/et';
import { errorMessage } from '@/i18n/validation';
import {
  CalculationCard,
  EstimateBreakdown,
  TrailingBreakdown,
  TrailingIntro,
} from './CalculationBreakdown';
import { LeaseDialog } from '@/features/leases/LeaseDialog';
import { PropertyLoansCard } from '@/features/loans/PropertyLoansCard';
import { termLabel } from '@/features/leases/labels';
import { UnitDialog } from './UnitDialog';

const text = et.properties;
const eur = (value: number) => formatCurrency(value, { whole: true });
const dash = '—';

export function PropertyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const now = new Date();
  const period = trailingTwelveMonths(now);

  const property = useProperty(id);
  const units = usePropertyUnits(id);
  const loans = usePropertyLoans(id);
  const leases = useLeases();
  const tenants = useTenants();
  const transactions = useTransactionsInRange(period, id);
  const [dialog, setDialog] = useState<{ unit?: Unit } | null>(null);
  const [leaseDialog, setLeaseDialog] = useState<{ lease?: Lease; unitId?: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const back = (
    <Link
      to="/kinnisvara"
      className="hover:text-brand-700 mb-4 inline-flex items-center gap-1 text-sm text-slate-600"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {text.detail.back}
    </Link>
  );

  if (property === null) {
    return (
      <>
        {back}
        <p className="text-sm text-slate-600">{text.detail.notFound}</p>
      </>
    );
  }
  if (!property || !units || !loans || !leases || !tenants || !transactions) {
    return <p className="text-sm text-slate-500">{et.common.loading}</p>;
  }

  const unitIds = new Set(units.map((u) => u.id));
  const propertyLeases = leases.filter((l) => unitIds.has(l.unitId));

  async function removeProperty(target: Property) {
    if (!window.confirm(text.detail.deleteConfirm(target.name, unitIds.size))) return;
    try {
      await store.properties.remove(target.id);
      navigate('/kinnisvara');
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function removeUnit(unit: Unit) {
    if (!window.confirm(et.units.deleteConfirm(unit.name))) return;
    try {
      await store.units.remove(unit.id);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  return (
    <>
      {back}
      <PageHeader
        title={property.name}
        description={`${property.address}, ${property.city}`}
        actions={
          <>
            <Link
              to={`/kinnisvara/${property.id}/muuda`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="size-4" aria-hidden="true" />
              {text.detail.edit}
            </Link>
            <Button variant="danger" onClick={() => removeProperty(property)}>
              <Trash2 className="size-4" aria-hidden="true" />
              {text.detail.delete}
            </Button>
          </>
        }
      />
      <div className="-mt-3 mb-6 flex gap-2">
        <StatusBadge tone="slate">{et.labels.propertyType[property.type]}</StatusBadge>
        <StatusBadge tone={property.status === 'owned' ? 'brand' : 'amber'}>
          {et.labels.propertyStatus[property.status]}
        </StatusBadge>
      </div>
      {actionError && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {actionError}
        </p>
      )}

      {property.status === 'owned' ? (
        <OwnedFigures
          property={property}
          performance={propertyPerformance({
            property,
            transactions,
            loans,
            period,
            balanceDate: todayIso(),
          })}
          period={period}
        />
      ) : (
        <ProspectFigures
          property={property}
          units={units}
          leases={propertyLeases}
          hasHistory={transactions.length > 0}
          forecastYear={
            forecast(
              forecastInputFor({
                property,
                units,
                leases: propertyLeases,
                trailingTransactions: transactions,
                loans,
                asOf: now,
              }),
              defaultScenarios.base,
              1,
            )[0]
          }
        />
      )}

      <UnitsCard
        units={units}
        leases={propertyLeases}
        tenants={tenants}
        onAdd={() => setDialog({})}
        onEdit={(unit) => setDialog({ unit })}
        onDelete={removeUnit}
        onAddLease={(unit) => setLeaseDialog({ unitId: unit.id })}
        onEditLease={(lease) => setLeaseDialog({ lease })}
      />

      <PropertyLoansCard propertyId={property.id} loans={loans} />

      <PropertyInfo property={property} />

      <UnitDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        propertyId={property.id}
        propertyType={property.type}
        unit={dialog?.unit}
      />
      <LeaseDialog
        open={leaseDialog !== null}
        onClose={() => setLeaseDialog(null)}
        lease={leaseDialog?.lease}
        unitId={leaseDialog?.unitId}
      />
    </>
  );
}

function OwnedFigures({
  property,
  performance: p,
  period,
}: {
  property: Property;
  performance: ReturnType<typeof propertyPerformance>;
  period: { from: string; to: string };
}) {
  const trailing = text.kpi.trailing;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label={text.form.fields.marketValue}
          value={eur(property.marketValue)}
          hint={formatDate(property.marketValueDate)}
        />
        <KpiCard label={et.kpi.monthlyNoi} value={eur(p.monthlyNoi)} hint={trailing} />
        <KpiCard
          label={et.kpi.monthlyFreeCashFlow}
          value={eur(p.monthlyFreeCashFlow)}
          hint={trailing}
        />
        <KpiCard
          label={text.kpi.netYield}
          value={p.netYield === null ? dash : formatPercent(p.netYield)}
          hint={et.calc.netYieldFormula}
        />
        <KpiCard
          label={et.calc.dscr}
          value={p.dscr === null ? dash : formatMultiple(p.dscr)}
          hint={et.calc.dscrFormula}
        />
        <KpiCard
          label={et.calc.ltv}
          value={p.ltv === null ? dash : formatPercent(p.ltv)}
          hint={et.calc.ltvFormula}
        />
      </div>
      <div className="mt-6">
        <CalculationCard intro={<TrailingIntro from={period.from} to={period.to} />}>
          <TrailingBreakdown performance={p} />
        </CalculationCard>
      </div>
    </>
  );
}

function ProspectFigures({
  property,
  units,
  leases,
  hasHistory,
  forecastYear,
}: {
  property: Property;
  units: Unit[];
  leases: Lease[];
  hasHistory: boolean;
  forecastYear: ReturnType<typeof forecast>[number] | undefined;
}) {
  const roll = rentRoll(units, leases, todayIso());
  const totalInvestment = property.purchasePrice + property.acquisitionCosts;
  const estimate = text.kpi.estimate;
  const share = (a: number, b: number) => (b > 0 ? formatPercent(a / b) : dash);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={text.kpi.askingPrice} value={eur(property.purchasePrice)} />
        <KpiCard label={text.kpi.potentialRent} value={eur(roll.potentialRent)} />
        <KpiCard
          label={text.kpi.grossYield}
          value={share(roll.potentialRent * 12, property.purchasePrice)}
          hint={et.calc.grossYieldFormula}
        />
        <KpiCard
          label={text.kpi.netYield}
          value={forecastYear ? share(forecastYear.noi, totalInvestment) : dash}
          hint={estimate}
        />
      </div>
      {forecastYear && (
        <div className="mt-6">
          <CalculationCard>
            <EstimateBreakdown
              year={forecastYear}
              scenario={defaultScenarios.base}
              opexRatio={hasHistory ? null : defaultOpexRatio[property.type]}
              purchasePrice={property.purchasePrice}
              totalInvestment={totalInvestment}
              marketValue={property.marketValue}
            />
          </CalculationCard>
        </div>
      )}
    </>
  );
}

function UnitsCard({
  units,
  leases,
  tenants,
  onAdd,
  onEdit,
  onDelete,
  onAddLease,
  onEditLease,
}: {
  units: Unit[];
  leases: Lease[];
  tenants: Tenant[];
  onAdd: () => void;
  onEdit: (unit: Unit) => void;
  onDelete: (unit: Unit) => void;
  onAddLease: (unit: Unit) => void;
  onEditLease: (lease: Lease) => void;
}) {
  const u = et.units;
  const today = todayIso();
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const roll = rentRoll(units, leases, today);
  const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name, 'et', { numeric: true }));
  const th = 'px-4 py-3 font-medium whitespace-nowrap';
  const td = 'tabular px-4 py-3 text-right whitespace-nowrap';

  return (
    <Card flush className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-lg font-semibold text-slate-900">{u.title}</h2>
        <Button variant="secondary" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          {u.add}
        </Button>
      </div>

      {units.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">{u.empty}</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className={th}>{u.columns.name}</th>
                  <th className={th}>{u.columns.type}</th>
                  <th className={`${th} text-right`}>{u.columns.area}</th>
                  <th className={`${th} text-right`}>{u.columns.marketRent}</th>
                  <th className={`${th} text-right`}>{u.columns.rentPerM2}</th>
                  <th className={th}>{u.columns.status}</th>
                  <th className={th}>{u.columns.tenant}</th>
                  <th className={`${th} text-right`}>{u.columns.contractRent}</th>
                  <th className={`${th} relative text-right`}>
                    <span className="sr-only">{u.columns.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((unit) => {
                  const lease = leases.find((l) => l.unitId === unit.id && isLeaseActive(l, today));
                  const details = [
                    unit.rooms !== undefined && u.rooms(unit.rooms),
                    unit.floor !== undefined && u.floor(unit.floor),
                  ].filter(Boolean);
                  return (
                    <tr key={unit.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{unit.name}</p>
                        {details.length > 0 && (
                          <p className="text-xs text-slate-500">{details.join(' · ')}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {et.labels.unitType[unit.type]}
                      </td>
                      <td className={td}>{formatArea(unit.area)}</td>
                      <td className={td}>{eur(unit.marketRent)}</td>
                      <td className={td}>{formatNumber(unit.marketRent / unit.area)}</td>
                      <td className="px-4 py-3">
                        {!lease ? (
                          <StatusBadge tone="amber">{u.vacant}</StatusBadge>
                        ) : leaseStatus(lease, today) === 'endingSoon' ? (
                          <StatusBadge tone="amber">{et.leases.status.endingSoon}</StatusBadge>
                        ) : (
                          <StatusBadge tone="brand">{u.leased}</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lease ? (
                          <>
                            <p>{tenantName.get(lease.tenantId) ?? dash}</p>
                            <p className="tabular text-xs whitespace-nowrap text-slate-500">
                              {termLabel(lease)}
                            </p>
                          </>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className={td}>{lease ? eur(lease.monthlyRent) : dash}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {lease ? (
                          <button
                            type="button"
                            onClick={() => onEditLease(lease)}
                            className="hover:text-brand-700 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                            aria-label={u.editLease(unit.name)}
                            title={u.editLease(unit.name)}
                          >
                            <FilePen className="size-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAddLease(unit)}
                            className="hover:text-brand-700 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                            aria-label={u.addLease(unit.name)}
                            title={u.addLease(unit.name)}
                          >
                            <FilePlus className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEdit(unit)}
                          className="hover:text-brand-700 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                          aria-label={`${u.edit}: ${unit.name}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(unit)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                          aria-label={`${u.delete}: ${unit.name}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-slate-500">
            {u.rollNote(eur(roll.contractRent), eur(roll.vacantMarketRent))}
          </p>
        </>
      )}
    </Card>
  );
}

function PropertyInfo({ property }: { property: Property }) {
  const f = text.form.fields;
  const indexation =
    property.rentIndexation === null
      ? text.detail.indexationScenario
      : property.rentIndexation === 0
        ? text.detail.indexationNone
        : formatPercent(property.rentIndexation);

  const rows: [string, string][] = [
    [f.address, `${property.address}, ${property.city}`],
    [f.purchaseDate, property.purchaseDate ? formatDate(property.purchaseDate) : dash],
    [f.purchasePrice, eur(property.purchasePrice)],
    [f.acquisitionCosts, eur(property.acquisitionCosts)],
    [text.detail.totalInvestment, eur(property.purchasePrice + property.acquisitionCosts)],
    [f.marketValue, `${eur(property.marketValue)} (${formatDate(property.marketValueDate)})`],
    [f.totalArea, property.totalArea === undefined ? dash : formatArea(property.totalArea)],
    [f.yearBuilt, property.yearBuilt === undefined ? dash : String(property.yearBuilt)],
    [f.rentIndexation, indexation],
  ];

  return (
    <Card className="mt-6">
      <h2 className="text-lg font-semibold text-slate-900">{text.detail.infoTitle}</h2>
      <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="tabular text-right text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {property.notes && (
        <p className="mt-4 text-sm whitespace-pre-line text-slate-600">
          <span className="font-medium text-slate-700">{f.notes}: </span>
          {property.notes}
        </p>
      )}
    </Card>
  );
}
