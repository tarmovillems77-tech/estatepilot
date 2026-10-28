import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/app/Layout';
import { navItems } from '@/app/navigation';
import { NotFoundPage } from '@/app/NotFoundPage';
import { PlaceholderPage } from '@/components/PlaceholderPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

// Modules without a real page yet render a placeholder; each later step swaps in its feature page.
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      ...navItems
        .filter((item) => item.section !== 'dashboard')
        .map((item) => ({
          path: item.path,
          element: <PlaceholderPage section={item.section} />,
        })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
