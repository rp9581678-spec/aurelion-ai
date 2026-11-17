import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  Type,
  type GenerateContentResponse,
  type LiveServerMessage,
} from '@google/genai';

interface GroundingSource {
  title: string;
  uri: string;
}

function extractGroundingSources(groundingChunks: unknown): GroundingSource[] {
  if (!Array.isArray(groundingChunks)) return [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];

  for (const chunk of groundingChunks) {
    if (chunk && typeof chunk === 'object' && 'web' in chunk) {
      const web = (chunk as { web?: { uri?: string; title?: string } }).web;
      if (web?.uri && !seen.has(web.uri)) {
        seen.add(web.uri);
        sources.push({
          uri: web.uri,
          title: web.title?.trim() || web.uri,
        });
      }
    }
  }
  return sources;
}

function cleanThoughtAndBrokenText(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<thought>[\s\S]*$/gi, '')
    .replace(/^[\s\S]*?<\/thought>/gi, '')
    .replace(/<\/thought>/gi, '')
    .replace(/^\s*\*\s*\(Searching Google[^)]*\)\s*\*\s*/gi, '')
    .replace(/\n\s*\*\s*\(Searching Google[^)]*\)\s*\*/gi, '')
    .trim();
}

function isBrokenOrIncompleteReply(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 15) return true;
  if (trimmed.includes('</thought>') || trimmed.includes('<thought>')) return true;
  if (/^\s*\*\s*\(Searching Google/i.test(trimmed) && trimmed.length < 50) return true;
  return false;
}

function formatGroundingSourcesAsMarkdown(sources: GroundingSource[]): string {
  if (!sources || sources.length === 0) return '';
  const lines = sources.map((s) => `• [${s.title}](${s.uri})`);
  return `\n\n🌐 **Live Web Sources:**\n${lines.join('\n')}`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI | null {
  const envKey =
    typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY
      ? process.env.GEMINI_API_KEY
      : '';
  if (!envKey || envKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: envKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface IncomingHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  message: string;
  history?: IncomingHistoryMessage[];
  systemInstruction?: string;
  enableWebSearch?: boolean;
  attachment?: {
    name: string;
    mimeType: string;
    base64Data?: string;
    textContent?: string;
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    res.json({ ok: true, geminiConfigured: hasKey, streaming: true, liveApi: true });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const body = req.body as ChatRequestBody;
      const messageText = typeof body.message === 'string' ? body.message.trim() : '';

      if (!messageText && !body.attachment) {
        res.status(400).json({ error: 'Message or attachment is required.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        // Zero-API-Key Free Public Chat Fallback
        try {
          const attachCtx = body.attachment?.textContent
            ? `\n[Attached Document (${body.attachment.name})]:\n${body.attachment.textContent.slice(0, 12000)}\n`
            : body.attachment?.name
              ? `\n[Attached File: ${body.attachment.name} (${body.attachment.mimeType})]\n`
              : '';
          const combined = `${body.systemInstruction || ''}${attachCtx}\n\nUser: ${messageText || `Analyze ${body.attachment?.name}`}\nAURA:`;
          const pollinationsRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(combined)}?model=openai`);
          const publicText = await pollinationsRes.text();
          const cleanPublic = (publicText || '').trim() || 'बॉस, कृपया एक बार फिर से पूछें।';
          res.json({
            text: cleanPublic,
            sources: [],
            usedWebSearch: false,
          });
          return;
        } catch {
          res.status(503).json({
            error: 'GEMINI_API_KEY is not configured in the server environment. Set it in Settings > Secrets.',
          });
          return;
        }
      }

      const liveDate = new Date().toLocaleDateString('en-IN', { dateStyle: 'full' });
      const nowLive = new Date().toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'short',
      });
      const liveClockInstruction = `TODAY'S EXACT DATE: ${liveDate}.\nCURRENT LIVE DATE & TIME: ${nowLive}.\nCRITICAL GROUNDING RULE: Always treat "${liveDate}" as today's exact live date. Provide accurate, real-time facts and search results as of ${liveDate}. Do NOT generate fake internal monologue, thought steps, or "* (Searching Google...)" placeholders.`;
      const finalSystemInstruction = `${liveClockInstruction}\n\n${body.systemInstruction || ''}`;

      const historyContents = (body.history || []).slice(-10).map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      }));

      const currentParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (body.attachment) {
        if (body.attachment.textContent) {
          currentParts.push({
            text: `[Attached File: ${body.attachment.name}]\n\`\`\`\n${body.attachment.textContent.slice(0, 20000)}\n\`\`\``,
          });
        }
        if (
          body.attachment.base64Data &&
          body.attachment.mimeType &&
          (!body.attachment.textContent || body.attachment.mimeType.startsWith('image/'))
        ) {
          currentParts.push({
            inlineData: {
              mimeType: body.attachment.mimeType,
              data: body.attachment.base64Data,
            },
          });
        }
      }

      if (messageText) {
        currentParts.push({ text: messageText });
      } else if (body.attachment) {
        currentParts.push({ text: `Please analyze the attached file (${body.attachment.name}).` });
      }

      const contents = [
        ...historyContents,
        {
          role: 'user',
          parts: currentParts,
        },
      ];

      const enableWebSearch = body.enableWebSearch !== false;

      // Self-healing auto-retry models in order of priority (official supported models)
      const FALLBACK_MODELS = [
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite',
      ];

      let finalCleanText = '';
      let finalSources: ReturnType<typeof extractGroundingSources> = [];
      let success = false;
      let lastError: unknown = null;
      const attemptLogs: string[] = [];

      for (const modelName of FALLBACK_MODELS) {
        // Try with search first if enabled; if search fails, try direct generation without search
        const searchModes = enableWebSearch ? [true, false] : [false];
        for (const withSearch of searchModes) {
          try {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout after 7000ms on ${modelName} (search=${withSearch})`)),
                7000
              )
            );

            const response: GenerateContentResponse = await Promise.race([
              ai.models.generateContent({
                model: modelName,
                contents,
                config: {
                  systemInstruction: finalSystemInstruction,
                  tools: withSearch ? [{ googleSearch: {} }] : undefined,
                },
              }),
              timeoutPromise,
            ]);

            const candidate = response.candidates?.[0];
            const rawParts = candidate?.content?.parts || [];

            // 1. Skip any part where part.thought === true
            const textParts = rawParts
              .filter((p: { thought?: boolean; text?: string }) => !p.thought)
              .map((p: { text?: string }) => (typeof p.text === 'string' ? p.text : ''))
              .filter(Boolean);

            let combinedText = textParts.join('').trim();
            if (!combinedText && response.text) {
              combinedText = response.text.trim();
            }

            // 2. Clean final text with regex to strip thoughts and placeholders
            let cleaned = cleanThoughtAndBrokenText(combinedText);

            // 3. Extract grounding chunks
            const groundingChunks = candidate?.groundingMetadata?.groundingChunks;
            const sources = extractGroundingSources(groundingChunks);

            // 4. Validate with isBrokenOrIncompleteReply
            if (isBrokenOrIncompleteReply(cleaned)) {
              continue;
            }

            // 5. Append real clickable groundingChunks source links if available and not already formatted
            if (sources.length > 0) {
              const hasExistingLinks = sources.some((s) => cleaned.includes(s.uri));
              if (!hasExistingLinks) {
                cleaned += formatGroundingSourcesAsMarkdown(sources);
              }
            }

            finalCleanText = cleaned;
            finalSources = sources;
            success = true;
            break;
          } catch (callErr: unknown) {
            lastError = callErr;
            const errMsg = callErr instanceof Error ? callErr.message : String(callErr);
            attemptLogs.push(`${modelName} (search=${withSearch}): ${errMsg}`);
          }
        }
        if (success) break;
      }

      if (!success) {
        if (finalCleanText && finalCleanText.length > 0) {
          res.json({
            text: finalCleanText,
            sources: finalSources,
            usedWebSearch: enableWebSearch && finalSources.length > 0,
          });
          return;
        }
        // Fallback to free zero-key Pollinations Text endpoint if all Gemini models fail
        try {
          const attachCtx = body.attachment?.textContent
            ? `\n[Attached Document (${body.attachment.name})]:\n${body.attachment.textContent.slice(0, 12000)}\n`
            : '';
          const combined = `${finalSystemInstruction}${attachCtx}\n\nUser: ${messageText || 'Analyze attached image/file'}\nAURA:`;
          const pollinationsRes = await fetch(
            `https://text.pollinations.ai/${encodeURIComponent(combined)}?model=openai`
          );
          if (pollinationsRes.ok) {
            const publicText = await pollinationsRes.text();
            const cleanPublic = cleanThoughtAndBrokenText((publicText || '').trim());
            if (cleanPublic) {
              res.json({
                text: cleanPublic,
                sources: [],
                usedWebSearch: false,
              });
              return;
            }
          }
        } catch {
          // ignore and fall through
        }
        console.error('All fallback attempts failed:', attemptLogs);
        throw lastError || new Error('All fallback models exhausted without a valid reply.');
      }

      res.json({
        text: finalCleanText,
        sources: finalSources,
        usedWebSearch: enableWebSearch && finalSources.length > 0,
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Unknown error calling Gemini API';

      let status = 500;
      let friendlyMsg = rawMsg;

      try {
        const parsed = JSON.parse(rawMsg) as { error?: { code?: number; message?: string } };
        if (parsed?.error?.message) {
          friendlyMsg = parsed.error.message;
          if (parsed.error.code) status = parsed.error.code;
        }
      } catch {
        // Not raw JSON
      }

      if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        status = 429;
        friendlyMsg =
          'Your Free Tier daily Gemini API quota has been reached. Wait for the quota window to reset, or select a billing-enabled API key in Settings > Secrets.';
        console.warn('[/api/chat] Quota limit reached (429)');
      } else if (
        rawMsg.includes('403') ||
        rawMsg.includes('PERMISSION_DENIED') ||
        rawMsg.includes('API_KEY_INVALID')
      ) {
        status = 403;
        friendlyMsg =
          'Gemini API key is invalid or lacks permission. Please verify GEMINI_API_KEY in Settings > Secrets.';
        console.warn('[/api/chat] Auth/permission issue (403)');
      } else if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE')) {
        status = 503;
        friendlyMsg =
          'Gemini AI service is experiencing temporary high demand. Please click Regenerate or try again in a few seconds.';
        console.warn('[/api/chat] Upstream service busy (503)');
      } else {
        console.error('[/api/chat] Unexpected error:', friendlyMsg);
      }

      res.status(status).json({
        error: friendlyMsg,
      });
    }
  });

  // Server-Side Streaming Chat (SSE) using ai.models.generateContentStream
  app.post('/api/chat/stream', async (req: Request, res: Response) => {
    const body = req.body as ChatRequestBody;
    const messageText = typeof body.message === 'string' ? body.message.trim() : '';

    if (!messageText && !body.attachment) {
      res.status(400).json({ error: 'Message or attachment is required.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const ai = getGeminiClient();
      if (!ai) {
        try {
          const attachCtx = body.attachment?.textContent
            ? `\n[Attached Document (${body.attachment.name})]:\n${body.attachment.textContent.slice(0, 12000)}\n`
            : body.attachment?.name
              ? `\n[Attached File: ${body.attachment.name} (${body.attachment.mimeType})]\n`
              : '';
          const combined = `${body.systemInstruction || ''}${attachCtx}\n\nUser: ${messageText || `Analyze ${body.attachment?.name}`}\nAURA:`;
          const pollinationsRes = await fetch(
            `https://text.pollinations.ai/${encodeURIComponent(combined)}?model=openai`
          );
          const publicText = cleanThoughtAndBrokenText((await pollinationsRes.text()) || '') || 'बॉस, कृपया एक बार फिर से पूछें।';
          sendEvent({ chunk: publicText, accumulated: publicText });
          sendEvent({ done: true, text: publicText, sources: [], usedWebSearch: false });
          res.end();
          return;
        } catch {
          sendEvent({
            error: 'GEMINI_API_KEY is not configured in the server environment. Set it in Settings > Secrets.',
          });
          res.end();
          return;
        }
      }

      const liveDate = new Date().toLocaleDateString('en-IN', { dateStyle: 'full' });
      const nowLive = new Date().toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'short',
      });
      const liveClockInstruction = `TODAY'S EXACT DATE: ${liveDate}.\nCURRENT LIVE DATE & TIME: ${nowLive}.\nCRITICAL GROUNDING RULE: Always treat "${liveDate}" as today's exact live date. Provide accurate, real-time facts and search results as of ${liveDate}. Do NOT generate fake internal monologue, thought steps, or "* (Searching Google...)" placeholders.`;
      const finalSystemInstruction = `${liveClockInstruction}\n\n${body.systemInstruction || ''}`;

      const historyContents = (body.history || []).slice(-10).map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      }));

      const currentParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (body.attachment) {
        if (body.attachment.textContent) {
          currentParts.push({
            text: `[Attached File: ${body.attachment.name}]\n\`\`\`\n${body.attachment.textContent.slice(0, 20000)}\n\`\`\``,
          });
        }
        if (
          body.attachment.base64Data &&
          body.attachment.mimeType &&
          (!body.attachment.textContent || body.attachment.mimeType.startsWith('image/'))
        ) {
          currentParts.push({
            inlineData: {
              mimeType: body.attachment.mimeType,
              data: body.attachment.base64Data,
            },
          });
        }
      }

      if (messageText) {
        currentParts.push({ text: messageText });
      } else if (body.attachment) {
        currentParts.push({ text: `Please analyze the attached file (${body.attachment.name}).` });
      }

      const contents = [
        ...historyContents,
        {
          role: 'user',
          parts: currentParts,
        },
      ];

      const enableWebSearch = body.enableWebSearch !== false;
      const FALLBACK_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
      let streamedSuccess = false;
      let lastError: unknown = null;

      for (const modelName of FALLBACK_MODELS) {
        const searchModes = enableWebSearch ? [true, false] : [false];
        for (const withSearch of searchModes) {
          try {
            const streamResponse = await ai.models.generateContentStream({
              model: modelName,
              contents,
              config: {
                systemInstruction: finalSystemInstruction,
                tools: withSearch ? [{ googleSearch: {} }] : undefined,
                ...(modelName === 'gemini-4-hydrogen'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
              },
            });

            let rawAccumulated = '';
            let lastSentClean = '';
            const mergedGroundingChunks: unknown[] = [];

            for await (const chunk of streamResponse) {
              const c = chunk as GenerateContentResponse;
              const candidate = c.candidates?.[0];
              const rawParts = candidate?.content?.parts || [];
              const textParts = rawParts
                .filter((p: { thought?: boolean; text?: string }) => !p.thought)
                .map((p: { text?: string }) => (typeof p.text === 'string' ? p.text : ''))
                .filter(Boolean);

              const piece = textParts.join('') || (typeof c.text === 'string' ? c.text : '');
              if (piece) {
                rawAccumulated += piece;
                const cleanNow = cleanThoughtAndBrokenText(rawAccumulated);
                if (cleanNow && cleanNow !== lastSentClean) {
                  const delta = cleanNow.startsWith(lastSentClean)
                    ? cleanNow.slice(lastSentClean.length)
                    : cleanNow;
                  lastSentClean = cleanNow;
                  sendEvent({ chunk: delta, accumulated: cleanNow });
                }
              }

              const gChunks = candidate?.groundingMetadata?.groundingChunks;
              if (Array.isArray(gChunks) && gChunks.length > 0) {
                mergedGroundingChunks.push(...gChunks);
              }
            }

            let finalClean = cleanThoughtAndBrokenText(rawAccumulated);
            if (isBrokenOrIncompleteReply(finalClean)) {
              if (lastSentClean) {
                // Already streamed partial output -> finalize it
                finalClean = lastSentClean;
              } else {
                continue;
              }
            }

            const sources = extractGroundingSources(mergedGroundingChunks);
            if (sources.length > 0 && !sources.some((s) => finalClean.includes(s.uri))) {
              finalClean += formatGroundingSourcesAsMarkdown(sources);
            }

            sendEvent({
              done: true,
              text: finalClean,
              sources,
              usedWebSearch: enableWebSearch && sources.length > 0,
            });
            streamedSuccess = true;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (streamedSuccess) break;
      }

      if (!streamedSuccess) {
        try {
          const attachCtx = body.attachment?.textContent
            ? `\n[Attached Document (${body.attachment.name})]:\n${body.attachment.textContent.slice(0, 12000)}\n`
            : '';
          const combined = `${finalSystemInstruction}${attachCtx}\n\nUser: ${messageText || 'Analyze attached image/file'}\nAURA:`;
          const pollinationsRes = await fetch(
            `https://text.pollinations.ai/${encodeURIComponent(combined)}?model=openai`
          );
          if (pollinationsRes.ok) {
            const cleanPublic = cleanThoughtAndBrokenText((await pollinationsRes.text()) || '');
            if (cleanPublic) {
              sendEvent({ chunk: cleanPublic, accumulated: cleanPublic });
              sendEvent({ done: true, text: cleanPublic, sources: [], usedWebSearch: false });
              res.end();
              return;
            }
          }
        } catch {
          // ignore and emit error
        }

        const msg = lastError instanceof Error ? lastError.message : 'Streaming request failed';
        sendEvent({ error: msg });
      }
      res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Streaming failed';
      sendEvent({ error: msg });
      res.end();
    }
  });

  // Smart Visual Prompt Enhancer & Translator for Image Generation
  app.post('/api/enhance-prompt', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body as { prompt?: string };
      const rawSubject = (prompt || '').trim();
      if (!rawSubject) {
        return res.json({
          enhancedPrompt: 'futuristic glowing sports car, photorealistic, vibrant colors, cinematic lighting, high detail',
        });
      }

      const ai = getGeminiClient();
      if (ai) {
        try {
          const aiResponse = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Convert this image request into a clean, safe, family-friendly English visual prompt (max 18 words, no quotes, only visual description): "${rawSubject}"`,
                  },
                ],
              },
            ],
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          const text = aiResponse.text?.trim()?.replace(/["']/g, '');
          if (text && text.length > 3) {
            return res.json({ enhancedPrompt: text });
          }
        } catch {
          // Fallback to local quality tags
        }
      }

      const defaultEnhanced = `${rawSubject}, photorealistic, vibrant colors, cinematic lighting, high detail`;
      res.json({ enhancedPrompt: defaultEnhanced });
    } catch {
      res.json({
        enhancedPrompt: 'futuristic glowing sports car, photorealistic, vibrant colors, cinematic lighting, high detail',
      });
    }
  });

  // Multimodal AI Image Edit Prompt Synthesizer (preserves original subject + applies requested edits)
  app.post('/api/edit-image-prompt', async (req: Request, res: Response) => {
    try {
      const { editInstruction, imageBase64, imageMimeType } = req.body as {
        editInstruction?: string;
        imageBase64?: string;
        imageMimeType?: string;
      };

      const cleanInstruction = (editInstruction || '').trim();
      if (!cleanInstruction) {
        res.status(400).json({ error: 'Edit instruction is required.' });
        return;
      }

      const ai = getGeminiClient();
      const cleanBase64 = (imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
      const normalizedMime = (imageMimeType || 'image/jpeg').trim() || 'image/jpeg';

      if (ai && cleanBase64) {
        const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
        for (const modelName of models) {
          try {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Edit prompt timeout on ${modelName}`)), 12000)
            );
            const imagePart = {
              inlineData: {
                mimeType: normalizedMime,
                data: cleanBase64,
              },
            };
            const textPart = {
              text:
                `Inspect this uploaded image carefully (exact main subject, colors, shapes, pose, clothing, objects, camera angle, and lighting).\n` +
                `Now write ONE cohesive, vivid, family-friendly English image generation prompt (max 50 words, no quotes, no commentary, visual description only) that PRESERVES the original subject and composition while accurately applying this requested edit: "${cleanInstruction}".`,
            };
            const aiResponse = await Promise.race([
              ai.models.generateContent({
                model: modelName,
                contents: { parts: [imagePart, textPart] },
                config: {
                  ...(modelName === 'gemini-4-hydrogen'
                    ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                    : {}),
                },
              }),
              timeoutPromise,
            ]);

            const raw = cleanThoughtAndBrokenText(aiResponse.text?.trim() || '');
            const sanitized = raw.replace(/^["'`]+|["'`]+$/g, '').replace(/[\r\n]+/g, ' ').trim();
            if (sanitized && sanitized.length > 8) {
              res.json({
                editPrompt: `${sanitized}, photorealistic, sharp focus, ultra-detailed, 8k`,
                model: modelName,
              });
              return;
            }
            console.warn(
              '[api/edit-image-prompt] Empty/short output from',
              modelName,
              'finishReason:',
              aiResponse.candidates?.[0]?.finishReason
            );
          } catch (modelErr: unknown) {
            const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
            console.warn('[api/edit-image-prompt] Model failed:', modelName, msg);
          }
        }
      }

      res.json({
        editPrompt: `${cleanInstruction}, preserving original subject and pose, photorealistic, high detail, 8k resolution`,
        model: 'fallback',
      });
    } catch {
      res.status(500).json({ error: 'Failed to synthesize image edit prompt.' });
    }
  });

  // Dynamic Real-Time Question Game Single-MCQ Generator (Gemini AI + Live AI Fallback)
  app.post('/api/question-game', async (req: Request, res: Response) => {
    try {
      const {
        topic,
        questionNumber,
        systemInstruction,
        askedQuestions,
        language,
        variationSeed,
      } = req.body as {
        topic?: string;
        questionNumber?: number;
        systemInstruction?: string;
        askedQuestions?: string[];
        language?: string;
        variationSeed?: number;
      };

      const cleanTopic = (topic || 'General Knowledge').trim();
      const qNum = Number(questionNumber) || 1;
      const seed =
        typeof variationSeed === 'number' && Number.isFinite(variationSeed)
          ? Math.floor(variationSeed)
          : Math.floor(Math.random() * 1_000_000_000);
      const angles = [
        'history, origins & major milestones',
        'records, champions, winners & statistics',
        'rules, mechanics & core concepts',
        'famous personalities, pioneers & legends',
        'surprising facts & memorable events',
        'tricky conceptual challenge',
      ];
      const angle = angles[(qNum + seed) % angles.length];
      const recentAsked = Array.isArray(askedQuestions)
        ? askedQuestions.slice(-30).filter((q) => typeof q === 'string' && q.trim())
        : [];
      const avoid = recentAsked.map((q, i) => `${i + 1}. ${q.trim()}`).join(' | ');
      const targetLang = (language || 'English').trim();

      const userPrompt = [
        `Generate Question #${qNum} strictly about the topic: "${cleanTopic}".`,
        `Language: ${targetLang}. Variation Seed: ${seed}. Focus angle: ${angle}.`,
        `Requirements:`,
        `- Every part (question, all 4 options, explanation) MUST be 100% authentic and directly about "${cleanTopic}".`,
        `- Provide 4 distinct options as an array of strings and correctIndex (integer 0-3).`,
        avoid
          ? `- NEVER repeat, paraphrase, or ask about the same fact as any of these previously asked questions: ${avoid}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const ai = getGeminiClient();
      if (ai) {
        const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
        for (const modelName of models) {
          try {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Question game timeout on ${modelName}`)), 8000)
            );
            const aiResponse = await Promise.race([
              ai.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                config: {
                  systemInstruction: systemInstruction || undefined,
                  seed,
                  ...(modelName === 'gemini-4-hydrogen'
                    ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                    : {}),
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { type: Type.STRING },
                      questionNumber: { type: Type.INTEGER },
                      question: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                    },
                    required: [
                      'topic',
                      'questionNumber',
                      'question',
                      'options',
                      'correctIndex',
                      'explanation',
                    ],
                  },
                },
              }),
              timeoutPromise,
            ]);
            const rawText = cleanThoughtAndBrokenText(aiResponse.text?.trim() || '');
            if (rawText && rawText.includes('{')) {
              try {
                const parsed = JSON.parse(rawText) as {
                  question?: string;
                  options?: unknown;
                };
                const hasOpts =
                  (Array.isArray(parsed.options) && parsed.options.length >= 4) ||
                  (parsed.options &&
                    typeof parsed.options === 'object' &&
                    Object.keys(parsed.options).length >= 4);
                if (parsed.question && hasOpts) {
                  res.json({ text: rawText, model: modelName });
                  return;
                }
              } catch {
                // Fall back to returning tagged/raw text if extractable on client
                if (rawText.includes('"question"') && rawText.includes('"options"')) {
                  res.json({ text: rawText, model: modelName });
                  return;
                }
              }
            }
          } catch {
            // Try next Gemini model
          }
        }
      }

      // Live Zero-Key AI Fallback (Pollinations Text AI) — strictly topic-driven, never static trivia
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        const polyPrompt = `${systemInstruction ? systemInstruction + '\n\n' : ''}${userPrompt}\n\nRespond ONLY with valid JSON: {"topic":"${cleanTopic}","questionNumber":${qNum},"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}`;
        const pollinationsRes = await fetch(
          `https://text.pollinations.ai/${encodeURIComponent(polyPrompt)}?model=openai&seed=${seed}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (pollinationsRes.ok) {
          const publicText = cleanThoughtAndBrokenText((await pollinationsRes.text()) || '');
          if (publicText && publicText.includes('"question"') && publicText.includes('"options"')) {
            res.json({ text: publicText, model: 'pollinations-openai' });
            return;
          }
        }
      } catch {
        // Live fallback unavailable
      }

      res.status(503).json({ error: 'Question game live AI service temporarily unavailable' });
    } catch {
      res.status(500).json({ error: 'Failed to generate question' });
    }
  });

  const imageProxyCache = new Map<string, { buffer: Buffer; contentType: string; ts: number }>();

  // Multi-Engine Server-Side Image Relay & Rate-Limit Recovery Proxy
  app.get('/api/image-proxy', async (req: Request, res: Response) => {
    const rawPrompt = typeof req.query.prompt === 'string' ? req.query.prompt.trim() : '';
    if (!rawPrompt) {
      res.status(400).json({ error: 'Missing prompt query parameter.' });
      return;
    }

    const baseSeed = Number(req.query.seed) || Math.floor(Math.random() * 1_000_000_000);
    const requestedModel =
      typeof req.query.model === 'string' && req.query.model.trim()
        ? req.query.model.trim()
        : 'flux';

    const trimmedPrompt = rawPrompt.slice(0, 260).trim();
    const cacheKey = `${requestedModel}:${baseSeed}:${trimmedPrompt}`;
    const cached = imageProxyCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(cached.buffer);
      return;
    }

    const engines = Array.from(new Set([requestedModel, 'flux', 'kontext', 'turbo', 'zimage']));
    const encodedPrompt = encodeURIComponent(trimmedPrompt);
    const enhanceParam = trimmedPrompt.length <= 60 ? '&enhance=true' : '';

    for (let i = 0; i < engines.length; i++) {
      const model = engines[i];
      const seed = baseSeed + i * 137;
      const upstreamUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${encodeURIComponent(model)}&width=1024&height=1024&seed=${seed}&nologo=true${enhanceParam}&safe=true`;

      for (let retry = 0; retry < 2; retry++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 24000);
          const upstreamRes = await fetch(upstreamUrl, {
            signal: controller.signal,
            headers: {
              Accept: 'image/jpeg,image/webp,image/*,*/*;q=0.8',
            },
          });
          clearTimeout(timeoutId);

          if (upstreamRes.status === 429 && retry === 0) {
            const retryAfterRaw = Number(upstreamRes.headers.get('retry-after') || '0');
            const waitMs =
              Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 && retryAfterRaw <= 26
                ? (retryAfterRaw + 1) * 1000
                : 3000;
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }

          const cacheControl = (upstreamRes.headers.get('cache-control') || '').toLowerCase();
          const contentType = upstreamRes.headers.get('content-type') || '';

          if (
            upstreamRes.ok &&
            contentType.startsWith('image/') &&
            !cacheControl.includes('no-store')
          ) {
            const buffer = Buffer.from(await upstreamRes.arrayBuffer());
            if (buffer.byteLength >= 8192) {
              if (imageProxyCache.size >= 24) {
                const oldestKey = imageProxyCache.keys().next().value;
                if (oldestKey) imageProxyCache.delete(oldestKey);
              }
              imageProxyCache.set(cacheKey, { buffer, contentType, ts: Date.now() });
              res.setHeader('Content-Type', contentType);
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.send(buffer);
              return;
            }
          }
          break;
        } catch {
          break;
        }
      }

      if (i < engines.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    res.status(502).json({ error: 'All image engines are currently busy. Please retry.' });
  });

  const publicPath = path.resolve(__dirname, 'public');
  app.use(express.static(publicPath));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const LIVE_VOICE_MAP: Record<string, string> = {
    Nova: 'Zephyr',
    Orion: 'Charon',
    Echo: 'Puck',
    Lyra: 'Kore',
    Zephyr: 'Zephyr',
    Charon: 'Charon',
    Puck: 'Puck',
    Kore: 'Kore',
    Fenrir: 'Fenrir',
  };

  server.on('upgrade', (req, socket, head) => {
    const reqPath = (req.url || '').split('?')[0];
    if (reqPath === '/api/live' || reqPath === '/live') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  interface LiveSessionHandle {
    sendRealtimeInput: (params: {
      audio?: { data: string; mimeType: string };
      video?: { data: string; mimeType: string };
      text?: string;
    }) => void;
    close: () => void;
  }

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: LiveSessionHandle | null = null;
    let sessionPromise: Promise<LiveSessionHandle | null> | null = null;
    let closed = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (!closed && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const startGeminiLiveSession = (
      systemInstruction?: string,
      voiceProfile?: string
    ) => {
      if (sessionPromise) return sessionPromise;

      const envKey =
        typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY
          ? process.env.GEMINI_API_KEY
          : '';
      if (!envKey || envKey === 'MY_GEMINI_API_KEY') {
        sendJson({
          error:
            'GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.',
        });
        clientWs.close();
        return null;
      }

      const prebuiltVoiceName =
        LIVE_VOICE_MAP[voiceProfile || 'Nova'] || 'Zephyr';

      const connectWithVersion = (apiVersion?: string): Promise<LiveSessionHandle> => {
        const liveAi = new GoogleGenAI({
          apiKey: envKey,
          ...(apiVersion ? { apiVersion } : {}),
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        let sawOpen = false;
        let lastErrMsg = 'Gemini Live connection error';

        return liveAi.live
          .connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: prebuiltVoiceName },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction:
                systemInstruction ||
                'You are AURELION AI, a warm, responsive voice assistant. Reply naturally and concisely.',
            },
            callbacks: {
              onopen: () => {
                sawOpen = true;
                sendJson({ ready: true });
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  sendJson({ inputTranscript: content.inputTranscription.text });
                }
                if (content?.outputTranscription?.text) {
                  sendJson({ outputTranscript: content.outputTranscription.text });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson({ audio: part.inlineData.data });
                  }
                }
                if (content?.interrupted) {
                  sendJson({ interrupted: true });
                }
                if (content?.turnComplete) {
                  sendJson({ turnComplete: true });
                }
              },
              onerror: (err: unknown) => {
                const msg =
                  err instanceof Error
                    ? err.message
                    : err &&
                        typeof err === 'object' &&
                        'message' in err &&
                        typeof (err as { message?: unknown }).message === 'string'
                      ? (err as { message: string }).message
                      : 'Gemini Live connection error';
                lastErrMsg = msg;
                if (sawOpen) {
                  console.warn('[/api/live] active session error:', msg);
                  sendJson({ error: msg });
                }
              },
              onclose: () => {
                if (sawOpen) {
                  sendJson({ closed: true });
                  if (!closed && clientWs.readyState === clientWs.OPEN) {
                    clientWs.close();
                  }
                }
              },
            },
          })
          .then((session) => session as unknown as LiveSessionHandle)
          .catch((err) => {
            const msg =
              err instanceof Error
                ? err.message
                : err &&
                    typeof err === 'object' &&
                    'message' in err &&
                    typeof (err as { message?: unknown }).message === 'string'
                  ? (err as { message: string }).message
                  : lastErrMsg;
            throw new Error(msg);
          });
      };

      sessionPromise = connectWithVersion()
        .catch((err: Error) => {
          console.warn('[/api/live] v1beta attempt failed:', err.message);
          if (err.message.includes('404')) {
            return connectWithVersion('v1alpha');
          }
          throw err;
        })
        .then((session) => {
          liveSession = session;
          if (closed) {
            try {
              session.close();
            } catch {
              // ignore
            }
          }
          return liveSession;
        })
        .catch((err: unknown) => {
          const msg =
            err instanceof Error
              ? err.message
              : 'Failed to open Gemini Live session';
          console.warn('[/api/live] connect failed:', msg);
          sendJson({ error: msg });
          if (!closed && clientWs.readyState === clientWs.OPEN) {
            clientWs.close();
          }
          return null;
        });

      return sessionPromise;
    };

    clientWs.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          systemInstruction?: string;
          voiceName?: string;
          audio?: string;
          video?: string;
          text?: string;
        };

        if (msg.type === 'start') {
          startGeminiLiveSession(msg.systemInstruction, msg.voiceName);
          return;
        }

        const pending = sessionPromise || startGeminiLiveSession();
        if (!pending) return;

        pending.then((session) => {
          if (!session || closed) return;
          if (msg.audio) {
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (msg.video) {
            session.sendRealtimeInput({
              video: { data: msg.video, mimeType: 'image/jpeg' },
            });
          } else if (msg.text) {
            session.sendRealtimeInput({ text: msg.text });
          }
        });
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on('close', () => {
      closed = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore
        }
        liveSession = null;
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AURA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AURA server:', err);
  process.exit(1);
});
