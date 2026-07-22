import { SettingsNav } from '@/components/SettingsNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">System Settings</h1>
        <p className="text-slate-500 text-xs mt-1">Configure your personal profile, security keys, automations, and presets.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Side Settings Navigation Pane */}
        <aside className="w-full lg:w-64 flex-shrink-0">
          <SettingsNav />
        </aside>

        {/* Right Side Settings Panel Area */}
        <main className="flex-1 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          {children}
        </main>
      </div>
    </div>
  );
}
