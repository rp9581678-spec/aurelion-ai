import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Gamepad2,
  Globe,
  Maximize2,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Square,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  buildImageEngineCandidateUrls,
  CANVAS_PRESETS,
  type CanvasFilterPresetId,
  computeRotatedCanvasDimensions,
  getCanvasPresetFilter,
  getQuestionGameFeedback,
  isSuspectPlaceholderImage,
  isThreeJsOr3DCode,
  isWebViewEnvironment,
  parseMessageSegments,
  sanitizeUserHTML,
} from '../utils/auraLogic';
import type { ChatMessage, QuestionGameData } from '../types/aura';

interface MessageBubbleProps {
  message: ChatMessage;
  isSpeakingThis: boolean;
  onSpeakToggle: (message: ChatMessage) => void;
  onRegenerate?: (messageId: string) => void;
  onRunCode: (language: string, code: string) => void;
  onAnswerQuestionGame?: (
    messageId: string,
    selectedIndex: number,
    gameData: QuestionGameData
  ) => void;
  onStopQuestionGame?: () => void;
  isLatestQuestionGameCard?: boolean;
}

function renderInlineFormatting(line: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s]+)/g;
  const parts = line.split(tokenRegex);

  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={key}
          className="font-mono rounded bg-white/10 px-1.5 py-0.5 text-[12.5px] text-[#00F0FF]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part);
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[#00F0FF] underline decoration-[#00F0FF]/40 underline-offset-2 hover:text-[#67F7FF]"
        >
          <span>{linkMatch[1]}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[#00F0FF] underline decoration-[#00F0FF]/40 underline-offset-2 hover:text-[#67F7FF]"
        >
          <span>{part}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

function FormattedProse({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyBase: string) => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`${keyBase}-ul`} className="my-1.5 list-disc space-y-0.5 pl-4 text-[#E2E8F0]">
        {listItems.map((item, idx) => (
          <li key={`${keyBase}-li-${idx}`}>{renderInlineFormatting(item, `${keyBase}-li-${idx}`)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList(`line-${idx}`);
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ''));
      return;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+\.\s+/, ''));
      return;
    }

    flushList(`line-${idx}`);

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h4-${idx}`} className="font-display mt-2 mb-0.5 text-xs sm:text-[13px] font-semibold text-white">
          {renderInlineFormatting(trimmed.slice(4), `h4-${idx}`)}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const textContent = trimmed.replace(/^#{1,3}\s+/, '');
      elements.push(
        <h3 key={`h3-${idx}`} className="font-display mt-2 mb-1 text-xs sm:text-sm font-semibold text-white">
          {renderInlineFormatting(textContent, `h3-${idx}`)}
        </h3>
      );
      return;
    }

    elements.push(
      <p key={`p-${idx}`} className="my-1 leading-snug text-[#E2E8F0]">
        {renderInlineFormatting(trimmed, `p-${idx}`)}
      </p>
    );
  });

  flushList('end');
  return <div className="space-y-0.5 text-xs sm:text-[13px]">{elements}</div>;
}

function InteractiveImageCard({ url, alt }: { url: string; alt: string }) {
  const seedMatch = /[?&]seed=(\d+)/.exec(url);
  const parsedSeed = seedMatch ? Number(seedMatch[1]) : undefined;
  const engineCandidates = useMemo(() => {
    const raw = buildImageEngineCandidateUrls(alt, parsedSeed, url);
    const proxy = raw.filter((c) => c.engine === 'server-proxy');
    const direct = raw.filter((c) => c.engine !== 'server-proxy');
    return [...proxy, ...direct];
  }, [alt, parsedSeed, url]);

  const [attemptIdx, setAttemptIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);

  // Full-Screen Tap-to-Zoom & HTML5 Canvas Quick-Edit State
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<CanvasFilterPresetId>('original');
  const [rotationDeg, setRotationDeg] = useState(0);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasDims, setCanvasDims] = useState<{ width: number; height: number } | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchDistanceRef = useRef<number | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceBitmapRef = useRef<HTMLImageElement | null>(null);

  const activeCandidate = engineCandidates[Math.min(attemptIdx, engineCandidates.length - 1)];
  const currentUrl = activeCandidate?.url || url;
  const activeCssFilter = getCanvasPresetFilter(activePreset);
  const hasCanvasEdits = activePreset !== 'original' || rotationDeg % 360 !== 0;

  useEffect(() => {
    setAttemptIdx(0);
    setLoaded(false);
    setHasError(false);
  }, [url]);

  const advanceEngine = () => {
    setLoaded(false);
    setAttemptIdx((prev) => {
      if (prev + 1 < engineCandidates.length) {
        return prev + 1;
      }
      setHasError(true);
      return prev;
    });
  };

  // Automatic timeout watchdog so slow/rate-limited engines switch seamlessly
  useEffect(() => {
    if (loaded || hasError) return;
    const timer = window.setTimeout(() => {
      advanceEngine();
    }, 28000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptIdx, loaded, hasError, currentUrl]);

  const retryDelayTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (retryDelayTimerRef.current !== null) {
        window.clearTimeout(retryDelayTimerRef.current);
      }
    };
  }, []);

  const handleImageError = () => {
    if (retryDelayTimerRef.current !== null) {
      window.clearTimeout(retryDelayTimerRef.current);
    }
    retryDelayTimerRef.current = window.setTimeout(() => {
      retryDelayTimerRef.current = null;
      advanceEngine();
    }, 800);
  };

  const loadCorsSafeImageElement = async (): Promise<HTMLImageElement> => {
    const proxyCandidate = engineCandidates.find((c) => c.engine === 'server-proxy');
    const urlsToTry = Array.from(
      new Set(
        [currentUrl, proxyCandidate?.url].filter(
          (u): u is string => Boolean(u && u.trim())
        )
      )
    );

    for (const candidateUrl of urlsToTry) {
      try {
        const res = await fetch(candidateUrl, { mode: 'cors', cache: 'force-cache' });
        if (!res.ok) continue;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Image decode failed'));
          el.src = objectUrl;
        });
        // Revoke only if replaced later; keep lightweight or revoke after draw when offscreen
        elCleanupUrlsRef.current.push(objectUrl);
        return img;
      } catch {
        // Try next candidate (server-proxy is same-origin so CORS never fails)
      }
    }
    throw new Error('Unable to load image for canvas processing');
  };

  const elCleanupUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      elCleanupUrlsRef.current.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
      elCleanupUrlsRef.current = [];
    };
  }, []);

  // Load CORS-safe image element when zoom modal opens with Quick Edit / edits active
  useEffect(() => {
    if (!zoomOpen || (!quickEditOpen && !hasCanvasEdits)) {
      return;
    }

    let cancelled = false;
    setCanvasReady(false);

    const drawToPreviewCanvas = (imgEl: HTMLImageElement) => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const naturalW = imgEl.naturalWidth || imgEl.width || 1024;
      const naturalH = imgEl.naturalHeight || imgEl.height || 1024;
      const dims = computeRotatedCanvasDimensions(naturalW, naturalH, rotationDeg);
      canvas.width = dims.width;
      canvas.height = dims.height;
      setCanvasDims({ width: dims.width, height: dims.height });

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, dims.width, dims.height);
      ctx.save();
      ctx.filter = activeCssFilter;
      ctx.translate(dims.width / 2, dims.height / 2);
      ctx.rotate((dims.normalizedDeg * Math.PI) / 180);
      ctx.drawImage(imgEl, -naturalW / 2, -naturalH / 2, naturalW, naturalH);
      ctx.restore();
      setCanvasReady(true);
    };

    if (sourceBitmapRef.current && sourceBitmapRef.current.complete && sourceBitmapRef.current.naturalWidth > 0) {
      drawToPreviewCanvas(sourceBitmapRef.current);
      return;
    }

    loadCorsSafeImageElement()
      .then((imgEl) => {
        if (cancelled) return;
        sourceBitmapRef.current = imgEl;
        drawToPreviewCanvas(imgEl);
      })
      .catch(() => {
        if (!cancelled) setCanvasReady(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOpen, quickEditOpen, activePreset, rotationDeg, currentUrl]);

  useEffect(() => {
    sourceBitmapRef.current = null;
    setCanvasReady(false);
  }, [currentUrl]);

  const renderEditedCanvasBlob = async (): Promise<Blob> => {
    const imgEl = sourceBitmapRef.current || (await loadCorsSafeImageElement());
    sourceBitmapRef.current = imgEl;
    const naturalW = imgEl.naturalWidth || imgEl.width || 1024;
    const naturalH = imgEl.naturalHeight || imgEl.height || 1024;
    const dims = computeRotatedCanvasDimensions(naturalW, naturalH, rotationDeg);

    const offscreen = document.createElement('canvas');
    offscreen.width = dims.width;
    offscreen.height = dims.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.save();
    ctx.filter = activeCssFilter;
    ctx.translate(dims.width / 2, dims.height / 2);
    ctx.rotate((dims.normalizedDeg * Math.PI) / 180);
    ctx.drawImage(imgEl, -naturalW / 2, -naturalH / 2, naturalW, naturalH);
    ctx.restore();

    return new Promise<Blob>((resolve, reject) => {
      offscreen.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            try {
              const dataUrl = offscreen.toDataURL('image/png');
              const byteStr = atob(dataUrl.split(',')[1]);
              const ab = new ArrayBuffer(byteStr.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
              resolve(new Blob([ab], { type: 'image/png' }));
            } catch (err) {
              reject(err);
            }
          }
        },
        'image/png',
        0.95
      );
    });
  };

  const triggerBlobDownload = async (blob: Blob, fileName: string): Promise<void> => {
    const isWebView =
      typeof navigator !== 'undefined' && isWebViewEnvironment(navigator.userAgent);
    if (isWebView && typeof FileReader !== 'undefined') {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('FileReader failed'));
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 3500);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    const isEdited = zoomOpen && hasCanvasEdits;
    const fileName = isEdited
      ? `AURELION_AI_EDIT_${activePreset}_${Date.now()}.png`
      : `AURELION_AI_${Date.now()}.jpg`;

    try {
      if (isEdited) {
        const editedBlob = await renderEditedCanvasBlob();
        await triggerBlobDownload(editedBlob, fileName);
      } else {
        const fetchTarget = currentUrl;
        let response = await fetch(fetchTarget, { mode: 'cors', cache: 'force-cache' });
        if (!response.ok) {
          const proxyCandidate = engineCandidates.find((c) => c.engine === 'server-proxy');
          if (proxyCandidate && fetchTarget !== proxyCandidate.url) {
            response = await fetch(proxyCandidate.url);
          }
        }
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();
        await triggerBlobDownload(blob, fileName);
      }
      setDownloadDone(true);
      window.setTimeout(() => setDownloadDone(false), 2200);
    } catch {
      try {
        const a = document.createElement('a');
        a.href = currentUrl;
        a.download = fileName;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {
        // ignore
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const resetZoomView = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setActivePreset('original');
    setRotationDeg(0);
  };

  const adjustZoom = (delta: number) => {
    setZoomScale((prev) => {
      const next = Math.max(1, Math.min(4, Number((prev + delta).toFixed(2))));
      if (next === 1) {
        setPanOffset({ x: 0, y: 0 });
      }
      return next;
    });
  };

  return (
    <>
      <div className="mt-1.5 max-w-[330px] overflow-hidden rounded-xl border border-[#00F0FF]/40 bg-[#0B101B] shadow-lg">
        <div
          data-testid="tappable-ai-image"
          role="button"
          tabIndex={0}
          aria-label="Tap image to open full-screen zoom viewer"
          onClick={() => {
            resetZoomView();
            setZoomOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              resetZoomView();
              setZoomOpen(true);
            }
          }}
          className="group relative min-h-[190px] w-full cursor-zoom-in overflow-hidden bg-[#0D1322]"
        >
          {!loaded && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#090E1C] p-4 text-center">
              <div className="relative flex h-7 w-7 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00F0FF] opacity-35" />
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00F0FF] border-t-transparent" />
              </div>
              <p className="font-mono text-[11px] font-medium text-[#00F0FF] animate-pulse">
                🎨 Rendering HD Studio Visual...
              </p>
              <span className="text-[10px] text-[#94A3B8]">
                {attemptIdx > 0
                  ? `Switching to ${activeCandidate?.label || 'backup engine'} (${attemptIdx + 1}/${engineCandidates.length})...`
                  : 'AURELION AI Flux Engine • 1024x1024 HD'}
              </span>
            </div>
          )}

          <img
            src={currentUrl}
            alt={alt}
            loading="lazy"
            onLoad={(e) => {
              const imgEl = e.currentTarget;
              if (isSuspectPlaceholderImage(imgEl.naturalWidth, imgEl.naturalHeight)) {
                advanceEngine();
                return;
              }
              setLoaded(true);
            }}
            onError={handleImageError}
            className={`block w-full object-cover transition-all duration-300 group-hover:scale-[1.02] ${
              loaded ? 'opacity-100 min-h-[190px]' : 'opacity-0 h-0'
            }`}
          />

          {loaded && !hasError && (
            <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded-md border border-white/20 bg-black/65 px-2 py-0.5 text-[10px] font-medium text-[#00F0FF] backdrop-blur-sm">
              <Maximize2 className="h-2.5 w-2.5" />
              <span>Tap to Zoom</span>
            </div>
          )}

          {hasError && (
            <div className="flex min-h-[150px] flex-col items-center justify-center p-3 text-center text-[11px] text-[#94A3B8]">
              <p className="font-medium text-amber-400">Image servers are temporarily busy.</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHasError(false);
                    setLoaded(false);
                    setAttemptIdx(0);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-[#00F0FF]/40 bg-[#00F0FF]/15 px-2.5 py-1 text-[10.5px] font-semibold text-[#00F0FF] hover:bg-[#00F0FF]/25 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Retry All Engines</span>
                </button>
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[#00F0FF] underline underline-offset-2"
                >
                  <span>Direct Link</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-[#070A12] px-3 py-2 text-[11px] text-[#94A3B8]">
          <div className="flex items-center gap-1.5 truncate pr-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
            <span className="truncate font-medium text-white">{alt || 'AURELION HD Visual'}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-testid="card-zoom-btn"
              onClick={() => {
                resetZoomView();
                setZoomOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10.5px] font-medium text-[#E2E8F0] transition-colors hover:border-[#00F0FF]/40 hover:text-[#00F0FF]"
            >
              <ZoomIn className="h-3 w-3" />
              <span>Zoom</span>
            </button>
            <button
              type="button"
              data-testid="card-download-btn"
              onClick={handleDownload}
              disabled={isDownloading}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#00F0FF]/40 bg-[#00F0FF]/15 px-2.5 py-0.5 font-semibold text-[#00F0FF] transition-all hover:bg-[#00F0FF]/25 active:scale-95 shadow-sm disabled:opacity-50"
            >
              {isDownloading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#00F0FF] border-t-transparent" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              <span>{isDownloading ? 'Saving...' : downloadDone ? 'Saved ✓' : 'Download'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Full-Screen Tap-to-Zoom Image Viewer Modal rendered via Portal to document.body */}
      {zoomOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Full-Screen Image Zoom Viewer"
            data-testid="image-zoom-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setZoomOpen(false);
            }}
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col bg-[#04060D]/[0.97]"
          >
            {/* Top Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#080C16]/95 px-3 py-2.5 sm:px-5">
              <div className="flex items-center gap-2 truncate">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]" />
                <span className="max-w-[200px] sm:max-w-md truncate font-display text-xs sm:text-sm font-semibold text-white">
                  {alt || 'AURELION AI HD Image Viewer'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  data-testid="zoom-out-btn"
                  onClick={() => adjustZoom(-0.5)}
                  disabled={zoomScale <= 1}
                  aria-label="Zoom out"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white transition-colors hover:border-[#00F0FF]/50 disabled:opacity-40 cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>

                <span
                  data-testid="zoom-scale-readout"
                  className="min-w-[48px] text-center font-mono text-xs font-semibold text-[#00F0FF]"
                >
                  {Math.round(zoomScale * 100)}%
                </span>

                <button
                  type="button"
                  data-testid="zoom-in-btn"
                  onClick={() => adjustZoom(0.5)}
                  disabled={zoomScale >= 4}
                  aria-label="Zoom in"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white transition-colors hover:border-[#00F0FF]/50 disabled:opacity-40 cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  data-testid="zoom-reset-btn"
                  onClick={resetZoomView}
                  aria-label="Reset zoom"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-[#CBD5E1] transition-colors hover:text-white cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Reset</span>
                </button>

                <button
                  type="button"
                  data-testid="zoom-download-btn"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#00F0FF]/45 bg-[#00F0FF]/20 px-3 text-xs font-semibold text-[#00F0FF] transition-all hover:bg-[#00F0FF]/30 active:scale-95 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{isDownloading ? 'Saving...' : downloadDone ? 'Saved ✓' : 'Download'}</span>
                </button>

                <button
                  type="button"
                  data-testid="zoom-close-btn"
                  onClick={() => setZoomOpen(false)}
                  aria-label="Close image viewer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/20 text-red-300 transition-colors hover:bg-red-500/30 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Interactive Pinch / Drag / Double-Tap Zoom Stage */}
            <div
              className="relative flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-6 select-none"
              style={{ touchAction: 'none' }}
              onWheel={(e) => {
                e.preventDefault();
                adjustZoom(e.deltaY < 0 ? 0.25 : -0.25);
              }}
              onDoubleClick={() => {
                if (zoomScale > 1) {
                  resetZoomView();
                } else {
                  setZoomScale(2.25);
                }
              }}
              onMouseDown={(e) => {
                if (zoomScale <= 1) return;
                isDraggingRef.current = true;
                dragStartRef.current = {
                  x: e.clientX - panOffset.x,
                  y: e.clientY - panOffset.y,
                };
              }}
              onMouseMove={(e) => {
                if (!isDraggingRef.current || zoomScale <= 1) return;
                setPanOffset({
                  x: e.clientX - dragStartRef.current.x,
                  y: e.clientY - dragStartRef.current.y,
                });
              }}
              onMouseUp={() => {
                isDraggingRef.current = false;
              }}
              onMouseLeave={() => {
                isDraggingRef.current = false;
              }}
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  pinchDistanceRef.current = Math.hypot(dx, dy);
                } else if (e.touches.length === 1 && zoomScale > 1) {
                  isDraggingRef.current = true;
                  dragStartRef.current = {
                    x: e.touches[0].clientX - panOffset.x,
                    y: e.touches[0].clientY - panOffset.y,
                  };
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 2 && pinchDistanceRef.current !== null) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  const dist = Math.hypot(dx, dy);
                  const delta = (dist - pinchDistanceRef.current) / 140;
                  pinchDistanceRef.current = dist;
                  adjustZoom(delta);
                } else if (e.touches.length === 1 && isDraggingRef.current && zoomScale > 1) {
                  setPanOffset({
                    x: e.touches[0].clientX - dragStartRef.current.x,
                    y: e.touches[0].clientY - dragStartRef.current.y,
                  });
                }
              }}
              onTouchEnd={() => {
                isDraggingRef.current = false;
                pinchDistanceRef.current = null;
              }}
            >
              {(quickEditOpen || hasCanvasEdits) && (
                <canvas
                  ref={previewCanvasRef}
                  data-testid="quick-edit-canvas"
                  data-preset={activePreset}
                  data-rotation={rotationDeg % 360}
                  style={{
                    aspectRatio: canvasDims ? `${canvasDims.width} / ${canvasDims.height}` : undefined,
                    transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                    transition: isDraggingRef.current ? 'none' : 'transform 150ms ease-out',
                  }}
                  className={`${
                    canvasReady ? 'block' : 'hidden'
                  } h-auto w-auto max-h-[72dvh] max-w-[94vw] rounded-lg shadow-2xl ${
                    zoomScale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
                  }`}
                />
              )}
              {(!canvasReady || (!quickEditOpen && !hasCanvasEdits)) && (
                <img
                  src={currentUrl}
                  alt={alt}
                  draggable={false}
                  style={{
                    filter: activeCssFilter,
                    transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale}) rotate(${rotationDeg}deg)`,
                    transition: isDraggingRef.current ? 'none' : 'transform 150ms ease-out',
                  }}
                  className={`max-h-[74dvh] max-w-[94vw] rounded-lg object-contain shadow-2xl ${
                    zoomScale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
                  }`}
                />
              )}
            </div>

            {/* Lightweight HTML5 Canvas Quick-Edit Studio Bar */}
            <div className="border-t border-white/10 bg-[#080C16]/95 px-3 py-2 sm:px-5">
              {quickEditOpen && (
                <div
                  data-testid="quick-edit-toolbar"
                  className="mb-2 flex flex-wrap items-center gap-1.5"
                >
                  {CANVAS_PRESETS.map((preset) => {
                    const isSelected = activePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        data-testid={`canvas-preset-${preset.id}`}
                        aria-pressed={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePreset(preset.id);
                        }}
                        className={`shrink-0 rounded-lg border px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#00F0FF] bg-[#00F0FF]/20 text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                            : 'border-white/15 bg-white/5 text-[#CBD5E1] hover:border-white/30 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    data-testid="canvas-rotate-90-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRotationDeg((prev) => (prev + 90) % 360);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-400/35 bg-amber-500/15 px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-500/25 cursor-pointer"
                  >
                    <RotateCw className="h-3 w-3" />
                    <span>Rotate 90°</span>
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
                <button
                  type="button"
                  data-testid="quick-edit-toggle"
                  aria-expanded={quickEditOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickEditOpen((prev) => !prev);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                    quickEditOpen || hasCanvasEdits
                      ? 'border-[#00F0FF]/60 bg-[#00F0FF]/20 text-[#00F0FF]'
                      : 'border-white/15 bg-white/5 text-[#E2E8F0] hover:border-[#00F0FF]/40 hover:text-[#00F0FF]'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Quick Edit</span>
                  {hasCanvasEdits && (
                    <span className="font-mono text-[10px] text-emerald-300">
                      • {CANVAS_PRESETS.find((p) => p.id === activePreset)?.label}
                      {rotationDeg % 360 !== 0 ? ` ${rotationDeg}°` : ''}
                    </span>
                  )}
                </button>

                <span className="hidden sm:inline text-center">
                  Pinch or use <strong className="text-[#00F0FF]">+ / -</strong> buttons to zoom • Drag to pan • Double-tap to toggle 225% zoom
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isSpeakingThis,
  onSpeakToggle,
  onRegenerate,
  onRunCode,
  onAnswerQuestionGame,
  onStopQuestionGame,
  isLatestQuestionGameCard,
}) => {
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const isUser = message.role === 'user';
  const segments = parseMessageSegments(message.content);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMsg(true);
      window.setTimeout(() => setCopiedMsg(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleCopyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeIdx(index);
      window.setTimeout(() => setCopiedCodeIdx(null), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-start" data-testid="message-user">
        <div className="max-w-[92%] rounded-xl border border-[#00F0FF]/35 bg-gradient-to-br from-[#00F0FF]/15 to-[#8B5CF6]/20 px-3 py-2 text-xs sm:text-[13px] text-[#F8FAFC] shadow-sm sm:max-w-[82%]">
          <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#00F0FF]/90">
            <span>You</span>
          </div>
          {message.attachment && (
            <div className="mb-1.5 rounded-lg border border-white/10 bg-[#07090E]/70 p-1.5">
              {message.attachment.previewUrl ? (
                <img
                  src={message.attachment.previewUrl}
                  alt={message.attachment.name}
                  className="max-h-36 rounded-md object-contain"
                />
              ) : (
                <span className="font-mono text-[11px] text-[#00F0FF]">
                  Attached: {message.attachment.name}
                </span>
              )}
            </div>
          )}
          <p className="whitespace-pre-wrap leading-snug">{sanitizeUserHTML(message.content)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start" data-testid="message-assistant">
      <div
        className={`w-full max-w-[96%] rounded-xl border px-3 py-2.5 sm:max-w-[88%] ${
          message.error
            ? 'border-red-500/35 bg-red-950/25'
            : 'border-white/10 bg-[#0F1420]/90 backdrop-blur-md'
        }`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
          <div className="flex items-center gap-1.5">
            <span className="font-display font-semibold tracking-wider text-[#00F0FF]">
              AURELION AI
            </span>
            {message.usedWebSearch && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                <Globe className="h-2.5 w-2.5" />
                Live Web
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] tabular-nums text-[#64748B]">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {!message.questionGame && (
          <div className="space-y-2">
            {segments.map((seg, idx) => {
            if (seg.type === 'text') {
              return <FormattedProse key={idx} text={seg.content} />;
            }

            if (seg.type === 'image') {
              return <InteractiveImageCard key={idx} url={seg.url} alt={seg.alt} />;
            }

            const is3DBlock = isThreeJsOr3DCode(seg.language, seg.code);

            return (
              <div
                key={idx}
                className="overflow-hidden rounded-lg border border-[#00F0FF]/25 bg-[#05070C] shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/10 bg-[#0D121D] px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#00F0FF]">
                      {seg.language || 'code'}
                    </span>
                    {is3DBlock && (
                      <span className="rounded bg-[#8B5CF6]/25 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[#C4B5FD]">
                        3D WebGL
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCode(seg.code, idx);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-[10.5px] font-medium text-[#CBD5E1] transition-colors hover:border-[#00F0FF]/40 hover:text-[#00F0FF] cursor-pointer"
                    >
                      {copiedCodeIdx === idx ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    {seg.isRunnableWeb && (
                      <button
                        type="button"
                        data-testid="run-code-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRunCode(seg.language, seg.code);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-emerald-400/50 bg-gradient-to-r from-emerald-500/25 to-[#00F0FF]/25 px-2.5 py-1 text-[10.5px] font-bold text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.2)] transition-all hover:from-emerald-500/40 hover:to-[#00F0FF]/40 hover:text-white active:scale-95 cursor-pointer"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>{is3DBlock ? 'Run 3D Live' : 'Run'}</span>
                      </button>
                    )}
                  </div>
                </div>
                <pre
                  data-aura-runner-attached="1"
                  className="font-mono max-h-[320px] overflow-x-auto overflow-y-auto p-2.5 text-[11.5px] leading-relaxed text-[#E2E8F0]"
                >
                  <code>{seg.code}</code>
                </pre>
              </div>
            );
          })}
          </div>
        )}

        {message.quizData && <InteractiveQuizWidget quizData={message.quizData} />}

        {message.questionGame && (
          <InteractiveQuestionGameCard
            messageId={message.id}
            gameData={message.questionGame}
            persistedSelectedIndex={message.gameSelectedIndex}
            language={message.gameLanguage || message.questionGame.language || 'auto'}
            onSelectOption={onAnswerQuestionGame}
            onStopGame={onStopQuestionGame}
            showStopButton={Boolean(isLatestQuestionGameCard)}
          />
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 border-t border-white/10 pt-1.5">
            <p className="mb-1 text-[10px] font-medium text-[#94A3B8]">
              Verified Web Sources
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {message.sources.map((src, i) => (
                <a
                  key={`${src.uri}-${i}`}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[220px] items-center gap-1 truncate text-[11px] text-[#00F0FF] hover:underline"
                >
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{src.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2.5 border-t border-white/10 pt-1.5">
          <button
            type="button"
            onClick={() => onSpeakToggle(message)}
            className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${
              isSpeakingThis ? 'text-[#00F0FF]' : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            {isSpeakingThis ? (
              <>
                <Square className="h-3 w-3" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Volume2 className="h-3 w-3" />
                <span>Listen</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyMessage}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
          >
            {copiedMsg ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>

          {onRegenerate && (
            <button
              type="button"
              onClick={() => onRegenerate(message.id)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Regenerate</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function InteractiveQuizWidget({ quizData }: { quizData: import('../types/aura').QuizItem[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [showScoreCard, setShowScoreCard] = useState(false);

  const currentQ = quizData[currentIndex];
  const selectedOption = selectedAnswers[currentIndex];
  const isAnswered = selectedOption !== undefined;

  const handleSelectOption = (optIdx: number) => {
    if (isAnswered) return;
    setSelectedAnswers({ ...selectedAnswers, [currentIndex]: optIdx });

    const isCorrect = optIdx === currentQ.answer;
    const boostText = isCorrect ? `Quiz Correct: ${currentQ.q} • Mastery Boost` : `Quiz Answered: ${currentQ.q}`;
    (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat?.(boostText);
  };

  const correctCount = Object.entries(selectedAnswers).filter(
    ([qIdx, optIdx]) => quizData[Number(qIdx)]?.answer === optIdx
  ).length;

  const totalAnswered = Object.keys(selectedAnswers).length;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-[#0F172A] to-[#070A12] p-4 text-left text-white shadow-xl">
      <div className="flex items-center justify-between border-b border-emerald-500/25 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs">🎯</span>
          <div>
            <p className="font-semibold text-sm text-emerald-300">1-Tap Interactive Quiz</p>
            <p className="text-[11px] text-[#94A3B8]">
              {showScoreCard ? 'Quiz Completed' : `Question ${currentIndex + 1} of ${quizData.length}`}
            </p>
          </div>
        </div>
        {!showScoreCard && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
            {Math.round((totalAnswered / quizData.length) * 100)}% Done
          </span>
        )}
      </div>

      {!showScoreCard && currentQ ? (
        <div>
          <p className="text-sm font-medium leading-snug text-white mb-3.5">
            {currentQ.q}
          </p>
          <div className="space-y-2 mb-3.5">
            {currentQ.options.map((opt, optIdx) => {
              const isSelected = selectedOption === optIdx;
              const isCorrectOpt = optIdx === currentQ.answer;
              let btnStyle = 'border-white/10 bg-white/[0.04] text-[#E2E8F0] hover:bg-emerald-500/10 hover:border-emerald-500/40';
              if (isAnswered) {
                if (isCorrectOpt) {
                  btnStyle = 'border-emerald-500 bg-emerald-500/25 text-emerald-200 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.3)]';
                } else if (isSelected && !isCorrectOpt) {
                  btnStyle = 'border-red-500 bg-red-500/25 text-red-200';
                } else {
                  btnStyle = 'border-white/5 bg-white/[0.02] text-[#94A3B8] opacity-60';
                }
              }

              return (
                <button
                  key={opt}
                  type="button"
                  disabled={isAnswered}
                  onClick={() => handleSelectOption(optIdx)}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-xs transition-all flex items-center justify-between ${btnStyle}`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/10 font-mono text-[10px] text-emerald-400">
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span className="truncate">{opt}</span>
                  </div>
                  {isAnswered && isCorrectOpt && <span className="text-emerald-400 text-xs font-bold">✓</span>}
                  {isAnswered && isSelected && !isCorrectOpt && <span className="text-red-400 text-xs font-bold">✕</span>}
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 mb-3">
              <p className="font-semibold mb-0.5 text-emerald-300">💡 Explanation / Tip:</p>
              <p className="text-[11.5px] leading-relaxed text-[#E2E8F0]">{currentQ.tip}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#94A3B8]">
              Score so far: <strong className="text-emerald-400">{correctCount}</strong> / {totalAnswered}
            </span>
            {currentIndex < quizData.length - 1 ? (
              <button
                type="button"
                disabled={!isAnswered}
                onClick={() => setCurrentIndex(currentIndex + 1)}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  isAnswered
                    ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 cursor-pointer'
                    : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}
              >
                Next Question →
              </button>
            ) : (
              <button
                type="button"
                disabled={!isAnswered}
                onClick={() => setShowScoreCard(true)}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  isAnswered
                    ? 'bg-gradient-to-r from-emerald-500 to-[#00F0FF] text-black hover:opacity-90 shadow-lg shadow-emerald-500/30 cursor-pointer'
                    : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}
              >
                🎯 View Final Scorecard
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="py-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-2xl font-bold mb-3 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            🏆
          </div>
          <h4 className="font-display text-lg font-bold text-white mb-1">
            🎯 Final Score: {correctCount} / {quizData.length} • {Math.round((correctCount / quizData.length) * 100)}% Mastery
          </h4>
          <p className="text-xs text-emerald-300 font-semibold mb-4">
            3D Study Graph Mastery &amp; Target Percentage Boosted Live!
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedAnswers({});
                setCurrentIndex(0);
                setShowScoreCard(false);
              }}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/30 hover:text-white"
            >
              🔄 Retake Quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InteractiveQuestionGameCard({
  messageId,
  gameData,
  persistedSelectedIndex,
  language,
  onSelectOption,
  onStopGame,
  showStopButton,
}: {
  messageId: string;
  gameData: QuestionGameData;
  persistedSelectedIndex?: number;
  language: string;
  onSelectOption?: (
    messageId: string,
    selectedIndex: number,
    gameData: QuestionGameData
  ) => void;
  onStopGame?: () => void;
  showStopButton?: boolean;
}) {
  const [localSelected, setLocalSelected] = useState<number | undefined>(
    persistedSelectedIndex
  );

  const effectiveSelected =
    typeof persistedSelectedIndex === 'number' ? persistedSelectedIndex : localSelected;
  const isAnswered = typeof effectiveSelected === 'number';
  const isCorrect = isAnswered && effectiveSelected === gameData.correctIndex;

  const handleTapOption = (optIdx: number) => {
    if (isAnswered) return;
    setLocalSelected(optIdx);
    onSelectOption?.(messageId, optIdx, gameData);
  };

  return (
    <div
      data-testid="question-game-card"
      className="mt-2.5 overflow-hidden rounded-2xl border border-[#00F0FF]/45 bg-gradient-to-b from-[#0D1628] via-[#0A101E] to-[#060911] p-3.5 sm:p-4 text-left text-white shadow-[0_8px_28px_rgba(0,240,255,0.12)]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#00F0FF]/25 to-[#8B5CF6]/30 text-[#00F0FF] border border-[#00F0FF]/35">
            <Gamepad2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xs sm:text-[13px] font-bold tracking-wide text-[#00F0FF] truncate">
              Question Games • {gameData.topic}
            </p>
            <p className="font-mono text-[10px] text-[#94A3B8]">
              Question #{gameData.questionNumber}
            </p>
          </div>
        </div>

        {showStopButton && onStopGame && (
          <button
            type="button"
            data-testid="question-game-stop-btn"
            onClick={onStopGame}
            className="rounded-lg border border-red-400/35 bg-red-500/15 px-2 py-1 text-[10px] font-semibold text-red-200 transition-colors hover:bg-red-500/25 cursor-pointer"
          >
            Stop Game
          </button>
        )}
      </div>

      <p
        data-testid="question-game-question"
        className="mb-3 text-xs sm:text-[13.5px] font-semibold leading-relaxed text-white"
      >
        {gameData.question}
      </p>

      <div className="space-y-2">
        {gameData.options.map((optionText, optIdx) => {
          const isSelected = effectiveSelected === optIdx;
          const isRightOption = optIdx === gameData.correctIndex;
          const letter = String.fromCharCode(65 + optIdx);

          let btnClass =
            'border-white/15 bg-white/[0.04] text-[#E2E8F0] hover:border-[#00F0FF]/50 hover:bg-[#00F0FF]/10 active:scale-[0.99] cursor-pointer';
          if (isAnswered) {
            if (isRightOption) {
              btnClass =
                'border-emerald-400 bg-emerald-500/25 text-emerald-100 font-semibold shadow-[0_0_14px_rgba(16,185,129,0.28)] cursor-default';
            } else if (isSelected && !isRightOption) {
              btnClass =
                'border-red-400 bg-red-500/25 text-red-100 font-semibold shadow-[0_0_14px_rgba(239,68,68,0.24)] cursor-default';
            } else {
              btnClass =
                'border-white/5 bg-white/[0.02] text-[#64748B] opacity-55 cursor-default';
            }
          }

          return (
            <button
              key={`${messageId}-opt-${optIdx}`}
              type="button"
              data-testid={`question-game-option-${letter}`}
              disabled={isAnswered}
              onClick={() => handleTapOption(optIdx)}
              style={{ touchAction: 'manipulation' }}
              className={`flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left text-xs sm:text-[12.5px] transition-all ${btnClass}`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/10 font-mono text-[10.5px] font-bold text-[#00F0FF]">
                  {letter}
                </span>
                <span className="leading-snug break-words">{optionText}</span>
              </div>
              {isAnswered && isRightOption && (
                <span className="shrink-0 text-xs font-bold text-emerald-300">✓</span>
              )}
              {isAnswered && isSelected && !isRightOption && (
                <span className="shrink-0 text-xs font-bold text-red-300">✕</span>
              )}
            </button>
          );
        })}
      </div>

      {isAnswered && (
        <div
          role="status"
          data-testid="question-game-feedback"
          className={`mt-3 rounded-xl border p-3 text-xs ${
            isCorrect
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-100'
              : 'border-red-500/50 bg-red-500/15 text-red-100'
          }`}
        >
          <p className="font-semibold text-[12.5px]">
            {getQuestionGameFeedback(isCorrect, language)}
          </p>
          {gameData.explanation && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#E2E8F0]">
              {gameData.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
