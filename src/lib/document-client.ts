export async function moveDocument(id: string, folderId: string | null, expectedUpdatedAt: string): Promise<unknown> {
  const response = await fetch(`/api/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId, expectedUpdatedAt }),
  });
  if (response.status === 409) {
    throw new Error('This document changed since the list loaded. Reload the page before moving it.');
  }
  if (!response.ok) throw new Error('Could not move the document. Please try again.');
  return response.json();
}
