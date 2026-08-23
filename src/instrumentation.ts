export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Delay boot work so the DB (which may start alongside us in compose) is ready.
  setTimeout(() => {
    void (async () => {
      try {
        const { initializeAllScans } = await import('@/lib/scan-runner');
        await initializeAllScans();
      } catch (err) {
        console.error('[instrumentation] failed to initialize scheduled scans', err);
      }

      try {
        const cron = (await import('node-cron')).default;
        const { runDailyMaintenance } = await import('@/lib/maintenance-jobs');

        cron.schedule('0 8 * * *', () => {
          void runDailyMaintenance().catch((err) => {
            console.error('[instrumentation] daily maintenance failed', err);
          });
        });

        if (process.env.MAINTENANCE_ON_BOOT === 'true') {
          void runDailyMaintenance().catch((err) => {
            console.error('[instrumentation] on-boot maintenance failed', err);
          });
        }
      } catch (err) {
        console.error('[instrumentation] failed to schedule maintenance', err);
      }
    })();
  }, 8000);
}
