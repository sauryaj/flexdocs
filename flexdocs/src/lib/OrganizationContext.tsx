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
    const stored = localStorage.getItem('selectedOrg');
    if (stored) {
      try {
        setSelectedOrgState(JSON.parse(stored));
      } catch {
        localStorage.removeItem('selectedOrg');
      }
    }
    setIsLoading(false);
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
