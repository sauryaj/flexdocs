export function bootstrapPassword(env: { BOOTSTRAP_ADMIN_PASSWORD?: string } = { BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD }): string {
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password || password.length < 16 || password === 'generate-a-unique-password-here') {
    throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD to a unique password of at least 16 characters before creating the first admin');
  }
  return password;
}
