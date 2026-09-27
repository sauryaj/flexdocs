import { test, expect, type BrowserContext, type Page } from '@playwright/test';

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
