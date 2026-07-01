'use client';

import { ThemeProvider } from '@/lib/ThemeContext';
import { ToastProvider } from '@/components/Toast';
import { OrganizationProvider } from '@/lib/OrganizationContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <OrganizationProvider>
        <ToastProvider>{children}</ToastProvider>
      </OrganizationProvider>
    </ThemeProvider>
  );
}
