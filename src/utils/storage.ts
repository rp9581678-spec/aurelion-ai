import type {
  AdminConfig,
  AuthUser,
  ChatSession,
  DailyGoal,
  ManagedUser,
  TelemetryData,
  UserSettings,
} from '../types/aura';

import {
  BOSS_ADMIN_EMAIL,
  BOSS_ADMIN_PIN,
  getSafeStorageUserKey,
  isWebViewEnvironment,
  validateLoginCredentials,
} from './auraLogic';

const KEYS = {
  SETTINGS: 'aurelion_user_settings_v1',
  SESSIONS: 'aurelion_chat_sessions_v1',
  ACTIVE_SESSION_ID: 'aurelion_active_session_v1',
  AUTH_USER: 'aurelion_auth_user_v1',
  ADMIN_CONFIG: 'aurelion_admin_config_v1',
  MANAGED_USERS: 'aurelion_managed_users_v1',
  TELEMETRY: 'aurelion_telemetry',
  DAILY_GOAL: 'aurelion_daily_goal_v1',
  REGISTERED_ACCOUNTS: 'aurelion_registered_accounts_v1',
};

export interface RegisteredAccount {
  identifier: string;
  password: string;
  displayName: string;
  createdAt: number;
}

export const DEFAULT_DAILY_GOAL: DailyGoal = {
  title: 'Complete 5 Study / Work Tasks',
  targetCount: 5,
  completedCount: 0,
  updatedDate: new Date().toISOString().slice(0, 10),
};

export const DEFAULT_SETTINGS: UserSettings = {
  displayName: 'Explorer',
  voiceProfile: 'Nova',
  speechSpeed: 1.0,
  autoSpeak: false,
  language: 'English',
  personalMemory: '',
  animationStyle: 'auto',
};

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  liveWebSearchEnabled: true,
  maintenanceMode: false,
  announcementBanner: '',
};

export const DEFAULT_TELEMETRY: TelemetryData = {
  totalRegisteredUsers: 0,
  activeSessionsCount: 0,
  totalQueriesProcessed: 0,
  totalImagesCreated: 0,
  ttsUsageCount: 0,
  activityLogs: [],
};

// Zero fake/dummy accounts — only real authenticated users are stored
export const SEED_MANAGED_USERS: ManagedUser[] = [];

const LEGACY_DUMMY_IDENTIFIERS = new Set([
  'aarav.sharma@techmail.in',
  'elena.v@studio.io',
  '+91 98201 44810',
  'mira.lin@campus.edu',
  'roshan.dev@gmail.com',
  'aura.explorer@gmail.com',
]);

const memoryFallbackStore: Record<string, string> = {};

export function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Blocked third-party / sandboxed iframe storage -> fall back to in-memory store
  }
  return Object.prototype.hasOwnProperty.call(memoryFallbackStore, key)
    ? memoryFallbackStore[key]
    : null;
}

export function safeSetItem(key: string, value: string): void {
  memoryFallbackStore[key] = value;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota or SecurityError in restricted iframes
  }
}

export function safeRemoveItem(key: string): void {
  delete memoryFallbackStore[key];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = safeGetItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    safeSetItem(key, JSON.stringify(value));
  } catch {
    // Ignore serialization or storage errors
  }
}

export function deriveDefaultDisplayName(identifier?: string | null): string {
  if (!identifier) return DEFAULT_SETTINGS.displayName;
  const clean = identifier.trim();
  const lower = clean.toLowerCase();
  if (!clean || lower === 'guest@aurelion.ai' || lower === 'guest@aura.ai' || lower === 'guest') {
    return 'Guest';
  }
  const prefix = clean.includes('@') ? clean.split('@')[0] : clean;
  const formatted = prefix.replace(/[._-]+/g, ' ').trim();
  if (!formatted) return DEFAULT_SETTINGS.displayName;
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function loadSettings(user?: AuthUser | null): UserSettings {
  const userKey = getSafeStorageUserKey(user?.identifier, user?.role);
  if (userKey === 'guest') {
    return { ...DEFAULT_SETTINGS, displayName: 'Guest' };
  }
  const scoped = safeRead<Partial<UserSettings> | null>(`${KEYS.SETTINGS}_${userKey}`, null);
  const fallbackName = user?.name?.trim() || deriveDefaultDisplayName(user?.identifier);
  if (scoped && typeof scoped === 'object') {
    return {
      ...DEFAULT_SETTINGS,
      displayName: fallbackName,
      ...scoped,
    };
  }
  return {
    ...DEFAULT_SETTINGS,
    displayName: fallbackName,
  };
}

export function saveSettings(settings: UserSettings, user?: AuthUser | null): void {
  const userKey = getSafeStorageUserKey(user?.identifier, user?.role);
  if (userKey === 'guest') {
    return;
  }
  safeWrite(`${KEYS.SETTINGS}_${userKey}`, settings);
}

export function loadSessions(user?: AuthUser | null): ChatSession[] {
  const userKey = getSafeStorageUserKey(user?.identifier, user?.role);
  if (userKey === 'guest') {
    return [];
  }
  const scoped = safeRead<ChatSession[] | null>(`${KEYS.SESSIONS}_${userKey}`, null);
  if (scoped && Array.isArray(scoped)) {
    return scoped
      .filter((s) => Boolean(s) && typeof s === 'object' && typeof s.id === 'string')
      .map((s) => ({
        ...s,
        title: typeof s.title === 'string' && s.title.trim() ? s.title : 'Conversation',
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
        messages: Array.isArray(s.messages)
          ? s.messages.filter((m) => Boolean(m) && typeof m === 'object' && typeof m.content === 'string')
          : [],
      }));
  }
  return [];
}

export function saveSessions(sessions: ChatSession[], user?: AuthUser | null): void {
  const userKey = getSafeStorageUserKey(user?.identifier, user?.role);
  if (userKey === 'guest') {
    return;
  }
  const trimmedSessions = sessions.slice(0, 8).map((s) => ({
    ...s,
    messages: s.messages.slice(-20),
  }));
  safeWrite(`${KEYS.SESSIONS}_${userKey}`, trimmedSessions);
}

export function loadActiveSessionId(user?: AuthUser | null): string | null {
  const userKey = getSafeStorageUserKey(user?.identifier, user?.role);
  if (userKey === 'guest') {
    return null;
  }
  return safeRead<string | null>(`${KEYS.ACTIVE_SESSION_ID}_${userKey}`, null);
}

export function saveActiveSessionId(id: string | null, user?: AuthUser | null): void {
  const userKey = getSafeStorageUserKey(user?.identifier, user?.role);
  if (userKey === 'guest') {
    return;
  }
  safeWrite(`${KEYS.ACTIVE_SESSION_ID}_${userKey}`, id);
}

export function loadAuthUser(): AuthUser | null {
  const stored = safeRead<AuthUser | null>(KEYS.AUTH_USER, null);
  if (!stored || !stored.identifier) return null;
  const lower = stored.identifier.toLowerCase();
  if (
    stored.role === 'guest' ||
    stored.provider === 'guest' ||
    lower === 'guest@aurelion.ai' ||
    lower === 'guest@aura.ai'
  ) {
    return null;
  }
  return stored;
}

export function saveAuthUser(user: AuthUser | null): void {
  const lower = user?.identifier?.toLowerCase() || '';
  if (
    !user ||
    user.role === 'guest' ||
    user.provider === 'guest' ||
    lower === 'guest@aurelion.ai' ||
    lower === 'guest@aura.ai'
  ) {
    try {
      window.localStorage.removeItem(KEYS.AUTH_USER);
      window.localStorage.removeItem('aura_auth_user_v1');
    } catch {
      // Ignore
    }
    return;
  }
  safeWrite(KEYS.AUTH_USER, user);
}

export function authenticateOrRegisterUser(
  mode: 'signin' | 'signup',
  identifier: string,
  password: string,
  displayName?: string
): {
  valid: boolean;
  error?: string;
  user?: AuthUser;
  displayName?: string;
  openAdminImmediately?: boolean;
} {
  const cleanId = identifier.trim();
  const cleanPass = password.trim();

  if (cleanPass === BOSS_ADMIN_PIN) {
    const adminId = cleanId || BOSS_ADMIN_EMAIL;
    const adminName = displayName?.trim() || 'Boss Admin';
    return {
      valid: true,
      user: {
        identifier: adminId,
        name: adminName,
        email: adminId.includes('@') ? adminId : undefined,
        provider: 'credentials',
        role: 'admin',
        loggedInAt: Date.now(),
      },
      displayName: adminName,
      openAdminImmediately: true,
    };
  }

  const validation = validateLoginCredentials(cleanId, cleanPass);
  if (!validation.valid) {
    return { valid: false, error: validation.error || 'Please check your credentials.' };
  }

  const normalizedId = cleanId.toLowerCase();
  const isAdmin =
    normalizedId === BOSS_ADMIN_EMAIL || normalizedId === 'boss@aurelion.ai';
  const accounts = safeRead<Record<string, RegisteredAccount>>(KEYS.REGISTERED_ACCOUNTS, {});
  const existing = accounts[normalizedId];

  if (mode === 'signup') {
    const resolvedName =
      displayName?.trim() || existing?.displayName || deriveDefaultDisplayName(cleanId);
    accounts[normalizedId] = {
      identifier: cleanId,
      password: cleanPass,
      displayName: resolvedName,
      createdAt: existing?.createdAt || Date.now(),
    };
    safeWrite(KEYS.REGISTERED_ACCOUNTS, accounts);

    const newUser: AuthUser = {
      identifier: cleanId,
      name: resolvedName,
      email: cleanId.includes('@') ? cleanId : undefined,
      provider: 'credentials',
      role: isAdmin ? 'admin' : 'user',
      loggedInAt: Date.now(),
    };
    const userSettings = loadSettings(newUser);
    saveSettings({ ...userSettings, displayName: resolvedName }, newUser);

    return {
      valid: true,
      user: newUser,
      displayName: resolvedName,
      openAdminImmediately: isAdmin,
    };
  }

  if (existing && existing.password !== cleanPass && !isAdmin) {
    return {
      valid: false,
      error: 'Incorrect password for this account. Try again or switch to Sign Up to reset.',
    };
  }

  const resolvedName =
    displayName?.trim() || existing?.displayName || deriveDefaultDisplayName(cleanId);
  if (!existing) {
    accounts[normalizedId] = {
      identifier: cleanId,
      password: cleanPass,
      displayName: resolvedName,
      createdAt: Date.now(),
    };
    safeWrite(KEYS.REGISTERED_ACCOUNTS, accounts);
  }

  const signedInUser: AuthUser = {
    identifier: cleanId,
    name: resolvedName,
    email: cleanId.includes('@') ? cleanId : undefined,
    provider: 'credentials',
    role: isAdmin ? 'admin' : 'user',
    loggedInAt: Date.now(),
  };
  const currentSettings = loadSettings(signedInUser);
  if (!currentSettings.displayName || currentSettings.displayName === 'Explorer') {
    saveSettings({ ...currentSettings, displayName: resolvedName }, signedInUser);
  }

  return {
    valid: true,
    user: signedInUser,
    displayName: resolvedName,
    openAdminImmediately: isAdmin,
  };
}

export function loadAdminConfig(): AdminConfig {
  return { ...DEFAULT_ADMIN_CONFIG, ...safeRead<Partial<AdminConfig>>(KEYS.ADMIN_CONFIG, {}) };
}

export function saveAdminConfig(config: AdminConfig): void {
  safeWrite(KEYS.ADMIN_CONFIG, config);
}

export function loadManagedUsers(): ManagedUser[] {
  const stored = safeRead<ManagedUser[] | null>(KEYS.MANAGED_USERS, null);
  if (!stored || !Array.isArray(stored)) return [];
  // Filter out any legacy dummy accounts
  return stored.filter((u) => !LEGACY_DUMMY_IDENTIFIERS.has((u.identifier || '').toLowerCase()));
}

export function saveManagedUsers(users: ManagedUser[]): void {
  const cleanUsers = users.filter(
    (u) => !LEGACY_DUMMY_IDENTIFIERS.has((u.identifier || '').toLowerCase())
  );
  safeWrite(KEYS.MANAGED_USERS, cleanUsers);
}

export function upsertManagedUserFromAuth(
  user: AuthUser,
  displayName?: string
): ManagedUser[] {
  const current = loadManagedUsers();
  if (user.role === 'guest' || user.provider === 'guest') {
    return current;
  }
  const cleanId = user.identifier.trim();
  const resolvedName =
    user.name?.trim() || displayName?.trim() || deriveDefaultDisplayName(cleanId);
  const roleLabel: ManagedUser['role'] =
    user.role === 'admin' ? 'Boss Admin' : user.provider === 'google' ? 'Pro Member' : 'Standard';
  const clientEnv: ManagedUser['clientEnvironment'] = isWebViewEnvironment()
    ? 'Android APK'
    : 'Chrome Web';
  const existingIdx = current.findIndex(
    (u) => u.identifier.toLowerCase() === cleanId.toLowerCase()
  );
  const nextList = [...current];
  if (existingIdx >= 0) {
    nextList[existingIdx] = {
      ...nextList[existingIdx],
      name: resolvedName,
      role: roleLabel,
      provider: user.provider || 'credentials',
      clientEnvironment: clientEnv,
      lastSeen: 'Just now',
    };
  } else {
    nextList.unshift({
      id: `user-${Date.now()}`,
      name: resolvedName,
      identifier: cleanId,
      role: roleLabel,
      status: 'Active',
      queries: 0,
      lastSeen: 'Just now',
      provider: user.provider || 'credentials',
      clientEnvironment: clientEnv,
      ttsCount: 0,
    });
  }
  saveManagedUsers(nextList);
  return nextList;
}

export function loadTelemetry(): TelemetryData {
  return { ...DEFAULT_TELEMETRY, ...safeRead<Partial<TelemetryData>>(KEYS.TELEMETRY, {}) };
}

export function saveTelemetry(telemetry: TelemetryData): void {
  safeWrite(KEYS.TELEMETRY, telemetry);
}

export function recordTelemetryEvent(
  updater: (prev: TelemetryData) => TelemetryData
): TelemetryData {
  const current = loadTelemetry();
  const updated = updater(current);
  saveTelemetry(updated);
  return updated;
}

export function loadDailyGoal(user?: AuthUser | null): DailyGoal {
  const userKey = getSafeStorageUserKey(user?.identifier, user?.role);
  const key = userKey === 'guest' ? `${KEYS.DAILY_GOAL}_guest` : `${KEYS.DAILY_GOAL}_${userKey}`;
  const stored = safeRead<Partial<DailyGoal>>(key, {});
  const title =
    typeof stored.title === 'string' && stored.title.trim()
      ? stored.title.trim()
      : DEFAULT_DAILY_GOAL.title;
  const targetCount =
    typeof stored.targetCount === 'number' && stored.targetCount >= 1
      ? Math.min(100, Math.round(stored.targetCount))
      : DEFAULT_DAILY_GOAL.targetCount;
  const completedCount =
    typeof stored.completedCount === 'number' && stored.completedCount >= 0
      ? Math.min(targetCount, Math.round(stored.completedCount))
      : DEFAULT_DAILY_GOAL.completedCount;
  return {
    title,
    targetCount,
    completedCount,
    updatedDate: stored.updatedDate || DEFAULT_DAILY_GOAL.updatedDate,
  };
}

export function saveDailyGoal(goal: DailyGoal, user?: AuthUser | null): void {
  const userKey = getSafeStorageUserKey(user?.identifier, user?.role);
  const key = userKey === 'guest' ? `${KEYS.DAILY_GOAL}_guest` : `${KEYS.DAILY_GOAL}_${userKey}`;
  safeWrite(key, goal);
}


