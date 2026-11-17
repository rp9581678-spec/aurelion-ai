import React, { useEffect, useState } from 'react';
import {
  Download,
  LogOut,
  MessageSquarePlus,
  Settings,
  Shield,
  Trash2,
  X,
  Lock,
  Target,
  Plus,
  Minus,
  Check,
  Edit3,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import {
  calculateGoalProgress,
  sanitizeUserHTML,
  updateDailyGoalProgress,
} from '../utils/auraLogic';
import { loadDailyGoal, saveDailyGoal } from '../utils/storage';
import type { AuthUser, ChatSession, DailyGoal } from '../types/aura';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
  onExportChat: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onOpenAnalytics: () => void;
  onLogout: () => void;
  isAdmin: boolean;
  authUser?: AuthUser | null;
  userDisplayName?: string;
  dailyGoal?: DailyGoal;
  onUpdateDailyGoal?: (goal: DailyGoal) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onCloseMobile,
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  onExportChat,
  onOpenSettings,
  onOpenAdmin,
  onOpenAnalytics,
  onLogout,
  isAdmin,
  authUser,
  userDisplayName,
  dailyGoal: propDailyGoal,
  onUpdateDailyGoal,
}) => {
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultPass, setVaultPass] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [failedVaultAttempts, setFailedVaultAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const [localDailyGoal, setLocalDailyGoal] = useState<DailyGoal>(() => loadDailyGoal());
  const activeGoal = propDailyGoal || localDailyGoal;

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalTitleDraft, setGoalTitleDraft] = useState(activeGoal.title);
  const [goalTargetDraft, setGoalTargetDraft] = useState(String(activeGoal.targetCount));
  const [goalFormError, setGoalFormError] = useState('');

  const commitGoalUpdate = (nextGoal: DailyGoal) => {
    setLocalDailyGoal(nextGoal);
    saveDailyGoal(nextGoal);
    onUpdateDailyGoal?.(nextGoal);
  };

  const goalProgressPercent = calculateGoalProgress(
    activeGoal.completedCount,
    activeGoal.targetCount
  );

  // Compute safe account identity details for the card directly above "New Chat"
  const isGuestSession =
    !authUser ||
    authUser?.role === 'guest' ||
    authUser?.provider === 'guest' ||
    authUser?.identifier === 'guest@aurelion.ai' ||
    authUser?.identifier === 'guest@aura.ai';

  const isGoogleSession = !isGuestSession && authUser?.provider === 'google';

  const resolvedAccountName = isGuestSession
    ? 'Guest'
    : (
        authUser?.name ||
        userDisplayName ||
        authUser?.identifier?.split('@')[0] ||
        'AURELION Member'
      ).trim();

  const resolvedAccountSubtext = isGuestSession
    ? 'Temporary Guest Session'
    : (authUser?.email || authUser?.identifier || '').trim();

  const resolvedBadgeLabel = isGuestSession
    ? 'Guest Mode'
    : isGoogleSession
      ? 'Google'
      : authUser?.role === 'admin'
        ? 'Boss Admin'
        : 'Account';

  const handleSaveGoalForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = goalTitleDraft.trim();
    const parsedTarget = parseInt(goalTargetDraft, 10);
    if (!cleanTitle) {
      setGoalFormError('Please enter a goal title.');
      return;
    }
    if (isNaN(parsedTarget) || parsedTarget < 1 || parsedTarget > 100) {
      setGoalFormError('Target must be between 1 and 100.');
      return;
    }
    const nextCompleted = Math.min(activeGoal.completedCount, parsedTarget);
    commitGoalUpdate({
      title: cleanTitle,
      targetCount: parsedTarget,
      completedCount: nextCompleted,
      updatedDate: new Date().toISOString().slice(0, 10),
    });
    setGoalFormError('');
    setEditingGoal(false);
  };

  useEffect(() => {
    if (lockoutUntil <= Date.now()) return;
    const timer = setInterval(() => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setCountdown(0);
        setLockoutUntil(0);
        clearInterval(timer);
      } else {
        setCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  const handleVaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutUntil > Date.now()) return;

    try {
      const msgBuffer = new TextEncoder().encode(vaultPass.trim());
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const enteredHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      const expectedSecret = String.fromCharCode(66, 79, 83, 83, 64, 55, 55, 55);
      const expectedBuffer = new TextEncoder().encode(expectedSecret);
      const expectedHashBuffer = await crypto.subtle.digest('SHA-256', expectedBuffer);
      const expectedHashArray = Array.from(new Uint8Array(expectedHashBuffer));
      const expectedHash = expectedHashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      if (enteredHash === expectedHash) {
        setVaultPass('');
        setVaultError('');
        setFailedVaultAttempts(0);
        setVaultModalOpen(false);
        onCloseMobile();
        onOpenAnalytics();
      } else {
        const nextAttempts = failedVaultAttempts + 1;
        setFailedVaultAttempts(nextAttempts);
        if (nextAttempts >= 3) {
          const unlockTime = Date.now() + 30000;
          setLockoutUntil(unlockTime);
          setCountdown(30);
          setVaultError('🔒 सुरक्षा कारणों से 30 सेकंड के लिए लॉक किया गया है...');
        } else {
          setVaultError(`Access Denied: Incorrect Password. (${3 - nextAttempts} attempts left)`);
        }
      }
    } catch {
      setVaultError('Authentication Error.');
    }
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Conversation Sidebar"
        data-testid="sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] shrink-0 flex-col border-r border-white/10 bg-[#080B13] p-3.5 transition-transform duration-200 md:static md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-2 md:hidden">
          <span className="font-display text-sm font-semibold tracking-widest text-[#00F0FF]">
            AURELION AI
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-white/5 hover:text-[#F1F5F9]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Live Account Identity Badge Card directly above "New Chat" */}
        <div
          data-testid="sidebar-account-badge"
          className="mb-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#0D1322]/90 px-3 py-2 shadow-inner"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#00F0FF]/35 bg-gradient-to-br from-[#00F0FF]/20 to-[#8B5CF6]/25 text-xs font-bold text-[#00F0FF]">
              {isGoogleSession ? (
                <span>G</span>
              ) : isGuestSession ? (
                <span>👤</span>
              ) : (
                <UserCheck className="h-3.5 w-3.5 text-[#00F0FF]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div
                data-testid="sidebar-account-name"
                className="truncate text-xs font-semibold text-[#F1F5F9]"
              >
                {resolvedAccountName}
              </div>
              <div
                data-testid="sidebar-account-email"
                className="truncate text-[10.5px] text-[#94A3B8]"
              >
                {resolvedAccountSubtext}
              </div>
            </div>
          </div>
          <span
            data-testid="sidebar-account-provider"
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${
              isGoogleSession
                ? 'border border-blue-400/40 bg-blue-500/15 text-blue-300'
                : isGuestSession
                  ? 'border border-amber-400/35 bg-amber-500/15 text-amber-300'
                  : 'border border-[#00F0FF]/35 bg-[#00F0FF]/15 text-[#00F0FF]'
            }`}
          >
            {resolvedBadgeLabel}
          </span>
        </div>

        {/* Top Row: New Chat + Sleek Locked Vault Button ("🔐") */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            className="flex flex-1 items-center gap-2 rounded-xl border border-[#00F0FF]/30 bg-[#00F0FF]/10 px-3.5 py-2.5 text-left text-xs font-medium text-[#00F0FF] transition-colors hover:bg-[#00F0FF]/15"
          >
            <MessageSquarePlus className="h-4 w-4 shrink-0" />
            <span>New chat</span>
          </button>

          <button
            type="button"
            onClick={() => setVaultModalOpen(true)}
            aria-label="Open analytics vault"
            title="Real-Time Analytics Vault"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#00F0FF]/40 bg-gradient-to-br from-[#00F0FF]/15 to-[#8B5CF6]/25 text-base text-[#00F0FF] shadow-[0_0_12px_rgba(0,240,255,0.2)] transition-transform hover:scale-105"
          >
            🔐
          </button>
        </div>

        {/* Daily Goal Tracker Widget */}
        <section
          aria-label="Daily Goal Tracker"
          data-testid="daily-goal-tracker"
          className="mt-3.5 rounded-xl border border-[#00F0FF]/25 bg-gradient-to-b from-[#0E1525] to-[#0A0E19] p-3 shadow-inner"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-[#00F0FF]" />
              <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-[#E2E8F0]">
                Daily Goal Tracker
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                data-testid="daily-goal-percent"
                className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                  goalProgressPercent >= 100
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30'
                }`}
              >
                {goalProgressPercent}%
              </span>
              <button
                type="button"
                onClick={() => {
                  setGoalTitleDraft(activeGoal.title);
                  setGoalTargetDraft(String(activeGoal.targetCount));
                  setGoalFormError('');
                  setEditingGoal((prev) => !prev);
                }}
                aria-label={editingGoal ? 'Cancel editing daily goal' : 'Edit daily goal'}
                title="Set or Edit Daily Goal"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[#94A3B8] transition-colors hover:border-[#00F0FF]/40 hover:text-white"
              >
                <Edit3 className="h-3 w-3" />
              </button>
            </div>
          </div>

          {editingGoal ? (
            <form onSubmit={handleSaveGoalForm} className="mt-2.5 space-y-2">
              <div>
                <label
                  htmlFor="daily-goal-title-input"
                  className="mb-1 block text-[10px] font-medium text-[#94A3B8]"
                >
                  Session Goal
                </label>
                <input
                  id="daily-goal-title-input"
                  type="text"
                  value={goalTitleDraft}
                  onChange={(e) => {
                    setGoalTitleDraft(e.target.value);
                    setGoalFormError('');
                  }}
                  placeholder="e.g. Finish 5 Physics Problems"
                  className="w-full rounded-lg border border-white/15 bg-[#060911] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#00F0FF]"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label
                    htmlFor="daily-goal-target-input"
                    className="mb-1 block text-[10px] font-medium text-[#94A3B8]"
                  >
                    Target Tasks
                  </label>
                  <input
                    id="daily-goal-target-input"
                    type="number"
                    min={1}
                    max={100}
                    value={goalTargetDraft}
                    onChange={(e) => {
                      setGoalTargetDraft(e.target.value);
                      setGoalFormError('');
                    }}
                    className="w-full rounded-lg border border-white/15 bg-[#060911] px-2.5 py-1 text-xs text-white outline-none focus:border-[#00F0FF]"
                  />
                </div>
                <button
                  type="submit"
                  className="mt-4 inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#00F0FF] to-[#10B981] px-3 py-1.5 text-xs font-semibold text-[#05070B] transition-opacity hover:opacity-95"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Goal</span>
                </button>
              </div>

              {goalFormError && (
                <p role="alert" className="text-[11px] text-red-400">
                  {goalFormError}
                </p>
              )}
            </form>
          ) : (
            <div className="mt-2">
              <p
                data-testid="daily-goal-title"
                className="truncate text-xs font-medium text-[#F1F5F9]"
                title={activeGoal.title}
              >
                {activeGoal.title.replace(/[<>]/g, '')}
              </p>

              {/* Progress Bar */}
              <div
                role="progressbar"
                aria-label="Daily goal progress"
                aria-valuenow={goalProgressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    goalProgressPercent >= 100
                      ? 'bg-gradient-to-r from-emerald-400 to-[#00F0FF] shadow-[0_0_10px_#10b981]'
                      : 'bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6]'
                  }`}
                  style={{ width: `${goalProgressPercent}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-1">
                <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">
                  {activeGoal.completedCount} / {activeGoal.targetCount} done
                  {goalProgressPercent >= 100 ? ' 🎉' : ''}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      commitGoalUpdate(updateDailyGoalProgress(activeGoal, -1))
                    }
                    disabled={activeGoal.completedCount <= 0}
                    aria-label="Decrease goal progress"
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs text-[#CBD5E1] transition-colors hover:border-[#00F0FF]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitGoalUpdate(updateDailyGoalProgress(activeGoal, 1))
                    }
                    disabled={activeGoal.completedCount >= activeGoal.targetCount}
                    aria-label="Increase goal progress"
                    className="inline-flex h-6 items-center gap-0.5 rounded-md border border-[#00F0FF]/35 bg-[#00F0FF]/15 px-2 text-[11px] font-semibold text-[#00F0FF] transition-colors hover:bg-[#00F0FF]/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Step</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitGoalUpdate({
                        ...activeGoal,
                        completedCount: 0,
                        updatedDate: new Date().toISOString().slice(0, 10),
                      })
                    }
                    disabled={activeGoal.completedCount === 0}
                    aria-label="Reset goal progress"
                    title="Reset today's progress"
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[#94A3B8] transition-colors hover:border-amber-400/40 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          <p className="mb-2 px-2 text-[11px] font-medium text-[#64748B]">
            Recent Sessions
          </p>
          {sessions.length === 0 ? (
            <p className="px-2 py-3 text-xs text-[#64748B]">
              No saved chats yet. Start a conversation below.
            </p>
          ) : (
            <ul className="space-y-1">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <li key={session.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSession(session.id);
                        onCloseMobile();
                      }}
                      className={`flex-1 truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-[#161D2E] font-medium text-[#F1F5F9]'
                          : 'text-[#94A3B8] hover:bg-white/5 hover:text-[#F1F5F9]'
                      }`}
                    >
                      {sanitizeUserHTML(session.title)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(session.id)}
                      aria-label={`Delete conversation ${session.title}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#64748B] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
          <PWAInstallButton />

          <button
            type="button"
            onClick={onExportChat}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-[#F1F5F9]"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Export Chat (.md)</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-[#F1F5F9]"
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>AURELION AI Settings</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const modal = document.getElementById('aura-privacy-modal');
              if (modal) modal.style.display = 'flex';
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-[#00F0FF]"
          >
            <span className="shrink-0 text-sm">📜</span>
            <span>Privacy Policy &amp; Terms</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#00F0FF] transition-colors hover:bg-[#00F0FF]/10"
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span>Boss Admin Panel</span>
            </button>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Password Prompt Modal for Analytics Vault */}
      {vaultModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#00F0FF]/40 bg-[#0F1420] p-6 shadow-2xl">
            <div className="mb-4 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#00F0FF]/40 bg-[#00F0FF]/10 text-xl text-[#00F0FF]">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="font-display text-base font-bold text-white">Analytics Vault Access</h3>
              <p className="mt-1 text-xs text-[#94A3B8]">Enter master password to unlock live command center</p>
            </div>

            <form onSubmit={handleVaultSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  aria-label="Vault master password"
                  value={vaultPass}
                  onChange={(e) => {
                    setVaultPass(e.target.value);
                    setVaultError('');
                  }}
                  placeholder="Enter master password"
                  className="w-full rounded-xl border border-white/10 bg-[#07090E] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#00F0FF]"
                  autoFocus
                />
              </div>

              {vaultError && (
                <p role="alert" className="text-xs text-red-400 text-center">{vaultError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={lockoutUntil > Date.now()}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${
                    lockoutUntil > Date.now()
                      ? 'bg-white/10 text-white/40 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] text-[#05070B]'
                  }`}
                >
                  {lockoutUntil > Date.now() ? `Locked (${countdown}s)` : 'Unlock Vault'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVaultModalOpen(false);
                    setVaultPass('');
                    setVaultError('');
                  }}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-medium text-[#CBD5E1] hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
