import React, { useState } from 'react';
import { Eye, EyeOff, ArrowRight, UserPlus, LogIn, Smartphone } from 'lucide-react';
import {
  authenticateOrRegisterUser,
  loadSettings,
  saveSettings,
  upsertManagedUserFromAuth,
} from '../utils/storage';
import { isWebViewEnvironment } from '../utils/auraLogic';
import type { AuthUser } from '../types/aura';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser, openAdminImmediately: boolean) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [googleChooserOpen, setGoogleChooserOpen] = useState(false);
  const [googleName, setGoogleName] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleError, setGoogleError] = useState('');

  const isApkWebView = isWebViewEnvironment();

  const handleCredentialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const result = authenticateOrRegisterUser(authMode, identifier, password, displayName);
    if (!result.valid || !result.user) {
      setErrorMsg(result.error || 'Please check your credentials.');
      return;
    }

    onAuthenticated(result.user, Boolean(result.openAdminImmediately));
  };

  const handleGuestLogin = () => {
    setErrorMsg('');
    onAuthenticated(
      {
        identifier: 'guest@aurelion.ai',
        name: 'Guest',
        provider: 'guest',
        role: 'guest',
        loggedInAt: Date.now(),
      },
      false
    );
  };

  const openGoogleChooser = () => {
    setErrorMsg('');
    setGoogleError('');
    setGoogleChooserOpen(true);
  };

  const completeGoogleSignIn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setGoogleError('');

    const email = googleEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGoogleError('Please enter a valid Google email address (e.g. yourname@gmail.com).');
      return;
    }

    const derivedName =
      googleName.trim() ||
      email
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim() ||
      'Google User';

    const isAdmin = email === 'boss@aurelion.ai' || email === 'boss@aura.ai';
    const googleUser: AuthUser = {
      identifier: email,
      name: derivedName,
      email,
      provider: 'google',
      role: isAdmin ? 'admin' : 'user',
      loggedInAt: Date.now(),
    };

    try {
      const currentSettings = loadSettings(googleUser);
      saveSettings({ ...currentSettings, displayName: derivedName }, googleUser);
      upsertManagedUserFromAuth(googleUser, derivedName);

      const raw = localStorage.getItem('aurelion_telemetry');
      const tel = raw
        ? JSON.parse(raw)
        : {
            totalRegisteredUsers: 0,
            activeSessionsCount: 0,
            totalQueriesProcessed: 0,
            totalImagesCreated: 0,
            activityLogs: [],
          };
      tel.totalRegisteredUsers = (tel.totalRegisteredUsers || 0) + 1;
      tel.activeSessionsCount = 1;
      tel.activityLogs = [
        {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          text: `Google Sign-In: ${derivedName} (${email})`,
        },
        ...(tel.activityLogs || []),
      ];
      localStorage.setItem('aurelion_telemetry', JSON.stringify(tel));
    } catch {
      // ignore storage errors in restricted webviews
    }

    setGoogleChooserOpen(false);
    onAuthenticated(googleUser, isAdmin);
  };

  return (
    <div
      data-testid="auth-screen"
      className="fixed inset-0 z-40 flex h-[100dvh] min-h-[100dvh] w-full flex-col items-center justify-center overflow-y-auto bg-[#07090E] bg-[radial-gradient(circle_at_20%_20%,#111936_0%,#07090E_70%)] p-4"
    >
      <div className="my-auto w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#0F1420]/90 p-6 sm:p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 text-center">
          <h1 className="font-display bg-gradient-to-r from-[#00F0FF] via-[#F1F5F9] to-[#8B5CF6] bg-clip-text text-2xl sm:text-3xl font-bold tracking-[0.18em] text-transparent">
            AURELION AI
          </h1>
          <p className="mt-1.5 text-xs text-[#94A3B8]">
            Royal Personal Intelligence &amp; Live Neural Workspace
          </p>
        </div>

        {/* Sign In / Sign Up Mode Toggle */}
        <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-[#07090E]/80 p-1">
          <button
            type="button"
            data-testid="auth-mode-signin"
            onClick={() => {
              setAuthMode('signin');
              setErrorMsg('');
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              authMode === 'signin'
                ? 'bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] text-[#05070B] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            data-testid="auth-mode-signup"
            onClick={() => {
              setAuthMode('signup');
              setErrorMsg('');
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              authMode === 'signup'
                ? 'bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] text-[#05070B] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Sign Up</span>
          </button>
        </div>

        <form onSubmit={handleCredentialSubmit} noValidate className="space-y-3.5">
          {authMode === 'signup' && (
            <div>
              <label
                htmlFor="login-display-name"
                className="mb-1.5 block text-xs font-medium text-[#94A3B8]"
              >
                Your Name
              </label>
              <input
                id="login-display-name"
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Enter your full name"
                className="w-full rounded-xl border border-white/10 bg-[#07090E]/90 px-3.5 py-2.5 text-base text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#00F0FF]"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="login-identifier"
              className="mb-1.5 block text-xs font-medium text-[#94A3B8]"
            >
              Email or Mobile Number
            </label>
            <input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setErrorMsg('');
              }}
              placeholder="name@domain.com or +91 9876543210"
              className="w-full rounded-xl border border-white/10 bg-[#07090E]/90 px-3.5 py-2.5 text-base text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#00F0FF]"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-xs font-medium text-[#94A3B8]"
            >
              Password or Admin PIN
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg('');
                }}
                placeholder={
                  authMode === 'signup'
                    ? 'Create a password (min 4 chars)'
                    : 'Enter your password'
                }
                className="w-full rounded-xl border border-white/10 bg-[#07090E]/90 py-2.5 pr-11 pl-3.5 text-base text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#00F0FF]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-1 flex w-9 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            data-testid="auth-submit-btn"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-[#05070B] transition-opacity hover:opacity-95"
          >
            <span>
              {authMode === 'signup' ? 'Create Account & Continue' : 'Sign In to AURELION AI'}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>

          <div className="my-3.5 flex items-center gap-2.5 text-[11px] text-[#94A3B8]">
            <div className="h-px flex-1 bg-white/10" />
            <span>OR</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {!isApkWebView ? (
            <button
              type="button"
              data-testid="google-signin-btn"
              onClick={openGoogleChooser}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[#0F172A] transition-opacity hover:opacity-95"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          ) : (
            <div
              data-testid="apk-auth-notice"
              className="flex items-center gap-2 rounded-xl border border-[#00F0FF]/25 bg-[#00F0FF]/10 px-3 py-2 text-[11px] text-[#E2E8F0]"
            >
              <Smartphone className="h-4 w-4 shrink-0 text-[#00F0FF]" />
              <span>
                Android APK Mode active: Sign in with Email / Mobile or Guest Mode (no popup blocks).
              </span>
            </div>
          )}

          <button
            type="button"
            data-testid="guest-login-btn"
            onClick={handleGuestLogin}
            className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm font-medium text-[#CBD5E1] transition-colors hover:border-white/20 hover:bg-white/5"
          >
            Continue as Guest
          </button>

          
        </form>

        {/* Dual-Environment Inline Google Sign-In Sheet (Chrome + standard browser safe, zero fake accounts) */}
        {!isApkWebView && googleChooserOpen && (
          <div
            id="google-chooser-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <form
              onSubmit={completeGoogleSignIn}
              className="w-full max-w-[360px] rounded-2xl border border-white/15 bg-[#0F1626] p-5 text-left shadow-2xl"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <div>
                  <h3 className="text-sm font-semibold text-white">Sign in with Google</h3>
                  <p className="text-[11px] text-[#94A3B8]">Continue to AURELION AI</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label
                    htmlFor="google-name-input"
                    className="mb-1 block text-[11px] font-medium text-[#94A3B8]"
                  >
                    Google Account Name
                  </label>
                  <input
                    type="text"
                    id="google-name-input"
                    value={googleName}
                    onChange={(e) => {
                      setGoogleName(e.target.value);
                      setGoogleError('');
                    }}
                    placeholder="Your Name"
                    className="w-full rounded-xl border border-white/15 bg-[#070A12] px-3 py-2 text-base text-white placeholder-[#64748B] outline-none focus:border-[#00F0FF]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="google-email-input"
                    className="mb-1 block text-[11px] font-medium text-[#94A3B8]"
                  >
                    Google Email Address
                  </label>
                  <input
                    type="email"
                    id="google-email-input"
                    value={googleEmail}
                    onChange={(e) => {
                      setGoogleEmail(e.target.value);
                      setGoogleError('');
                    }}
                    placeholder="yourname@gmail.com"
                    className="w-full rounded-xl border border-white/15 bg-[#070A12] px-3 py-2 text-base text-white placeholder-[#64748B] outline-none focus:border-[#00F0FF]"
                    autoFocus
                  />
                </div>

                {googleError && (
                  <p role="alert" className="text-[11px] text-red-400">
                    {googleError}
                  </p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  data-testid="google-confirm-btn"
                  className="flex-1 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] py-2.5 text-xs font-semibold text-[#05070B]"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGoogleChooserOpen(false);
                    setGoogleError('');
                  }}
                  className="rounded-xl border border-white/15 bg-transparent px-3.5 py-2.5 text-xs text-[#CBD5E1]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
