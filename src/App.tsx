import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Code2,
  Gamepad2,
  Globe,
  Menu,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { AuthScreen } from './components/AuthScreen';
import { CodePreviewModal } from './components/CodePreviewModal';
import { HologramStage } from './components/HologramStage';
import { MessageBubble } from './components/MessageBubble';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { SplashScreen } from './components/SplashScreen';
import type {
  AdminConfig,
  AiState,
  AppScreen,
  AttachmentData,
  AuthUser,
  ChatMessage,
  ChatSession,
  DailyGoal,
  ManagedUser,
  QuestionGameData,
  SmartMode,
  TelemetryData,
  UserSettings,
  VoiceProfile,
} from './types/aura';
import {
  buildCleanVisualPrompt,
  buildMessageSpeechText,
  buildPollinationsImageUrl,
  buildQuestionGameTurnInstruction,
  buildRunnableHtmlDocument,
  buildSystemInstruction,
  cleanImageSubject,
  cleanSpeechTextForPronunciation,
  deriveSessionTitle,
  detectCodingIntent,
  detectEffectiveLanguage,
  detectLanguageLockSwitch,
  detectVoiceLocaleAndLang,
  extractCleanImagePrompt,
  extractQuestionGameBlock,
  extractTopicChangeFromQuestionGame,
  formatConversationMarkdown,
  getPollinationsFluxUrl,
  getQuestionGameTopicPrompt,
  getQuickPrompts,
  isDuplicateQuestion,
  isImageEditRequest,
  isImageGenerationRequest,
  isStopQuestionGameIntent,
  resolveHologramMode,
  cleanThoughtAndBrokenText,
  generateStudyQuiz,
  pushCloudAnalytics,
  syncUserDataToCloud,
  fetchUserDataFromCloud,
  sanitizeUserHTML,
  fetchAuraReply,
  streamAuraReply,
  synthesizeImageEditPrompt,
  getSafeStorageUserKey,
  isWebViewEnvironment,
} from './utils/auraLogic';
import {
  loadActiveSessionId,
  loadAdminConfig,
  loadAuthUser,
  loadManagedUsers,
  loadSessions,
  loadSettings,
  loadTelemetry,
  recordTelemetryEvent,
  saveActiveSessionId,
  saveAdminConfig,
  saveAuthUser,
  saveManagedUsers,
  saveSessions,
  saveSettings,
  saveTelemetry,
  loadDailyGoal,
  saveDailyGoal,
  safeGetItem,
  safeSetItem,
  upsertManagedUserFromAuth,
} from './utils/storage';

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((ev: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const STARTER_PROMPTS: Array<{
  title: string;
  prompt: string;
  mode: SmartMode;
  icon: 'globe' | 'code' | 'book';
}> = [
  {
    title: 'Live Web Briefing',
    prompt: 'What are the latest breakthroughs in space exploration and AI this week?',
    mode: 'general',
    icon: 'globe',
  },
  {
    title: 'Interactive Code Sandbox',
    prompt: 'Create a sleek interactive HTML/CSS/JS digital stopwatch card with start, pause, and reset buttons.',
    mode: 'coding',
    icon: 'code',
  },
  {
    title: 'Study & Exam Breakdown',
    prompt: 'Explain Newton’s laws of motion with simple everyday analogies and 3 quick quiz questions.',
    mode: 'study',
    icon: 'book',
  },
];

export default function App() {
  const autostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    if (autostart) {
      return {
        identifier: 'guest@aurelion.ai',
        name: 'Guest',
        provider: 'guest',
        role: 'guest',
        loggedInAt: Date.now(),
      };
    }
    return loadAuthUser();
  });

  const postLoginTargetRef = useRef<'app' | 'admin' | null>(null);

  useEffect(() => {
    if (authUser) {
      pushCloudAnalytics(authUser, sessionQueriesCount);
    }
  }, [authUser]);

  const [screen, setScreen] = useState<AppScreen | 'analytics'>(() => {
    if (autostart) return 'app';
    return 'splash';
  });

  useEffect(() => {
    if (
      !authUser ||
      authUser.role === 'guest' ||
      authUser.identifier === 'guest@aura.ai' ||
      authUser.identifier === 'guest@aurelion.ai'
    ) {
      return;
    }
    const initCloudSync = async () => {
      const cloudData = await fetchUserDataFromCloud(authUser);
      if (cloudData) {
        if (cloudData.chats && Array.isArray(cloudData.chats) && cloudData.chats.length > 0) {
          setSessions(cloudData.chats);
        }
        if (typeof cloudData.memory === 'string' && cloudData.memory.trim()) {
          setSettings((prev) => ({ ...prev, personalMemory: cloudData.memory || '' }));
        }
      }
    };
    initCloudSync();
  }, [authUser]);

  const [settings, setSettings] = useState<UserSettings>(() => loadSettings(authUser));
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions(authUser));

  const [langMode, setLangMode] = useState<string>(() => {
    if (typeof window === 'undefined') return 'auto';
    return safeGetItem('aurelion_lang_mode') || safeGetItem('aura_lang_mode') || 'auto';
  });

  const [liveAdminToast, setLiveAdminToast] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return safeGetItem('aurelion_live_alert') || safeGetItem('aura_banner') || '';
  });

  const [saveBadgeText, setSaveBadgeText] = useState('☁️ Saved ✓');
  const [saveBadgeColor, setSaveBadgeColor] = useState('#10b981');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const userKey = getSafeStorageUserKey(authUser?.identifier, authUser?.role);
      if (userKey !== 'guest') {
        const optimizedCache = sessions.slice(0, 3).map((s) => ({
          ...s,
          messages: s.messages.slice(-10),
        }));
        safeSetItem(`aurelion_saved_chats_v2_${userKey}`, JSON.stringify(optimizedCache));
        safeSetItem(`aura_saved_chats_v2_${userKey}`, JSON.stringify(optimizedCache));
        syncUserDataToCloud(sessions, settings.personalMemory, authUser);
      }

      setSaveBadgeText('⏳ Saving...');
      setSaveBadgeColor('#00f0ff');
      const timer = setTimeout(() => {
        setSaveBadgeText('☁️ Saved ✓');
        setSaveBadgeColor('#10b981');
      }, 450);
      return () => clearTimeout(timer);
    } catch {
      // ignore
    }
  }, [sessions, settings.personalMemory, authUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    safeSetItem('aurelion_lang_mode', langMode);
    safeSetItem('aura_lang_mode', langMode);
  }, [langMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleLiveAlert = (e: Event) => {
      const customEv = e as CustomEvent<string>;
      const msg =
        typeof customEv.detail === 'string'
          ? customEv.detail
          : safeGetItem('aurelion_live_alert') || safeGetItem('aura_banner') || '';
      setLiveAdminToast(msg);
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'aurelion_live_alert' || e.key === 'aura_banner') {
        setLiveAdminToast(e.newValue || '');
      }
    };
    window.addEventListener('aurelion-live-alert', handleLiveAlert);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('aurelion-live-alert', handleLiveAlert);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    loadActiveSessionId(authUser)
  );
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const [smartMode, setSmartMode] = useState<SmartMode>('live');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [liveCallActive, setLiveCallActive] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(() => loadAdminConfig());
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>(() => loadManagedUsers());
  const [telemetry, setTelemetry] = useState<TelemetryData>(() => loadTelemetry());
  const [dailyGoal, setDailyGoal] = useState<DailyGoal>(() => loadDailyGoal(authUser));

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<{
    id: 'image' | 'search' | 'upload' | 'coding' | 'study';
    label: string;
    placeholder: string;
  } | null>(null);

  const [previewTarget, setPreviewTarget] = useState<{
    language: string;
    code: string;
  } | null>(null);

  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingNote, setThinkingNote] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [inputNotice, setInputNotice] = useState('');
  const [sessionQueriesCount, setSessionQueriesCount] = useState(0);
  const [reactionTrigger, setReactionTrigger] = useState<{ text: string; id: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSentMsgRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const liveCallActiveRef = useRef(false);
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveMediaStreamRef = useRef<MediaStream | null>(null);
  const liveInputAudioCtxRef = useRef<AudioContext | null>(null);
  const liveScriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveOutputAudioCtxRef = useRef<AudioContext | null>(null);
  const liveNextStartTimeRef = useRef(0);
  const liveScheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const voiceMutedRef = useRef(false);

  useEffect(() => {
    voiceMutedRef.current = voiceMuted;
  }, [voiceMuted]);
  const msgTimestampsRef = useRef<number[]>([]);
  const imgTimestampsRef = useRef<number[]>([]);

  const [questionGameState, setQuestionGameState] = useState<{
    active: boolean;
    phase: 'awaiting_topic' | 'playing';
    topic: string;
    questionNumber: number;
    askedQuestions: string[];
    sessionId: string | null;
  }>({
    active: false,
    phase: 'awaiting_topic',
    topic: '',
    questionNumber: 0,
    askedQuestions: [],
    sessionId: null,
  });
  const questionGameRef = useRef(questionGameState);
  questionGameRef.current = questionGameState;
  const questionGameTimerRef = useRef<number | null>(null);
  const questionGameRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (questionGameTimerRef.current) {
        window.clearTimeout(questionGameTimerRef.current);
      }
    };
  }, []);

  // Close sidebar on mobile resize & preload SpeechSynthesis voices for Dual-Engine TTS
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          try {
            window.speechSynthesis.getVoices();
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore
      }
    }

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Unified Live Code Runner global bridge -> opens CodePreviewModal directly
  useEffect(() => {
    (window as unknown as {
      openLiveCodeRunner?: (code: string, lang?: string) => void;
      currentSandboxCode?: string;
    }).openLiveCodeRunner = (rawCode: string, lang = 'javascript') => {
      (window as unknown as { currentSandboxCode?: string }).currentSandboxCode = rawCode;
      setPreviewTarget({ language: lang || 'javascript', code: rawCode });
    };
  }, []);

  // Splash timer (max 1.2s) unless autostart=1
  useEffect(() => {
    if (autostart) return;
    if (screen !== 'splash') return;
    const durationMs = postLoginTargetRef.current ? 900 : 1200;
    const timer = window.setTimeout(() => {
      if (postLoginTargetRef.current) {
        const target = postLoginTargetRef.current;
        postLoginTargetRef.current = null;
        setScreen(target);
      } else if (authUser) {
        setScreen('app');
      } else {
        setScreen('auth');
      }
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [autostart, authUser, screen]);

  // Persist state slices per isolated user
  useEffect(() => {
    saveSettings(settings, authUser);
  }, [settings, authUser]);

  useEffect(() => {
    saveSessions(sessions, authUser);
  }, [sessions, authUser]);

  useEffect(() => {
    saveActiveSessionId(activeSessionId, authUser);
  }, [activeSessionId, authUser]);

  useEffect(() => {
    saveAdminConfig(adminConfig);
  }, [adminConfig]);

  useEffect(() => {
    saveManagedUsers(managedUsers);
  }, [managedUsers]);

  useEffect(() => {
    saveTelemetry(telemetry);
  }, [telemetry]);


  const lastUserMessageText = useMemo(() => {
    if (!activeSession) return inputText;
    const lastUser = [...activeSession.messages]
      .reverse()
      .find((m) => m.role === 'user');
    return inputText.trim() ? inputText : lastUser?.content || '';
  }, [activeSession, inputText]);

  const hologramMode = useMemo(
    () =>
      resolveHologramMode(
        settings.animationStyle,
        smartMode,
        lastUserMessageText
      ),
    [settings.animationStyle, smartMode, lastUserMessageText]
  );

  const aiState: AiState = useMemo(() => {
    if (isThinking) return 'thinking';
    if (speakingMessageId) return 'speaking';
    return 'idle';
  }, [isThinking, speakingMessageId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isThinking]);

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.src = '';
      } catch {
        // ignore
      }
      ttsAudioRef.current = null;
    }
    setSpeakingMessageId(null);
  }, []);

  const playHtml5AudioTtsFallback = useCallback(
    (
      plainText: string,
      targetLang: string,
      speed: number,
      messageId: string | null,
      onDone?: () => void
    ) => {
      if (typeof window === 'undefined' || !plainText) {
        onDone?.();
        return;
      }

      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.src = '';
        } catch {
          // ignore
        }
        ttsAudioRef.current = null;
      }

      const lowerLang = targetLang.toLowerCase();
      const tl = lowerLang.startsWith('mr') ? 'mr' : lowerLang.startsWith('hi') ? 'hi' : 'en';

      // Split into natural sentence/clause chunks (<=175 chars) preserving pauses on । . ? ! ,
      const rawClauses = plainText
        .slice(0, 620)
        .split(/(?<=[।.?!,])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const chunks: string[] = [];
      let current = '';
      for (const clause of rawClauses) {
        if (clause.length > 175) {
          if (current.trim()) {
            chunks.push(current.trim());
            current = '';
          }
          const words = clause.split(/\s+/);
          for (const word of words) {
            if ((current + ' ' + word).trim().length > 175) {
              if (current.trim()) chunks.push(current.trim());
              current = word;
            } else {
              current = (current + ' ' + word).trim();
            }
          }
        } else if ((current + ' ' + clause).trim().length > 175) {
          if (current.trim()) chunks.push(current.trim());
          current = clause;
        } else {
          current = (current + ' ' + clause).trim();
        }
      }
      if (current.trim()) chunks.push(current.trim());

      if (chunks.length === 0) {
        if (messageId) setSpeakingMessageId(null);
        onDone?.();
        return;
      }

      if (messageId) {
        setSpeakingMessageId(messageId);
      }

      let idx = 0;
      const playNextChunk = () => {
        if (idx >= chunks.length) {
          ttsAudioRef.current = null;
          if (messageId) setSpeakingMessageId(null);
          onDone?.();
          return;
        }
        const chunkText = chunks[idx++];
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(chunkText)}`;
        try {
          const audio = new Audio(ttsUrl);
          audio.playbackRate = Math.max(0.75, Math.min(1.5, speed || 1.0));
          ttsAudioRef.current = audio;
          audio.onended = () => playNextChunk();
          audio.onerror = () => playNextChunk();
          audio.play().catch(() => {
            ttsAudioRef.current = null;
            if (messageId) setSpeakingMessageId(null);
            onDone?.();
          });
        } catch {
          ttsAudioRef.current = null;
          if (messageId) setSpeakingMessageId(null);
          onDone?.();
        }
      };

      playNextChunk();
    },
    []
  );

  const speakText = useCallback(
    (
      text: string,
      messageId: string,
      profileOverride?: VoiceProfile,
      speedOverride?: number,
      langOverride?: string
    ) => {
      if (voiceMuted) return;
      if (typeof window === 'undefined') return;

      stopSpeech();

      const plainText = cleanSpeechTextForPronunciation(text);
      if (!plainText) return;

      // Record TTS usage in telemetry and managedUsers
      const updatedTel = recordTelemetryEvent((prev) => ({
        ...prev,
        ttsUsageCount: (prev.ttsUsageCount || 0) + 1,
      }));
      setTelemetry(updatedTel);
      if (authUser?.identifier) {
        setManagedUsers((prev) =>
          prev.map((u) =>
            u.identifier.toLowerCase() === authUser.identifier.toLowerCase()
              ? { ...u, ttsCount: (u.ttsCount || 0) + 1 }
              : u
          )
        );
      }

      const profile = profileOverride || settings.voiceProfile;
      const speed = speedOverride ?? settings.speechSpeed;
      const { locale: targetLang, shortLang } = detectVoiceLocaleAndLang(
        plainText,
        langOverride || langMode
      );

      const hasNativeSpeech = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
      const voices = hasNativeSpeech ? window.speechSynthesis.getVoices() : [];
      const isWebView = isWebViewEnvironment(navigator.userAgent);

      // Inside Android WebView APKs or when window.speechSynthesis has 0 voices, use HTML5 Audio TTS fallback
      if (!hasNativeSpeech ) {
        playHtml5AudioTtsFallback(plainText, shortLang, speed, messageId);
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(plainText);
        utterance.rate = speed;
        if (profile === 'Orion') utterance.pitch = 0.85;
        else if (profile === 'Echo') utterance.pitch = 1.15;
        else if (profile === 'Lyra') utterance.pitch = 1.25;
        else utterance.pitch = 1.0;

        utterance.lang = targetLang;

        if (voices.length > 0) {
          const matchedVoice =
            voices.find((v) => v.lang.toLowerCase().includes(targetLang.toLowerCase())) ||
            voices.find((v) => v.lang.toLowerCase().startsWith(shortLang)) ||
            (shortLang === 'mr' ? voices.find((v) => v.lang.toLowerCase().startsWith('hi')) : undefined) ||
            (shortLang === 'en' ? voices.find((v) => v.lang.toLowerCase().startsWith('en')) : undefined);
          if (matchedVoice) utterance.voice = matchedVoice;
        }

        utterance.onend = () => setSpeakingMessageId(null);
        utterance.onerror = () => {
          // Automatic HTML5 Audio TTS fallback if WebView speechSynthesis fails or has 0 voices
          playHtml5AudioTtsFallback(plainText, shortLang, speed, messageId);
        };

        setSpeakingMessageId(messageId);
        window.speechSynthesis.speak(utterance);
      } catch {
        playHtml5AudioTtsFallback(plainText, shortLang, speed, messageId);
      }
    },
    [langMode, playHtml5AudioTtsFallback, settings.speechSpeed, settings.voiceProfile, stopSpeech, voiceMuted]
  );

  const handleSpeakToggle = useCallback(
    (msg: ChatMessage) => {
      if (speakingMessageId === msg.id) {
        stopSpeech();
      } else {
        const speechText = buildMessageSpeechText(msg, langMode);
        const speechLangHint = msg.gameLanguage || msg.questionGame?.language || langMode;
        speakText(speechText, msg.id, undefined, undefined, speechLangHint);
      }
    },
    [langMode, speakingMessageId, speakText, stopSpeech]
  );

  const handleAuthenticated = (user: AuthUser, openAdminImmediately: boolean) => {
    setAuthUser(user);
    saveAuthUser(user);

    // Load isolated user data (Guest Mode automatically gets clean [] sessions & default Guest settings)
    const loadedUserSettings = loadSettings(user);
    setSettings(loadedUserSettings);
    setSessions(loadSessions(user));
    setActiveSessionId(loadActiveSessionId(user));
    setDailyGoal(loadDailyGoal(user));
    setManagedUsers(upsertManagedUserFromAuth(user, user.name || loadedUserSettings.displayName));
    setInputNotice('');

    const updated = recordTelemetryEvent((prev) => {
      const isNewUser = !managedUsers.some((u) => u.identifier === user.identifier);
      return {
        ...prev,
        totalRegisteredUsers: isNewUser ? prev.totalRegisteredUsers + 1 : Math.max(prev.totalRegisteredUsers, 1),
        activeSessionsCount: 1,
        activityLogs: [
          {
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            text: `User signed in: ${user.identifier} (${user.role})`,
          },
          ...prev.activityLogs,
        ],
      };
    });
    setTelemetry(updated);

    // Transition smoothly through brief SplashScreen (900ms) directly into workspace
    const targetScreen = openAdminImmediately ? 'admin' : 'app';
    postLoginTargetRef.current = targetScreen;
    setScreen('splash');
  };

  const handleLogout = () => {
    stopSpeech();
    postLoginTargetRef.current = null;
    setAuthUser(null);
    saveAuthUser(null);
    setSettingsOpen(false);
    setActiveSessionId(null);
    setSessions([]);

    const updated = recordTelemetryEvent((prev) => ({
      ...prev,
      activeSessionsCount: 0,
      activityLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          text: `User logged out`,
        },
        ...prev.activityLogs,
      ],
    }));
    setTelemetry(updated);

    setScreen('auth');
  };

  const handleNewChat = () => {
    stopSpeech();
    questionGameRequestIdRef.current += 1;
    if (questionGameTimerRef.current) {
      window.clearTimeout(questionGameTimerRef.current);
      questionGameTimerRef.current = null;
    }
    const resetGame = {
      active: false,
      phase: 'awaiting_topic' as const,
      topic: '',
      questionNumber: 0,
      askedQuestions: [],
      sessionId: null,
    };
    questionGameRef.current = resetGame;
    setQuestionGameState(resetGame);
    setActiveSessionId(null);
    setInputNotice('');
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  const handleClearAllHistory = () => {
    stopSpeech();
    setSessions([]);
    setActiveSessionId(null);
  };

  const handleExportChat = () => {
    if (!activeSession || activeSession.messages.length === 0) {
      setInputNotice('Start a conversation first before exporting.');
      window.setTimeout(() => setInputNotice(''), 2500);
      return;
    }

    const md = formatConversationMarkdown(activeSession);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurelion-ai-chat-${activeSession.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setInputNotice('');

    if (file.size > 8 * 1024 * 1024) {
      setInputNotice('File size must be under 8 MB.');
      return;
    }

    const reader = new FileReader();
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64Data = result.includes(',') ? result.split(',')[1] : '';
        setAttachment({
          name: file.name,
          mimeType: file.type,
          size: file.size,
          base64Data,
          previewUrl: file.type.startsWith('image/') ? result : undefined,
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        const textContent = typeof reader.result === 'string' ? reader.result : '';
        setAttachment({
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          textContent,
        });
      };
      reader.readAsText(file);
    }
  };

  const toggleVoiceInput = () => {
    setInputNotice('');
    if (isRecording && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setInputNotice('⚠️ बॉस, इस ब्राउज़र में वॉइस टाइपिंग सपोर्ट नहीं है—कृपया Google Chrome इस्तेमाल करें।');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang =
        langMode === 'Marathi'
          ? 'mr-IN'
          : langMode === 'Hindi' || settings.language === 'Hindi'
            ? 'hi-IN'
            : 'en-IN';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      const baseText = inputText.trim();

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += piece;
          } else {
            interimTranscript += piece;
          }
        }

        const spoken = (finalTranscript || interimTranscript).trim();
        if (spoken) {
          setInputText(baseText ? `${baseText} ${spoken}` : spoken);
        }
      };

      recognition.onerror = (event: { error?: string }) => {
        setIsRecording(false);
        const errType = event?.error;
        if (errType === 'not-allowed' || errType === 'service-not-allowed') {
          setInputNotice('🎙️ माइक की अनुमति बंद है बॉस! ब्राउज़र के ऊपर 🔒 ताले पर क्लिक करके Microphone Allow करें।');
        } else if (errType === 'no-speech') {
          setInputNotice('🤫 कोई आवाज़ सुनाई नहीं दी—माइक दबाकर थोड़ा करीब से बोलें।');
        } else {
          setInputNotice('🎙️ माइक रीसेट हो गया है, कृपया दोबारा टैप करके बोलें।');
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
      setInputNotice('🎙️ माइक शुरू करने के लिए पेज को एक बार रिफ्रेश करें बॉस।');
    }
  };

  const stopLiveAudioPlayback = () => {
    liveScheduledSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // ignore already stopped source
      }
    });
    liveScheduledSourcesRef.current.clear();
    if (liveOutputAudioCtxRef.current) {
      liveNextStartTimeRef.current = liveOutputAudioCtxRef.current.currentTime;
    } else {
      liveNextStartTimeRef.current = 0;
    }
  };

  const cleanupLiveSessionResources = () => {
    stopLiveAudioPlayback();
    if (liveScriptProcessorRef.current) {
      try {
        liveScriptProcessorRef.current.disconnect();
        liveScriptProcessorRef.current.onaudioprocess = null;
      } catch {}
      liveScriptProcessorRef.current = null;
    }
    if (liveMediaStreamRef.current) {
      try {
        liveMediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      liveMediaStreamRef.current = null;
    }
    if (liveInputAudioCtxRef.current) {
      try {
        void liveInputAudioCtxRef.current.close();
      } catch {}
      liveInputAudioCtxRef.current = null;
    }
    if (liveOutputAudioCtxRef.current) {
      try {
        void liveOutputAudioCtxRef.current.close();
      } catch {}
      liveOutputAudioCtxRef.current = null;
    }
    if (liveWsRef.current) {
      try {
        liveWsRef.current.onopen = null;
        liveWsRef.current.onmessage = null;
        liveWsRef.current.onerror = null;
        liveWsRef.current.onclose = null;
        liveWsRef.current.close();
      } catch {}
      liveWsRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      liveCallActiveRef.current = false;
      cleanupLiveSessionResources();
    };
  }, []);

  const playLivePcmChunk = (base64Audio: string) => {
    if (!base64Audio || !liveCallActiveRef.current || voiceMutedRef.current) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!liveOutputAudioCtxRef.current || liveOutputAudioCtxRef.current.state === 'closed') {
        liveOutputAudioCtxRef.current = new AudioCtx({ sampleRate: 24000 });
        liveNextStartTimeRef.current = liveOutputAudioCtxRef.current.currentTime;
      }
      const ctx = liveOutputAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const sampleCount = Math.floor(bytes.byteLength / 2);
      if (sampleCount <= 0) return;

      const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const float32Data = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Data[i] = int16 / 32768;
      }

      const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
      audioBuffer.copyToChannel(float32Data, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const startTime = Math.max(ctx.currentTime + 0.015, liveNextStartTimeRef.current);
      source.start(startTime);
      liveNextStartTimeRef.current = startTime + audioBuffer.duration;

      liveScheduledSourcesRef.current.add(source);
      source.onended = () => {
        liveScheduledSourcesRef.current.delete(source);
      };
    } catch {
      // Ignore malformed audio chunk
    }
  };

  const encodePcm16Base64 = (float32Samples: Float32Array): string => {
    const buffer = new ArrayBuffer(float32Samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32Samples[i]));
      view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  const stopLiveCall = () => {
    liveCallActiveRef.current = false;
    setLiveCallActive(false);
    stopSpeech();
    cleanupLiveSessionResources();
    setInputNotice('📞 Live Call ended.');
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsRecording(false);
  };

  const speakLiveCallReplyAndResume = (rawText: string) => {
    if (!liveCallActiveRef.current) return;

    const cleanSpeech = cleanSpeechTextForPronunciation(rawText).slice(0, 480);

    if (voiceMutedRef.current || !cleanSpeech) {
      if (liveCallActiveRef.current) {
        setTimeout(() => startLiveCallListening(), 700);
      }
      return;
    }

    let resumed = false;
    const resumeNextTurn = () => {
      if (resumed) return;
      resumed = true;
      if (liveCallActiveRef.current) {
        setTimeout(() => startLiveCallListening(), 600);
      }
    };

    const { locale: targetLang, shortLang } = detectVoiceLocaleAndLang(cleanSpeech, langMode);
    const hasNativeSpeech = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    const voices = hasNativeSpeech ? window.speechSynthesis.getVoices() : [];
    const isWebView = isWebViewEnvironment(navigator.userAgent);

    if (!hasNativeSpeech || (voices.length === 0 && isWebView)) {
      playHtml5AudioTtsFallback(cleanSpeech, shortLang, 1.02, null, resumeNextTurn);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(cleanSpeech);
      utter.lang = targetLang;
      utter.rate = 1.02;

      if (voices.length > 0) {
        const matchedVoice =
          voices.find((v) => v.lang.toLowerCase().includes(targetLang.toLowerCase())) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(shortLang)) ||
          (shortLang === 'mr' ? voices.find((v) => v.lang.toLowerCase().startsWith('hi')) : undefined);
        if (matchedVoice) utter.voice = matchedVoice;
      }

      utter.onend = resumeNextTurn;
      utter.onerror = () => {
        playHtml5AudioTtsFallback(cleanSpeech, shortLang, 1.02, null, resumeNextTurn);
      };

      // Guaranteed fallback timer in case Android Chrome skips onend
      const estimatedMs = Math.max(3000, cleanSpeech.length * 75);
      setTimeout(() => {
        resumeNextTurn();
      }, estimatedMs);

      window.speechSynthesis.speak(utter);
    } catch {
      playHtml5AudioTtsFallback(cleanSpeech, shortLang, 1.02, null, resumeNextTurn);
    }
  };

  const startLiveCallListening = () => {
    if (!liveCallActiveRef.current) return;

    // 1. Try SpeechRecognition first
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      // Fallback to MediaRecorder audio streaming to server /api/chat
      startMediaRecorderAudioFallback();
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }

      const recognition = new SpeechRec();
      recognition.lang = settings.language === 'Hindi' ? 'hi-IN' : 'en-IN';
      recognition.interimResults = true;
      recognition.continuous = true;

      let liveCallBuffer = '';
      let silenceTimer: number | null = null;
      let hasSubmitted = false;
      let startTimeout: number | null = null;
      let started = false;

      recognition.onstart = () => {
        started = true;
        if (startTimeout) clearTimeout(startTimeout);
        setIsRecording(true);
        setInputNotice('🔴 Mic Listening... अब बोलिए');
      };

      // 2-second timeout guard on onstart
      startTimeout = window.setTimeout(() => {
        if (!started && liveCallActiveRef.current) {
          try { recognition.stop(); } catch {}
          startMediaRecorderAudioFallback();
        }
      }, 2000);

      recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
        if (!liveCallActiveRef.current || hasSubmitted) return;
        let fullText = '';
        for (let i = 0; i < event.results.length; i++) {
          fullText += event.results[i][0].transcript;
        }
        liveCallBuffer = fullText.trim();
        setInputText(liveCallBuffer);

        if (silenceTimer) clearTimeout(silenceTimer);
        if (liveCallBuffer.length > 0) {
          silenceTimer = window.setTimeout(() => {
            if (!hasSubmitted && liveCallBuffer.trim() && liveCallActiveRef.current) {
              hasSubmitted = true;
              try { recognition.stop(); } catch {}
              setIsRecording(false);
              const spoken = liveCallBuffer.trim();
              setInputText('');
              setInputNotice('');
              handleSendMessage(spoken, 'live').then(() => {
                const currentChat = sessions.find((s) => s.id === activeSessionId);
                const lastMsg = currentChat?.messages[currentChat.messages.length - 1];
                const replyText = lastMsg && lastMsg.role === 'assistant' ? lastMsg.content : 'जी बॉस, आगे बोलिए।';
                speakLiveCallReplyAndResume(replyText);
              }).catch(() => {
                if (liveCallActiveRef.current) setTimeout(() => startLiveCallListening(), 1000);
              });
            }
          }, 1500);
        }
      };

      recognition.onerror = (event: { error?: string }) => {
        if (startTimeout) clearTimeout(startTimeout);
        setIsRecording(false);
        const err = event?.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setInputNotice('⚠️ AI Studio Preview ने माइक ब्लॉक किया है — इसे Chrome टैब में खोलें!');
          startMediaRecorderAudioFallback();
        } else {
          setInputNotice('🎙️ माइक रीसेट हो रहा है...');
          setTimeout(() => {
            if (liveCallActiveRef.current) startLiveCallListening();
          }, 1000);
        }
      };

      recognition.onend = () => {
        if (startTimeout) clearTimeout(startTimeout);
        setIsRecording(false);
        if (!hasSubmitted && liveCallBuffer.trim() && liveCallActiveRef.current) {
          hasSubmitted = true;
          const spoken = liveCallBuffer.trim();
          setInputText('');
          setInputNotice('');
          handleSendMessage(spoken, 'live').then(() => {
            const currentChat = sessions.find((s) => s.id === activeSessionId);
            const lastMsg = currentChat?.messages[currentChat.messages.length - 1];
            const replyText = lastMsg && lastMsg.role === 'assistant' ? lastMsg.content : 'जी बॉस, आगे बोलिए।';
            speakLiveCallReplyAndResume(replyText);
          }).catch(() => {
            if (liveCallActiveRef.current) setTimeout(() => startLiveCallListening(), 1000);
          });
        } else if (liveCallActiveRef.current && !hasSubmitted) {
          setTimeout(() => {
            if (liveCallActiveRef.current) startLiveCallListening();
          }, 600);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
      startMediaRecorderAudioFallback();
    }
  };

  const startMediaRecorderAudioFallback = () => {
    if (!liveCallActiveRef.current) return;
    setInputNotice('🎙️ MediaRecorder Audio Mode Active... बोलिए');

    if (!navigator.mediaDevices?.getUserMedia) {
      setInputNotice('⚠️ Microphone access unavailable in this browser view.');
      liveCallActiveRef.current = false;
      setLiveCallActive(false);
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (!liveCallActiveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!liveCallActiveRef.current) return;

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Full = reader.result as string;
          const base64Data = base64Full.includes(',') ? base64Full.split(',')[1] : '';

          if (base64Data && liveCallActiveRef.current) {
            setInputNotice('⏳ AURELION AI सुन रही है...');
            try {
              const replyText = await fetchAuraReply(
                'Transcribe this voice note and answer/reply back directly in simple Hindi/Hinglish.',
                {
                  attachment: {
                    name: 'voice-note.webm',
                    mimeType: 'audio/webm',
                    base64Data,
                  },
                }
              );
              speakLiveCallReplyAndResume(replyText);
            } catch {
              const fallbackText = await fetchAuraReply(
                'Please respond warmly in natural Hinglish for our live voice call.'
              );
              speakLiveCallReplyAndResume(fallbackText);
            }
          } else if (liveCallActiveRef.current) {
            setTimeout(() => startLiveCallListening(), 1000);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      // 1.5-second silence / speech detector with AudioContext Analyser
      try {
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silenceStartTime = Date.now();
        let hasSpoken = false;

        const checkInterval = window.setInterval(() => {
          if (!liveCallActiveRef.current || mediaRecorder.state !== 'recording') {
            clearInterval(checkInterval);
            return;
          }
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;

          if (avg > 14) {
            hasSpoken = true;
            silenceStartTime = Date.now();
          } else if (hasSpoken && Date.now() - silenceStartTime > 1500) {
            clearInterval(checkInterval);
            try { mediaRecorder.stop(); } catch {}
            setIsRecording(false);
          }
        }, 200);
      } catch {
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            try { mediaRecorder.stop(); } catch {}
            setIsRecording(false);
          }
        }, 5000);
      }
    }).catch(() => {
      setInputNotice('⚠️ AI Studio Preview ने माइक ब्लॉक किया है — इसे Chrome टैब में खोलें!');
      liveCallActiveRef.current = false;
      setLiveCallActive(false);
    });
  };

  const startServerLiveCall = () => {
    cleanupLiveSessionResources();
    liveCallActiveRef.current = true;
    setLiveCallActive(true);
    setVoiceMuted(false);
    setSmartMode('live');
    setInputNotice('📞 Connecting Gemini Live server bridge...');

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      startLiveCallListening();
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/live`;
    let fellBack = false;
    let sessionReady = false;

    const triggerFallbackLoop = () => {
      if (fellBack || !liveCallActiveRef.current) return;
      fellBack = true;
      cleanupLiveSessionResources();
      setInputNotice('📞 Gemini Live Call active! Speak naturally...');
      const greetText = 'हाँ बॉस, बोलिए मैं सुन रही हूँ।';
      const greetLang = settings.language === 'Hindi' ? 'hi-IN' : 'en-IN';
      const hasNativeSpeech =
        'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
      const voices = hasNativeSpeech ? window.speechSynthesis.getVoices() : [];
      const isWebView = isWebViewEnvironment(navigator.userAgent);

      if (hasNativeSpeech && (voices.length > 0 || !isWebView)) {
        window.speechSynthesis.cancel();
        const greetUtter = new SpeechSynthesisUtterance(greetText);
        greetUtter.lang = greetLang;
        greetUtter.onend = () => {
          if (liveCallActiveRef.current) setTimeout(() => startLiveCallListening(), 200);
        };
        greetUtter.onerror = () => {
          playHtml5AudioTtsFallback(greetText, greetLang, 1.0, null, () => {
            if (liveCallActiveRef.current) setTimeout(() => startLiveCallListening(), 200);
          });
        };
        window.speechSynthesis.speak(greetUtter);
      } else {
        playHtml5AudioTtsFallback(greetText, greetLang, 1.0, null, () => {
          if (liveCallActiveRef.current) setTimeout(() => startLiveCallListening(), 200);
        });
      }
    };

    try {
      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      const liveSys = buildSystemInstruction(
        settings,
        'live',
        false,
        langMode,
        '',
        sessions,
        activeSessionId
      );

      ws.onopen = () => {
        if (!liveCallActiveRef.current) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            type: 'start',
            systemInstruction: liveSys,
            voiceName: settings.voiceProfile,
          })
        );
      };

      ws.onmessage = (event) => {
        if (!liveCallActiveRef.current) return;
        try {
          const payload = JSON.parse(String(event.data || '{}')) as {
            ready?: boolean;
            audio?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            interrupted?: boolean;
            turnComplete?: boolean;
            error?: string;
            closed?: boolean;
          };

          if (payload.error) {
            if (!sessionReady) {
              triggerFallbackLoop();
            } else {
              setInputNotice(`⚠️ Live session notice: ${payload.error}`);
            }
            return;
          }

          if (payload.ready) {
            sessionReady = true;
            setInputNotice('🔴 Gemini Live Connected... अब बोलिए');

            if (navigator.mediaDevices?.getUserMedia) {
              navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then((stream) => {
                  if (!liveCallActiveRef.current || liveWsRef.current !== ws) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                  }
                  liveMediaStreamRef.current = stream;
                  const AudioCtx =
                    window.AudioContext ||
                    (window as unknown as { webkitAudioContext: typeof AudioContext })
                      .webkitAudioContext;
                  const inputCtx = new AudioCtx({ sampleRate: 16000 });
                  liveInputAudioCtxRef.current = inputCtx;
                  if (inputCtx.state === 'suspended') {
                    void inputCtx.resume();
                  }

                  const source = inputCtx.createMediaStreamSource(stream);
                  const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                  liveScriptProcessorRef.current = processor;

                  processor.onaudioprocess = (ev) => {
                    if (
                      !liveCallActiveRef.current ||
                      ws.readyState !== WebSocket.OPEN
                    ) {
                      return;
                    }
                    const inputData = ev.inputBuffer.getChannelData(0);
                    const b64 = encodePcm16Base64(inputData);
                    ws.send(JSON.stringify({ audio: b64 }));
                  };

                  source.connect(processor);
                  processor.connect(inputCtx.destination);
                  setIsRecording(true);
                })
                .catch(() => {
                  setInputNotice('🎙️ Mic permission needed in Chrome tab — text & audio playback active.');
                });
            }
            return;
          }

          if (payload.interrupted) {
            stopLiveAudioPlayback();
            return;
          }

          if (payload.audio) {
            playLivePcmChunk(payload.audio);
          }

          if (payload.inputTranscript) {
            setInputNotice(`🗣️ ${payload.inputTranscript}`);
          } else if (payload.outputTranscript) {
            setInputNotice(`🔊 ${payload.outputTranscript.slice(0, 80)}`);
          } else if (payload.turnComplete && sessionReady) {
            setInputNotice('🔴 Gemini Live Listening... अब बोलिए');
          }
        } catch {
          // ignore malformed WS packet
        }
      };

      ws.onerror = () => {
        if (!sessionReady) {
          triggerFallbackLoop();
        }
      };

      ws.onclose = () => {
        if (liveCallActiveRef.current && !sessionReady) {
          triggerFallbackLoop();
        } else if (liveCallActiveRef.current) {
          stopLiveCall();
        }
      };
    } catch {
      triggerFallbackLoop();
    }
  };

  const dispatchChatRequest = async (
    targetSessionId: string,
    promptText: string,
    historyMsgs: ChatMessage[],
    modeToUse: SmartMode,
    attachedFile: AttachmentData | null
  ) => {
    pushCloudAnalytics(authUser, sessionQueriesCount + 1);
    const looksLikeCoding = modeToUse === 'coding' || detectCodingIntent(promptText);
    setIsThinking(true);
    setThinkingNote(
      adminConfig.liveWebSearchEnabled && !looksLikeCoding
        ? 'Searching Live Web...'
        : 'Synthesizing Neural Response...'
    );

    const streamingMsgId = `msg-${Date.now()}-ai`;
    let insertedStreamingBubble = false;

    const upsertAssistantMessage = (
      content: string,
      sources?: Array<{ title: string; uri: string }>,
      usedWebSearch?: boolean
    ) => {
      const safeContent = content || 'नमस्ते बॉस! कृपया अपना सवाल एक बार फिर से पूछें।';
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          const exists = s.messages.some((m) => m.id === streamingMsgId);
          if (exists) {
            return {
              ...s,
              updatedAt: Date.now(),
              messages: s.messages.map((m) =>
                m.id === streamingMsgId
                  ? {
                      ...m,
                      content: safeContent,
                      ...(sources ? { sources } : {}),
                      ...(typeof usedWebSearch === 'boolean' ? { usedWebSearch } : {}),
                    }
                  : m
              ),
            };
          }
          const aiMessage: ChatMessage = {
            id: streamingMsgId,
            role: 'assistant',
            content: safeContent,
            timestamp: Date.now(),
            mode: modeToUse,
            sources,
            usedWebSearch,
          };
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [...s.messages, aiMessage],
          };
        })
      );
    };

    try {
      const explicitLock = detectLanguageLockSwitch(promptText);
      const effectiveLangMode = explicitLock || langMode;
      if (explicitLock && explicitLock !== langMode) {
        setLangMode(explicitLock);
      }

      const systemInstruction = buildSystemInstruction(
        settings,
        modeToUse,
        adminConfig.liveWebSearchEnabled,
        effectiveLangMode,
        promptText,
        sessions,
        targetSessionId
      );

      const streamResult = await streamAuraReply(promptText, {
        history: historyMsgs.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        systemInstruction,
        enableWebSearch: adminConfig.liveWebSearchEnabled,
        attachment: attachedFile
          ? {
              name: attachedFile.name,
              mimeType: attachedFile.mimeType,
              base64Data: attachedFile.base64Data,
              textContent: attachedFile.textContent,
            }
          : undefined,
        onChunk: (partialClean) => {
          if (!partialClean) return;
          if (!insertedStreamingBubble) {
            insertedStreamingBubble = true;
            setIsThinking(false);
            setThinkingNote('');
          }
          upsertAssistantMessage(partialClean);
        },
      });

      const finalContent =
        cleanThoughtAndBrokenText(streamResult.text) ||
        'नमस्ते बॉस! कृपया अपना सवाल एक बार फिर से पूछें।';

      upsertAssistantMessage(
        finalContent,
        streamResult.sources,
        streamResult.usedWebSearch
      );
      setSessionQueriesCount((c) => c + 1);

      const telUpdated = recordTelemetryEvent((prev) => ({
        ...prev,
        totalQueriesProcessed: prev.totalQueriesProcessed + 1,
        activityLogs: [
          {
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            text: `Query processed in ${modeToUse} mode`,
          },
          ...prev.activityLogs,
        ],
      }));
      setTelemetry(telUpdated);
      setReactionTrigger({ text: finalContent, id: Date.now() });
      (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(
        finalContent
      );

      if (settings.autoSpeak && finalContent) {
        speakText(finalContent, streamingMsgId);
      }
    } catch {
      const fallbackReply = await fetchAuraReply(promptText, {
        systemInstruction: buildSystemInstruction(
          settings,
          modeToUse,
          adminConfig.liveWebSearchEnabled,
          langMode,
          promptText,
          sessions,
          targetSessionId
        ),
      });
      upsertAssistantMessage(fallbackReply);
    } finally {
      setIsThinking(false);
      setThinkingNote('');
    }
  };

  const handleSendMessage = async (overridePrompt?: string, overrideMode?: SmartMode) => {
    const rawPrompt = typeof overridePrompt === 'string' ? overridePrompt : inputText;
    const trimmed = rawPrompt.trim();
    const activeAttach = typeof overridePrompt === 'string' ? null : attachment;

    const modeToUse = overrideMode || smartMode;
    if (overrideMode) {
      setSmartMode(overrideMode);
    }

    // 0. Question Games Mode Interception (Stop / Topic Selection / Topic Change)
    if (questionGameRef.current.active && !activeAttach && typeof overridePrompt !== 'string') {
      if (isStopQuestionGameIntent(trimmed)) {
        handleStopQuestionGames(true);
        setInputText('');
        return;
      }

      if (trimmed) {
        stopSpeech();
        setInputNotice('');
        questionGameRequestIdRef.current += 1;
        if (questionGameTimerRef.current) {
          window.clearTimeout(questionGameTimerRef.current);
          questionGameTimerRef.current = null;
        }
        const nextTopic =
          questionGameRef.current.phase === 'awaiting_topic'
            ? trimmed
            : extractTopicChangeFromQuestionGame(trimmed);

        const userMsg: ChatMessage = {
          id: `msg-${Date.now()}-user`,
          role: 'user',
          content: trimmed,
          timestamp: Date.now(),
          mode: modeToUse,
        };

        let targetSessionId = questionGameRef.current.sessionId || activeSessionId;
        let historyBefore: ChatMessage[] = [];

        if (!targetSessionId || !sessions.some((s) => s.id === targetSessionId)) {
          targetSessionId = `sess-${Date.now()}`;
          const newSession: ChatSession = {
            id: targetSessionId,
            title: `🎮 ${deriveSessionTitle(nextTopic)}`,
            mode: modeToUse,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [userMsg],
          };
          setSessions((prev) => [newSession, ...prev]);
          setActiveSessionId(targetSessionId);
        } else {
          const existing = sessions.find((s) => s.id === targetSessionId);
          historyBefore = existing ? existing.messages : [];
          setSessions((prev) =>
            prev.map((s) =>
              s.id === targetSessionId
                ? {
                    ...s,
                    updatedAt: Date.now(),
                    messages: [...s.messages, userMsg],
                  }
                : s
            )
          );
        }

        const existingTopicQuestions = historyBefore
          .filter(
            (m) =>
              m.questionGame &&
              m.questionGame.topic.trim().toLowerCase() === nextTopic.trim().toLowerCase()
          )
          .map((m) => m.questionGame!.question);

        const nextGameState = {
          active: true,
          phase: 'playing' as const,
          topic: nextTopic,
          questionNumber: 1,
          askedQuestions: existingTopicQuestions,
          sessionId: targetSessionId,
        };
        questionGameRef.current = nextGameState;
        setInputText('');
        setQuestionGameState(nextGameState);

        await requestNextQuestionGameQuestion(
          targetSessionId,
          nextTopic,
          1,
          existingTopicQuestions,
          historyBefore,
          modeToUse
        );
        return;
      }
    }

    // 1. Smart AI Image Editing (Uploaded Gallery Image + Edit Prompt)
    const hasUploadedImage = Boolean(
      activeAttach?.mimeType?.startsWith('image/') && activeAttach?.base64Data
    );
    if (hasUploadedImage && trimmed && isImageEditRequest(trimmed, true) && activeAttach) {
      setActiveTool(null);
      if (typeof overridePrompt !== 'string') {
        setInputText('');
        setAttachment(null);
      }
      setInputNotice('');
      await handleEditUploadedImagePrompt(trimmed, activeAttach, modeToUse);
      return;
    }

    // 2. Automatic Image Intent Detection (English, Hindi, Hinglish, or activeTool === 'image')
    const isImageRequest =
      (activeTool?.id === 'image' || isImageGenerationRequest(trimmed)) && !activeAttach;

    if (isImageRequest && trimmed) {
      setActiveTool(null);
      if (typeof overridePrompt !== 'string') {
        setInputText('');
        setAttachment(null);
      }
      setInputNotice('');
      await handleGenerateAiImagePrompt(trimmed, modeToUse);
      return;
    }

    if ((!trimmed && !activeAttach) || isThinking) return;

    const nowMs = Date.now();
    if (
      trimmed &&
      trimmed === lastSentMsgRef.current.text &&
      nowMs - lastSentMsgRef.current.time < 3000
    ) {
      setInputNotice('🛡️ सुरक्षा कवच: कृपया कुछ सेकंड रुककर अगला संदेश भेजें।');
      return;
    }
    msgTimestampsRef.current = msgTimestampsRef.current.filter((t) => nowMs - t < 60000);
    if (msgTimestampsRef.current.length >= 12) {
      setInputNotice('🛡️ सुरक्षा कवच: कृपया कुछ सेकंड रुककर अगला संदेश भेजें।');
      return;
    }
    msgTimestampsRef.current.push(nowMs);
    lastSentMsgRef.current = { text: trimmed, time: nowMs };

    stopSpeech();
    setInputNotice('');

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: trimmed || `Analyze attached file: ${activeAttach?.name}`,
      timestamp: Date.now(),
      mode: modeToUse,
      attachment: activeAttach
        ? {
            name: activeAttach.name,
            mimeType: activeAttach.mimeType,
            previewUrl: activeAttach.previewUrl,
          }
        : undefined,
    };

    setReactionTrigger({ text: userMsg.content, id: Date.now() });
    (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(
      userMsg.content
    );

    let targetSessionId = activeSessionId;
    let historyBefore: ChatMessage[] = [];

    if (!targetSessionId || !sessions.some((s) => s.id === targetSessionId)) {
      targetSessionId = `sess-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetSessionId,
        title: deriveSessionTitle(userMsg.content),
        mode: modeToUse,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMsg],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(targetSessionId);
    } else {
      const existing = sessions.find((s) => s.id === targetSessionId);
      historyBefore = existing ? existing.messages : [];
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                mode: modeToUse,
                updatedAt: Date.now(),
                messages: [...s.messages, userMsg],
              }
            : s
        )
      );
    }

    if (typeof overridePrompt !== 'string') {
      setInputText('');
      setAttachment(null);
    }

    await dispatchChatRequest(
      targetSessionId,
      userMsg.content,
      historyBefore,
      modeToUse,
      activeAttach
    );
  };

  const handleGenerateAiImagePrompt = async (
    promptText: string,
    modeToUse: SmartMode = smartMode
  ) => {
    const nowMs = Date.now();
    const recentClick = imgTimestampsRef.current[imgTimestampsRef.current.length - 1] || 0;
    if (nowMs - recentClick < 800) {
      return;
    }
    imgTimestampsRef.current = [...imgTimestampsRef.current.slice(-10), nowMs];

    stopSpeech();
    setInputNotice('');
    setIsThinking(true);
    setThinkingNote('🎨 Designing your image...');

    // 1. Smart Prompt Cleaner & Visual Enhancer (strips filler words, translates Hindi, enriches prompt)
    const enhancedPrompt = await buildCleanVisualPrompt(promptText);
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const imageUrl = getPollinationsFluxUrl(enhancedPrompt, seed);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: promptText.trim(),
      timestamp: Date.now(),
      mode: modeToUse,
    };

    setReactionTrigger({ text: userMsg.content, id: Date.now() });

    let targetSessionId = activeSessionId;
    if (!targetSessionId || !sessions.some((s) => s.id === targetSessionId)) {
      targetSessionId = `sess-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetSessionId,
        title: deriveSessionTitle(enhancedPrompt),
        mode: modeToUse,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMsg],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(targetSessionId);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, userMsg],
              }
            : s
        )
      );
    }

    const imageMarkdown = `🎨 **Generated Visual:** ${enhancedPrompt}\n\n![${enhancedPrompt}](${imageUrl})\n\n[⬇️ Download Image](${imageUrl})`;

    const aiMsg: ChatMessage = {
      id: `msg-${Date.now()}-ai`,
      role: 'assistant',
      content: imageMarkdown,
      timestamp: Date.now(),
      mode: modeToUse,
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              updatedAt: Date.now(),
              messages: [...s.messages, aiMsg],
            }
          : s
      )
    );

    setSessionQueriesCount((c) => c + 1);

    // Update Live Analytics Dashboard counter
    const updatedTel = recordTelemetryEvent((prev) => ({
      ...prev,
      totalImagesCreated: prev.totalImagesCreated + 1,
      totalQueriesProcessed: prev.totalQueriesProcessed + 1,
      activityLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          text: `Flux AI Image generated: ${enhancedPrompt.slice(0, 35)}...`,
        },
        ...prev.activityLogs,
      ],
    }));
    setTelemetry(updatedTel);

    setIsThinking(false);
    setThinkingNote('');
    setReactionTrigger({ text: 'image ' + enhancedPrompt, id: Date.now() });
  };

  const handleEditUploadedImagePrompt = async (
    promptText: string,
    attachedImage: AttachmentData,
    modeToUse: SmartMode = smartMode
  ) => {
    const nowMs = Date.now();
    const recentClick = imgTimestampsRef.current[imgTimestampsRef.current.length - 1] || 0;
    if (nowMs - recentClick < 800) {
      return;
    }
    imgTimestampsRef.current = [...imgTimestampsRef.current.slice(-10), nowMs];

    stopSpeech();
    setInputNotice('');
    setIsThinking(true);
    setThinkingNote('✨ Analyzing photo & crafting AI edit...');

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: promptText.trim(),
      timestamp: Date.now(),
      mode: modeToUse,
      attachment: {
        name: attachedImage.name,
        mimeType: attachedImage.mimeType,
        previewUrl: attachedImage.previewUrl,
      },
    };

    setReactionTrigger({ text: userMsg.content, id: Date.now() });

    let targetSessionId = activeSessionId;
    if (!targetSessionId || !sessions.some((s) => s.id === targetSessionId)) {
      targetSessionId = `sess-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetSessionId,
        title: deriveSessionTitle(`Edit: ${promptText}`),
        mode: modeToUse,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMsg],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(targetSessionId);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, userMsg],
              }
            : s
        )
      );
    }

    try {
      const synthesizedPrompt = await synthesizeImageEditPrompt(
        promptText,
        attachedImage.base64Data || '',
        attachedImage.mimeType || 'image/jpeg'
      );
      const seed = Math.floor(Math.random() * 1_000_000_000);
      const editedImageUrl = getPollinationsFluxUrl(synthesizedPrompt, seed);

      const editedMarkdown = `✨ **Edited HD Image:** ${synthesizedPrompt}\n\n![${synthesizedPrompt}](${editedImageUrl})\n\n[⬇️ Download Edited Image](${editedImageUrl})`;

      const aiMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: editedMarkdown,
        timestamp: Date.now(),
        mode: modeToUse,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, aiMsg],
              }
            : s
        )
      );

      setSessionQueriesCount((c) => c + 1);
      const updatedTel = recordTelemetryEvent((prev) => ({
        ...prev,
        totalImagesCreated: prev.totalImagesCreated + 1,
        totalQueriesProcessed: prev.totalQueriesProcessed + 1,
        activityLogs: [
          {
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            text: `AI Image Edit generated: ${synthesizedPrompt.slice(0, 35)}...`,
          },
          ...prev.activityLogs,
        ],
      }));
      setTelemetry(updatedTel);
      setReactionTrigger({ text: 'image ' + synthesizedPrompt, id: Date.now() });
    } finally {
      setIsThinking(false);
      setThinkingNote('');
    }
  };

  const handleRegenerate = async (assistantMessageId: string) => {
    if (!activeSession || isThinking) return;
    const idx = activeSession.messages.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;

    const precedingMessages = activeSession.messages.slice(0, idx);
    const lastUser = [...precedingMessages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;

    const historyBeforeLastUser = precedingMessages.slice(
      0,
      precedingMessages.findIndex((m) => m.id === lastUser.id)
    );

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, messages: precedingMessages }
          : s
      )
    );

    await dispatchChatRequest(
      activeSession.id,
      lastUser.content,
      historyBeforeLastUser,
      lastUser.mode,
      null
    );
  };

  const handleStartQuiz = () => {
    setSmartMode('study');
    setInputNotice('🎯 Starting 5-Question Interactive Quiz...');

    const lastUserMsg = activeSession
      ? [...activeSession.messages].reverse().find((m) => m.role === 'user')?.content || ''
      : '';
    const topic = lastUserMsg.length > 3 ? lastUserMsg.slice(0, 30) : 'General Science & Mathematics';

    const quizItems = generateStudyQuiz(topic, langMode);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: '🎯 Start 5-Q Quiz',
      timestamp: Date.now(),
      mode: 'study',
    };

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content: `🎯 **AURELION AI Interactive Study Quiz**\nTopic: *${topic}*\nTest your understanding with this interactive 5-question quiz below. Your answers will instantly update your 3D Study Graph mastery percentage!`,
      timestamp: Date.now() + 1,
      mode: 'study',
      quizData: quizItems,
    };

    if (!activeSession) {
      const newSessionId = `sess-${Date.now()}`;
      const newSess: ChatSession = {
        id: newSessionId,
        title: `🎯 ${topic}`,
        mode: 'study',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMsg, assistantMsg],
      };
      setSessions((prev) => [newSess, ...prev]);
      setActiveSessionId(newSessionId);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, userMsg, assistantMsg],
              }
            : s
        )
      );
    }

    (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(
      `Quiz Started: ${topic}`
    );
  };

  const handleStopQuestionGames = (appendSummaryMsg: boolean = true) => {
    questionGameRequestIdRef.current += 1;
    if (questionGameTimerRef.current) {
      window.clearTimeout(questionGameTimerRef.current);
      questionGameTimerRef.current = null;
    }
    const prevSessionId = questionGameRef.current.sessionId || activeSessionId;
    const prevTopic = questionGameRef.current.topic;
    const stoppedState = {
      active: false,
      phase: 'awaiting_topic' as const,
      topic: '',
      questionNumber: 0,
      askedQuestions: [],
      sessionId: null,
    };
    questionGameRef.current = stoppedState;
    setQuestionGameState(stoppedState);
    setInputNotice('');

    if (appendSummaryMsg && prevSessionId) {
      const endMsg: ChatMessage = {
        id: `msg-${Date.now()}-game-stop`,
        role: 'assistant',
        content: prevTopic
          ? `🎮 **Question Games Stopped** (*${prevTopic}*).\nAsk any question normally, or tap **Question Games** anytime to start a new topic!`
          : `🎮 **Question Games Stopped.**\nAsk any question normally, or tap **Question Games** anytime to play!`,
        timestamp: Date.now(),
        mode: smartMode,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === prevSessionId
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, endMsg] }
            : s
        )
      );
    }
  };

  const handleStartQuestionGames = () => {
    stopSpeech();
    questionGameRequestIdRef.current += 1;
    if (questionGameTimerRef.current) {
      window.clearTimeout(questionGameTimerRef.current);
      questionGameTimerRef.current = null;
    }
    setPlusMenuOpen(false);
    setActiveTool(null);

    const activeLang = detectEffectiveLanguage('', langMode);
    const promptMsg = getQuestionGameTopicPrompt(langMode === 'auto' ? activeLang : langMode);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-qgame-start-user`,
      role: 'user',
      content: '🎮 Question Games',
      timestamp: Date.now(),
      mode: smartMode,
    };

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now() + 1}-qgame-ask-topic`,
      role: 'assistant',
      content: promptMsg,
      timestamp: Date.now() + 1,
      mode: smartMode,
    };

    let targetSessionId = activeSessionId;
    if (!targetSessionId || !sessions.some((s) => s.id === targetSessionId)) {
      targetSessionId = `sess-${Date.now()}`;
      const newSess: ChatSession = {
        id: targetSessionId,
        title: '🎮 Question Games',
        mode: smartMode,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMsg, assistantMsg],
      };
      setSessions((prev) => [newSess, ...prev]);
      setActiveSessionId(targetSessionId);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, userMsg, assistantMsg],
              }
            : s
        )
      );
    }

    const startState = {
      active: true,
      phase: 'awaiting_topic' as const,
      topic: '',
      questionNumber: 0,
      askedQuestions: [],
      sessionId: targetSessionId,
    };
    questionGameRef.current = startState;
    setQuestionGameState(startState);
    setInputNotice('🎮 Question Games active — type any topic name to start!');
  };

  const requestNextQuestionGameQuestion = async (
    targetSessionId: string,
    topic: string,
    qNumber: number,
    askedQuestions: string[],
    historyMsgs: ChatMessage[],
    modeToUse: SmartMode
  ) => {
    if (!questionGameRef.current.active && qNumber > 1) return;
    const reqId = ++questionGameRequestIdRef.current;
    setIsThinking(true);
    setThinkingNote(`🎮 Generating Question #${qNumber} • ${topic}...`);

    try {
      const effectiveLang = detectEffectiveLanguage(topic, langMode);
      const variationSeed = Math.floor(Math.random() * 1_000_000_000);
      const baseSys = buildSystemInstruction(
        settings,
        modeToUse,
        false,
        effectiveLang,
        topic,
        sessions,
        targetSessionId
      );
      const turnDirective = buildQuestionGameTurnInstruction(
        topic,
        qNumber,
        effectiveLang,
        askedQuestions,
        variationSeed
      );
      const systemInstruction = `${baseSys}\n\n${turnDirective}`;

      let gameData: QuestionGameData | null = null;

      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 14000);
        const res = await fetch('/api/question-game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            topic,
            questionNumber: qNumber,
            systemInstruction,
            askedQuestions,
            language: effectiveLang,
            variationSeed,
          }),
        });
        window.clearTimeout(timeoutId);
        if (res.ok) {
          const data = (await res.json()) as { text?: string };
          if (data.text) {
            const parsed = extractQuestionGameBlock(data.text, topic, qNumber, effectiveLang);
            if (parsed.gameData && !isDuplicateQuestion(parsed.gameData.question, askedQuestions)) {
              gameData = parsed.gameData;
            }
          }
        }
      } catch {
        // Fall through to live client/public AI retry below
      }

      // If /api/question-game failed or produced a repeat, retry via live AI (Gemini / /api/chat / Pollinations) with fresh seed
      if (!gameData && reqId === questionGameRequestIdRef.current && questionGameRef.current.active) {
        const retrySeed = Math.floor(Math.random() * 1_000_000_000);
        const retryDirective = buildQuestionGameTurnInstruction(
          topic,
          qNumber,
          effectiveLang,
          askedQuestions,
          retrySeed
        );
        const retrySys = `${baseSys}\n\n${retryDirective}`;
        const retryPrompt = `Generate a brand-new, non-repetitive Question #${qNumber} strictly about "${topic}" in ${effectiveLang} (Seed ${retrySeed}) inside [QUESTION_GAME]...[/QUESTION_GAME] tags.`;

        try {
          const aiRaw = await fetchAuraReply(retryPrompt, {
            history: historyMsgs.slice(-4).map((m) => ({
              role: m.role,
              content: m.content,
            })),
            systemInstruction: retrySys,
            enableWebSearch: false,
          });
          const parsedRetry = extractQuestionGameBlock(aiRaw, topic, qNumber, effectiveLang);
          if (parsedRetry.gameData) {
            gameData = parsedRetry.gameData;
          }
        } catch {
          // Live AI unreachable
        }
      }

      if (
        reqId !== questionGameRequestIdRef.current ||
        !questionGameRef.current.active ||
        questionGameRef.current.topic !== topic
      ) {
        return;
      }

      if (!gameData) {
        const errMsg: ChatMessage = {
          id: `msg-${Date.now()}-qgame-err-${qNumber}`,
          role: 'assistant',
          content: `⚠️ Could not reach the live AI quiz generator for **${topic}** right now. Please check your connection and send **${topic}** (or any new topic) to retry!`,
          timestamp: Date.now(),
          mode: modeToUse,
          error: true,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId
              ? { ...s, updatedAt: Date.now(), messages: [...s.messages, errMsg] }
              : s
          )
        );
        return;
      }

      const resolvedTopic = gameData.topic || topic;
      const aiGameMsg: ChatMessage = {
        id: `msg-${Date.now()}-qgame-${qNumber}`,
        role: 'assistant',
        content: `🎮 **Question #${gameData.questionNumber}** • *${resolvedTopic}*`,
        timestamp: Date.now(),
        mode: modeToUse,
        questionGame: gameData,
        gameLanguage: effectiveLang,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, aiGameMsg],
              }
            : s
        )
      );

      const updatedState = {
        active: true,
        phase: 'playing' as const,
        topic,
        questionNumber: qNumber,
        askedQuestions: Array.from(new Set([...askedQuestions, gameData.question])),
        sessionId: targetSessionId,
      };
      questionGameRef.current = updatedState;
      setQuestionGameState(updatedState);
      setReactionTrigger({ text: `Question Games: ${resolvedTopic}`, id: Date.now() });
    } finally {
      setIsThinking(false);
      setThinkingNote('');
    }
  };

  const handleAnswerQuestionGame = (
    messageId: string,
    selectedIndex: number,
    gameData: QuestionGameData
  ) => {
    const isCorrect = selectedIndex === gameData.correctIndex;
    const currentSessId = questionGameRef.current.sessionId || activeSessionId;

    // 1. Lock chosen option inside session state cleanly
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, gameSelectedIndex: selectedIndex } : m
        ),
      }))
    );

    // 2. Boost 3D Study Graph
    (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(
      isCorrect
        ? `Quiz Correct: ${gameData.topic} • Mastery Boost`
        : `Quiz Answered: ${gameData.topic}`
    );

    // 3. After a 1.2s pause to read feedback, automatically trigger the next question on the same topic
    if (questionGameTimerRef.current) {
      window.clearTimeout(questionGameTimerRef.current);
    }

    if (questionGameRef.current.active && currentSessId) {
      const nextQNum = (gameData.questionNumber || questionGameRef.current.questionNumber || 1) + 1;
      const topicToPlay = questionGameRef.current.topic || gameData.topic;
      const askedSoFar = Array.from(
        new Set([...questionGameRef.current.askedQuestions, gameData.question])
      );

      questionGameTimerRef.current = window.setTimeout(() => {
        questionGameTimerRef.current = null;
        if (
          !questionGameRef.current.active ||
          questionGameRef.current.topic !== topicToPlay
        ) {
          return;
        }
        const sessObj = sessions.find((s) => s.id === currentSessId);
        requestNextQuestionGameQuestion(
          currentSessId,
          topicToPlay,
          nextQNum,
          askedSoFar,
          sessObj?.messages || [],
          smartMode
        );
      }, 1200);
    }
  };

  if (screen === 'splash') {
    return <SplashScreen />;
  }

  if (screen === 'analytics') {
    return (
      <AnalyticsDashboard
        telemetry={telemetry}
        sessions={sessions}
        onBack={() => setScreen('app')}
        authUser={authUser}
        managedUsers={managedUsers}
      />
    );
  }

  if (screen === 'auth' || !authUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (screen === 'admin') {
    return (
      <AdminPanel
        config={adminConfig}
        users={managedUsers}
        sessions={sessions}
        telemetry={telemetry}
        onUpdateConfig={setAdminConfig}
        onUpdateUsers={setManagedUsers}
        onResetTelemetry={() => {
          const resetVal: TelemetryData = {
            totalRegisteredUsers: 0,
            activeSessionsCount: authUser ? 1 : 0,
            totalQueriesProcessed: 0,
            totalImagesCreated: 0,
            activityLogs: [
              {
                id: `log-${Date.now()}`,
                timestamp: Date.now(),
                text: 'Boss Admin reset all telemetry stats to 0',
              },
            ],
          };
          setTelemetry(resetVal);
          saveTelemetry(resetVal);
        }}
        onBackToApp={() => setScreen('app')}
      />
    );
  }

  const isBoss = authUser.role === 'admin';
  const showMaintenanceLock = adminConfig.maintenanceMode && !isBoss;

  return (
    <div
      data-testid="app-container"
      className="flex h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[#060911] text-[#F1F5F9]"
      onClick={() => {
        setPlusMenuOpen(false);
        setPersonaMenuOpen(false);
      }}
    >
      <Sidebar
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => {
          stopSpeech();
          questionGameRequestIdRef.current += 1;
          if (questionGameTimerRef.current) {
            window.clearTimeout(questionGameTimerRef.current);
            questionGameTimerRef.current = null;
          }
          if (questionGameRef.current.active && questionGameRef.current.sessionId !== id) {
            const stopped = {
              active: false,
              phase: 'awaiting_topic' as const,
              topic: '',
              questionNumber: 0,
              askedQuestions: [],
              sessionId: null,
            };
            questionGameRef.current = stopped;
            setQuestionGameState(stopped);
          }
          setActiveSessionId(id);
        }}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
        onExportChat={handleExportChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdmin={() => setScreen('admin')}
        onOpenAnalytics={() => setScreen('analytics')}
        onLogout={handleLogout}
        isAdmin={isBoss}
        authUser={authUser}
        userDisplayName={settings.displayName}
        dailyGoal={dailyGoal}
        onUpdateDailyGoal={(nextGoal) => {
          setDailyGoal(nextGoal);
          saveDailyGoal(nextGoal, authUser);
        }}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {adminConfig.announcementBanner && (
          <div
            role="status"
            data-testid="announcement-banner"
            className="border-b border-[#00F0FF]/40 bg-gradient-to-r from-[#8B5CF6]/20 via-[#00F0FF]/15 to-[#8B5CF6]/20 px-3 py-1 text-center text-[11px] font-medium text-[#F1F5F9]"
          >
            {adminConfig.announcementBanner}
          </div>
        )}

        {liveAdminToast && (
          <div
            role="alert"
            data-testid="live-admin-toast"
            className="flex items-center justify-between gap-2 border-b border-emerald-400/40 bg-gradient-to-r from-emerald-500/20 via-[#00F0FF]/20 to-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-100 shadow-sm"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 animate-ping" />
              <span className="truncate">📢 Live Alert: {liveAdminToast}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setLiveAdminToast('');
                try {
                  localStorage.removeItem('aurelion_live_alert');
                  localStorage.removeItem('aura_banner');
                } catch {
                  // ignore
                }
              }}
              aria-label="Dismiss live alert"
              className="rounded px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        )}

        {/* Compact Top HUD Header */}
        <header className="relative z-40 flex h-10 shrink-0 items-center justify-between gap-1.5 border-b border-white/10 bg-[#060911]/95 px-2.5 sm:h-11 sm:gap-3 sm:px-4">
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle sidebar"
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#CBD5E1] transition-colors hover:text-white"
            >
              <Menu className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>

            {/* Compact Persona Selector Pill */}
            <div
              className="relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                data-testid="persona-dropdown-trigger"
                aria-expanded={personaMenuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setPlusMenuOpen(false);
                  setPersonaMenuOpen((prev) => !prev);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-[#00F0FF]/30 bg-[#131A2B] px-2 py-1 text-[11px] font-medium text-white shadow-sm transition-colors hover:border-[#00F0FF]/60 sm:px-2.5 sm:text-xs"
              >
                <span className="whitespace-nowrap">
                  {smartMode === 'coding'
                    ? 'AURELION AI • Coding'
                    : smartMode === 'study'
                      ? 'AURELION AI • Study'
                      : smartMode === 'live'
                        ? 'AURELION AI • Live'
                        : 'AURELION AI • Pro'}
                </span>
                <span className="hidden xs:inline-block rounded bg-gradient-to-r from-[#00F0FF]/20 to-[#8B5CF6]/25 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[#00F0FF]">
                  {smartMode === 'coding'
                    ? 'Möbius 3D'
                    : smartMode === 'study'
                      ? 'Graph 3D'
                      : smartMode === 'live'
                        ? 'Live Wave'
                        : 'Orbital 3D'}
                </span>
                <ChevronDown
                  className={`h-3 w-3 text-[#94A3B8] transition-transform ${
                    personaMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {personaMenuOpen && (
                <div
                  role="menu"
                  data-testid="persona-dropdown-menu"
                  className="absolute top-9 left-0 z-50 w-64 space-y-1 rounded-xl border border-[#00F0FF]/35 bg-[#0E1422] p-1.5 shadow-2xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSmartMode('live');
                      setPersonaMenuOpen(false);
                    }}
                    className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      smartMode === 'live'
                        ? 'border-[#EC4899]/50 bg-[#EC4899]/15 text-white'
                        : 'border-transparent text-[#E2E8F0] hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[#EC4899]">💬</span>
                        <span>Live Chat</span>
                      </span>
                      <span className="font-mono text-[9.5px] text-[#EC4899]">Live Wave</span>
                    </div>
                    <p className="text-[10px] text-[#94A3B8]">
                      Natural real-time conversation &amp; vocal heartbeat wave
                    </p>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSmartMode('general');
                      setPersonaMenuOpen(false);
                    }}
                    className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      smartMode === 'general'
                        ? 'border-[#00F0FF]/40 bg-[#00F0FF]/12 text-white'
                        : 'border-transparent text-[#E2E8F0] hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-[#00F0FF]" />
                        <span>✨ Friendly &amp; Pro</span>
                      </span>
                      <span className="font-mono text-[9.5px] text-[#00F0FF]">Orbital 3D</span>
                    </div>
                    <p className="text-[10px] text-[#94A3B8]">
                      3D Orbital Neural Core + Live Web Grounding
                    </p>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSmartMode('coding');
                      setPersonaMenuOpen(false);
                    }}
                    className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      smartMode === 'coding'
                        ? 'border-[#8B5CF6]/50 bg-[#8B5CF6]/15 text-white'
                        : 'border-transparent text-[#E2E8F0] hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Code2 className="h-3 w-3 text-[#C4B5FD]" />
                        <span>💻 Coding &amp; Tech</span>
                      </span>
                      <span className="font-mono text-[9.5px] text-[#C4B5FD]">Möbius 3D</span>
                    </div>
                    <p className="text-[10px] text-[#94A3B8]">
                      Stark Endgame Möbius Strip + Code Sandbox
                    </p>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSmartMode('study');
                      setPersonaMenuOpen(false);
                    }}
                    className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      smartMode === 'study'
                        ? 'border-[#00F0FF]/40 bg-[#00F0FF]/12 text-white'
                        : 'border-transparent text-[#E2E8F0] hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <BookOpen className="h-3 w-3 text-emerald-400" />
                        <span>📚 Study &amp; Notes</span>
                      </span>
                      <span className="font-mono text-[9.5px] text-emerald-400">Graph 3D</span>
                    </div>
                    <p className="text-[10px] text-[#94A3B8]">
                      Animated 3D Holographic Study &amp; Analytics Graph
                    </p>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              id="aura-mute-btn"
              onClick={() => {
                setVoiceMuted((prev) => {
                  const next = !prev;
                  if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    setSpeakingMessageId(null);
                  }
                  return next;
                });
              }}
              title="Mute / Unmute Voice"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#00F0FF]/25 bg-white/5 text-xs text-[#00F0FF]"
            >
              {voiceMuted ? '🔇' : '🔊'}
            </button>

            <select
              id="quick-lang-select"
              data-testid="quick-lang-select"
              value={langMode}
              onChange={(e) => setLangMode(e.target.value)}
              aria-label="Language mode"
              className="h-7 rounded-lg border border-[#00F0FF]/30 bg-[#131A2B] px-1.5 text-[11px] text-[#00F0FF] outline-none cursor-pointer"
            >
              <option value="auto">🌐 Auto</option>
              <option value="Hindi">🇮🇳 हिंदी</option>
              <option value="Marathi">🇮🇳 मराठी</option>
              <option value="Hinglish">💬 Hinglish</option>
              <option value="English">🔤 EN</option>
            </select>

            <span
              id="chat-save-badge"
              data-testid="chat-save-badge"
              className="hidden sm:inline-block font-mono text-[10px]"
              style={{ color: saveBadgeColor }}
            >
              {saveBadgeText}
            </span>

            <span
              data-testid="header-account-badge"
              title={authUser?.email || authUser?.identifier || 'Guest'}
              className="hidden md:inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#131A2B] px-2 py-1 text-[10.5px] font-medium text-[#CBD5E1]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="max-w-[110px] truncate">
                {authUser?.role === 'guest' ||
                authUser?.provider === 'guest' ||
                authUser?.identifier === 'guest@aurelion.ai' ||
                authUser?.identifier === 'guest@aura.ai'
                  ? 'Guest'
                  : authUser?.name || settings.displayName || authUser?.identifier}
              </span>
            </span>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#CBD5E1] transition-colors hover:border-[#00F0FF]/40 hover:text-[#00F0FF]"
            >
              <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </header>

        {/* Top-Right Square Minimap 3D Hologram HUD Box */}
        <HologramStage
          mode={hologramMode}
          aiState={aiState}
          statusNote={thinkingNote}
          reactionTrigger={reactionTrigger}
        />

        {/* Right HUD Action Column Directly Beneath Top-Right 3D Box (8-10px gap, zero left overlap) */}
        {!showMaintenanceLock && (
          <aside
            aria-label="Question Games & Quick Actions"
            data-testid="right-hud-actions"
            className="fixed top-[166px] right-2.5 z-30 flex w-[112px] max-h-[calc(100dvh-250px)] flex-col gap-1.5 overflow-y-auto scrollbar-none pb-1 sm:top-[198px] sm:right-4 sm:w-[140px]"
          >
            <button
              type="button"
              data-testid="question-games-btn"
              onClick={handleStartQuestionGames}
              className={`flex w-full shrink-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[9.5px] sm:text-[10.5px] font-bold leading-tight tracking-tight transition-all active:scale-95 cursor-pointer ${
                questionGameState.active
                  ? 'border-[#00F0FF] bg-gradient-to-r from-[#00F0FF]/35 via-[#8B5CF6]/40 to-[#00F0FF]/30 text-white shadow-[0_0_18px_rgba(0,240,255,0.45)]'
                  : 'border-[#00F0FF]/65 bg-gradient-to-r from-[#00F0FF]/20 via-[#8B5CF6]/25 to-[#00F0FF]/15 text-white shadow-[0_0_14px_rgba(0,240,255,0.28)] hover:border-[#00F0FF] hover:from-[#00F0FF]/30 hover:to-[#8B5CF6]/35'
              }`}
            >
              <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-[#00F0FF]" />
              <span className="text-center leading-tight">Question Games</span>
              {questionGameState.active && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>

            <div
              aria-label="Quick Prompt Suggestions"
              data-testid="right-hud-quick-bar"
              className="flex w-full flex-col gap-1"
            >
              <button
                type="button"
                data-testid="quick-start-quiz-btn"
                onClick={() => {
                  if (questionGameRef.current.active) {
                    handleStopQuestionGames(false);
                  }
                  handleStartQuiz();
                }}
                className="flex w-full items-center gap-1 rounded-lg border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-1.5 text-left text-[9.5px] sm:text-[10.5px] font-semibold leading-tight text-emerald-300 transition-all hover:bg-emerald-500/25 hover:text-white shadow-sm cursor-pointer"
                title="Start 5-Q Quiz"
              >
                <span className="leading-tight break-words">🎯 Start 5-Q Quiz</span>
              </button>

              {(smartMode === 'coding'
                ? getQuickPrompts('coding').slice(0, 3)
                : getQuickPrompts('study').slice(0, 2)
              ).map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    if (questionGameRef.current.active) {
                      handleStopQuestionGames(false);
                    }
                    setInputText(chip.prompt);
                  }}
                  className="flex w-full items-center rounded-lg border border-[#00F0FF]/30 bg-[#0D1424]/95 px-1.5 py-1.5 text-left text-[9.5px] sm:text-[10.5px] font-medium leading-tight text-[#00F0FF] transition-all hover:border-[#00F0FF]/65 hover:bg-[#00F0FF]/15 hover:text-white shadow-sm cursor-pointer"
                  title={chip.prompt}
                >
                  <span className="leading-tight break-words">{chip.label}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {showMaintenanceLock ? (
          <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
            <div className="max-w-md rounded-2xl border border-amber-500/30 bg-[#131A2B] p-5">
              <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-amber-400" />
              <h2 className="font-display text-base font-semibold text-white">
                System Under Maintenance
              </h2>
              <p className="mt-1.5 text-xs text-[#94A3B8]">
                AURELION AI is undergoing scheduled neural core calibration by the administrator. Please check back shortly.
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 rounded-xl border border-white/15 px-3.5 py-1.5 text-xs font-medium text-[#F1F5F9] hover:bg-white/5"
              >
                Switch Account
              </button>
            </div>
          </main>
        ) : (
          <>
            {/* Top-Left Chat Flow with Right Clearance for the 3D Minimap Box + Quick Column */}
            <main
              aria-label="Conversation messages"
              data-testid="chat-feed"
              className="flex-1 overflow-y-auto px-2.5 pt-2 pb-2.5 sm:px-5 sm:pt-3"
            >
              {!activeSession || activeSession.messages.length === 0 ? (
                <div className="flex flex-col items-start justify-start pt-0.5 pr-[124px] sm:pr-[160px] text-left">
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-[#00F0FF]/25 bg-[#00F0FF]/10 px-2 py-0.5 font-mono text-[10px] text-[#00F0FF] mb-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#00F0FF] animate-pulse" />
                    <span>HUD READY • TOP-LEFT FEED</span>
                  </div>
                  <h2 className="font-display text-sm sm:text-base font-semibold leading-snug text-[#F1F5F9]">
                    Hello, {sanitizeUserHTML(settings.displayName)}. How can I assist you today?
                  </h2>
                  <p className="mt-1 max-w-md text-[11px] sm:text-xs leading-relaxed text-[#94A3B8]">
                    Ask about live world news, build and preview code in real time, or break down complex study topics.
                  </p>

                  <div className="mt-3 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-3">
                    {STARTER_PROMPTS.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => handleSendMessage(item.prompt, item.mode)}
                        className="flex flex-col items-start rounded-xl border border-white/10 bg-[#131A2B]/85 p-2.5 text-left transition-colors hover:border-[#00F0FF]/40 hover:bg-[#1a233a]"
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-[#00F0FF]">
                          {item.icon === 'globe' ? (
                            <Globe className="h-3.5 w-3.5" />
                          ) : item.icon === 'code' ? (
                            <Code2 className="h-3.5 w-3.5 text-[#C4B5FD]" />
                          ) : (
                            <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
                          )}
                          <span className="font-display text-xs font-semibold text-[#F1F5F9]">
                            {item.title}
                          </span>
                        </div>
                        <span className="line-clamp-2 text-[11px] leading-snug text-[#94A3B8]">
                          {item.prompt}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 pr-[124px] sm:pr-[160px]">
                  {(() => {
                    const lastGameMsgId = [...activeSession.messages]
                      .reverse()
                      .find((m) => Boolean(m.questionGame))?.id;
                    return activeSession.messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isSpeakingThis={speakingMessageId === msg.id}
                        onSpeakToggle={handleSpeakToggle}
                        onRegenerate={
                          msg.role === 'assistant' ? handleRegenerate : undefined
                        }
                        onRunCode={(language, code) =>
                          setPreviewTarget({ language, code })
                        }
                        onAnswerQuestionGame={handleAnswerQuestionGame}
                        onStopQuestionGame={() => handleStopQuestionGames(true)}
                        isLatestQuestionGameCard={
                          questionGameState.active && msg.id === lastGameMsgId
                        }
                      />
                    ));
                  })()}

                  {isThinking && (
                    <div
                      role="status"
                      className="flex items-center gap-2 self-start rounded-xl border border-[#00F0FF]/25 bg-[#131A2B]/85 px-3 py-2 text-[11px] text-[#00F0FF]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#00F0FF] animate-ping" />
                      <span className="font-mono">{thinkingNote || 'Thinking...'}</span>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              )}
            </main>

            {/* Compact Bottom Input Bar */}
            <footer className="relative z-30 shrink-0 border-t border-white/10 bg-[#060911]/95 px-2.5 py-1.5 sm:px-4 sm:py-2">
              <div className="mx-auto max-w-4xl relative">
                {inputNotice && (
                  <p role="alert" className="mb-1 text-[11px] text-amber-300">
                    {inputNotice}
                  </p>
                )}

                {/* Glowing Active Tool Banner confirming what was selected */}
                {activeTool && (
                  <div
                    id="active-mode-banner"
                    className="flex items-center justify-between mb-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#00F0FF]/20 to-[#8B5CF6]/25 border border-[#00F0FF] text-[11px] font-semibold text-white shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#00F0FF] animate-ping" />
                      <span className="truncate">Active: <strong>{activeTool.label}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTool(null)}
                      className="ml-2 shrink-0 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-[#00F0FF] border border-white/20 hover:bg-black/60"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {attachment && (
                  <div className="mb-1.5 inline-flex items-center gap-2 rounded-lg border border-[#00F0FF]/30 bg-[#131A2B] px-2.5 py-1 text-[11px] text-[#E2E8F0]">
                    {attachment.previewUrl && (
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="h-5 w-5 rounded object-cover"
                      />
                    )}
                    <span className="font-mono max-w-[180px] truncate">
                      {attachment.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      aria-label="Remove attachment"
                      className="text-[#94A3B8] hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Glowing Glass Action Sheet for "+" Button */}
                {plusMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    id="plus-menu-popup"
                    className="absolute bottom-13 left-0 z-40 w-72 space-y-1 rounded-xl border border-[#00F0FF]/40 bg-[#0E1422] p-2 shadow-2xl"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'image',
                          label: 'Create AI Image (Free • Pollinations AI)',
                          placeholder: 'Describe your AI image prompt...',
                        });
                        setInputNotice('AI Image Generator active. Enter your prompt and press Send.');
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11px] font-medium text-left transition-all ${
                        activeTool?.id === 'image'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-pink-500/20 text-pink-400 font-bold shrink-0">🎨</div>
                      <div>
                        <p className="font-semibold">Create AI Image (Free • No Login)</p>
                        <p className="text-[10px] text-[#94A3B8]">Instant image generation inside chat</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'search',
                          label: 'Background Live Web Search (Google Grounding)',
                          placeholder: 'Ask about live news, scores, weather...',
                        });
                        setAdminConfig((prev) => ({ ...prev, liveWebSearchEnabled: true }));
                        setInputNotice('Background Live Web Search active with Google Grounding.');
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11px] font-medium text-left transition-all ${
                        activeTool?.id === 'search'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#00F0FF]/20 text-[#00F0FF] font-bold shrink-0">🌐</div>
                      <div>
                        <p className="font-semibold">Background Live Web Search</p>
                        <p className="text-[10px] text-[#94A3B8]">Ground replies with real-time web</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'upload',
                          label: 'Upload Photo / File / Document',
                          placeholder: 'Upload image or document to analyze...',
                        });
                        fileInputRef.current?.click();
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11px] font-medium text-left transition-all ${
                        activeTool?.id === 'upload'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/20 text-violet-400 font-bold shrink-0">🖼️</div>
                      <div>
                        <p className="font-semibold">Upload Photo / File</p>
                        <p className="text-[10px] text-[#94A3B8]">Attach documents or screenshots</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'coding',
                          label: 'Coding & 3D Möbius Mode',
                          placeholder: 'Ask a coding or tech question...',
                        });
                        setSmartMode('coding');
                        setInputNotice('Coding & 3D Möbius Mode active.');
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11px] font-medium text-left transition-all ${
                        activeTool?.id === 'coding' || smartMode === 'coding'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/20 text-amber-400 font-bold shrink-0">💻</div>
                      <div>
                        <p className="font-semibold">Coding &amp; 3D Möbius Mode</p>
                        <p className="text-[10px] text-[#94A3B8]">Activate Stark wireframe &amp; sandbox</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setActiveTool({
                          id: 'study',
                          label: 'Study & 3D Book Mode',
                          placeholder: 'Ask a study or concept breakdown question...',
                        });
                        setSmartMode('study');
                        setInputNotice('Study & 3D Book Mode active.');
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11px] font-medium text-left transition-all ${
                        activeTool?.id === 'study' || smartMode === 'study'
                          ? 'bg-gradient-to-r from-[#00F0FF]/25 to-[#8B5CF6]/30 border border-[#00F0FF] text-white shadow'
                          : 'bg-white/[0.03] text-[#F1F5F9] hover:bg-[#00F0FF]/15 hover:text-[#00F0FF]'
                      }`}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400 font-bold shrink-0">📚</div>
                      <div>
                        <p className="font-semibold">Study &amp; Exam Helper</p>
                        <p className="text-[10px] text-[#94A3B8]">Activate 3D Study Graph mode</p>
                      </div>
                    </button>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#131A2B] p-1 focus-within:border-[#00F0FF]/50"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.txt,.md,.js,.ts,.tsx,.jsx,.py,.html,.css,.json,.csv,.pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPersonaMenuOpen(false);
                      setPlusMenuOpen((prev) => !prev);
                    }}
                    aria-label="Open action menu"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#00F0FF]/40 bg-[#00F0FF]/15 text-[#00F0FF] transition-all hover:bg-[#00F0FF]/25 ${
                      plusMenuOpen ? 'rotate-45 bg-[#00F0FF] text-[#060911]' : ''
                    }`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <input
                    type="text"
                    aria-label="Message AURELION AI"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      activeTool?.placeholder ||
                      (langMode === 'Hindi'
                        ? 'बॉस, यहाँ हिंदी में लिखें या बोलें...'
                        : smartMode === 'coding'
                          ? 'Ask Coding & Tech Expert...'
                          : smartMode === 'study'
                            ? 'Ask Study & Exam Helper...'
                            : 'Ask AURELION AI anything...')
                    }
                    className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-base text-[#F1F5F9] placeholder-[#64748B] outline-none"
                  />

                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isRecording
                        ? 'bg-red-500/20 text-red-400'
                        : 'text-[#94A3B8] hover:bg-white/5 hover:text-[#00F0FF]'
                    }`}
                  >
                    {isRecording ? (
                      <MicOff className="h-3.5 w-3.5" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="submit"
                    disabled={isThinking || (!inputText.trim() && !attachment)}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-2.5 sm:px-3 text-xs font-semibold text-[#05070B] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Send className="h-3 w-3" />
                    <span>Send</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (liveCallActive) {
                        stopLiveCall();
                      } else {
                        startServerLiveCall();
                      }
                    }}
                    aria-label={liveCallActive ? 'End Live Call' : 'Start Live Call'}
                    title={liveCallActive ? 'End Gemini Live Call' : 'Start Gemini Live Call'}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                      liveCallActive
                        ? 'border border-red-500 bg-red-500/20 text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.7)] animate-pulse'
                        : 'border border-[#00F0FF]/50 bg-gradient-to-r from-[#00F0FF]/15 via-[#8B5CF6]/15 to-[#EC4899]/15 text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.25)] hover:scale-105'
                    }`}
                  >
                    <span className="flex items-center gap-0.5 font-mono text-[10px] font-bold tracking-tighter">
                      {liveCallActive ? (
                        <span className="text-red-400 font-bold">🔴</span>
                      ) : (
                        <span className="flex items-end gap-[1px] h-3">
                          <span className="w-[2px] bg-[#00F0FF] animate-bounce h-1.5" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-[2px] bg-[#8B5CF6] animate-bounce h-3" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-[2px] bg-[#EC4899] animate-bounce h-2" style={{ animationDelay: '300ms' }}></span>
                        </span>
                      )}
                    </span>
                  </button>
                </form>
              </div>
            </footer>
          </>
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={setSettings}
          onClearHistory={handleClearAllHistory}
          onLogout={handleLogout}
          onTestVoice={(profile, speed) =>
            speakText(
              `Hello ${settings.displayName}, AURELION AI neural voice ${profile} is calibrated at ${speed.toFixed(1)}x speed.`,
              'test-voice',
              profile,
              speed
            )
          }
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {previewTarget && (
        <CodePreviewModal
          language={previewTarget.language}
          code={previewTarget.code}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* Privacy Policy & Terms Modal (App Store Ready) */}
      <div
        id="aura-privacy-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const m = document.getElementById('aura-privacy-modal');
            if (m) m.style.display = 'none';
          }
        }}
        style={{
          display: 'none',
          position: 'fixed',
          inset: 0,
          background: 'rgba(2, 6, 15, 0.86)',
          backdropFilter: 'blur(8px)',
          zIndex: 4000,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <div
          style={{
            maxWidth: '400px',
            width: '100%',
            background: '#0c1322',
            border: '1px solid rgba(0,240,255,0.3)',
            borderRadius: '18px',
            padding: '20px',
            color: '#e2e8f0',
            fontSize: '12.5px',
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <strong style={{ color: '#00f0ff', fontSize: '15px' }}>📜 AURELION AI Privacy Policy &amp; Terms</strong>
            <button
              type="button"
              onClick={() => {
                const m = document.getElementById('aura-privacy-modal');
                if (m) m.style.display = 'none';
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
          <p>
            • <b>Data Storage:</b> Chat history and preferences are stored locally on your device (<code>localStorage</code>). We do not sell personal data.
          </p>
          <p style={{ marginTop: '6px' }}>
            • <b>AI &amp; Web Services:</b> Queries, web lookups, and image generation use secure third-party AI APIs (Google Gemini, Pollinations AI, DuckDuckGo).
          </p>
          <p style={{ marginTop: '6px' }}>
            • <b>User Control:</b> You can clear your chat history anytime from the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}
