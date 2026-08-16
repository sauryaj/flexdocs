'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface Organization {
  id: string;
  name: string;
  description?: string | null;
}

interface OrganizationContextType {
  selectedOrg: Organization | null;
  setSelectedOrg: (org: Organization | null) => void;
  isLoading: boolean;
}

const OrganizationContext = createContext<OrganizationContextType>({
  selectedOrg: null,
  setSelectedOrg: () => {},
  isLoading: true,
});

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [selectedOrg, setSelectedOrgState] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let storedOrg: Organization | null = null;
      const stored = localStorage.getItem('selectedOrg');
      if (stored) {
        try {
          storedOrg = JSON.parse(stored);
        } catch {
          localStorage.removeItem('selectedOrg');
        }
      }

      try {
        const res = await fetch('/api/organizations');
        if (res.ok) {
          const orgs = (await res.json()) as Organization[];
          const valid = storedOrg ? orgs.some((o) => o.id === storedOrg?.id) : true;
          if (storedOrg && !valid) {
            localStorage.removeItem('selectedOrg');
            storedOrg = null;
          }
        }
      } catch {
        // Network error: keep the stored selection as-is
      }

      if (!cancelled) {
        setSelectedOrgState(storedOrg);
        setIsLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const setSelectedOrg = useCallback((org: Organization | null) => {
    setSelectedOrgState(org);
    if (org) {
      localStorage.setItem('selectedOrg', JSON.stringify(org));
    } else {
      localStorage.removeItem('selectedOrg');
    }
  }, []);

  return (
    <OrganizationContext.Provider value={{ selectedOrg, setSelectedOrg, isLoading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}
