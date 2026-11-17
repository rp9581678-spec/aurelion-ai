import React, { useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed or running in standalone mode, suppress
  if (isInstalled) {
    return null;
  }

  // Show if installable prompt is ready or on mobile browser
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        aria-label="Install AURELION AI App"
        className="flex w-full items-center gap-2.5 rounded-lg border border-[#00F0FF]/30 bg-[#00F0FF]/10 px-2.5 py-2 text-left text-xs font-semibold text-[#00F0FF] transition-all hover:bg-[#00F0FF]/20 active:scale-95"
      >
        <Smartphone className="h-4 w-4 shrink-0 text-[#00F0FF]" />
        <span>Install AURELION AI App</span>
      </button>

      {/* iOS Safari Guided Modal */}
      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[#00F0FF]/40 bg-[#0F1420] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold text-white">Install on iPhone / iPad</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close guide"
                className="rounded-lg p-1 text-[#94A3B8] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-[#CBD5E1] leading-relaxed">
              <p>
                1. Tap the <strong>Share</strong> button (square with arrow) in Safari.
              </p>
              <p>
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <p>
                3. Tap <strong>Add</strong> in the top-right corner to launch AURELION AI in standalone full-screen mode.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] py-2 text-xs font-semibold text-black shadow-lg hover:opacity-90 transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
