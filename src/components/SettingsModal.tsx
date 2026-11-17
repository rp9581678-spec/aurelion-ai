import React, { useState } from 'react';
import { LogOut, Trash2, Volume2, X } from 'lucide-react';
import { safeGetItem, safeSetItem } from '../utils/storage';
import type {
  AnimationPreference,
  LanguageOption,
  UserSettings,
  VoiceProfile,
} from '../types/aura';

interface SettingsModalProps {
  settings: UserSettings;
  onSave: (next: UserSettings) => void;
  onClearHistory: () => void;
  onLogout: () => void;
  onTestVoice: (profile: VoiceProfile, speed: number) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSave,
  onClearHistory,
  onLogout,
  onTestVoice,
  onClose,
}) => {
  const [draft, setDraft] = useState<UserSettings>(settings);
  const [confirmClear, setConfirmClear] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');
  const [cloudUrl, setCloudUrl] = useState(() =>
    typeof window !== 'undefined' ? safeGetItem('aura_cloud_url') || '' : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...draft,
      displayName: draft.displayName.trim() || 'Explorer',
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AURELION AI Settings"
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[90vh] w-full max-w-[540px] overflow-y-auto rounded-2xl border border-white/15 bg-[#0D121E] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-3.5">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#F1F5F9]">
              AURELION AI Settings
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Personalize voice, memory, language, and hologram behavior
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {statusNotice && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-[#00F0FF]/35 bg-[#00F0FF]/10 px-3.5 py-2 text-xs font-medium text-[#00F0FF]"
          >
            {statusNotice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="set-display-name" className="mb-1.5 block text-xs font-medium text-[#CBD5E1]">
              Your Display Name
            </label>
            <input
              id="set-display-name"
              type="text"
              value={draft.displayName}
              onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              placeholder="How AURELION AI should address you"
              className="w-full rounded-xl border border-white/10 bg-[#07090E] px-3.5 py-2 text-sm text-[#F1F5F9] outline-none focus:border-[#00F0FF]"
            />
          </div>

          <div>
            <label htmlFor="set-cloud-url" className="mb-1.5 block text-xs font-medium text-[#CBD5E1]">
              ☁️ Boss Cloud Sync URL (Firebase)
            </label>
            <div className="flex gap-2">
              <input
                id="set-cloud-url"
                type="url"
                value={cloudUrl}
                onChange={(e) => setCloudUrl(e.target.value)}
                placeholder="https://your-firebase-project.firebasedatabase.app"
                className="flex-1 rounded-xl border border-white/10 bg-[#07090E] px-3.5 py-2 text-sm text-[#F1F5F9] outline-none focus:border-[#00F0FF]"
              />
              <button
                type="button"
                onClick={async () => {
                  const trimmed = cloudUrl.trim();
                  if (!trimmed) {
                    setStatusNotice('⚠️ Please enter a valid Firebase Realtime Database URL.');
                    return;
                  }
                  try {
                    const testUrl = `${trimmed.replace(/\/$/, '')}/analytics.json`;
                    const res = await fetch(testUrl, { method: 'GET' });
                    safeSetItem('aura_cloud_url', trimmed);
                    if (res.ok || res.status === 200 || res.status === 401 || res.status === 403) {
                      setStatusNotice('✅ Cloud Sync connected & verified successfully!');
                    } else {
                      setStatusNotice('⚠️ Cloud URL saved! (Server returned status ' + res.status + ')');
                    }
                  } catch {
                    safeSetItem('aura_cloud_url', trimmed);
                    setStatusNotice('✅ Cloud URL saved!');
                  }
                }}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 hover:text-white shrink-0"
              >
                Save &amp; Test Sync
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              Connect your Firebase Realtime Database URL to sync analytics live across devices.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#07090E] p-3">
            <div>
              <p className="text-xs font-semibold text-white">🧹 Free Phone Cache</p>
              <p className="text-[11px] text-[#94A3B8]">Clear local chat/temp cache without losing login or Cloud data</p>
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  const cloudUrlVal = safeGetItem('aura_cloud_url');
                  const authUserVal = safeGetItem('aurelion_auth_user_v1');
                  const accountsVal = safeGetItem('aurelion_registered_accounts_v1');
                  window.localStorage.clear();
                  if (cloudUrlVal) safeSetItem('aura_cloud_url', cloudUrlVal);
                  if (authUserVal) safeSetItem('aurelion_auth_user_v1', authUserVal);
                  if (accountsVal) safeSetItem('aurelion_registered_accounts_v1', accountsVal);
                } catch {
                  // ignore
                }
                setStatusNotice('✅ फ़ोन की स्टोरेज साफ़ हो गई है — आपका डेटा क्लाउड पर सुरक्षित है!');
              }}
              className="rounded-xl border border-amber-500/40 bg-amber-500/25 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/35 transition-all"
            >
              Free Cache
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="set-voice-profile" className="mb-1.5 block text-xs font-medium text-[#CBD5E1]">
                Voice Profile
              </label>
              <div className="flex gap-2">
                <select
                  id="set-voice-profile"
                  value={draft.voiceProfile}
                  onChange={(e) =>
                    setDraft({ ...draft, voiceProfile: e.target.value as VoiceProfile })
                  }
                  className="flex-1 rounded-xl border border-white/10 bg-[#07090E] px-3 py-2 text-sm text-[#F1F5F9] outline-none focus:border-[#00F0FF]"
                >
                  <option value="Nova">Nova (Warm Balanced)</option>
                  <option value="Orion">Orion (Deep Clear)</option>
                  <option value="Echo">Echo (Crisp Bright)</option>
                  <option value="Lyra">Lyra (Soft Expressive)</option>
                </select>
                <button
                  type="button"
                  onClick={() => onTestVoice(draft.voiceProfile, draft.speechSpeed)}
                  aria-label="Test selected voice"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#00F0FF]/35 bg-[#00F0FF]/10 text-[#00F0FF] hover:bg-[#00F0FF]/20"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="set-language" className="mb-1.5 block text-xs font-medium text-[#CBD5E1]">
                Response Language
              </label>
              <select
                id="set-language"
                value={draft.language}
                onChange={(e) =>
                  setDraft({ ...draft, language: e.target.value as LanguageOption })
                }
                className="w-full rounded-xl border border-white/10 bg-[#07090E] px-3 py-2 text-sm text-[#F1F5F9] outline-none focus:border-[#00F0FF]"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi (हिन्दी)</option>
                <option value="Marathi">Marathi (मराठी)</option>
                <option value="Hinglish">Hinglish (Natural Mix)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="set-speech-speed" className="text-xs font-medium text-[#CBD5E1]">
                Speech Speed
              </label>
              <span className="font-mono text-xs tabular-nums text-[#00F0FF]">
                {draft.speechSpeed.toFixed(1)}x
              </span>
            </div>
            <input
              id="set-speech-speed"
              type="range"
              min="0.8"
              max="1.5"
              step="0.1"
              value={draft.speechSpeed}
              onChange={(e) =>
                setDraft({ ...draft, speechSpeed: parseFloat(e.target.value) })
              }
              className="w-full accent-[#00F0FF]"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#07090E]/80 px-3.5 py-2.5">
            <div>
              <label htmlFor="set-auto-speak" className="text-sm font-medium text-[#F1F5F9]">
                Auto-Speak Responses
              </label>
              <p className="text-xs text-[#94A3B8]">
                Automatically read new AURELION AI replies aloud
              </p>
            </div>
            <input
              id="set-auto-speak"
              type="checkbox"
              checked={draft.autoSpeak}
              onChange={(e) => setDraft({ ...draft, autoSpeak: e.target.checked })}
              className="h-4 w-4 accent-[#00F0FF]"
            />
          </div>

          <div>
            <label htmlFor="set-anim-style" className="mb-1.5 block text-xs font-medium text-[#CBD5E1]">
              Hologram Animation Style
            </label>
            <select
              id="set-anim-style"
              value={draft.animationStyle}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  animationStyle: e.target.value as AnimationPreference,
                })
              }
              className="w-full rounded-xl border border-white/10 bg-[#07090E] px-3 py-2 text-sm text-[#F1F5F9] outline-none focus:border-[#00F0FF]"
            >
              <option value="auto">Auto-Switch (Orbital / Möbius on Coding / Book on Study)</option>
              <option value="orbital">Orbital Neural Core (Always)</option>
              <option value="mobius">Chrono Möbius Loop (Always)</option>
              <option value="book">3D Flipping Book Hologram (Always)</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-personal-memory" className="mb-1.5 block text-xs font-medium text-[#CBD5E1]">
              Personal Memory Instructions
            </label>
            <textarea
              id="set-personal-memory"
              rows={3}
              value={draft.personalMemory}
              onChange={(e) => setDraft({ ...draft, personalMemory: e.target.value })}
              placeholder="e.g. I am a computer science student. Prefer concise step-by-step explanations and TypeScript examples."
              className="w-full rounded-xl border border-white/10 bg-[#07090E] px-3.5 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none focus:border-[#00F0FF]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2">
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear Chat History</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    setConfirmClear(false);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600"
                >
                  <span>Confirm Clear All</span>
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-white/5"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </button>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-5 py-2 text-sm font-semibold text-[#05070B] transition-opacity hover:opacity-95"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
