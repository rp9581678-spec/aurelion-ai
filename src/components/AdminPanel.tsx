import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Megaphone,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
  Activity,
  Zap,
} from 'lucide-react';
import type { AdminConfig, ChatSession, ManagedUser, TelemetryData } from '../types/aura';

interface AdminPanelProps {
  config: AdminConfig;
  users: ManagedUser[];
  sessions: ChatSession[];
  telemetry: TelemetryData;
  onUpdateConfig: (next: AdminConfig) => void;
  onUpdateUsers: (next: ManagedUser[]) => void;
  onResetTelemetry: () => void;
  onBackToApp: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  config,
  users,
  sessions,
  telemetry,
  onUpdateConfig,
  onUpdateUsers,
  onResetTelemetry,
  onBackToApp,
}) => {
  const [bannerDraft, setBannerDraft] = useState(config.announcementBanner);
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerFeedback, setBannerFeedback] = useState('');
  const [resetFeedback, setResetFeedback] = useState('');

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.identifier.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const handlePublishBanner = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({ ...config, announcementBanner: bannerDraft.trim() });
    setBannerFeedback(
      bannerDraft.trim()
        ? 'Global announcement published to workspace.'
        : 'Global announcement cleared.'
    );
    window.setTimeout(() => setBannerFeedback(''), 2500);
  };

  const handleToggleUserStatus = (id: string) => {
    const nextUsers = users.map((u) =>
      u.id === id
        ? { ...u, status: u.status === 'Active' ? ('Suspended' as const) : ('Active' as const) }
        : u
    );
    onUpdateUsers(nextUsers);
  };

  const handleResetAllStats = () => {
    if (window.confirm('Reset all live telemetry stats (users, queries, images) to 0?')) {
      onResetTelemetry();
      setResetFeedback('Telemetry statistics reset to 0.');
      window.setTimeout(() => setResetFeedback(''), 3000);
    }
  };

  return (
    <div
      data-testid="admin-screen"
      className="min-h-screen overflow-y-auto bg-[#06080D] bg-[radial-gradient(circle_at_top_right,#141C33_0%,#06080D_100%)] p-5 md:p-8 text-[#F1F5F9]"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-wide text-[#00F0FF]">
              AURELION AI Boss Command Center
            </h1>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Live Telemetry, Broadcast Global Announcements &amp; User Governance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetAllStats}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reset Stats to 0</span>
            </button>
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-[#05070B] transition-opacity hover:opacity-95"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to AURELION AI App</span>
            </button>
          </div>
        </header>

        {resetFeedback && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
            {resetFeedback}
          </div>
        )}

        {/* Real Live Telemetry Stats Cards (Starting at 0) */}
        <section aria-label="Live Telemetry Metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#0F1420]/85 p-4 shadow-lg">
            <p className="text-xs font-medium text-[#94A3B8]">Total Registered Users</p>
            <p
              data-testid="stat-total-users"
              className="font-mono mt-2 text-3xl font-bold tabular-nums text-[#00F0FF]"
            >
              {telemetry.totalRegisteredUsers.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-[#64748B]">
              New logins tracked live
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0F1420]/85 p-4 shadow-lg">
            <p className="text-xs font-medium text-[#94A3B8]">Live Active Sessions</p>
            <p
              data-testid="stat-active-sessions"
              className="font-mono mt-2 text-3xl font-bold tabular-nums text-emerald-400"
            >
              {telemetry.activeSessionsCount.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-[#64748B]">
              Active workspace connection
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0F1420]/85 p-4 shadow-lg">
            <p className="text-xs font-medium text-[#94A3B8]">Queries Processed</p>
            <p
              data-testid="stat-total-queries"
              className="font-mono mt-2 text-3xl font-bold tabular-nums text-[#8B5CF6]"
            >
              {telemetry.totalQueriesProcessed.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-[#64748B]">
              Prompts sent across chats
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0F1420]/85 p-4 shadow-lg">
            <p className="text-xs font-medium text-[#94A3B8]">Free AI Images Created</p>
            <p
              data-testid="stat-total-images"
              className="font-mono mt-2 text-3xl font-bold tabular-nums text-pink-400"
            >
              {telemetry.totalImagesCreated.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-[#64748B]">
              Generated via Pollinations AI
            </p>
          </div>
        </section>

        {/* Live Timestamped Activity Feed */}
        <section aria-label="Activity Feed" className="rounded-2xl border border-white/10 bg-[#0F1420]/85 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#F1F5F9] flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#00F0FF]" />
              <span>Live Workspace Activity Feed</span>
            </h2>
            <span className="font-mono text-[11px] text-[#64748B]">
              {telemetry.activityLogs.length} recorded events
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 rounded-xl bg-[#07090E] p-3 border border-white/5 font-mono text-xs">
            {telemetry.activityLogs.length === 0 ? (
              <p className="text-[#64748B] py-2 text-center">No activity logged yet. Start chatting or generating images!</p>
            ) : (
              telemetry.activityLogs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-4 py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-[#E2E8F0]">{log.text}</span>
                  <span className="text-[#64748B] shrink-0 text-[10.5px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Global Controls & Broadcast Announcement */}
        <section
          aria-label="Global Controls"
          className="rounded-2xl border border-white/10 bg-[#0F1420]/85 p-5 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-[#F1F5F9]">
            Global App Controls &amp; Broadcast Announcement
          </h2>

          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <label htmlFor="admin-live-web" className="text-sm font-medium text-[#F1F5F9]">
                Live Internet Search (Google Search Grounding)
              </label>
              <p className="text-xs text-[#94A3B8]">
                Allow AURELION AI to fetch real-time news, scores, weather, and citations
              </p>
            </div>
            <input
              id="admin-live-web"
              type="checkbox"
              checked={config.liveWebSearchEnabled}
              onChange={(e) =>
                onUpdateConfig({ ...config, liveWebSearchEnabled: e.target.checked })
              }
              className="h-4 w-4 accent-[#00F0FF]"
            />
          </div>

          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <label htmlFor="admin-maint-mode" className="text-sm font-medium text-[#F1F5F9]">
                Maintenance Mode
              </label>
              <p className="text-xs text-[#94A3B8]">
                Pause standard user access while preserving Boss Admin access
              </p>
            </div>
            <input
              id="admin-maint-mode"
              type="checkbox"
              checked={config.maintenanceMode}
              onChange={(e) =>
                onUpdateConfig({ ...config, maintenanceMode: e.target.checked })
              }
              className="h-4 w-4 accent-[#00F0FF]"
            />
          </div>

          <form onSubmit={handlePublishBanner} className="space-y-2 pt-1">
            <label htmlFor="admin-banner-input" className="block text-xs font-medium text-[#CBD5E1]">
              Broadcast Global Announcement Banner
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="admin-banner-input"
                type="text"
                value={bannerDraft}
                onChange={(e) => setBannerDraft(e.target.value)}
                placeholder="e.g. AURELION AI Live Web Search & Möbius Neural Core Upgraded!"
                className="flex-1 rounded-xl border border-white/10 bg-[#07090E] px-3.5 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none focus:border-[#00F0FF]"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-4 py-2 text-sm font-semibold text-[#05070B]"
                >
                  <Megaphone className="h-4 w-4" />
                  <span>Broadcast</span>
                </button>
                {config.announcementBanner && (
                  <button
                    type="button"
                    onClick={() => {
                      setBannerDraft('');
                      onUpdateConfig({ ...config, announcementBanner: '' });
                      setBannerFeedback('Announcement banner cleared.');
                    }}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-white/5"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {bannerFeedback && (
              <p className="text-xs text-emerald-400">{bannerFeedback}</p>
            )}
          </form>
        </section>

        {/* User Management */}
        <section
          aria-label="User Management"
          className="rounded-2xl border border-white/10 bg-[#0F1420]/85 p-5"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-[#F1F5F9]">
              User Management
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#64748B]" />
              <input
                type="text"
                aria-label="Filter users"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or email..."
                className="w-full rounded-xl border border-white/10 bg-[#07090E] py-2 pr-3 pl-9 text-xs text-[#F1F5F9] placeholder-[#64748B] outline-none focus:border-[#00F0FF]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[#94A3B8]">
                  <th className="py-2.5 pr-4 font-medium">User</th>
                  <th className="py-2.5 pr-4 font-medium">Account</th>
                  <th className="py-2.5 pr-4 font-medium">Role</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Queries</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 font-medium text-[#F1F5F9]">{u.name}</td>
                    <td className="font-mono py-3 pr-4 text-[#94A3B8]">{u.identifier}</td>
                    <td className="py-3 pr-4 text-[#CBD5E1]">{u.role}</td>
                    <td className="font-mono py-3 pr-4 text-right tabular-nums text-[#CBD5E1]">
                      {u.queries}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          u.status === 'Active' ? 'text-emerald-400' : 'text-red-400'
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {u.role !== 'Boss Admin' ? (
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(u.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-[#CBD5E1] hover:border-white/20 hover:text-white"
                        >
                          {u.status === 'Active' ? (
                            <>
                              <UserX className="h-3 w-3 text-red-400" />
                              <span>Suspend</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3 w-3 text-emerald-400" />
                              <span>Activate</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#64748B]">Protected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
