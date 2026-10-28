import { Card } from '@/components/ui/Card';

interface KpiCardProps {
  label: string;
  /** Already formatted value, e.g. "1 234,50 €". */
  value: string;
  hint?: string;
  /** Highlights a value that needs attention (e.g. a low DSCR). */
  tone?: 'default' | 'warning';
}

export function KpiCard({ label, value, hint, tone = 'default' }: KpiCardProps) {
  return (
    <Card className="flex flex-col">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={`tabular mt-2 text-2xl font-semibold whitespace-nowrap lg:text-xl xl:text-2xl ${
          tone === 'warning' ? 'text-amber-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
