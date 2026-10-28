import { Link } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { et } from '@/i18n/et';

export function NotFoundPage() {
  const text = et.pages.notFound;

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      <Link to="/" className="text-brand-700 font-medium hover:underline">
        {text.backHome}
      </Link>
    </>
  );
}
