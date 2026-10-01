export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeJobs } = await import('@/lib/register-jobs');
    await registerNodeJobs();
  }
}
