import { test, expect } from '@playwright/test';

test('grant administration preserves server denials and confirms saved roles', async ({ context, request, page, baseURL }) => {
  if (!baseURL || !process.env.SMOKE_PASSWORD) throw new Error('Set TEST_BASE_URL and SMOKE_PASSWORD for a disposable installation');
  const login = await request.post(`${baseURL}/api/login`, { data: { email: 'admin@flexdocs.local', password: process.env.SMOKE_PASSWORD } });
  expect(login.status()).toBe(200);
  await context.addCookies((await request.storageState()).cookies);
  let role = 'administrator';
  let deny = true;
  let writes = 0;
  await context.route('**/api/org-members**', route => route.fulfill(route.request().method() === 'DELETE'
    ? { status: 409, json: { error: 'Assign another documentation administrator first' } }
    : { json: [{ id: 'membership', userId: 'member', userEmail: 'member@example.invalid', userName: 'Member', organizationId: 'org', organizationName: 'Test organization', role: 'client' }] }));
  await context.route('**/api/organizations', route => route.fulfill({ json: [{ id: 'org', name: 'Test organization' }] }));
  await context.route('**/api/organizations/org/documentation-grants', async route => {
    if (route.request().method() === 'PUT') {
      writes++;
      expect(route.request().postDataJSON()).toEqual({ userId: 'member', role: 'reader' });
      if (deny) return route.fulfill({ status: 409, json: { error: 'Assign another documentation administrator first' } });
      role = 'reader';
      return route.fulfill({ json: { success: true, grant: { userId: 'member', role } } });
    }
    return route.fulfill({ json: [{ userId: 'member', role }] });
  });
  try {
    await page.goto('/dashboard/settings/members');
    await page.getByRole('button', { name: 'Remove member@example.invalid' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Assign another documentation administrator first' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove member@example.invalid' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Documentation organization' }).selectOption('org');
    const panel = page.getByRole('region', { name: 'Documentation permissions' });
    const select = panel.getByRole('combobox', { name: 'Documentation role for member@example.invalid' });
    await expect(select).toHaveValue('administrator');
    await select.selectOption('reader');
    await panel.getByRole('button', { name: 'Save role' }).click();
    await expect(panel.getByRole('alert')).toContainText('Assign another documentation administrator first');
    expect(role).toBe('administrator');
    await panel.getByRole('button', { name: 'Refresh grants' }).click();
    await expect(select).toHaveValue('administrator');
    deny = false;
    await select.selectOption('reader');
    await panel.getByRole('button', { name: 'Save role' }).click();
    await expect(select).toHaveValue('reader');
    await expect(panel.getByRole('button', { name: 'Save role' })).toBeDisabled();
    expect(writes).toBe(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(select).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/flexdocs-documentation-grants.png', fullPage: true });
  } finally { await request.post(`${baseURL}/api/logout`); }
});
