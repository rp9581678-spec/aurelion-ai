import React, { useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Play, RotateCw, X } from 'lucide-react';
import { buildRunnableHtmlDocument, isThreeJsOr3DCode } from '../utils/auraLogic';

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__AURELION_THREE__ = THREE;
  (window as unknown as Record<string, unknown>).__AURELION_ORBIT_CONTROLS__ = OrbitControls;
}

interface CodePreviewModalProps {
  language: string;
  code: string;
  onClose: () => void;
}

export const CodePreviewModal: React.FC<CodePreviewModalProps> = ({
  language,
  code,
  onClose,
}) => {
  const [reloadSeed, setReloadSeed] = useState(0);
  const is3D = isThreeJsOr3DCode(language, code);

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__AURELION_THREE__ = THREE;
    (window as unknown as Record<string, unknown>).__AURELION_ORBIT_CONTROLS__ = OrbitControls;
  }

  const srcDoc = buildRunnableHtmlDocument(language, code);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live Code Preview"
      data-testid="code-preview-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[5500] flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-md"
    >
      <div className="flex h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#00F0FF]/35 bg-[#0B101C] shadow-[0_0_50px_rgba(0,240,255,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#070B14] px-3.5 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
              <h3 className="font-display text-xs sm:text-sm font-semibold text-[#F1F5F9]">
                {is3D ? 'AURELION 3D WebGL Sandbox' : 'AURELION Live Code Runner'}
              </h3>
            </div>
            <span className="rounded bg-[#00F0FF]/15 border border-[#00F0FF]/30 px-2 py-0.5 font-mono text-[10px] uppercase font-semibold text-[#00F0FF]">
              {language || 'code'}
            </span>
            {is3D && (
              <span
                data-testid="3d-mode-badge"
                className="inline-flex items-center gap-1 rounded-md border border-[#8B5CF6]/45 bg-[#8B5CF6]/20 px-2 py-0.5 font-mono text-[10px] font-medium text-[#C4B5FD]"
              >
                <Box className="h-3 w-3 text-[#00F0FF]" />
                <span>Three.js + OrbitControls • 60fps</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="rerun-code-btn"
              onClick={() => setReloadSeed((s) => s + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#00F0FF]/35 bg-[#00F0FF]/15 px-3 py-1.5 text-xs font-semibold text-[#00F0FF] transition-all hover:bg-[#00F0FF]/25 active:scale-95 cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Reload / Re-run</span>
            </button>
            <button
              type="button"
              data-testid="close-code-preview-btn"
              onClick={onClose}
              aria-label="Close live preview"
              className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/25 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
              <span className="hidden xs:inline">Close</span>
            </button>
          </div>
        </div>

        {is3D && (
          <div className="flex items-center justify-between border-b border-white/5 bg-[#090E1A] px-3.5 py-1 text-[10.5px] text-[#94A3B8]">
            <span className="inline-flex items-center gap-1.5">
              <Play className="h-2.5 w-2.5 text-[#00F0FF]" />
              <span>Touch-drag or mouse-drag to rotate • Pinch or scroll to zoom</span>
            </span>
            <span className="font-mono text-[10px] text-emerald-400">
              sandbox=&quot;allow-scripts allow-same-origin&quot;
            </span>
          </div>
        )}

        <div className="relative flex-1 bg-[#07090E]">
          <iframe
            key={reloadSeed}
            title="Live Code Sandbox"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={srcDoc}
            className="h-full w-full border-0 bg-[#07090E]"
          />
        </div>
      </div>
    </div>
  );
};
