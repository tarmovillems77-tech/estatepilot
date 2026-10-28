import { Card } from '@/components/ui/Card';

interface KpiCardProps {
  label: string;
  /** Already formatted value, e.g. "1 234,50 €". */
  value: string;
  hint?: string;
}

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <Card>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
