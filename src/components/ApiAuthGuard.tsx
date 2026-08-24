'use client';

import { useEffect } from 'react';

/**
 * Global safety net: any API 401 while inside the dashboard means the session
 * died (expiry or pruning). Redirect to login with an explanatory flag instead
 * of letting pages render mysterious empty states.
 */
export function ApiAuthGuard() {
  useEffect(() => {
    const original = window.fetch;
    const w = window as unknown as { __apiAuthGuardInstalled?: boolean };
    if (w.__apiAuthGuardInstalled) return;
    w.__apiAuthGuardInstalled = true;

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      try {
        if (res.status !== 401) return res;
        const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : '';
        if (!url.includes('/api/')) return res;
        // Auth endpoints 401 for wrong credentials — that's not a session expiry
        if (/\/api\/(login|register|logout)/.test(url)) return res;
        if (window.location.pathname.startsWith('/login')) return res;
        window.location.href = '/login?expired=1';
      } catch {
        // never break the caller because of guard logic
      }
      return res;
    };
  }, []);

  return null;
}
