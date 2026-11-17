export type AppScreen = 'splash' | 'auth' | 'app' | 'admin';

export type SmartMode = 'general' | 'coding' | 'study' | 'live';

export type HologramMode = 'orbital' | 'mobius' | 'book' | 'livewave';

export type AiState = 'idle' | 'thinking' | 'speaking';

export type AnimationPreference = 'auto' | 'orbital' | 'mobius' | 'book' | 'livewave';

export type VoiceProfile = 'Nova' | 'Orion' | 'Echo' | 'Lyra';

export type LanguageOption = 'English' | 'Hindi' | 'Marathi' | 'Hinglish';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AttachmentData {
  name: string;
  mimeType: string;
  size: number;
  base64Data?: string;
  previewUrl?: string;
  textContent?: string;
  pageCount?: number;
}

export interface QuizItem {
  q: string;
  options: string[];
  answer: number;
  tip: string;
}

export interface QuestionGameData {
  topic: string;
  questionNumber: number;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation?: string;
  language?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  mode: SmartMode;
  sources?: GroundingSource[];
  usedWebSearch?: boolean;
  quizData?: QuizItem[];
  questionGame?: QuestionGameData;
  gameSelectedIndex?: number;
  gameLanguage?: string;
  attachment?: {
    name: string;
    mimeType: string;
    previewUrl?: string;
    pageCount?: number;
  };
  error?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: SmartMode;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface UserSettings {
  displayName: string;
  voiceProfile: VoiceProfile;
  speechSpeed: number;
  autoSpeak: boolean;
  language: LanguageOption;
  personalMemory: string;
  animationStyle: AnimationPreference;
}

export interface AuthUser {
  identifier: string;
  role: 'user' | 'guest' | 'admin';
  loggedInAt: number;
  name?: string;
  email?: string;
  provider?: 'google' | 'credentials' | 'guest';
}

export interface ManagedUser {
  id: string;
  name: string;
  identifier: string;
  role: 'Boss Admin' | 'Pro Member' | 'Standard' | 'Guest';
  status: 'Active' | 'Suspended';
  queries: number;
  lastSeen: string;
  provider?: 'google' | 'credentials' | 'guest';
  clientEnvironment?: 'Android APK' | 'Chrome Web';
  ttsCount?: number;
}

export interface AdminConfig {
  liveWebSearchEnabled: boolean;
  maintenanceMode: boolean;
  announcementBanner: string;
}

export interface TelemetryData {
  totalRegisteredUsers: number;
  activeSessionsCount: number;
  totalQueriesProcessed: number;
  totalImagesCreated: number;
  ttsUsageCount?: number;
  activityLogs: Array<{ id: string; timestamp: number; text: string }>;
}

export interface AdminStatistics {
  totalRegisteredUsers: number;
  activeUsersCount: number;
  activeSessionsCount: number;
  totalQueriesProcessed: number;
  totalImagesCreated: number;
}

export type MessageSegment =
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'code';
      language: string;
      code: string;
      isRunnableWeb: boolean;
    }
  | {
      type: 'image';
      alt: string;
      url: string;
    };

export interface DailyGoal {
  title: string;
  targetCount: number;
  completedCount: number;
  updatedDate: string;
}

