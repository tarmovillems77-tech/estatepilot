import type { ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/app/Layout';
import { navItems, type Section } from '@/app/navigation';
import { NotFoundPage } from '@/app/NotFoundPage';
import { PlaceholderPage } from '@/components/PlaceholderPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

// Modules without a real page yet render a placeholder; each later step adds its page here.
const pages: Partial<Record<Section, ReactNode>> = {
  dashboard: <DashboardPage />,
  settings: <SettingsPage />,
};

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      ...navItems.map((item) => ({
        path: item.path,
        element: pages[item.section] ?? <PlaceholderPage section={item.section} />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
