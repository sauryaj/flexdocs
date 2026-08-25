'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Renders children only for staff (full-scope) users; clients are redirected to their portal. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/me/org-scope')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const staff = d?.mode === 'all';
        setAllowed(staff);
        if (!staff) router.replace('/dashboard/portal');
      })
      .catch(() => setAllowed(false));
  }, [router]);

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}
