import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { Layout } from '@/app/Layout';
import { navItems, type Section } from '@/app/navigation';
import { NotFoundPage } from '@/app/NotFoundPage';
import { PlaceholderPage } from '@/components/PlaceholderPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { PropertyDetailPage } from '@/features/properties/PropertyDetailPage';
import { PropertyFormPage } from '@/features/properties/PropertyFormPage';
import { PropertyListPage } from '@/features/properties/PropertyListPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

// Modules without a real page yet render a placeholder; each later step adds its page here.
const pages: Partial<Record<Section, ReactNode>> = {
  dashboard: <DashboardPage />,
  properties: <PropertyListPage />,
  settings: <SettingsPage />,
};

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      ...navItems.map((item) => ({
        path: item.path,
        element: pages[item.section] ?? <PlaceholderPage section={item.section} />,
      })),
      { path: '/kinnisvara/uus', element: <PropertyFormPage /> },
      { path: '/kinnisvara/:id', element: <PropertyDetailPage /> },
      { path: '/kinnisvara/:id/muuda', element: <PropertyFormPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
