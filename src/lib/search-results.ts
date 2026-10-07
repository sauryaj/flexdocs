export const searchEntityTypes = {
  documents: 'document', passwords: 'password', domains: 'domain', assets: 'asset',
  servers: 'server', checklists: 'checklist', ssl: 'ssl', network: 'network', organizations: 'organization',
} as const;
export type SearchEntity = { id: string; name: string; type: typeof searchEntityTypes[keyof typeof searchEntityTypes] };
export function searchEntities(data: unknown): SearchEntity[] {
  if (!data || typeof data !== 'object' || !('groups' in data) || !Array.isArray(data.groups)) return [];
  return data.groups.flatMap((group: unknown) => {
    if (!group || typeof group !== 'object' || !('type' in group) || !('items' in group) || !Array.isArray(group.items)) return [];
    const type = searchEntityTypes[group.type as keyof typeof searchEntityTypes];
    if (!type) return [];
    return group.items.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object' || !('id' in item) || !('title' in item) || typeof item.id !== 'string' || typeof item.title !== 'string') return [];
      return [{ id: item.id, name: item.title, type }];
    });
  });
}
