import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { store } from '@/data';
import { buildDemoData } from '@/data/demo';
import { useDataCounts } from '@/data/hooks';
import { et } from '@/i18n/et';

const text = et.settings;

export function SettingsPage() {
  const counts = useDataCounts();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(confirmText: string, action: () => Promise<void>, doneText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(doneText);
    } catch {
      setMessage(et.errors.unknown);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={et.pages.settings.title} description={et.pages.settings.description} />

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{text.dataTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{text.dataDescription}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(text.counts) as (keyof typeof text.counts)[]).map((key) => (
            <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">{text.counts[key]}</dt>
              <dd className="tabular text-lg font-semibold text-slate-900">
                {counts ? counts[key] : '…'}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(
                text.resetDemoConfirm,
                () => store.replaceAll(buildDemoData(new Date())),
                text.resetDemoDone,
              )
            }
          >
            {text.resetDemo}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => run(text.clearAllConfirm, () => store.clearAll(), text.clearAllDone)}
          >
            {text.clearAll}
          </Button>
        </div>

        {message && (
          <p className="mt-4 text-sm text-slate-700" role="status">
            {message}
          </p>
        )}
        <p className="mt-6 text-xs text-slate-500">{text.demoNotice}</p>
      </Card>
    </>
  );
}
