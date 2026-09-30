import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const original = {
  id: 'browser-draft-a', title: 'Saved document', content: '# Saved Markdown\n', category: 'general',
  tags: [], folder: null, organizationId: null, visibility: 'private', canEdit: true,
  isPinned: false, isArchived: false, createdAt: '2026-09-25T00:00:00.000Z', updatedAt: '2026-09-25T00:00:00.000Z',
};
const markdown = '# Recovered Markdown\n\n```sh\necho "exact"\n```\n';

async function fixture(context: BrowserContext) {
  let current = { ...original };
  let fail = true;
  let writes = 0;
  await context.route('**/api/documents/browser-draft-*', async route => {
    if (route.request().method() === 'PUT') {
      writes++;
      if (fail) return route.abort('internetdisconnected');
      const data = route.request().postDataJSON();
      if (data.expectedUpdatedAt !== current.updatedAt) return route.fulfill({ status: 409, json: { error: 'Document changed. Your edits have not been saved.' } });
      current = { ...current, ...data, tags: [], updatedAt: new Date().toISOString() };
      return route.fulfill({ json: current });
    }
    return route.fulfill({ json: route.request().url().endsWith('browser-draft-b') ? { ...original, id: 'browser-draft-b', title: 'Second document', content: '# Second' } : current });
  });
  return { allowSave: () => { fail = false; }, writes: () => writes, current: () => current };
}

async function openEditor(page: Page) {
  await page.goto('/dashboard/documents/browser-draft-a');
  await expect(page.getByRole('heading', { name: 'Edit Document' })).toBeVisible();
  await expect(page.locator('textarea')).toHaveValue(original.content);
}

let cookies: Parameters<BrowserContext['addCookies']>[0] = [];
test.beforeAll(async ({ request, baseURL }) => {
  if (!baseURL || !process.env.SMOKE_PASSWORD) throw new Error('Set TEST_BASE_URL and SMOKE_PASSWORD for a disposable test installation.');
  const login = await request.post(`${baseURL}/api/login`, { data: { email: 'admin@flexdocs.local', password: process.env.SMOKE_PASSWORD } });
  expect(login.status(), 'Disposable test account login must succeed').toBe(200);
  cookies = (await request.storageState()).cookies;
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });
test.afterAll(async ({ request, baseURL }) => { await request.post(`${baseURL}/api/logout`); });

test('lifecycle controls preserve edits, show conflicts and return archived content to draft', async ({ context, page }) => {
  let current = { ...original, id: 'browser-lifecycle', lifecycleState: 'draft', canManageLifecycle: true, canDuplicate: false };
  let calls = 0;
  await context.route('**/api/documents/browser-lifecycle', route => route.fulfill({ json: current }));
  await context.route('**/api/documents/browser-lifecycle/lifecycle', async route => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.expectedUpdatedAt).toBe(current.updatedAt);
    if (calls === 1) return route.fulfill({ status: 409, json: { error: 'Document changed; reload before changing its lifecycle' } });
    current = { ...current, lifecycleState: body.action === 'archive' ? 'archived' : 'draft', isArchived: body.action === 'archive',
      canEdit: body.action !== 'archive', updatedAt: new Date().toISOString() };
    return route.fulfill({ json: { document: current, changed: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/documents/browser-lifecycle');
  const archive = page.getByRole('button', { name: 'Archive document', exact: true });
  await page.locator('textarea').fill('# Unsaved edits');
  await expect(archive).toBeDisabled();
  await page.locator('textarea').fill(original.content);
  await expect(archive).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  await archive.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Document changed; reload' })).toBeVisible();
  await expect(page.locator('textarea')).toHaveValue(original.content);
  page.once('dialog', dialog => dialog.accept());
  await archive.click();
  await expect(page.getByRole('button', { name: 'Return to draft', exact: true })).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/flexdocs-lifecycle-archived.png', fullPage: true });
  page.once('dialog', dialog => { expect(dialog.message()).toContain('does not republish'); return dialog.accept(); });
  await page.getByRole('button', { name: 'Return to draft', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue(original.content);
  expect(calls).toBe(3);
});

test('team contributor edits a draft while lifecycle and private attachment controls remain restricted', async ({ context, page }) => {
  let team = { ...original, id: 'browser-team', ownershipKind: 'organization', canManageLifecycle: false, canDuplicate: false, organizationId: 'team-org' };
  let saved = false;
  await context.route('**/api/documents/browser-team', async route => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON();
      expect(input.expectedUpdatedAt).toBe(team.updatedAt);
      team = { ...team, ...input, updatedAt: '2026-09-30T00:00:00.000Z' };
      saved = true;
    }
    return route.fulfill({ json: team });
  });
  await page.goto('/dashboard/documents/browser-team');
  await expect(page.getByText('Team draft · Saved edits do not change the published version.')).toBeVisible();
  for (const name of ['Archive', 'Delete', 'Duplicate']) await expect(page.getByTitle(name, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Visibility')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Attachments', exact: true })).toHaveCount(0);
  await page.locator('textarea').fill('# Team draft changes');
  await page.getByRole('button', { name: 'Save Now', exact: true }).click();
  await expect.poll(() => saved).toBe(true);
  await expect(page.locator('textarea')).toHaveValue('# Team draft changes');
  await expect(page.getByTitle('Archive', { exact: true })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Edit Document' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/flexdocs-team-draft-editor.png', fullPage: true });
});

test('published reader can retry an unavailable frozen attachment without entering edit mode', async ({ context, page }) => {
  await context.route('**/api/documents/browser-published', route => route.fulfill({ json: { ...original,
    id: 'browser-published', title: 'Published guide', canEdit: false, snapshotId: 'snapshot-a',
    attachments: [{ attachmentId: 'frozen-file', filename: 'frozen.txt', size: 11 }],
  } }));
  let available = false;
  await context.route('**/api/documents/browser-published/publications/snapshot-a/attachments/frozen-file', route =>
    available ? route.fulfill({ body: 'exact bytes', contentType: 'application/octet-stream' })
      : route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/documents/browser-published');
  await expect(page.getByRole('heading', { name: 'Published guide' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit Document' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Download frozen.txt' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Published file is unavailable' })).toBeVisible();
  available = true;
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download frozen.txt' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('frozen.txt');
  expect(await readFile((await download.path())!, 'utf8')).toBe('exact bytes');
  await expect(page.getByRole('alert').filter({ hasText: 'Published file is unavailable' })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/flexdocs-published-attachments.png', fullPage: true });
});

test('a superseded attachment response cannot replace the latest list', async ({ context, page }) => {
  await fixture(context);
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    let count = 0;
    window.fetch = async (input, init) => {
      if (String(input).includes('/api/attachments?')) {
        count++;
        if (count === 1) return new Promise<Response>(resolve => {
          Object.assign(window, { finishOldAttachment: () => resolve(Response.json([{ id: 'old-file', filename: 'Old list file', size: 1, mimeType: 'text/plain' }])) });
        });
        return Response.json([{ id: 'new-file', filename: 'Latest list file', size: 1, mimeType: 'text/plain' }]);
      }
      return originalFetch(input, init);
    };
  });
  await openEditor(page);
  await page.getByRole('button', { name: 'Attachments', exact: true }).click();
  await expect.poll(() => page.evaluate(() => 'finishOldAttachment' in window)).toBe(true);
  await page.getByRole('button', { name: 'Attachments', exact: true }).click();
  await page.getByRole('button', { name: 'Attachments', exact: true }).click();
  await expect(page.getByText('Latest list file', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    (window as unknown as { finishOldAttachment: () => void }).finishOldAttachment();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.getByText('Latest list file', { exact: true })).toBeVisible();
  await expect(page.getByText('Old list file', { exact: true })).toHaveCount(0);
});

test('multipart uploader shows pending confirmation, cancellation and retry guidance', async ({ context, page }) => {
  await fixture(context);
  let uploads = 0;
  await context.route('**/api/attachments**', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
    uploads++;
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await route.fulfill({ status: 503, json: { error: 'Storage unavailable' } }).catch(() => {});
  });
  await openEditor(page);
  await page.getByRole('button', { name: 'Attachments', exact: true }).click();
  await page.getByLabel('Attachment file').setInputFiles({ name: 'notes.conf', mimeType: 'application/octet-stream', buffer: Buffer.from('exact bytes') });
  await expect(page.getByRole('progressbar', { name: 'Attachment upload progress' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel upload' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Upload cancelled' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled();
  await page.getByLabel('Attachment file').setInputFiles({ name: 'notes.conf', mimeType: 'application/octet-stream', buffer: Buffer.from('exact bytes') });
  await expect(page.getByRole('alert').filter({ hasText: 'Storage unavailable' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Refresh attachments before retrying' })).toBeVisible();
  expect(uploads).toBe(2);
  await page.screenshot({ path: '/tmp/flexdocs-upload-ui.png', fullPage: true });
});

test('portable restore requires preview and explicit confirmation of the same file', async ({ context, page }) => {
  const requests: { preview: boolean; data: unknown }[] = [];
  await context.route('**/api/import', async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({ json: body.preview
      ? { preview: { valid: true, counts: { documents: 1 }, errors: [], warnings: ['Source counts are not predicted writes.'] } }
      : { success: true, imported: { documents: 1 }, skipped: 0, errors: [] } });
  });
  await page.goto('/dashboard/settings/import-export');
  await page.getByRole('button', { name: 'Portable Export', exact: true }).click();
  const bundle = { schema: 'flexdocs-backup', version: 1, documents: [{ id: 'preview-doc', content: 'Exact preview body' }] };
  await page.getByLabel('Portable backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) });
  await expect(page.getByRole('button', { name: 'Confirm import' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview Backup', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Import preview' })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].preview).toBe(true);
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(page.getByRole('button', { name: 'Confirm import' })).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Preview Backup', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2]).toMatchObject({ preview: false, data: bundle });
  await expect(page.getByRole('region', { name: 'Import preview' })).toHaveCount(0);
});

test('workspace shortcuts remain reachable beside search on narrow screens', async ({ page }) => {
  await page.goto('/dashboard');
  const shortcuts = page.getByRole('navigation', { name: 'Workspace shortcuts' });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(shortcuts.getByRole('link', { name: 'My Day', exact: true })).toBeVisible();
    await expect(shortcuts.getByRole('link', { name: 'Ask the Docs', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('header').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const search = await page.getByRole('button', { name: 'Open global search' }).boundingBox();
    const nav = await shortcuts.boundingBox();
    expect(search).not.toBeNull();
    expect(nav).not.toBeNull();
    expect(nav!.x).toBeGreaterThanOrEqual(search!.x + search!.width);
  }
  await shortcuts.getByRole('link', { name: 'My Day', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/my-day$/);
  await expect(shortcuts.getByRole('link', { name: 'My Day', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('failed save survives reload, compares exact Markdown and saves only after confirmation', async ({ page, context }) => {
  const server = await fixture(context);
  await openEditor(page);
  await page.locator('textarea').fill(markdown);
  await expect(page.getByRole('status').filter({ hasText: 'protected in this browser' })).toBeVisible();
  await page.getByRole('button', { name: 'Save Now' }).click();
  await expect(page.getByText('Save failed. Your edits are still here; try Save Now.')).toBeVisible();
  await page.reload();
  await expect(page.locator('textarea')).toHaveValue(original.content);
  await page.getByRole('button', { name: 'Compare draft' }).click();
  await expect(page.getByRole('region', { name: 'Draft comparison' }).locator('pre').nth(1)).toHaveText(markdown);
  await page.getByRole('button', { name: 'Restore a copy into editor' }).click();
  await expect(page.locator('textarea')).toHaveValue(markdown);
  const writes = server.writes();
  await page.waitForTimeout(2300);
  expect(server.writes()).toBe(writes);
  expect(server.current().content).toBe(original.content);
  server.allowSave();
  await page.getByRole('button', { name: 'Pin', exact: true }).click();
  await expect.poll(() => server.writes()).toBe(writes + 1);
  await expect(page.getByText('Autosave paused — review your edits and use Save Now.')).toBeVisible();
  await page.waitForTimeout(2300);
  expect(server.current().content).toBe(original.content);
  await page.getByRole('button', { name: 'Save Now' }).click();
  await expect.poll(() => server.current().content).toBe(markdown);
});

test('separate tabs preserve separate copies and document switching never restores another document', async ({ context, page }) => {
  await fixture(context);
  await openEditor(page);
  await page.locator('textarea').fill('First tab text');
  await expect(page.getByRole('status').filter({ hasText: 'protected in this browser' })).toBeVisible();
  const second = await context.newPage();
  await openEditor(second);
  await second.locator('textarea').fill('Second tab text');
  await expect(second.getByRole('status').filter({ hasText: 'protected in this browser' })).toBeVisible();
  await second.goto('/dashboard/documents/browser-draft-b');
  await expect(second.locator('textarea')).toHaveValue('# Second');
  await expect(second.getByRole('button', { name: 'Compare draft' })).toHaveCount(0);
  await openEditor(second);
  await expect(second.getByRole('button', { name: 'Compare draft' })).toHaveCount(2);
});

test('blocked storage shows an honest warning and protects link navigation', async ({ page, context }) => {
  await fixture(context);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'QuotaExceededError'); };
  });
  await openEditor(page);
  await page.locator('textarea').fill(markdown);
  await expect(page.getByText('Your latest changes could not be saved in this browser.', { exact: false })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'protected in this browser' })).toHaveCount(0);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('a[href="/dashboard/documents"]').last().click();
  await expect(page).toHaveURL(/browser-draft-a$/);
  await expect(page.locator('textarea')).toHaveValue(markdown);
});

test('logout epoch closes other editors and stops recreating browser copies', async ({ context, page }) => {
  await fixture(context);
  await openEditor(page);
  await page.locator('textarea').fill(markdown);
  await expect(page.getByRole('status').filter({ hasText: 'protected in this browser' })).toBeVisible();
  const other = await context.newPage();
  await openEditor(other);
  await other.evaluate(() => {
    localStorage.setItem('flexdocs:draft:epoch', 'browser-test-logout');
    Object.keys(localStorage).filter(key => key.startsWith('flexdocs:draft:v1:')).forEach(key => localStorage.removeItem(key));
  });
  await expect(page.getByText('This editor was closed because the account changed or signed out.', { exact: false })).toBeVisible();
  await page.waitForTimeout(2300);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('flexdocs:draft:v1:')))).toEqual([]);
});

test('two-tab conflicts require comparison and explicit baseline acceptance', async ({ context, page }) => {
  const server = await fixture(context);
  server.allowSave();
  await openEditor(page);
  const other = await context.newPage();
  await openEditor(other);
  await other.locator('textarea').fill('Changes from the other tab');
  await other.getByRole('button', { name: 'Save Now' }).click();
  await expect.poll(() => server.current().content).toBe('Changes from the other tab');
  await page.locator('textarea').fill(markdown);
  await page.getByRole('button', { name: 'Save Now' }).click();
  const comparison = page.getByRole('region', { name: 'Save conflict comparison' });
  await expect(comparison.locator('pre').first()).toHaveText('Changes from the other tab');
  await expect(comparison.locator('pre').last()).toHaveText(markdown);
  await page.waitForTimeout(2300);
  expect(server.current().content).toBe('Changes from the other tab');
  await page.getByRole('button', { name: 'Keep local edits against this server version' }).click();
  expect(server.current().content).toBe('Changes from the other tab');
  await page.locator('textarea').fill(markdown + '\nChanges from the other tab');
  await page.getByRole('button', { name: 'Save Now' }).click();
  await expect.poll(() => server.current().content).toBe(markdown + '\nChanges from the other tab');
});

test('focus revalidation closes an editor after the authenticated account changes', async ({ context, page }) => {
  const server = await fixture(context);
  let accountId = 'browser-account-a';
  await context.route('**/api/profile', route => route.fulfill({ json: { id: accountId } }));
  await openEditor(page);
  await page.locator('textarea').fill(markdown);
  await expect(page.getByRole('status').filter({ hasText: 'protected in this browser' })).toBeVisible();
  const writes = server.writes();
  accountId = 'browser-account-b';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('This editor was closed because the account changed or signed out.', { exact: false })).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compare draft' })).toHaveCount(0);
  await page.waitForTimeout(2300);
  expect(server.writes()).toBe(writes);
});

test('session broadcasts close other editors even when storage writes fail', async ({ context, page }) => {
  const server = await fixture(context);
  await context.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'QuotaExceededError'); };
  });
  await openEditor(page);
  await page.locator('textarea').fill(markdown);
  await expect(page.getByText('Your latest changes could not be saved in this browser.', { exact: false })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/login');
  await other.evaluate(() => {
    const channel = new BroadcastChannel('flexdocs:draft-session');
    channel.postMessage('changed');
    channel.close();
  });
  await expect(page.getByText('This editor was closed because the account changed or signed out.', { exact: false })).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  const writes = server.writes();
  await page.waitForTimeout(2300);
  expect(server.writes()).toBe(writes);
});

test('creation retries preserve the same key and payload after a lost response and reload', async ({ context, page }) => {
  await fixture(context);
  const requests: { key: string | undefined; body: string | null }[] = [];
  await context.route('**/api/documents', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
    if (requests.length === 1) return route.abort('internetdisconnected');
    return route.fulfill({ status: 200, json: { ...original, id: 'browser-draft-created' } });
  });
  await page.goto('/dashboard/documents/new');
  await page.getByPlaceholder('e.g. Production Web Server Setup & Disaster Recovery SOP').fill('Retry-safe browser document');
  await page.locator('textarea').fill(markdown);
  await expect(page.getByText('Draft saved in this browser', { exact: false })).toBeVisible();
  await page.locator('form').evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect(page.getByRole('button', { name: 'Retry original save' })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].key).toMatch(/^[a-f0-9-]{36}$/);
  await expect(page.locator('textarea')).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Restore a copy', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue(markdown);
  await expect(page.locator('textarea')).toBeDisabled();
  await page.getByRole('button', { name: 'Retry original save' }).click();
  await expect(page).toHaveURL(/browser-draft-created$/);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test('storage failure still protects navigation while a creation request is in flight', async ({ context, page }) => {
  let release = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await context.route('**/api/documents', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    started = true;
    await hold;
    return route.abort('internetdisconnected');
  });
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError'); }; });
  try {
    await page.goto('/dashboard/documents/new');
    await page.getByPlaceholder('e.g. Production Web Server Setup & Disaster Recovery SOP').fill('In-flight request');
    await page.locator('textarea').fill(markdown);
    await expect(page.getByText('Your latest changes could not be saved in this browser.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Save Document', exact: true }).click();
    await expect.poll(() => started).toBe(true);
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('a[href="/dashboard/documents"]').first().click();
    await expect(page).toHaveURL(/\/documents\/new$/);
    await expect(page.locator('textarea')).toHaveValue(markdown);
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Retry original save' })).toBeVisible();
});
