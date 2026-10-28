import { Hammer } from 'lucide-react';
import type { Section } from '@/app/navigation';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { et } from '@/i18n/et';

/** Stand-in for modules that are built in later steps. */
export function PlaceholderPage({ section }: { section: Section }) {
  const page = et.pages[section];

  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <Card className="flex flex-col items-center py-12 text-center">
        <Hammer className="size-8 text-slate-400" aria-hidden="true" />
        <p className="mt-3 font-medium text-slate-900">{et.common.comingSoon}</p>
        <p className="mt-1 text-sm text-slate-500">{et.common.comingSoonDescription}</p>
      </Card>
    </>
  );
}
