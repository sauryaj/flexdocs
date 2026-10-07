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

for (const lost of ['preparation', 'confirmation'] as const) test(`ownership consent survives a lost ${lost} response and reload without duplicate changes`, async ({ context, page }) => {
  const id = `browser-ownership-${lost}`;
  let completed = false, preparations = 0, confirmations = 0;
  const keys: string[] = [];
  await context.route(`**/api/documents/${id}**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/ownership/destinations')) return route.fulfill({ json: { items: [{ id: 'team-target', name: 'Destination Team' }], hasMore: false } });
    if (url.pathname.endsWith('/ownership/preview')) {
      const pageNumber = Number(url.searchParams.get('page') || 0);
      return route.fulfill({ json: { destination: { id: 'team-target', name: 'Destination Team' }, fingerprint: 'a'.repeat(64), blockers: [],
        audience: { total: 26, workingCount: 25, publishedOnlyCount: 1, page: pageNumber, limit: 25, hasMore: pageNumber === 0,
          items: [{ id: String(pageNumber), name: pageNumber ? 'Last Reader' : 'First Maintainer', email: 'user@example.invalid', role: pageNumber ? 'reader' : 'administrator', working: !pageNumber }] },
        exposure: { revisions: 3, reviews: 2, publications: 1, workingFiles: 2 }, effects: {}, requiresExplicitConsent: true, executionAvailable: true } });
    }
    if (url.pathname.endsWith('/ownership/requests')) {
      preparations++; keys.push(route.request().postDataJSON().key);
      if (lost === 'preparation' && preparations === 1) return route.abort('internetdisconnected');
      return route.fulfill({ status: preparations === 1 ? 201 : 200, json: { id: 'browser-ownership-request', status: 'pending' } });
    }
    if (url.pathname.endsWith('/files')) return route.fulfill({ json: { items: [], total: 0, hasMore: false } });
    if (completed && lost === 'confirmation') return route.fulfill({ status: 404, json: { error: 'Document not found' } });
    return route.fulfill({ json: { ...original, id, canEdit: !completed, canRequestTransfer: !completed, ownershipKind: completed ? 'organization' : 'personal',
      organizationId: completed ? 'team-target' : null, updatedAt: completed ? '2026-10-07T01:00:00.000Z' : original.updatedAt } });
  });
  await context.route('**/api/ownership-requests/browser-ownership-request**', async route => {
    if (route.request().url().endsWith('/confirm')) {
      confirmations++; expect(route.request().postDataJSON()).toEqual({ expectedUpdatedAt: original.updatedAt, previewFingerprint: 'a'.repeat(64), acknowledgeWorkingHistoryAndFilesExposure: true });
      completed = true;
      if (lost === 'confirmation' && confirmations === 1) return route.abort('internetdisconnected');
    }
    return route.fulfill({ json: { id: 'browser-ownership-request', status: completed ? 'completed' : 'pending', expired: false } });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/documents/${id}`);
  const panel = page.getByRole('region', { name: 'Document ownership', exact: true });
  await expect(panel.getByLabel('Destination team', { exact: true })).toBeEnabled();
  await panel.getByLabel('Destination team', { exact: true }).selectOption('team-target');
  await panel.getByRole('button', { name: 'Preview ownership change' }).click();
  const consent = panel.getByRole('checkbox');
  await expect(consent).toBeDisabled();
  await panel.getByRole('button', { name: 'Next audience' }).click();
  await expect(panel.getByText('Last Reader', { exact: false })).toBeVisible();
  await consent.check();
  await panel.screenshot({ path: `/tmp/flexdocs-ownership-${lost}.png` });
  await panel.getByRole('button', { name: 'Confirm ownership change', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Retry acknowledged ownership change' })).toBeVisible();
  await expect(page.locator('textarea')).toBeDisabled();
  await page.reload();
  await expect(panel.getByRole('button', { name: 'Retry acknowledged ownership change' })).toBeVisible();
  if (lost === 'preparation') {
    await context.route('**/api/profile', route => route.fulfill({ json: { id: 'another-account' } }));
    await panel.getByRole('button', { name: 'Retry acknowledged ownership change' }).click();
    await expect(page.getByText('This editor was closed because the account changed or signed out. Reload and sign in before continuing.', { exact: true })).toBeVisible();
    expect(preparations).toBe(1); expect(confirmations).toBe(0);
    await context.unroute('**/api/profile'); await page.reload();
    await panel.getByRole('button', { name: 'Retry acknowledged ownership change' }).click();
    await expect.poll(() => confirmations).toBe(1);
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  } else {
    await panel.getByRole('button', { name: 'Check ownership request' }).click();
    await expect(panel.getByText('Ownership change completed. Reload the saved document.')).toBeVisible();
    expect(confirmations).toBe(1);
  }
});

test('ownership changes cannot start without durable browser retry storage', async ({ context, page }) => {
  await context.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage unavailable'); } }));
  await context.route('**/api/documents/browser-ownership-storage', route => route.fulfill({ json: { ...original, id: 'browser-ownership-storage', canRequestTransfer: true } }));
  await context.route('**/api/documents/browser-ownership-storage/ownership/destinations?**', route => route.fulfill({ json: { items: [{ id: 'team', name: 'Team' }], hasMore: false } }));
  await page.goto('/dashboard/documents/browser-ownership-storage');
  const panel = page.getByRole('region', { name: 'Document ownership', exact: true });
  await expect(panel.getByRole('alert')).toContainText('retry storage is unavailable');
  await expect(panel.getByRole('button', { name: 'Preview ownership change' })).toBeDisabled();
});

test('authorized legacy team readers can review ownership without editing the document', async ({ context, page }) => {
  await context.route('**/api/documents/browser-ownership-readonly', route => route.fulfill({ json: { ...original, id: 'browser-ownership-readonly', ownershipKind: 'organization', representation: 'working', canEdit: false, canRequestTransfer: true } }));
  await context.route('**/api/documents/browser-ownership-readonly/files?**', route => route.fulfill({ json: { items: [], total: 0, hasMore: false } }));
  await context.route('**/api/documents/browser-ownership-readonly/ownership/destinations?**', route => route.fulfill({ json: { items: [{ id: 'team', name: 'Team' }], hasMore: false } }));
  await page.goto('/dashboard/documents/browser-ownership-readonly');
  const panel = page.getByRole('region', { name: 'Document ownership', exact: true });
  await expect(panel.getByLabel('Destination team', { exact: true })).toBeEnabled();
  await expect(page.locator('textarea')).toHaveCount(0);
});
test.beforeAll(async ({ request, baseURL }) => {
  if (!baseURL || !process.env.SMOKE_PASSWORD) throw new Error('Set TEST_BASE_URL and SMOKE_PASSWORD for a disposable test installation.');
  const login = await request.post(`${baseURL}/api/login`, { data: { email: 'admin@flexdocs.local', password: process.env.SMOKE_PASSWORD } });
  expect(login.status(), 'Disposable test account login must succeed').toBe(200);
  cookies = (await request.storageState()).cookies;
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });
test.afterAll(async ({ request, baseURL }) => { await request.post(`${baseURL}/api/logout`); });

test('maintainer changes protect edits, require saved-state reload after failure and preserve version checks', async ({ context, page }) => {
  let version = original.updatedAt;
  let responsibleUserId: string | null = 'maintainer-a';
  let fail = true;
  const requests: unknown[] = [];
  await context.route('**/api/documents/browser-responsibility', route => route.fulfill({ json: { ...original, id: 'browser-responsibility',
    ownershipKind: 'organization', representation: 'working', lifecycleState: 'draft', canManageLifecycle: true, updatedAt: version } }));
  await context.route('**/api/documents/browser-responsibility/files?**', route => route.fulfill({ json: { items: [], hasMore: false } }));
  await context.route('**/api/documents/browser-responsibility/reviews?**', route => route.fulfill({ json: { items: [], hasMore: false, canSubmit: false } }));
  await context.route('**/api/documents/browser-responsibility/responsibility**', async route => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON(); requests.push(input);
      if (fail) return route.fulfill({ status: 409, json: { error: 'Document changed' } });
      expect(input.expectedUpdatedAt).toBe(version);
      responsibleUserId = input.responsibleUserId; version = '2026-10-07T00:00:00.000Z';
      return route.fulfill({ json: { responsibleUserId, updatedAt: version, changed: true, audienceChanges: false } });
    }
    return route.fulfill({ json: { items: [{ id: 'maintainer-a', name: 'Original Maintainer', email: 'original@example.invalid' },
      { id: 'maintainer-b', name: 'New Maintainer', email: 'new@example.invalid' }], hasMore: false, responsibleUserId, updatedAt: version, audienceChanges: false } });
  });
  await page.goto('/dashboard/documents/browser-responsibility');
  const panel = page.getByRole('region', { name: 'Document responsibility', exact: true });
  await expect(panel.getByText('Assigned: Original Maintainer', { exact: true })).toBeVisible();
  await panel.getByLabel('Eligible team maintainer', { exact: true }).selectOption('maintainer-b');
  await page.getByRole('textbox', { name: 'Document title' }).fill('Unsaved responsibility title');
  await expect(panel.getByRole('button', { name: 'Assign maintainer', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Document title' }).fill(original.title);
  await expect(panel.getByRole('button', { name: 'Assign maintainer', exact: true })).toBeEnabled();
  page.once('dialog', dialog => dialog.dismiss());
  await panel.getByRole('button', { name: 'Assign maintainer', exact: true }).click(); expect(requests).toHaveLength(0);
  page.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Assign maintainer', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Reload the saved document before retrying');
  await expect(panel.getByRole('button', { name: 'Assign maintainer', exact: true })).toBeDisabled();
  fail = false;
  await panel.getByRole('button', { name: 'Reload saved document', exact: true }).click();
  await expect(panel.getByText('Assigned: Original Maintainer', { exact: true })).toBeVisible();
  await panel.getByLabel('Eligible team maintainer', { exact: true }).selectOption('maintainer-b');
  page.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Assign maintainer', exact: true }).click();
  await expect(panel.getByText('Assigned: New Maintainer', { exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Clear maintainer', exact: true }).click();
  await expect(panel.getByText('No maintainer assigned', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/flexdocs-responsibility-ui.png', fullPage: true });
});

test('review panel selects files, preserves feedback on failure and separates approval from publication', async ({ context, page }) => {
  let stage: 'draft' | 'pending' | 'approved' | 'published' = 'draft';
  let approvalCalls = 0;
  let publicationCalls = 0;
  let release = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  const document = { ...original, id: 'browser-review', ownershipKind: 'organization', lifecycleState: 'draft', canManageLifecycle: false, canDuplicate: false };
  await context.route('**/api/documents/browser-review', route => route.fulfill({ json: { ...document, lifecycleState: stage === 'draft' ? 'draft' : stage === 'published' ? 'published' : 'in_review' } }));
  await context.route('**/api/documents/browser-review/reviewers?**', route => route.fulfill({ json: { items: [{ id: 'reviewer-a', name: 'Review Person', email: 'reviewer@example.invalid' }], hasMore: false } }));
  await context.route('**/api/documents/browser-review/reviews/files?**', route => route.fulfill({ json: { items: [{ id: 'review-file', filename: 'guide.bin', size: 4 }], hasMore: false } }));
  await context.route('**/api/documents/browser-review/files?page=**', route => route.fulfill({ json: { items: [], hasMore: false } }));
  await context.route('**/api/documents/browser-review/reviews?page=**', route => route.fulfill({ json: { canSubmit: stage === 'draft', hasMore: false,
    items: stage === 'draft' ? [] : [{ id: 'review-a', decision: stage === 'pending' ? 'pending' : 'approved', submittedAt: original.updatedAt,
      feedback: stage === 'pending' ? null : 'Exact version checked', canDecide: stage === 'pending', canWithdraw: false, canPublish: stage === 'approved',
      isPublished: stage === 'published', isCurrentPublication: stage === 'published', tags: [], sourceRevision: { title: original.title, content: original.content, category: 'general', version: 1 },
      attachments: [{ attachmentId: 'review-file', filename: 'guide.bin', size: 4 }] }],
  } }));
  await context.route('**/api/documents/browser-review/reviews', async route => {
    expect(route.request().postDataJSON()).toEqual({ expectedUpdatedAt: original.updatedAt, reviewerIds: ['reviewer-a'], attachmentIds: ['review-file'] });
    await hold; stage = 'pending'; return route.fulfill({ status: 201, json: { id: 'review-a' } });
  });
  await context.route('**/api/documents/browser-review/reviews/review-a', async route => {
    approvalCalls++;
    expect(route.request().postDataJSON()).toEqual({ decision: 'approved', feedback: 'Exact version checked' });
    if (approvalCalls === 1) return route.fulfill({ status: 409, json: { error: 'Review changed; refresh first' } });
    stage = 'approved'; return route.fulfill({ json: { decision: 'approved' } });
  });
  await context.route('**/api/documents/browser-review/reviews/review-a/publish', route => { publicationCalls++; stage = 'published'; return route.fulfill({ status: 201, json: { snapshotId: 'published-a' } }); });
  await context.route('**/api/documents/browser-review/reviews/review-a/attachments/review-file', route => route.fulfill({ body: Buffer.from([1, 2, 3, 4]), contentType: 'application/octet-stream' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/documents/browser-review');
  await page.getByRole('checkbox', { name: /Review Person/ }).check();
  await page.getByRole('checkbox', { name: /guide.bin/ }).check();
  page.once('dialog', dialog => { expect(dialog.message()).toContain('does not publish'); return dialog.accept(); });
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  try { await expect(page.locator('textarea').last()).toBeDisabled(); } finally { release(); }
  await expect(page.getByRole('button', { name: 'Approve review', exact: true })).toBeVisible();
  const comparison = page.getByText('Compare reviewed version with saved working version', { exact: true });
  await comparison.focus(); await comparison.press('Enter');
  await expect(page.getByRole('heading', { name: 'Reviewed version: Saved document', exact: true })).toBeVisible();
  await expect(page.getByText('Category: general · Tags: None', { exact: true })).toHaveCount(2);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download guide.bin' }).click();
  expect(await readFile((await (await downloadEvent).path())!)).toEqual(Buffer.from([1, 2, 3, 4]));
  await page.getByLabel('Feedback for version 1', { exact: true }).fill('Exact version checked');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('a[href="/dashboard/documents"]').last().click();
  await expect(page).toHaveURL(/browser-review$/);
  await expect(page.getByLabel('Feedback for version 1', { exact: true })).toHaveValue('Exact version checked');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Approve review', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Review changed' })).toBeVisible();
  await expect(page.getByLabel('Feedback for version 1', { exact: true })).toHaveValue('Exact version checked');
  await page.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve review', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Feedback for version 1', { exact: true })).toHaveValue('Exact version checked');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Approve review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish approved version', exact: true })).toBeVisible();
  expect(publicationCalls).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Publish approved version', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Version 1 · approved · Current publication', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish approved version', exact: true })).toHaveCount(0);
  expect(publicationCalls).toBe(1);
  await page.getByRole('heading', { name: 'Review and publication', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/flexdocs-review-workflow.png', fullPage: true });
});

test('team Trash preserves failed restoration and refreshes its version before retry', async ({ context, page }) => {
  let restored = false;
  let calls = 0;
  let version = '2026-10-01T00:00:00.000Z';
  await context.route('**/api/documents?**', route => route.fulfill({ json: { items: restored ? [] : [{ id: 'browser-trash-team', title: 'Team recovery guide',
    deletedAt: version, updatedAt: version, ownershipKind: 'organization', lifecycleState: 'trashed', canRestore: true }], hasMore: false } }));
  await context.route('**/api/documents/browser-trash-team/lifecycle', async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ action: 'restore', expectedUpdatedAt: version });
    if (calls === 1) return route.fulfill({ status: 409, json: { error: 'Document changed; refresh Trash before retrying' } });
    restored = true;
    return route.fulfill({ json: { document: { lifecycleState: 'draft' }, changed: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/documents/trash');
  await expect(page.getByRole('heading', { name: 'Team recovery guide' })).toBeVisible();
  page.once('dialog', dialog => { expect(dialog.message()).toContain('does not republish'); return dialog.accept(); });
  await page.getByRole('button', { name: 'Restore Team recovery guide' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Document changed' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team recovery guide' })).toBeVisible();
  version = '2026-10-01T00:01:00.000Z';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Document changed' })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/flexdocs-team-trash.png', fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Restore Team recovery guide' }).click();
  await expect(page.getByRole('status')).toContainText('It remains unpublished');
  await expect(page.getByText('Trash is empty.', { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

test('lifecycle controls preserve edits, show conflicts and return archived content to draft', async ({ context, page }) => {
  let current = { ...original, id: 'browser-lifecycle', lifecycleState: 'draft', canManageLifecycle: true, canDuplicate: false };
  let calls = 0;
  let release = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/api/documents/browser-lifecycle', route => route.fulfill({ json: current }));
  await context.route('**/api/documents/browser-lifecycle/lifecycle', async route => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.expectedUpdatedAt).toBe(current.updatedAt);
    if (calls === 1) return route.fulfill({ status: 409, json: { error: 'Document changed; reload before changing its lifecycle' } });
    if (calls === 2) await hold;
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
  try { await expect(page.locator('textarea')).toBeDisabled(); }
  finally { release(); }
  await expect(page.getByRole('button', { name: 'Return to draft', exact: true })).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/flexdocs-lifecycle-archived.png', fullPage: true });
  page.once('dialog', dialog => { expect(dialog.message()).toContain('does not republish'); return dialog.accept(); });
  await page.getByRole('button', { name: 'Return to draft', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue(original.content);
  expect(calls).toBe(3);
});

test('team files preserve failed changes and published copies while locking pending uploads', async ({ context, page }) => {
  let version = original.updatedAt;
  let uploaded = false;
  let removed = false;
  let uploads = 0;
  let deletes = 0;
  let release = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/api/documents/browser-team-files', route => route.fulfill({ json: { ...original, id: 'browser-team-files', ownershipKind: 'organization', updatedAt: version, canManageLifecycle: false, canDuplicate: false } }));
  await context.route('**/api/documents/browser-team-files/files?page=**', route => route.fulfill({ json: { items: removed ? [] : [{ id: 'existing-file', filename: 'other-uploader.bin', size: 4 }], hasMore: false } }));
  await context.route('**/api/documents/browser-team-files/files/existing-file', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ body: Buffer.from([1, 2, 3, 4]), contentType: 'application/octet-stream' });
    deletes++;
    expect(route.request().postDataJSON()).toEqual({ expectedUpdatedAt: version });
    if (deletes === 1) return route.fulfill({ status: 409, json: { error: 'Document changed; reload before removing files' } });
    removed = true; version = '2026-10-01T02:00:00.000Z';
    return route.fulfill({ json: { success: true, bytesRetained: true, updatedAt: version } });
  });
  await context.route('**/api/documents/browser-team-files/files', async route => {
    uploads++;
    expect(route.request().headers()['x-document-version']).toBe(version);
    if (uploads === 1) return route.fulfill({ status: 409, json: { error: 'Document changed; reload before uploading files' } });
    await hold; uploaded = true; version = '2026-10-01T01:00:00.000Z';
    return route.fulfill({ status: 201, json: { attachment: { id: 'uploaded' }, updatedAt: version } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/documents/browser-team-files');
  const files = page.getByRole('region', { name: 'Team working files', exact: true });
  const downloadEvent = page.waitForEvent('download');
  await files.getByRole('button', { name: 'Download working other-uploader.bin' }).click();
  expect(await readFile((await (await downloadEvent).path())!)).toEqual(Buffer.from([1, 2, 3, 4]));
  const fileInput = files.getByLabel('Team attachment file');
  page.once('dialog', dialog => dialog.accept());
  await fileInput.setInputFiles({ name: 'new.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('new') });
  await expect(files.getByRole('alert')).toContainText('Document changed');
  await expect(fileInput).toBeDisabled();
  await files.getByRole('button', { name: 'Reload saved document and files', exact: true }).click();
  await expect(fileInput).toBeEnabled();
  page.once('dialog', dialog => { expect(dialog.message()).toContain('Published files remain unchanged'); return dialog.accept(); });
  await fileInput.setInputFiles({ name: 'new.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('new') });
  try {
    await expect(page.locator('textarea')).toBeDisabled();
    await expect(files.getByRole('button', { name: 'Cancel upload', exact: true })).toBeEnabled();
  } finally { release(); }
  await expect.poll(() => uploaded).toBe(true);
  await expect(fileInput).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  await files.getByRole('button', { name: 'Remove working other-uploader.bin' }).click();
  await expect(files.getByRole('alert')).toContainText('Document changed');
  await expect(files.getByText('other-uploader.bin (4 bytes)', { exact: true })).toBeVisible();
  await files.getByRole('button', { name: 'Reload saved document and files', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await files.getByRole('button', { name: 'Remove working other-uploader.bin' }).click();
  await expect(files.getByText('No working files on this page.', { exact: true })).toBeVisible();
  expect(uploads).toBe(2); expect(deletes).toBe(2);
  await files.scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/flexdocs-team-working-files.png', fullPage: true });
});

test('archived team files remain readable to maintainers with mutation controls absent', async ({ context, page }) => {
  await context.route('**/api/documents/browser-archived-files', route => route.fulfill({ json: { ...original, id: 'browser-archived-files', ownershipKind: 'organization',
    representation: 'working', lifecycleState: 'archived', isArchived: true, canEdit: false } }));
  await context.route('**/api/documents/browser-archived-files/files?page=**', route => route.fulfill({ json: { items: [{ id: 'archived-file', filename: 'archived.bin', size: 4 }], hasMore: false } }));
  await context.route('**/api/documents/browser-archived-files/files/archived-file', route => route.fulfill({ body: Buffer.from([1, 2, 3, 4]), contentType: 'application/octet-stream' }));
  await page.goto('/dashboard/documents/browser-archived-files');
  const files = page.getByRole('region', { name: 'Team working files', exact: true });
  await expect(files.getByText('Archived working files are read only', { exact: false })).toBeVisible();
  await expect(files.getByLabel('Team attachment file')).toHaveCount(0);
  await expect(files.getByRole('button', { name: 'Remove working archived.bin' })).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download');
  await files.getByRole('button', { name: 'Download working archived.bin' }).click();
  expect(await readFile((await (await downloadEvent).path())!)).toEqual(Buffer.from([1, 2, 3, 4]));
});

test('team contributor edits a draft while lifecycle and private attachment controls remain restricted', async ({ context, page }) => {
  let team = { ...original, id: 'browser-team', ownershipKind: 'organization', canManageLifecycle: false, canDuplicate: false, organizationId: 'team-org' };
  let saved = false;
  await context.route('**/api/documents/browser-team/files?page=**', route => route.fulfill({ json: { items: [], hasMore: false } }));
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
  await expect(page.getByRole('region', { name: 'Document responsibility', exact: true })).toHaveCount(0);
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
    id: 'browser-published', title: 'Published guide', ownershipKind: 'organization', canEdit: false, snapshotId: 'snapshot-a',
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
  await expect(page.getByRole('region', { name: 'Team working files', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Document responsibility', exact: true })).toHaveCount(0);
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
  await expect(page).toHaveURL(/\/dashboard\/my-day$/, { timeout: 15000 });
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
  await expect(page.getByText('Draft saved in this browser', { exact: false })).toBeVisible({ timeout: 15000 });
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
