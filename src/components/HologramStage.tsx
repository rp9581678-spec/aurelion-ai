import React, { useEffect, useRef } from 'react';
import type { AiState, HologramMode } from '../types/aura';

interface HologramStageProps {
  mode: HologramMode;
  aiState: AiState;
  statusNote?: string;
  reactionTrigger?: { text: string; id: number } | null;
}

export type BotMood = 'normal' | 'happy' | 'sad' | 'love' | 'thinking';

export interface RobotEmojiParticle {
  char: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  scale: number;
  maxScale: number;
  alpha: number;
  life: number;
  maxLife: number;
  glowColor: string;
}

const timeSymbols = ['⟁', '◈', '⬡', '∆', '⌖', '01', '10'];
const nanoParticles = Array.from({ length: 42 }, (_, i) => ({
  angle: (i / 42) * Math.PI * 2,
  rad: 45 + (i % 6) * 14,
  zOff: ((i % 5) - 2) * 12,
  speed: (i % 2 === 0 ? 1 : -1) * (0.012 + (i % 4) * 0.004),
  isSymbol: i % 6 === 0,
  sym: timeSymbols[i % timeSymbols.length],
  size: 1.4 + (i % 3) * 0.7,
}));

export const HologramStage: React.FC<HologramStageProps> = ({
  mode,
  aiState,
  statusNote,
  reactionTrigger,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<HologramMode>(mode);
  const aiStateRef = useRef<AiState>(aiState);
  const robotEmojisRef = useRef<RobotEmojiParticle[]>([]);
  const botMoodRef = useRef<BotMood>('normal');
  const moodTimerRef = useRef<NodeJS.Timeout | null>(null);
  const spawnTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // --- 3D STUDY GRAPH STATE & CHAT CONNECTION ---
  const studyGraphBarsRef = useRef<number[]>([52, 68, 60, 82, 74, 90]);
  const studyTargetBarsRef = useRef<number[]>([52, 68, 60, 82, 74, 90]);
  const studyDisplayPercentRef = useRef<number>(78);
  const studyTargetPercentRef = useRef<number>(78);
  const studyTopicLabelRef = useRef<string>('Study Analytics Ready');

  const updateStudyGraphFromChat = (messageText: string) => {
    const t = (messageText || '').trim();
    if (!t) return;

    // Calculate a realistic dynamic percentage (72% to 99%) based on question depth/keywords
    let baseScore = 76 + (t.length % 19);
    if (
      /\b(math|physics|chemistry|biology|exam|quiz|formula|solve|explain|science|history|गणित|विज्ञान|परीक्षा|सवाल|समझाओ)\b/i.test(
        t
      )
    ) {
      baseScore = Math.min(99, baseScore + 7);
    }
    studyTargetPercentRef.current = Math.max(65, Math.min(99, baseScore));

    // Generate 6 new 3D bar heights around the target percentage
    studyTargetBarsRef.current = Array.from({ length: 6 }, (_, idx) => {
      const waveOffset = Math.sin(idx * 1.1 + t.length) * 16;
      return Math.max(
        25,
        Math.min(98, Math.round(studyTargetPercentRef.current - 10 + waveOffset + idx * 2.5))
      );
    });

    // Short topic tag above graph
    const cleanTopic = t.replace(/[^\w\s\u0900-\u097F]/g, '').trim().slice(0, 22);
    studyTopicLabelRef.current = cleanTopic ? `Topic: ${cleanTopic}...` : 'Live Study Metric';
  };

  useEffect(() => {
    (window as unknown as { updateStudyGraphFromChat?: (t: string) => void }).updateStudyGraphFromChat =
      updateStudyGraphFromChat;
    return () => {
      delete (window as unknown as { updateStudyGraphFromChat?: (t: string) => void })
        .updateStudyGraphFromChat;
    };
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    aiStateRef.current = aiState;
  }, [aiState]);

  useEffect(() => {
    if (!reactionTrigger) return;
    const rawText = reactionTrigger.text || '';
    updateStudyGraphFromChat(rawText);
    const t = rawText.toLowerCase();

    let pool = ['✨', '💫', '🤖'];
    let mood: BotMood = 'normal';

    if (/\b(haha|lol|lmao|funny|joke|comedy|हंसी|मजाक|कॉमेडी|😂|🤣)\b/.test(t)) {
      pool = ['😂', '🤣', '😆', '😹'];
      mood = 'happy';
    } else if (/\b(sad|cry|crying|sorry|hurt|pain|miss|दुख|रोना|रोने|उदास|😢|😭)\b/.test(t)) {
      pool = ['😢', '😭', '💔', '🥺'];
      mood = 'sad';
    } else if (/\b(hi|hii|hello|hey|namaste|yo|हाय|हेलो|नमस्ते|👋)\b/.test(t)) {
      pool = ['👋', '🙌', '✨', '😊'];
      mood = 'happy';
    } else if (/\b(love|thanks|thank you|awesome|great|nice|best|प्यार|शुक्रिया|अच्छा|बढ़िया|❤️)\b/.test(t)) {
      pool = ['❤️', '🥰', '😍', '💖'];
      mood = 'love';
    } else if (/\b(wow|omg|shock|what|crazy|हैरान|अरे|🤯|😱)\b/.test(t)) {
      pool = ['🤯', '😲', '🔥', '⚡'];
      mood = 'thinking';
    } else if (/\b(code|html|css|js|python|app|script|कोड)\b/.test(t)) {
      pool = ['🚀', '💻', '⚡', '🛠️'];
      mood = 'happy';
    } else if (/\b(study|exam|notes|quiz|math|science|physics|chemistry|formula|solve|explain|biology|history|गणित|विज्ञान|परीक्षा|पढ़ाई|समझाओ)\b/.test(t)) {
      pool = ['📊', '📈', '🎯', '📚', '💡'];
      mood = 'happy';
    } else if (/\?|\b(why|how|what|idea|think|क्या|कैसे|क्यों|सोच)\b/.test(t)) {
      pool = ['🤔', '💡', '🧐', '✨'];
      mood = 'thinking';
    }

    botMoodRef.current = mood;
    if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    moodTimerRef.current = setTimeout(() => {
      botMoodRef.current = 'normal';
    }, 4500);

    // Clear previous pending spawns
    spawnTimeoutsRef.current.forEach((tId) => clearTimeout(tId));
    spawnTimeoutsRef.current = [];

    const canvas = canvasRef.current;
    const w = canvas ? canvas.width : 400;
    const spawnX = w - 68;
    const spawnY = 44;

    const glowColor =
      mood === 'love'
        ? '#ec4899'
        : mood === 'thinking'
          ? '#facc15'
          : mood === 'sad'
            ? '#67e8f9'
            : mood === 'happy'
              ? '#38bdf8'
              : '#00f0ff';

    // Spawn 5 floating emoji particles directly from the Robot's upper-right position
    for (let i = 0; i < 5; i++) {
      const timeoutId = setTimeout(() => {
        robotEmojisRef.current.push({
          char: pool[i % pool.length],
          x: spawnX + (Math.random() - 0.5) * 12,
          y: spawnY + (Math.random() - 0.5) * 10,
          vx: -1.2 - Math.random() * 1.5,
          vy: -0.7 - Math.random() * 1.1,
          wobbleSpeed: 2.4 + Math.random() * 2,
          wobbleAmp: 0.8 + Math.random() * 0.8,
          scale: 0.35,
          maxScale: 1.15 + Math.random() * 0.35,
          alpha: 1.0,
          life: 0,
          maxLife: 85 + Math.random() * 25,
          glowColor,
        });
      }, i * 110);
      spawnTimeoutsRef.current.push(timeoutId);
    }

    const emojiEl = document.getElementById('aura-reaction-emoji');
    const stageCanvas =
      document.querySelector('.hologram-stage canvas') || canvasRef.current;
    if (emojiEl) {
      emojiEl.innerText = pool[0];
      emojiEl.classList.remove('show-wave', 'show-bounce');
      if (stageCanvas) stageCanvas.classList.remove('stage-jump');

      void emojiEl.offsetWidth; // Force reflow

      emojiEl.classList.add(mood === 'happy' ? 'show-wave' : 'show-bounce');
      if (stageCanvas) stageCanvas.classList.add('stage-jump');
    }
  }, [reactionTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) return;

    let animationFrameId = 0;
    let t = 0;

    const resize = () => {
      if (!canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth || 400;
      canvas.height = canvas.parentElement.clientHeight || 200;
    };
    resize();
    window.addEventListener('resize', resize);

    // Floating ambient particles for General Mode
    const particles = Array.from({ length: 36 }, (_, i) => ({
      angle: (i / 36) * Math.PI * 2,
      radius: 42 + (i % 5) * 16,
      speed: (i % 2 === 0 ? 1 : -1) * (0.008 + (i % 4) * 0.003),
      size: 1.5 + (i % 3) * 0.9,
      color: i % 2 === 0 ? '#00f0ff' : '#a855f7',
    }));

    function drawGeneralOrbitalCore(cx: number, cy: number, time: number) {
      const outerGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 95);
      outerGlow.addColorStop(0, 'rgba(0, 240, 255, 0.32)');
      outerGlow.addColorStop(0.55, 'rgba(139, 92, 246, 0.14)');
      outerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, 95, 0, Math.PI * 2);
      ctx.fill();

      const tilts = [-0.55, 0.55, 1.57];
      tilts.forEach((tilt, idx) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt + Math.sin(time * 0.4 + idx) * 0.06);
        const grad = ctx.createLinearGradient(-75, 0, 75, 0);
        grad.addColorStop(0, 'rgba(0, 240, 255, 0.85)');
        grad.addColorStop(0.5, 'rgba(139, 92, 246, 0.75)');
        grad.addColorStop(1, 'rgba(0, 240, 255, 0.85)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, 76, 26, 0, 0, Math.PI * 2);
        ctx.stroke();

        const nodeAngle = time * (1.4 + idx * 0.35) + idx * 2;
        const nx = Math.cos(nodeAngle) * 76;
        const ny = Math.sin(nodeAngle) * 26;
        ctx.fillStyle = '#67e8f9';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(nx, ny, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      particles.forEach((p) => {
        p.angle += p.speed;
        const px = cx + Math.cos(p.angle) * p.radius;
        const py =
          cy +
          Math.sin(p.angle) * (p.radius * 0.78) +
          Math.sin(time * 2 + p.angle) * 4;
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      const coreGrad = ctx.createRadialGradient(cx - 6, cy - 6, 3, cx, cy, 28);
      coreGrad.addColorStop(0, '#e0f2fe');
      coreGrad.addColorStop(0.45, '#00f0ff');
      coreGrad.addColorStop(0.85, '#6366f1');
      coreGrad.addColorStop(1, 'rgba(139, 92, 246, 0.1)');
      ctx.save();
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 24;
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawCodingMobius(cx: number, cy: number, time: number) {
      const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 90);
      glow.addColorStop(0, 'rgba(0, 240, 255, 0.22)');
      glow.addColorStop(0.6, 'rgba(59, 130, 246, 0.1)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();

      nanoParticles.forEach((p) => {
        p.angle += p.speed;
        const px = cx + Math.cos(p.angle) * p.rad;
        const py =
          cy +
          Math.sin(p.angle) * (p.rad * 0.58) +
          Math.sin(time * 2 + p.angle) * 5;
        ctx.save();
        if (p.isSymbol) {
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillStyle = 'rgba(103, 232, 249, 0.75)';
          ctx.fillText(p.sym, px, py);
        } else {
          ctx.fillStyle = p.angle % 2 > 1 ? '#00f0ff' : '#818cf8';
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      const R = 58,
        halfW = 16,
        steps = 84;
      for (let i = 0; i < steps; i++) {
        const u = (i / steps) * Math.PI * 2;
        const pts = [-1, 1].map((s) => {
          const v = s * halfW;
          const x0 = (R + v * Math.cos(u / 2)) * Math.cos(u);
          const y0 = (R + v * Math.cos(u / 2)) * Math.sin(u);
          const z0 = v * Math.sin(u / 2);
          const rx = x0 * Math.cos(time * 1.1) - z0 * Math.sin(time * 1.1);
          const rz = x0 * Math.sin(time * 1.1) + z0 * Math.cos(time * 1.1);
          return { x: cx + rx, y: cy + y0 * 0.6 - rz * 0.38, z: rz };
        });

        ctx.strokeStyle =
          i % 2 === 0 ? 'rgba(0, 240, 255, 0.85)' : 'rgba(99, 102, 241, 0.72)';
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();

        if (i % 4 === 0) {
          ctx.fillStyle = '#e0f2fe';
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawStudy3DGraph(w: number, h: number, time: number) {
      const cx = w / 2;
      const baseY = h * 0.78;
      const maxBarH = h * 0.44;
      const studyGraphBars = studyGraphBarsRef.current;
      const studyTargetBars = studyTargetBarsRef.current;
      const barCount = studyGraphBars.length;
      const barW = Math.min(24, Math.max(16, (w * 0.52) / (barCount * 1.6)));
      const gap = Math.min(16, Math.max(10, barW * 0.65));
      const depthX = 8; // 3D isometric X extrusion
      const depthY = -6; // 3D isometric Y extrusion
      const totalW = barCount * barW + (barCount - 1) * gap;
      const startX = cx - totalW / 2;

      // Smoothly interpolate percentage counter
      studyDisplayPercentRef.current +=
        (studyTargetPercentRef.current - studyDisplayPercentRef.current) * 0.08;
      const currentPercent = studyDisplayPercentRef.current;
      const topicLabel = studyTopicLabelRef.current;

      // 1. Top Glowing Holographic Percentage Badge & Topic Readout
      ctx.save();
      ctx.textAlign = 'center';

      // Sleek Glass Pill Badge
      const badgeW = Math.min(180, w * 0.48);
      const badgeH = 26;
      const badgeX = cx - badgeW / 2;
      const badgeY = h * 0.07;
      ctx.fillStyle = 'rgba(6, 11, 24, 0.78)';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.55)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 7);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00F0FF';
      ctx.shadowColor = 'rgba(0, 240, 255, 0.9)';
      ctx.shadowBlur = 12;
      ctx.font = 'bold 15px "JetBrains Mono", monospace';
      ctx.fillText(`📊 Mastery: ${Math.round(currentPercent)}%`, cx, badgeY + 18);

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#94A3B8';
      ctx.font = '11px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(topicLabel, cx, h * 0.25);
      ctx.restore();

      // 2. 3D Holographic Grid Floor & Horizontal Reference Lines
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let g = 0; g <= 3; g++) {
        const gy = baseY - (maxBarH / 3) * g;
        ctx.beginPath();
        ctx.moveTo(startX - 18, gy);
        ctx.lineTo(startX + totalW + depthX + 18, gy);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Draw 3D Extruded Bars (Continuously Oscillating Up & Down)
      const topNodes: { x: number; y: number }[] = [];
      const barColors = [
        ['#00F0FF', '#0284C7'],
        ['#38BDF8', '#2563EB'],
        ['#818CF8', '#4F46E5'],
        ['#A855F7', '#7E22CE'],
        ['#EC4899', '#BE185D'],
        ['#10B981', '#047857'],
      ];

      for (let i = 0; i < barCount; i++) {
        // Smooth transition toward target + continuous live dynamic analytical wave
        studyGraphBars[i] += (studyTargetBars[i] - studyGraphBars[i]) * 0.07;
        const liveWave = Math.sin(time * 3.2 + i * 0.85) * 6.5;
        const effectivePct = Math.max(18, Math.min(100, studyGraphBars[i] + liveWave));
        const bh = (effectivePct / 100) * maxBarH;

        const x = startX + i * (barW + gap);
        const y = baseY - bh;
        const [cTop, cBot] = barColors[i % barColors.length];

        // 3D Right Side Face (Darker shaded)
        ctx.fillStyle = cBot;
        ctx.beginPath();
        ctx.moveTo(x + barW, y);
        ctx.lineTo(x + barW + depthX, y + depthY);
        ctx.lineTo(x + barW + depthX, baseY + depthY);
        ctx.lineTo(x + barW, baseY);
        ctx.closePath();
        ctx.fill();

        // 3D Top Cap Face (Bright highlight)
        ctx.fillStyle = '#E0F2FE';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + depthX, y + depthY);
        ctx.lineTo(x + barW + depthX, y + depthY);
        ctx.lineTo(x + barW, y);
        ctx.closePath();
        ctx.fill();

        // Front Main Face (Vertical Gradient)
        const grad = ctx.createLinearGradient(x, y, x, baseY);
        grad.addColorStop(0, cTop);
        grad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, bh);

        // Crisp Neon Outline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x, y, barW, bh);

        topNodes.push({ x: x + barW / 2 + depthX / 2, y: y + depthY / 2 - 4 });
      }

      // 4. Glowing Trend Line Connecting 3D Bar Peaks
      ctx.save();
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#00F0FF';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      topNodes.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      // Glowing Data Dots at Each Peak
      topNodes.forEach((pt) => {
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    function drawLiveChatHeartbeatWave(w: number, h: number, time: number, state: AiState) {
      const cy = h * 0.58; // Positioned slightly lower so the corner AI bot has clean headroom
      const isTalking = state === 'thinking' || state === 'speaking';
      const ampMult = isTalking ? 1.85 : 0.72;

      // 1. Ambient Cyber Grid & Soft Radial Glow
      const bgGlow = ctx.createRadialGradient(w * 0.5, cy, 10, w * 0.5, cy, w * 0.45);
      bgGlow.addColorStop(0, isTalking ? 'rgba(236, 72, 153, 0.16)' : 'rgba(0, 240, 255, 0.14)');
      bgGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      // 2. Multi-Layer Neural Heartbeat Wave (Primary + Echo + Mirror Reflection)
      const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
      lineGrad.addColorStop(0, 'rgba(0, 240, 255, 0.05)');
      lineGrad.addColorStop(0.22, '#00f0ff');
      lineGrad.addColorStop(0.5, '#8b5cf6');
      lineGrad.addColorStop(0.78, '#ec4899');
      lineGrad.addColorStop(1, 'rgba(236, 72, 153, 0.05)');

      // Helper for realistic ECG + Vocal Wave math
      function getWaveY(x: number, phaseOffset = 0, scale = 1) {
        const nx = (x / w) * 2 - 1;
        const envelope = Math.exp(-nx * nx * 4.2);
        const beatCycle = (time * 1.4 + phaseOffset) % 1;
        // Sharp realistic ECG spike + smooth vocal harmonics
        const ecgSpike =
          Math.exp(-Math.pow((nx - (beatCycle * 1.6 - 0.8)) * 14, 2)) * 26 -
          Math.exp(-Math.pow((nx - (beatCycle * 1.6 - 0.72)) * 18, 2)) * 14;
        const vocalHarmonic =
          Math.sin(x * 0.055 + time * 7.5 + phaseOffset) *
          Math.cos(x * 0.022 - time * 4.0) *
          14;
        return (ecgSpike + vocalHarmonic) * envelope * ampMult * scale;
      }

      // Subtle mirror reflection beneath it
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = cy - getWaveY(x, 0.1, 0.45) * 0.6;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Secondary soft violet ribbon wave
      ctx.save();
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const y = cy + getWaveY(x, 0.25, 0.75);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Main glowing heartbeat & voice line
      ctx.save();
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 2.8;
      ctx.shadowColor = isTalking ? '#ec4899' : '#00f0ff';
      ctx.shadowBlur = isTalking ? 18 : 12;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = cy + getWaveY(x, 0, 1.0);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Tiny luminous pulse particles traveling along the wave
      const pulseParticlesCount = 3;
      for (let p = 0; p < pulseParticlesCount; p++) {
        const particlePhase = (time * 0.35 + p * 0.33) % 1;
        const px = particlePhase * w;
        const py = cy + getWaveY(px, 0, 1.0);
        ctx.fillStyle = p === 0 ? '#ffffff' : p === 1 ? '#00f0ff' : '#ec4899';
        ctx.shadowColor = p === 2 ? '#ec4899' : '#00f0ff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(px, py, p === 0 ? 3.2 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 3. FLOATING MINI 3D AI ROBOT + "AI" HOLOGRAM BADGE (Upper-Right of Minimap)
      const botX = Math.max(w * 0.64, w - 48);
      const botY = 62 + Math.sin(time * 2.6) * 4; // Smooth hovering in mid-air below HUD header
      const tilt = Math.sin(time * 1.8) * 0.07;

      ctx.save();
      ctx.translate(botX, botY);
      ctx.rotate(tilt);
      ctx.scale(0.82, 0.82);

      // Anti-gravity cyan thruster glow underneath bot
      const thrustGrad = ctx.createRadialGradient(0, 22, 2, 0, 24, 22);
      thrustGrad.addColorStop(0, 'rgba(0, 240, 255, 0.75)');
      thrustGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = thrustGrad;
      ctx.beginPath();
      ctx.ellipse(0, 23, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Floating side ear-pods (metallic cyan trim)
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.2;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(-24, -6, 5, 13, 2.5);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(19, -6, 5, 13, 2.5);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(-24, -6, 5, 13);
        ctx.strokeRect(-24, -6, 5, 13);
        ctx.fillRect(19, -6, 5, 13);
        ctx.strokeRect(19, -6, 5, 13);
      }

      // Glossy 3D Spherical Robot Head/Body
      const bodyGrad = ctx.createRadialGradient(-7, -9, 3, 0, 0, 22);
      bodyGrad.addColorStop(0, '#ffffff');
      bodyGrad.addColorStop(0.55, '#cbd5e1');
      bodyGrad.addColorStop(1, '#334155');
      ctx.fillStyle = bodyGrad;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.45)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Dark Glass Visor Faceplate
      ctx.fillStyle = '#060a14';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-14, -7, 28, 15, 7);
      } else {
        ctx.rect(-14, -7, 28, 15);
      }
      ctx.fill();
      ctx.stroke();

      // Expressive Glowing LED Eyes (Reacting to bot mood & chat context)
      const currentMood = botMoodRef.current;
      const blinkCycle = (time * 0.7) % 4;
      const eyeHeight = blinkCycle > 3.85 ? 1.2 : isTalking ? 6.2 : 5.0;

      if (currentMood === 'happy') {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2.4;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(-6.5, 2.8, 3.8, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(6.5, 2.8, 3.8, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (currentMood === 'sad') {
        ctx.strokeStyle = '#67e8f9';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = 'rgba(103, 232, 249, 0.9)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(-6.5, -1.2, 3.6, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(6.5, -1.2, 3.6, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.arc(-6.5, 4.2, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (currentMood === 'love') {
        ctx.fillStyle = '#ec4899';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 12;
        const drawHeartEye = (cx: number) => {
          ctx.save();
          ctx.translate(cx, -0.5);
          ctx.scale(0.85, 0.85);
          ctx.beginPath();
          ctx.moveTo(0, 2.5);
          ctx.bezierCurveTo(-3.5, -0.5, -4, -3.8, -1.8, -3.8);
          ctx.bezierCurveTo(0, -3.8, 0, -2, 0, -1);
          ctx.bezierCurveTo(0, -2, 0, -3.8, 1.8, -3.8);
          ctx.bezierCurveTo(4, -3.8, 3.5, -0.5, 0, 2.5);
          ctx.fill();
          ctx.restore();
        };
        drawHeartEye(-6.5);
        drawHeartEye(6.5);
        ctx.shadowBlur = 0;
      } else if (currentMood === 'thinking') {
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.ellipse(-6.5, -0.5, 3.8, 5.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(6.5, 0.5, 3.4, 4.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = isTalking ? '#38bdf8' : '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.ellipse(-6.5, 0.5, 3.3, eyeHeight / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(6.5, 0.5, 3.3, eyeHeight / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Top Micro Antenna with Glowing Tip
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(0, -27);
      ctx.stroke();
      ctx.fillStyle =
        currentMood === 'love'
          ? '#ec4899'
          : currentMood === 'thinking'
            ? '#facc15'
            : currentMood === 'sad'
              ? '#67e8f9'
              : isTalking
                ? '#ec4899'
                : '#00f0ff';
      ctx.beginPath();
      ctx.arc(0, -28, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Holographic "AI" Badge Floating Right Next to the Bot
      ctx.save();
      ctx.translate(-44, -10 + Math.cos(time * 2.4) * 2.5);
      ctx.fillStyle = 'rgba(10, 18, 34, 0.85)';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.1;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-14, -9, 28, 18, 6);
      } else {
        ctx.rect(-14, -9, 28, 18);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AI', 0, 0.5);
      ctx.restore();

      ctx.restore();
    }

    const loop = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      t += 0.025;

      const currentMode = modeRef.current;
      const currentState = aiStateRef.current;
      const speedMult =
        currentState === 'speaking' ? 1.4 : currentState === 'thinking' ? 1.2 : 1.0;

      // Scale 3D hologram geometry smoothly into the compact square minimap HUD
      const minimapScale = Math.min(w, h) / 185;
      ctx.save();
      ctx.scale(minimapScale, minimapScale);
      const vw = w / minimapScale;
      const vh = h / minimapScale;

      if (currentMode === 'mobius') {
        drawCodingMobius(vw / 2, vh / 2, t * speedMult);
      } else if (currentMode === 'book') {
        drawStudy3DGraph(vw, vh, t * speedMult);
      } else if (currentMode === 'livewave') {
        drawLiveChatHeartbeatWave(vw, vh, t, currentState);
      } else {
        drawGeneralOrbitalCore(vw / 2, vh / 2, t * speedMult);
      }
      ctx.restore();

      // Render Floating Robot-Emitted Emoji Particle System
      const emojis = robotEmojisRef.current;
      for (let i = emojis.length - 1; i >= 0; i--) {
        const p = emojis[i];
        p.life++;
        const progress = p.life / p.maxLife;
        if (progress >= 1) {
          emojis.splice(i, 1);
          continue;
        }

        p.x += p.vx;
        p.y += p.vy + Math.sin(p.life * 0.08 * p.wobbleSpeed) * p.wobbleAmp;
        p.vy += 0.012;

        p.scale =
          progress < 0.22
            ? 0.3 + (progress / 0.22) * (p.maxScale - 0.3)
            : p.maxScale;
        p.alpha =
          progress > 0.65 ? Math.max(0, 1 - (progress - 0.65) / 0.35) : 1;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.font = `${Math.round(16 * p.scale)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.shadowColor = p.glowColor;
        ctx.shadowBlur = Math.round(10 * p.scale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.char, p.x, p.y);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
      spawnTimeoutsRef.current.forEach((tId) => clearTimeout(tId));
    };
  }, []);

  const shortModeLabel =
    mode === 'livewave'
      ? 'LIVE WAVE'
      : mode === 'mobius'
        ? 'MÖBIUS 3D'
        : mode === 'book'
          ? 'STUDY 3D'
          : 'ORBITAL 3D';

  const stateLabel =
    aiState === 'thinking'
      ? statusNote ? 'SYNC' : 'THINK'
      : aiState === 'speaking'
        ? 'VOICE'
        : 'READY';

  return (
    <section
      aria-label="AURELION AI 3D Minimap HUD"
      data-testid="hologram-stage"
      data-hologram-mode={mode}
      data-ai-state={aiState}
      className="hologram-stage fixed top-11 right-2.5 z-30 h-[112px] w-[112px] sm:top-12 sm:right-4 sm:h-[140px] sm:w-[140px] shrink-0 overflow-hidden rounded-2xl border border-[#00F0FF]/45 bg-[radial-gradient(circle_at_center,#101d38_0%,#060911_100%)] shadow-[0_8px_28px_rgba(0,0,0,0.65),0_0_18px_rgba(0,240,255,0.22)] backdrop-blur-md pointer-events-none select-none"
    >
      <style>{`
        .emoji-reaction-layer {
          position: absolute; inset: 0; pointer-events: none;
          display: flex; align-items: center; justify-content: center; z-index: 20;
        }
        .aura-pop-emoji {
          font-size: 28px; opacity: 0; transform: translateY(14px) scale(0.4);
          filter: drop-shadow(0 0 12px rgba(0, 240, 255, 0.75));
        }
        .aura-pop-emoji.show-wave {
          animation: emojiBounceWave 2.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .aura-pop-emoji.show-bounce {
          animation: emojiJumpPop 2.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .stage-jump {
          animation: stageBounce 0.65s ease;
        }

        @keyframes stageBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          35% { transform: translateY(-5px) scale(1.03); }
          70% { transform: translateY(2px) scale(0.99); }
        }
        @keyframes emojiBounceWave {
          0% { opacity: 0; transform: translateY(14px) scale(0.4) rotate(0deg); }
          18% { opacity: 1; transform: translateY(-6px) scale(1.1) rotate(16deg); }
          32% { transform: translateY(-3px) scale(1.04) rotate(-12deg); }
          46% { transform: translateY(-5px) scale(1.06) rotate(14deg); }
          62% { transform: translateY(-3px) scale(1.02) rotate(-6deg); }
          82% { opacity: 1; transform: translateY(-4px) scale(1) rotate(0deg); }
          100% { opacity: 0; transform: translateY(-14px) scale(0.75); }
        }
        @keyframes emojiJumpPop {
          0% { opacity: 0; transform: translateY(14px) scale(0.4); }
          20% { opacity: 1; transform: translateY(-7px) scale(1.12); }
          38% { transform: translateY(-3px) scale(0.98); }
          52% { transform: translateY(-5px) scale(1.04); }
          82% { opacity: 1; transform: translateY(-4px) scale(1); }
          100% { opacity: 0; transform: translateY(-14px) scale(0.75); }
        }
      `}</style>

      {/* Subtle Minimap HUD Corner Brackets */}
      <div className="pointer-events-none absolute top-1.5 left-2 z-10 font-mono text-[8px] font-semibold tracking-wider text-[#00F0FF]/80">
        HUD • {shortModeLabel}
      </div>

      <canvas
        id="aura-stage-canvas"
        ref={canvasRef}
        className="block h-full w-full"
      />

      <div className="emoji-reaction-layer">
        <div id="aura-reaction-emoji" className="aura-pop-emoji">✨</div>
      </div>

      <div className="pointer-events-none absolute inset-x-1.5 bottom-1 flex items-center justify-between rounded-md bg-[#060911]/85 px-1.5 py-0.5 text-[8.5px] text-[#CBD5E1] border border-white/10">
        <span className="font-mono font-semibold text-[#00F0FF] truncate">
          {mode === 'livewave' ? 'AI BOT' : mode.toUpperCase()}
        </span>
        <span className="font-mono text-[#94A3B8] tabular-nums">
          {stateLabel}
        </span>
      </div>
    </section>
  );
};

