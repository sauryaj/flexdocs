export async function uploadDocumentAttachment(documentId: string, file: File): Promise<void> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('The file could not be read. Select it again to retry.'));
    reader.onabort = () => reject(new Error('Reading the file was cancelled. Select it again to retry.'));
    reader.readAsDataURL(file);
  });
  const response = await fetch('/api/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId, filename: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, data }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(typeof result?.error === 'string' ? result.error : 'The attachment could not be uploaded.');
  }
}

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
