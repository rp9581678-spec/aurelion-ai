import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOSS_ADMIN_EMAIL,
  BOSS_ADMIN_PIN,
  DEMO_OTP_CODE,
  buildPollinationsImageUrl,
  buildRunnableHtmlDocument,
  buildSystemInstruction,
  calculateAdminStats,
  cleanImageSubject,
  detectCodingIntent,
  extractCleanImagePrompt,
  extractGroundingSources,
  formatConversationMarkdown,
  getPollinationsFluxUrl,
  isBossAdminLogin,
  isImageGenerationRequest,
  parseMessageSegments,
  resolveHologramMode,
  validateLoginCredentials,
  verifyOtpCode,
  getQuickPrompts,
  cleanThoughtAndBrokenText,
  isBrokenOrIncompleteReply,
  formatGroundingSourcesAsMarkdown,
  fetchAuraReply,
} from './auraLogic';
import type { ChatSession, ManagedUser, UserSettings } from '../types/aura';

test('auth validation and boss admin detection', () => {
  assert.equal(validateLoginCredentials('', '').valid, false);
  assert.equal(validateLoginCredentials('invalid', '1234').valid, false);
  assert.equal(validateLoginCredentials('roshan@aura.ai', '12').valid, false);

  const regular = validateLoginCredentials('roshan@aura.ai', 'secret99');
  assert.equal(regular.valid, true);
  assert.equal(regular.isAdminAccess, false);

  const bossEmail = validateLoginCredentials(BOSS_ADMIN_EMAIL, 'pass123');
  assert.equal(bossEmail.valid, true);
  assert.equal(bossEmail.isAdminAccess, true);

  const bossPin = validateLoginCredentials('', BOSS_ADMIN_PIN);
  assert.equal(bossPin.valid, true);
  assert.equal(bossPin.isAdminAccess, true);

  assert.equal(isBossAdminLogin('BOSS@AURA.AI', 'anything'), true);
  assert.equal(isBossAdminLogin('boss@aurelion.ai', 'anything'), true);
  assert.equal(isBossAdminLogin('guest@aura.ai', '2026'), true);
  assert.equal(isBossAdminLogin('user@aura.ai', '1234'), false);
});

test('6-digit OTP verification', () => {
  assert.equal(verifyOtpCode(DEMO_OTP_CODE), true);
  assert.equal(verifyOtpCode('482 910'), true);
  assert.equal(verifyOtpCode('123456'), false);
  assert.equal(verifyOtpCode('48291'), false);
});

test('coding intent detection and hologram auto-switching', () => {
  assert.equal(detectCodingIntent('Write a Python function to reverse a list'), true);
  assert.equal(detectCodingIntent('Debug my React component state'), true);
  assert.equal(detectCodingIntent('What is the weather in Tokyo today?'), false);

  assert.equal(resolveHologramMode('auto', 'general', 'Hello AURA'), 'orbital');
  assert.equal(resolveHologramMode('auto', 'coding', 'Hello AURA'), 'mobius');
  assert.equal(resolveHologramMode('auto', 'study', 'Explain gravity'), 'book');
  assert.equal(resolveHologramMode('auto', 'live', 'Hello AURA'), 'livewave');
  assert.equal(
    resolveHologramMode('auto', 'general', 'Can you fix this TypeScript bug?'),
    'mobius'
  );
  assert.equal(resolveHologramMode('orbital', 'coding', 'Write HTML'), 'orbital');
  assert.equal(resolveHologramMode('mobius', 'general', 'Hi'), 'mobius');
  assert.equal(resolveHologramMode('livewave', 'general', 'Hi'), 'livewave');
});

test('message segment parsing identifies runnable web code blocks', () => {
  const sample = `Here is a button:\n\`\`\`html\n<button>Click</button>\n\`\`\`\nAnd Python:\n\`\`\`python\nprint("hi")\n\`\`\``;
  const segments = parseMessageSegments(sample);
  assert.equal(segments.length, 4);
  assert.deepEqual(segments[0], { type: 'text', content: 'Here is a button:' });
  assert.deepEqual(segments[1], {
    type: 'code',
    language: 'html',
    code: '<button>Click</button>',
    isRunnableWeb: true,
  });
  assert.deepEqual(segments[2], { type: 'text', content: 'And Python:' });
  assert.deepEqual(segments[3], {
    type: 'code',
    language: 'python',
    code: 'print("hi")',
    isRunnableWeb: false,
  });
});

test('buildRunnableHtmlDocument wraps HTML and JS safely', () => {
  const htmlDoc = buildRunnableHtmlDocument('html', '<h1>Hello</h1>');
  assert.equal(htmlDoc.includes('<h1>Hello</h1>'), true);

  const jsDoc = buildRunnableHtmlDocument('javascript', 'console.log(42);');
  assert.equal(jsDoc.includes('console.log(42);'), true);
});

test('extractGroundingSources deduplicates web URIs', () => {
  const chunks = [
    { web: { uri: 'https://example.com/a', title: 'Source A' } },
    { web: { uri: 'https://example.com/a', title: 'Duplicate A' } },
    { web: { uri: 'https://example.com/b', title: 'Source B' } },
  ];
  const sources = extractGroundingSources(chunks);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, 'Source A');
  assert.equal(sources[1].uri, 'https://example.com/b');
});

test('system instruction and markdown export include display name and memory', () => {
  const settings: UserSettings = {
    displayName: 'Roshan',
    voiceProfile: 'Nova',
    speechSpeed: 1.0,
    autoSpeak: false,
    language: 'Hinglish',
    personalMemory: 'Always give concise bullet points.',
    animationStyle: 'auto',
  };
  const instruction = buildSystemInstruction(settings, 'study', true);
  assert.equal(instruction.includes('Roshan'), true);
  assert.equal(instruction.includes('Hinglish'), true);
  assert.equal(instruction.includes('Always give concise bullet points.'), true);

  const session: ChatSession = {
    id: 's1',
    title: 'Physics Study',
    mode: 'study',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Explain gravity',
        timestamp: 1700000000000,
        mode: 'study',
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Gravity attracts mass.',
        timestamp: 1700000001000,
        mode: 'study',
        sources: [{ title: 'NASA', uri: 'https://nasa.gov' }],
      },
    ],
  };
  const md = formatConversationMarkdown(session);
  assert.equal(md.includes('# AURELION AI Conversation: Physics Study'), true);
  assert.equal(md.includes('https://nasa.gov'), true);
});

test('calculateAdminStats computes live counts from users and sessions without placeholders', () => {
  const users: ManagedUser[] = [
    {
      id: 'u1',
      name: 'Boss',
      identifier: 'boss@aura.ai',
      role: 'Boss Admin',
      status: 'Active',
      queries: 10,
      lastSeen: 'Now',
    },
    {
      id: 'u2',
      name: 'Mira',
      identifier: 'mira@aura.ai',
      role: 'Standard',
      status: 'Suspended',
      queries: 5,
      lastSeen: '2d ago',
    },
  ];
  const sessions: ChatSession[] = [
    {
      id: 's1',
      title: 'Session 1',
      mode: 'general',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [
        { id: 'm1', role: 'user', content: 'Hi', timestamp: 1000, mode: 'general' },
        { id: 'm2', role: 'assistant', content: 'Hello', timestamp: 1500, mode: 'general' },
        { id: 'm3', role: 'user', content: 'News?', timestamp: 2000, mode: 'general' },
      ],
    },
    {
      id: 's2',
      title: 'Session 2',
      mode: 'coding',
      createdAt: 3000,
      updatedAt: 3500,
      messages: [
        { id: 'm4', role: 'user', content: 'Code?', timestamp: 3000, mode: 'coding' },
      ],
    },
  ];

  const stats = calculateAdminStats(users, sessions, 2);
  assert.equal(stats.totalRegisteredUsers, 2);
  assert.equal(stats.activeUsersCount, 1);
  assert.equal(stats.activeSessionsCount, 2);
  assert.equal(stats.totalQueriesProcessed, 18);

  const emptyStats = calculateAdminStats([], [], 0);
  assert.equal(emptyStats.totalRegisteredUsers, 0);
  assert.equal(emptyStats.activeUsersCount, 0);
  assert.equal(emptyStats.activeSessionsCount, 0);
  assert.equal(emptyStats.totalQueriesProcessed, 0);
});

test('parseMessageSegments extracts markdown image cards cleanly', () => {
  const sample = `Here is your generated AI image:\n\n![AI Generated Image](https://image.pollinations.ai/prompt/dragon?width=1024&height=1024&nologo=true)\n\n[Download Image](https://image.pollinations.ai/prompt/dragon?width=1024&height=1024&nologo=true)`;
  const segments = parseMessageSegments(sample);
  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0], { type: 'text', content: 'Here is your generated AI image:' });
  assert.deepEqual(segments[1], {
    type: 'image',
    alt: 'AI Generated Image',
    url: 'https://image.pollinations.ai/prompt/dragon?width=1024&height=1024&nologo=true',
  });
  assert.deepEqual(segments[2], {
    type: 'text',
    content: '[Download Image](https://image.pollinations.ai/prompt/dragon?width=1024&height=1024&nologo=true)',
  });
});

test('getQuickPrompts returns mode-specific prompt chips', () => {
  const codingChips = getQuickPrompts('coding');
  assert.ok(codingChips.length >= 2);
  assert.ok(codingChips.some((c) => c.label.includes('Debug')));

  const studyChips = getQuickPrompts('study');
  assert.ok(studyChips.length >= 2);
  assert.ok(studyChips.some((c) => c.label.includes('Quiz') || c.label.includes('Explain')));

  const generalChips = getQuickPrompts('general');
  assert.ok(generalChips.length >= 2);
});

test('isImageGenerationRequest detects English, Hindi, Hinglish and slash commands', () => {
  assert.equal(isImageGenerationRequest('/image futuristic cyber city'), true);
  assert.equal(isImageGenerationRequest('generate image of a golden eagle'), true);
  assert.equal(isImageGenerationRequest('create an image of taj mahal'), true);
  assert.equal(isImageGenerationRequest('draw a picture of a neon robot'), true);
  assert.equal(isImageGenerationRequest('photo of snow mountains'), true);
  assert.equal(isImageGenerationRequest('चित्र बनाओ एक शेर का'), true);
  assert.equal(isImageGenerationRequest('फोटो बनाओ ताज महल की'), true);
  assert.equal(isImageGenerationRequest('इमेज जनरेट करो'), true);
  assert.equal(isImageGenerationRequest('cyber car image banao'), true);
  assert.equal(isImageGenerationRequest('Create one car image'), true);
  assert.equal(isImageGenerationRequest('hello what is the capital of France?'), false);
  assert.equal(isImageGenerationRequest('explain how async await works in javascript'), false);

  assert.equal(cleanImageSubject('Create one car image'), 'car');
  assert.equal(extractCleanImagePrompt('generate image of golden eagle'), 'golden eagle');
  assert.equal(extractCleanImagePrompt('/image cyberpunk city'), 'cyberpunk city');
  assert.equal(extractCleanImagePrompt('फोटो बनाओ ताज महल की'), 'ताज महल');

  const fluxUrl = getPollinationsFluxUrl('luxury sports car', 98765);
  assert.ok(fluxUrl.includes('image.pollinations.ai/prompt/luxury%20sports%20car'));
  assert.ok(fluxUrl.includes('model=flux'));
  assert.ok(fluxUrl.includes('seed=98765'));
  assert.ok(fluxUrl.includes('safe=true'));

  const url = buildPollinationsImageUrl('dragon', 12345);
  assert.ok(url.includes('image.pollinations.ai/prompt/dragon'));
  assert.ok(url.includes('seed=12345'));
});

test('cleanThoughtAndBrokenText strips internal thought leaks, orphan tags, and fake search indicators', () => {
  // 1. Complete thought tag
  const raw1 = '<thought>I need to check cricket scores for today...</thought>India won the match by 5 wickets!';
  assert.equal(cleanThoughtAndBrokenText(raw1), 'India won the match by 5 wickets!');

  // 2. Multiline thought with casing
  const raw2 = '<THOUGHT>\nStep 1: Parse user query\nStep 2: Generate response\n</THOUGHT>\nHere is your solution.';
  assert.equal(cleanThoughtAndBrokenText(raw2), 'Here is your solution.');

  // 3. Orphan closing tag at the start
  const raw3 = 'some intermediate reasoning step\n</thought>The exact answer is 42.';
  assert.equal(cleanThoughtAndBrokenText(raw3), 'The exact answer is 42.');

  // 4. Orphan closing tag inline
  const raw4 = '</thought>Hello! How can I assist you today?';
  assert.equal(cleanThoughtAndBrokenText(raw4), 'Hello! How can I assist you today?');

  // 5. Unclosed trailing thought tag
  const raw5 = 'Valid response here.<thought>Wait what about other cases...';
  assert.equal(cleanThoughtAndBrokenText(raw5), 'Valid response here.');

  // 6. Fake search placeholders
  const raw6 = '* (Searching Google for current news...)*\nHere are the top headlines for today.';
  assert.equal(cleanThoughtAndBrokenText(raw6), 'Here are the top headlines for today.');

  const raw7 = '*(Searching Google...)*\nResult content';
  assert.equal(cleanThoughtAndBrokenText(raw7), 'Result content');

  // 7. Empty or whitespace
  assert.equal(cleanThoughtAndBrokenText(''), '');
  assert.equal(cleanThoughtAndBrokenText('   '), '');
});

test('isBrokenOrIncompleteReply validates response quality and rejects broken replies', () => {
  // Empty, null, or short
  assert.equal(isBrokenOrIncompleteReply(''), true);
  assert.equal(isBrokenOrIncompleteReply('Short'), true);
  assert.equal(isBrokenOrIncompleteReply('Under 15 chars'), true);

  // Still contains thought tags
  assert.equal(isBrokenOrIncompleteReply('This is a response but still contains </thought> tag here'), true);
  assert.equal(isBrokenOrIncompleteReply('This contains <thought> tags inside the response text'), true);

  // Fake searching placeholder with no substance
  assert.equal(isBrokenOrIncompleteReply('* (Searching Google...)*'), true);
  assert.equal(isBrokenOrIncompleteReply('*(Searching Google for answers...)*'), true);

  // Valid, complete replies
  assert.equal(
    isBrokenOrIncompleteReply('Quantum computing leverages superposition and entanglement to perform complex computations.'),
    false
  );
  assert.equal(
    isBrokenOrIncompleteReply('नमस्ते! मैं ऑरा (AURA) हूँ, आपकी व्यक्तिगत एआई साथी। मैं आपकी क्या मदद करूँ?'),
    false
  );
});

test('formatGroundingSourcesAsMarkdown formats clickable links', () => {
  const sources = [
    { title: 'BBC News', uri: 'https://bbc.com/news' },
    { title: 'Reuters', uri: 'https://reuters.com' },
  ];
  const formatted = formatGroundingSourcesAsMarkdown(sources);
  assert.ok(formatted.includes('🌐 **Live Web Sources:**'));
  assert.ok(formatted.includes('• [BBC News](https://bbc.com/news)'));
  assert.ok(formatted.includes('• [Reuters](https://reuters.com)'));

  assert.equal(formatGroundingSourcesAsMarkdown([]), '');
});

test('fetchAuraReply is exported and callable', () => {
  assert.equal(typeof fetchAuraReply, 'function');
});

test('Daily Goal Tracker calculates progress percentage and updates progress within bounds', async () => {
  const { calculateGoalProgress, updateDailyGoalProgress } = await import('./auraLogic');

  assert.equal(calculateGoalProgress(0, 5), 0);
  assert.equal(calculateGoalProgress(2, 5), 40);
  assert.equal(calculateGoalProgress(5, 5), 100);
  assert.equal(calculateGoalProgress(8, 5), 100);
  assert.equal(calculateGoalProgress(-2, 5), 0);

  const initialGoal = {
    title: 'Solve 4 Coding Challenges',
    targetCount: 4,
    completedCount: 1,
    updatedDate: '2026-11-14',
  };

  const incremented = updateDailyGoalProgress(initialGoal, 1);
  assert.equal(incremented.completedCount, 2);
  assert.equal(calculateGoalProgress(incremented.completedCount, incremented.targetCount), 50);

  const maxedOut = updateDailyGoalProgress(initialGoal, 10);
  assert.equal(maxedOut.completedCount, 4);
  assert.equal(calculateGoalProgress(maxedOut.completedCount, maxedOut.targetCount), 100);

  const floored = updateDailyGoalProgress(initialGoal, -5);
  assert.equal(floored.completedCount, 0);
  assert.equal(calculateGoalProgress(floored.completedCount, floored.targetCount), 0);
});

test('streamAuraReply and parseSseEventStreamBuffer handle incremental SSE chunks cleanly without client API keys', async () => {
  const auraLogic = await import('./auraLogic');
  const { streamAuraReply, fetchFreePublicFallback, parseSseEventStreamBuffer } = auraLogic;

  assert.equal('getSafeEnvApiKey' in auraLogic, false);
  assert.equal(typeof streamAuraReply, 'function');
  assert.equal(typeof fetchFreePublicFallback, 'function');

  // Partial chunk boundary simulation
  const part1 = 'data: {"chunk":"Hello ","accumulated":"Hello "}\n\ndata: {"chunk":"Wor';
  const res1 = parseSseEventStreamBuffer(part1);
  assert.equal(res1.events.length, 1);
  assert.equal(res1.events[0].accumulated, 'Hello ');
  assert.equal(res1.remainder, 'data: {"chunk":"Wor');

  const part2 = `${res1.remainder}ld!","accumulated":"Hello World!"}\n\ndata: {"done":true,"text":"Hello World!","sources":[],"usedWebSearch":false}\n\n`;
  const res2 = parseSseEventStreamBuffer(part2);
  assert.equal(res2.events.length, 2);
  assert.equal(res2.events[0].accumulated, 'Hello World!');
  assert.equal(res2.events[1].done, true);
  assert.equal(res2.events[1].text, 'Hello World!');
});

test('isWebViewEnvironment detects Android WebView and Median.co APK user agents accurately', async () => {
  const { isWebViewEnvironment } = await import('./auraLogic');

  // Standard Chrome desktop & mobile browsers -> false
  assert.equal(
    isWebViewEnvironment(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    ),
    false
  );
  assert.equal(
    isWebViewEnvironment(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    ),
    false
  );

  // Android WebView (wv) and Median.co APK -> true
  assert.equal(
    isWebViewEnvironment(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36'
    ),
    true
  );
  assert.equal(
    isWebViewEnvironment(
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) MedianIOS/1.0 MedianAndroid/2.0 Mobile'
    ),
    true
  );
});

test('getSafeStorageUserKey isolates registered accounts and maps guest sessions to guest', async () => {
  const { getSafeStorageUserKey } = await import('./auraLogic');

  assert.equal(getSafeStorageUserKey('guest@aura.ai', 'guest'), 'guest');
  assert.equal(getSafeStorageUserKey('guest@aurelion.ai', 'guest'), 'guest');
  assert.equal(getSafeStorageUserKey('guest@aurelion.ai', 'user'), 'guest');
  assert.equal(getSafeStorageUserKey('any@aura.ai', 'guest'), 'guest');
  assert.equal(getSafeStorageUserKey('', 'user'), 'guest');
  assert.equal(getSafeStorageUserKey(null, 'user'), 'guest');

  assert.equal(getSafeStorageUserKey('Aarav.Sharma@TechMail.in', 'user'), 'aarav_sharma_techmail_in');
  assert.equal(getSafeStorageUserKey('roshan.dev@gmail.com', 'user'), 'roshan_dev_gmail_com');
  assert.notEqual(
    getSafeStorageUserKey('aarav@techmail.in', 'user'),
    getSafeStorageUserKey('elena@studio.io', 'user')
  );
});

test('3D Code Runner detection and zero-CDN inline Three.js + OrbitControls + GridHelper injection', async () => {
  const { isThreeJsOr3DCode, isRunnableCodeBlock, buildRunnableHtmlDocument } = await import('./auraLogic');

  const threeSnippet = `
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x00f0ff }));
    scene.add(cube);
    function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }
    animate();
  `;

  assert.equal(isThreeJsOr3DCode('javascript', threeSnippet), true);
  assert.equal(isRunnableCodeBlock('javascript', threeSnippet), true);
  assert.equal(isRunnableCodeBlock('threejs', threeSnippet), true);
  assert.equal(isRunnableCodeBlock('webgl', threeSnippet), true);

  const built3D = buildRunnableHtmlDocument('javascript', threeSnippet);
  assert.equal(built3D.includes('data-aurelion-three-bridge="inline"'), true);
  assert.equal(built3D.includes('__AURELION_THREE__'), true);
  assert.equal(built3D.includes('__AURELION_ORBIT_CONTROLS__'), true);
  assert.equal(built3D.includes('DirectionalLight'), true);
  assert.equal(built3D.includes('GridHelper'), true);
  assert.equal(built3D.includes("window.addEventListener('resize'"), true);
});

test('cleanSpeechTextForPronunciation strips Markdown and URLs while preserving commas and stops', async () => {
  const { cleanSpeechTextForPronunciation } = await import('./auraLogic');

  const raw = `### नमस्ते बॉस!\nयहाँ **महत्वपूर्ण** जानकारी है, कृपया ध्यान दें। Visit [Google](https://google.com) or https://example.com\n\`\`\`js\nconsole.log(1);\n\`\`\`\nधन्यवाद, आपका दिन शुभ हो।`;
  const cleaned = cleanSpeechTextForPronunciation(raw);

  assert.equal(cleaned.includes('###'), false);
  assert.equal(cleaned.includes('**'), false);
  assert.equal(cleaned.includes('https://'), false);
  assert.equal(cleaned.includes('console.log'), false);
  assert.equal(cleaned.includes(','), true);
  assert.equal(cleaned.includes('।'), true);
});

test('isMarathiText, detectLanguageLockSwitch, and detectVoiceLocaleAndLang accurately distinguish Marathi, Hindi, and English', async () => {
  const { isMarathiText, detectLanguageLockSwitch, detectVoiceLocaleAndLang } = await import('./auraLogic');

  const marathiSample = 'नमस्कार बॉस, तुम्ही कसे आहात? मी मराठी भाषेत मदत करत आहे, काळजी करू नका होय.';
  const hindiSample = 'नमस्ते बॉस, आप कैसे हैं? मैं आपकी क्या मदद कर सकती हूँ।';
  const englishSample = 'Hello Boss, here is the complete explanation with clear steps.';

  assert.equal(isMarathiText(marathiSample), true);
  assert.equal(isMarathiText('मराठीत बोल'), true);
  assert.equal(isMarathiText(hindiSample), false);

  assert.equal(detectLanguageLockSwitch('हिंदी में बात करो'), 'Hindi');
  assert.equal(detectLanguageLockSwitch('मराठीत बोल'), 'Marathi');
  assert.equal(detectLanguageLockSwitch('talk in english'), 'English');

  const mrVoice = detectVoiceLocaleAndLang(marathiSample, 'auto');
  assert.equal(mrVoice.locale, 'mr-IN');
  assert.equal(mrVoice.shortLang, 'mr');

  const hiVoice = detectVoiceLocaleAndLang(hindiSample, 'auto');
  assert.equal(hiVoice.locale, 'hi-IN');
  assert.equal(hiVoice.shortLang, 'hi');

  const enVoice = detectVoiceLocaleAndLang(englishSample, 'auto');
  assert.equal(enVoice.locale, 'en-IN');
  assert.equal(enVoice.shortLang, 'en');
});

test('cross-session chat history memory recall and Gemini-like persona in buildSystemInstruction', async () => {
  const { isMemoryRecallRequest, buildCrossSessionMemorySummary, buildSystemInstruction } = await import('./auraLogic');

  assert.equal(isMemoryRecallRequest('हमारी पिछली बात देखो'), true);
  assert.equal(isMemoryRecallRequest('मैंने पहले क्या पूछा था?'), true);
  assert.equal(isMemoryRecallRequest('What did we talk about in our previous chat?'), true);
  assert.equal(isMemoryRecallRequest('Write a sorting algorithm in JS'), false);

  const mockSessions: ChatSession[] = [
    {
      id: 'sess-old-1',
      title: 'Quantum Computing Notes',
      mode: 'study',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [
        { id: 'm1', role: 'user', content: 'Explain qubits in simple Hindi', timestamp: 1000, mode: 'study' },
        { id: 'm2', role: 'assistant', content: 'क्यूबिट क्वांटम कंप्यूटिंग की मूल इकाई है।', timestamp: 1500, mode: 'study' },
      ],
    },
  ];

  const summary = buildCrossSessionMemorySummary(mockSessions, 'sess-current');
  assert.equal(summary.includes('Quantum Computing Notes'), true);
  assert.equal(summary.includes('Explain qubits in simple Hindi'), true);

  const settings: UserSettings = {
    displayName: 'Boss',
    voiceProfile: 'Nova',
    speechSpeed: 1.0,
    autoSpeak: false,
    language: 'Hindi',
    personalMemory: '',
    animationStyle: 'auto',
  };

  const sysInstruction = buildSystemInstruction(
    settings,
    'general',
    true,
    'auto',
    'हिंदी में बात करो और हमारी पिछली बात देखो',
    mockSessions,
    'sess-current'
  );
  assert.equal(sysInstruction.includes('100% HINDI DEVANAGARI'), true);
  assert.equal(sysInstruction.includes('GEMINI-LIKE ADAPTIVE PERSONA'), true);
  assert.equal(sysInstruction.includes('CROSS-SESSION CHAT MEMORY RECALL'), true);
  assert.equal(sysInstruction.includes('Quantum Computing Notes'), true);
});

test('buildSystemInstruction enforces strict Creator / Developer Identity Rule (Roshan Pawar only when asked)', async () => {
  const { buildSystemInstruction } = await import('./auraLogic');
  const settings: UserSettings = {
    displayName: 'Explorer',
    voiceProfile: 'Nova',
    speechSpeed: 1.0,
    autoSpeak: false,
    language: 'English',
    personalMemory: '',
    animationStyle: 'auto',
  };

  const instruction = buildSystemInstruction(settings, 'general', true, 'auto', 'Who created you?');
  assert.equal(instruction.includes('CREATOR / DEVELOPER IDENTITY RULE'), true);
  assert.equal(instruction.includes('Never mention your developer unprompted'), true);
  assert.equal(instruction.includes('मुझे बनाने वाले मेरे बॉस रोशन पवार हैं।'), true);
  assert.equal(instruction.includes('मला बनवणारे माझे बॉस रोशन पवार आहेत.'), true);
  assert.equal(instruction.includes('My developer is my Boss, Roshan Pawar.'), true);
  assert.equal(instruction.includes('Do NOT mention any company name, address, location, or any other personal details'), true);
});

test('Question Games prompt, localized feedback, structured/raw/object JSON parser, and zero-repeat check work accurately', async () => {
  const auraLogic = await import('./auraLogic');
  const {
    getQuestionGameTopicPrompt,
    getQuestionGameFeedback,
    isStopQuestionGameIntent,
    extractTopicChangeFromQuestionGame,
    buildQuestionGameTurnInstruction,
    extractQuestionGameBlock,
    isDuplicateQuestion,
  } = auraLogic;

  assert.equal('generateFallbackQuestionGameQuestion' in auraLogic, false);

  assert.ok(getQuestionGameTopicPrompt('Hindi').includes('आपको किस विषय पर प्रश्न गेम खेलना है'));
  assert.ok(getQuestionGameTopicPrompt('English').includes('Which topic would you like to play'));
  assert.ok(getQuestionGameTopicPrompt('Marathi').includes('तुम्हाला कोणत्या विषयावर प्रश्न गेम खेळायचा आहे'));

  assert.equal(getQuestionGameFeedback(true, 'Hindi'), 'वाह! आपने सही जवाब दिया! 🎉');
  assert.equal(getQuestionGameFeedback(false, 'Hindi'), 'आपने गलत जवाब दिया! ❌');
  assert.equal(getQuestionGameFeedback(true, 'English'), 'Awesome! You got the right answer! 🎉');
  assert.equal(getQuestionGameFeedback(false, 'English'), "Oops! That's the wrong answer! ❌");

  assert.equal(isStopQuestionGameIntent('stop'), true);
  assert.equal(isStopQuestionGameIntent('बंद करो'), true);
  assert.equal(isStopQuestionGameIntent('Cricket'), false);
  assert.equal(extractTopicChangeFromQuestionGame('change topic to Cricket'), 'Cricket');

  const directive = buildQuestionGameTurnInstruction(
    'Cricket',
    2,
    'English',
    ['Who won the 1975 Cricket World Cup?'],
    98765
  );
  assert.ok(directive.includes('Cricket'));
  assert.ok(directive.includes('98765'));
  assert.ok(directive.includes('Who won the 1975 Cricket World Cup?'));
  assert.ok(directive.includes('NEVER repeat any previously asked question'));

  const modelOutput = `Intro text\n[QUESTION_GAME]\n{"topic":"Space","questionNumber":2,"question":"Which is the largest planet?","options":["Earth","Mars","Jupiter","Venus"],"correctIndex":2,"explanation":"Jupiter is massive."}\n[/QUESTION_GAME]`;
  const parsed = extractQuestionGameBlock(modelOutput, 'Space', 1, 'English');
  assert.equal(parsed.cleanText, 'Intro text');
  assert.ok(parsed.gameData);
  assert.equal(parsed.gameData?.topic, 'Space');
  assert.equal(parsed.gameData?.questionNumber, 2);
  assert.equal(parsed.gameData?.correctIndex, 2);
  assert.equal(parsed.gameData?.options.length, 4);

  // Also parse raw JSON with object options {A, B, C, D} + "answer": "B" + "question_number": 3
  const rawObjJson = `{"question_number":3,"topic":"Cricket","question":"Who won the inaugural ICC Cricket World Cup held in 1975?","options":{"A":"Australia","B":"West Indies","C":"England","D":"India"},"answer":"B"}`;
  const parsedObj = extractQuestionGameBlock(rawObjJson, 'Cricket', 1, 'English');
  assert.ok(parsedObj.gameData);
  assert.equal(parsedObj.gameData?.topic, 'Cricket');
  assert.equal(parsedObj.gameData?.questionNumber, 3);
  assert.equal(parsedObj.gameData?.correctIndex, 1);
  assert.deepEqual(parsedObj.gameData?.options, ['Australia', 'West Indies', 'England', 'India']);

  assert.equal(
    isDuplicateQuestion('Who won the 1975 Cricket World Cup?', ['who won the 1975 cricket world cup']),
    true
  );
  assert.equal(
    isDuplicateQuestion('How many balls are in one over?', ['Who won the 1975 Cricket World Cup?']),
    false
  );
});

test('Multi-engine image candidates and placeholder detection build diverse seeded URLs', async () => {
  const { buildImageEngineCandidateUrls, isSuspectPlaceholderImage } = await import('./auraLogic');
  const candidates = buildImageEngineCandidateUrls('golden temple sunrise', 424242);
  assert.ok(candidates.length >= 5);
  assert.equal(candidates[0].engine, 'flux');
  assert.equal(candidates[1].engine, 'kontext');
  assert.equal(candidates[2].engine, 'turbo');
  assert.equal(candidates[3].engine, 'zimage');
  assert.ok(candidates.every((c) => c.url.includes('nologo=true') || c.url.startsWith('/api/image-proxy')));

  assert.equal(isSuspectPlaceholderImage(0, 0), true);
  assert.equal(isSuspectPlaceholderImage(64, 64), true);
  assert.equal(isSuspectPlaceholderImage(1024, 1024), false);
});

test('buildMessageSpeechText extracts clean Question, Result, and Explanation for Question Game TTS', async () => {
  const { buildMessageSpeechText } = await import('./auraLogic');

  const hindiGameMsg = {
    id: 'msg-qg-1',
    role: 'assistant' as const,
    content: '🎮 **Question #1** • *अंतरिक्ष*',
    timestamp: Date.now(),
    mode: 'general' as const,
    gameLanguage: 'Hindi',
    questionGame: {
      topic: 'अंतरिक्ष',
      questionNumber: 1,
      question: 'हमारे सौरमंडल में किस ग्रह को "लाल ग्रह" कहा जाता है?',
      options: ['शुक्र', 'मंगल', 'बृहस्पति', 'बुध'] as [string, string, string, string],
      correctIndex: 1,
      explanation: 'मंगल ग्रह की सतह पर आयरन ऑक्साइड की अधिकता के कारण यह लाल दिखता है।',
      language: 'Hindi',
    },
  };

  const unansweredSpeech = buildMessageSpeechText(hindiGameMsg, 'Hindi');
  assert.equal(unansweredSpeech.includes('हमारे सौरमंडल में किस ग्रह को'), true);
  assert.equal(unansweredSpeech.includes('Question #1'), false);
  assert.equal(unansweredSpeech.includes('सही जवाब'), false);
  assert.equal(unansweredSpeech.includes('🎮'), false);

  const answeredCorrectSpeech = buildMessageSpeechText(
    { ...hindiGameMsg, gameSelectedIndex: 1 },
    'Hindi'
  );
  assert.equal(answeredCorrectSpeech.includes('हमारे सौरमंडल में किस ग्रह को'), true);
  assert.equal(answeredCorrectSpeech.includes('वाह! आपने सही जवाब दिया!'), true);
  assert.equal(answeredCorrectSpeech.includes('मंगल ग्रह की सतह पर आयरन ऑक्साइड'), true);
  assert.equal(answeredCorrectSpeech.includes('🎉'), false);

  const englishGameMsg = {
    id: 'msg-qg-2',
    role: 'assistant' as const,
    content: '🎮 **Question #2** • *Space*',
    timestamp: Date.now(),
    mode: 'study' as const,
    gameLanguage: 'English',
    gameSelectedIndex: 0,
    questionGame: {
      topic: 'Space',
      questionNumber: 2,
      question: 'Which is the largest planet?',
      options: ['Earth', 'Mars', 'Jupiter', 'Venus'] as [string, string, string, string],
      correctIndex: 2,
      explanation: 'Jupiter is the largest planet in our solar system.',
      language: 'English',
    },
  };
  const answeredWrongSpeech = buildMessageSpeechText(englishGameMsg, 'English');
  assert.equal(answeredWrongSpeech.includes('Which is the largest planet?'), true);
  assert.equal(answeredWrongSpeech.includes("Oops! That's the wrong answer!"), true);
  assert.equal(answeredWrongSpeech.includes('Jupiter is the largest planet in our solar system.'), true);
  assert.equal(answeredWrongSpeech.includes('❌'), false);
});

test('isImageEditRequest distinguishes image editing intents from normal visual Q&A', async () => {
  const { isImageEditRequest } = await import('./auraLogic');

  // No uploaded image -> always false
  assert.equal(isImageEditRequest('change the background to Mars', false), false);
  assert.equal(isImageEditRequest('edit this photo', false), false);

  // Uploaded image + edit instruction (English, Hindi, Hinglish) -> true
  assert.equal(isImageEditRequest('edit the background to snowy mountains', true), true);
  assert.equal(isImageEditRequest('make it cyberpunk anime style with neon lights', true), true);
  assert.equal(isImageEditRequest('remove the car from background', true), true);
  assert.equal(isImageEditRequest('add sunglasses and a leather jacket', true), true);
  assert.equal(isImageEditRequest('इसका बैकग्राउंड बदलो और पहाड़ लगाओ', true), true);
  assert.equal(isImageEditRequest('is photo ko edit karo aur anime style banao', true), true);

  // Uploaded image + normal visual Q&A -> false
  assert.equal(isImageEditRequest('what is this?', true), false);
  assert.equal(isImageEditRequest('solve this math equation step by step', true), false);
  assert.equal(isImageEditRequest('explain what is happening in this picture', true), false);
  assert.equal(isImageEditRequest('यह क्या है बताओ', true), false);
  assert.equal(isImageEditRequest('what background is shown here?', true), false);
});

test('Canvas Quick-Edit presets and 90-degree rotation math compute accurate filters and dimensions', async () => {
  const {
    CANVAS_PRESETS,
    getCanvasPresetFilter,
    computeRotatedCanvasDimensions,
  } = await import('./auraLogic');

  assert.deepEqual(
    CANVAS_PRESETS.map((p) => p.label),
    ['Original', 'HD Enhance', 'Warm', 'Cool', 'B&W', 'Cyber']
  );

  assert.equal(getCanvasPresetFilter('original'), 'none');
  assert.ok(getCanvasPresetFilter('hd').includes('contrast'));
  assert.ok(getCanvasPresetFilter('bw').includes('grayscale(1)'));
  assert.ok(getCanvasPresetFilter('warm').includes('sepia'));
  assert.ok(getCanvasPresetFilter('cool').includes('hue-rotate'));
  assert.ok(getCanvasPresetFilter('cyber').includes('saturate'));

  assert.deepEqual(computeRotatedCanvasDimensions(1200, 800, 0), {
    width: 1200,
    height: 800,
    normalizedDeg: 0,
  });
  assert.deepEqual(computeRotatedCanvasDimensions(1200, 800, 90), {
    width: 800,
    height: 1200,
    normalizedDeg: 90,
  });
  assert.deepEqual(computeRotatedCanvasDimensions(1200, 800, 180), {
    width: 1200,
    height: 800,
    normalizedDeg: 180,
  });
  assert.deepEqual(computeRotatedCanvasDimensions(1200, 800, 270), {
    width: 800,
    height: 1200,
    normalizedDeg: 270,
  });
  assert.deepEqual(computeRotatedCanvasDimensions(1200, 800, 360), {
    width: 1200,
    height: 800,
    normalizedDeg: 0,
  });
});
