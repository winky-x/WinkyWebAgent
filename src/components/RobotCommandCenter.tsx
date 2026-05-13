import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wifi, WifiOff, Radio, Zap, AlertTriangle, Camera, CameraOff,
  RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Square, Activity, Cpu, MonitorSpeaker, Ruler
} from 'lucide-react';
import clsx from 'clsx';
import { ChatInput } from './ChatInput';
import { Attachment, Message } from '@/lib/gemini';
import { KinematicsLogEntry, executeKinematicsSingle } from '@/lib/robotManager';

// ─── Types ───────────────────────────────────────────────────────────────────

type Emotion = 'happy' | 'sad' | 'curious' | 'thinking' | 'neutral' | 'angry' | 'excited' | 'confused';

interface RobotCommandCenterProps {
  ip: string;
  esp32Online: boolean | null;
  esp32Latency: number;
  esp32DistanceCm: number | undefined;
  kinematicsLog: KinematicsLogEntry[];
  messages: Message[];
  isGenerating: boolean;
  isSpeaking: boolean;
  emotion: Emotion;
  robotSpeakingText: string;
  isRobotStreaming: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onEmergencyStop: () => void;
  isMuted: boolean;
  onMuteChange: (m: boolean) => void;
  selectedTool: string;
  onToolSelect: (t: string) => void;
  inputText: string;
  onInputChange: (v: string) => void;
}

// ─── Emotion Config ───────────────────────────────────────────────────────────

const EMOTION_CFG: Record<Emotion, { color: string; bg: string; ring: string; label: string }> = {
  happy:    { color: '#10b981', bg: '#ecfdf5', ring: '#6ee7b7', label: 'Happy' },
  sad:      { color: '#60a5fa', bg: '#eff6ff', ring: '#93c5fd', label: 'Sad' },
  curious:  { color: '#f59e0b', bg: '#fffbeb', ring: '#fcd34d', label: 'Curious' },
  thinking: { color: '#8b5cf6', bg: '#f5f3ff', ring: '#c4b5fd', label: 'Thinking' },
  neutral:  { color: '#6b7280', bg: '#f9fafb', ring: '#d1d5db', label: 'Neutral' },
  angry:    { color: '#ef4444', bg: '#fef2f2', ring: '#fca5a5', label: 'Angry' },
  excited:  { color: '#f97316', bg: '#fff7ed', ring: '#fdba74', label: 'Excited' },
  confused: { color: '#ec4899', bg: '#fdf4ff', ring: '#f0abfc', label: 'Confused' },
};

// ─── EmotionVisualizer ────────────────────────────────────────────────────────

function EmotionVisualizer({ emotion }: { emotion: Emotion }) {
  const cfg = EMOTION_CFG[emotion] ?? EMOTION_CFG.neutral;

  const faces: Record<Emotion, React.ReactNode> = {
    happy: (
      <g>
        <path d="M22 28 Q28 22 34 28" stroke={cfg.color} strokeWidth="3" fill="none" strokeLinecap="round"/>
        <path d="M54 28 Q60 22 66 28" stroke={cfg.color} strokeWidth="3" fill="none" strokeLinecap="round"/>
        <path d="M28 56 Q44 68 60 56" stroke={cfg.color} strokeWidth="3" fill="none" strokeLinecap="round"/>
      </g>
    ),
    sad: (
      <g>
        <line x1="22" y1="26" x2="34" y2="26" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <line x1="54" y1="26" x2="66" y2="26" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <path d="M30 62 Q44 52 58 62" stroke={cfg.color} strokeWidth="3" fill="none" strokeLinecap="round"/>
      </g>
    ),
    curious: (
      <g>
        <circle cx="28" cy="27" r="8" stroke={cfg.color} strokeWidth="2.5" fill="none"/>
        <circle cx="28" cy="27" r="3" fill={cfg.color}/>
        <circle cx="60" cy="27" r="5" stroke={cfg.color} strokeWidth="2.5" fill="none"/>
        <circle cx="60" cy="27" r="2" fill={cfg.color}/>
        <circle cx="44" cy="58" r="5" stroke={cfg.color} strokeWidth="2.5" fill="none"/>
      </g>
    ),
    thinking: (
      <g>
        <line x1="20" y1="26" x2="36" y2="26" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <line x1="52" y1="26" x2="68" y2="26" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <line x1="30" y1="58" x2="58" y2="58" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <circle cx="62" cy="22" r="3" fill={cfg.color} opacity="0.6"/>
        <circle cx="69" cy="16" r="2" fill={cfg.color} opacity="0.4"/>
        <circle cx="74" cy="10" r="1.5" fill={cfg.color} opacity="0.2"/>
      </g>
    ),
    neutral: (
      <g>
        <line x1="22" y1="26" x2="34" y2="26" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <line x1="54" y1="26" x2="66" y2="26" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <line x1="30" y1="58" x2="58" y2="58" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
      </g>
    ),
    angry: (
      <g>
        <path d="M20 22 L34 28" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <path d="M68 22 L54 28" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <circle cx="28" cy="30" r="3" fill={cfg.color}/>
        <circle cx="60" cy="30" r="3" fill={cfg.color}/>
        <path d="M30 62 Q44 52 58 62" stroke={cfg.color} strokeWidth="3" fill="none" strokeLinecap="round"/>
      </g>
    ),
    excited: (
      <g>
        <path d="M20 25 L26 22 L32 25" stroke={cfg.color} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M52 25 L58 22 L64 25" stroke={cfg.color} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <circle cx="28" cy="29" r="3" fill={cfg.color}/>
        <circle cx="60" cy="29" r="3" fill={cfg.color}/>
        <path d="M26 54 Q44 70 62 54" stroke={cfg.color} strokeWidth="3" fill="none" strokeLinecap="round"/>
      </g>
    ),
    confused: (
      <g>
        <path d="M22 26 Q28 22 34 26" stroke={cfg.color} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <line x1="54" y1="26" x2="66" y2="26" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"/>
        <path d="M30 56 Q44 60 58 54" stroke={cfg.color} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <text x="64" y="20" fontSize="12" fill={cfg.color} fontWeight="bold">?</text>
      </g>
    ),
  };

  const animations: Record<Emotion, string> = {
    happy: 'animate-bounce',
    sad: 'animate-pulse',
    curious: 'animate-[tilt_2s_ease-in-out_infinite]',
    thinking: 'animate-pulse',
    neutral: '',
    angry: 'animate-[shake_0.4s_ease-in-out_infinite]',
    excited: 'animate-bounce',
    confused: 'animate-[wobble_1.5s_ease-in-out_infinite]',
  };

  return (
    <motion.div
      key={emotion}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center gap-2"
    >
      <div
        className={clsx('rounded-3xl p-3 transition-all duration-500 shadow-lg', animations[emotion])}
        style={{ backgroundColor: cfg.bg, boxShadow: `0 0 24px ${cfg.ring}88` }}
      >
        <svg width="88" height="88" viewBox="0 0 88 88">
          {/* Head */}
          <rect x="8" y="8" width="72" height="72" rx="18" fill={cfg.bg} stroke={cfg.color} strokeWidth="2"/>
          {/* Antenna */}
          <line x1="44" y1="8" x2="44" y2="1" stroke={cfg.color} strokeWidth="2"/>
          <circle cx="44" cy="0" r="2.5" fill={cfg.color}/>
          {/* Face */}
          {faces[emotion]}
        </svg>
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </motion.div>
  );
}

// ─── ConnectionStatusBar ──────────────────────────────────────────────────────

function ConnectionStatusBar({ ip, online, latencyMs, distanceCm, onEmergencyStop }: {
  ip: string; online: boolean | null; latencyMs: number;
  distanceCm?: number; onEmergencyStop: () => void;
}) {
  const isChecking = online === null;
  const isOnline = online === true;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 border-b border-zinc-800 text-xs font-mono">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {isChecking ? (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          ) : isOnline ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}
          <span className={clsx('font-bold', isOnline ? 'text-emerald-400' : isChecking ? 'text-amber-400' : 'text-red-400')}>
            {isChecking ? 'CHECKING...' : isOnline ? 'ESP32-CAM ONLINE' : 'OFFLINE — SIM MODE'}
          </span>
        </div>
        <span className="text-zinc-500">{ip}</span>
        {isOnline && latencyMs > 0 && (
          <span className="text-zinc-400 flex items-center gap-1">
            <Wifi className="w-3 h-3 text-emerald-500" /> {latencyMs}ms
          </span>
        )}
        {distanceCm !== undefined && (
          <span className="flex items-center gap-1 text-sky-400">
            <Ruler className="w-3 h-3" /> {distanceCm}cm
          </span>
        )}
      </div>
      <button
        onClick={onEmergencyStop}
        className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-colors text-[11px] uppercase tracking-wider"
      >
        <Square className="w-3 h-3" /> E-STOP
      </button>
    </div>
  );
}

// ─── VideoFeedPanel ───────────────────────────────────────────────────────────

function VideoFeedPanel({ ip }: { ip: string }) {
  const [hasError, setHasError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const timestamp = new Date().toLocaleTimeString();

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await fetch(`http://${ip}/capture`, { mode: 'no-cors', signal: AbortSignal.timeout(2000) });
      setHasError(false);
    } catch { /* still offline */ }
    setRetrying(false);
  }, [ip]);

  return (
    <div className="relative w-full h-full bg-black rounded-2xl overflow-hidden border border-zinc-800">
      {/* HUD overlays */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-1 rounded-full border border-white/10 text-[10px] font-mono text-white/80">
        <span className={clsx('w-1.5 h-1.5 rounded-full', hasError ? 'bg-amber-400' : 'bg-red-500 animate-pulse')} />
        {hasError ? 'VISION SIM' : 'LIVE ESP32-CAM'}
      </div>
      <div className="absolute top-3 right-3 z-20 text-[10px] font-mono text-white/30">{timestamp}</div>

      {!hasError ? (
        <img
          src={`http://${ip}/stream`}
          alt="Winky Robot Vision"
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-900 to-black">
          {/* Animated scanlines */}
          <div className="absolute inset-0 overflow-hidden opacity-10 pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="w-full h-px bg-white/50" style={{ marginTop: `${i * 5}%` }} />
            ))}
          </div>
          <CameraOff className="w-12 h-12 text-zinc-600 animate-pulse relative z-10" />
          <div className="text-center relative z-10">
            <p className="text-white font-bold text-sm">ESP32-CAM Offline</p>
            <p className="text-zinc-500 text-xs mt-1 max-w-[200px]">
              L298N motors, HC-SR04, and LCD remain active.
            </p>
          </div>
          <button
            onClick={retry}
            disabled={retrying}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-colors relative z-10 disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-3 h-3', retrying && 'animate-spin')} />
            {retrying ? 'Retrying...' : 'Retry Connection'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ResponseBubble ───────────────────────────────────────────────────────────

function ResponseBubble({ text, isStreaming, emotion }: {
  text: string; isStreaming: boolean; emotion: Emotion;
}) {
  const cfg = EMOTION_CFG[emotion] ?? EMOTION_CFG.neutral;
  if (!text && !isStreaming) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 border-2 transition-all duration-500 relative"
      style={{ borderColor: cfg.ring, backgroundColor: cfg.bg }}
    >
      <p className="text-sm font-medium text-zinc-800 leading-relaxed">
        {text || '…'}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1 rounded-sm align-middle animate-pulse"
            style={{ backgroundColor: cfg.color }} />
        )}
      </p>
      {/* LCD preview — first 16 chars */}
      <div className="mt-3 pt-3 border-t border-zinc-200/60">
        <div className="flex items-center gap-2 mb-1">
          <MonitorSpeaker className="w-3 h-3 text-zinc-400" />
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">16×2 LCD Preview</span>
        </div>
        <div className="font-mono text-[11px] bg-zinc-900 text-green-400 rounded-lg px-3 py-2 leading-5">
          <div className="truncate w-[16ch]">{(emotion.toUpperCase() + '        ').slice(0, 16)}</div>
          <div className="truncate w-[16ch]">{(text || '').slice(0, 16).padEnd(16)}</div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── KinematicsLog ────────────────────────────────────────────────────────────

function KinematicsLog({ log, distanceCm }: {
  log: KinematicsLogEntry[]; distanceCm?: number;
}) {
  const statusColor = { confirmed: 'text-emerald-400', sent: 'text-sky-400', timeout: 'text-amber-400' };
  const statusLabel = { confirmed: 'OK', sent: 'SENT', timeout: 'TMO' };

  return (
    <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-3 font-mono text-[11px]">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800">
        <span className="text-zinc-500 font-bold uppercase tracking-widest text-[9px] flex items-center gap-1">
          <Activity className="w-3 h-3" /> Kinematics Log
        </span>
        {distanceCm !== undefined && (
          <span className="text-sky-400 flex items-center gap-1">
            <Ruler className="w-3 h-3" /> {distanceCm}cm
          </span>
        )}
      </div>
      {log.length === 0 ? (
        <p className="text-zinc-700 text-center py-2">No commands yet</p>
      ) : (
        <div className="space-y-1 max-h-[120px] overflow-y-auto">
          {[...log].reverse().slice(0, 6).map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-zinc-400">
              <span className="text-zinc-600">→</span>
              <span className="text-white font-bold w-14 truncate">{entry.command}</span>
              {entry.speed !== undefined && <span>s:{entry.speed}</span>}
              {entry.duration_ms !== undefined && <span>{entry.duration_ms}ms</span>}
              <span className={clsx('ml-auto font-bold', statusColor[entry.status])}>
                [{statusLabel[entry.status]}]
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── QuickActionBar ───────────────────────────────────────────────────────────

function QuickActionBar({ onCommand }: { onCommand: (cmd: string) => void }) {
  const btn = (cmd: string, icon: React.ReactNode, label: string, extra = '') => (
    <button
      onPointerDown={() => onCommand(cmd)}
      className={clsx(
        'flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-3 font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 select-none',
        extra || 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <div className="grid grid-cols-3 gap-1.5">
        <div />
        {btn('forward', <ChevronUp className="w-4 h-4" />, 'Fwd')}
        <div />
        {btn('left', <ChevronLeft className="w-4 h-4" />, 'Left')}
        {btn('stop', <Square className="w-4 h-4" />, 'Stop', 'bg-red-900/60 hover:bg-red-800 text-red-300')}
        {btn('right', <ChevronRight className="w-4 h-4" />, 'Right')}
        <div />
        {btn('backward', <ChevronDown className="w-4 h-4" />, 'Back')}
        <div />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RobotCommandCenter({
  ip, esp32Online, esp32Latency, esp32DistanceCm,
  kinematicsLog, isGenerating, isSpeaking,
  emotion, robotSpeakingText, isRobotStreaming,
  onSend, onEmergencyStop, isMuted, onMuteChange,
  selectedTool, onToolSelect, inputText, onInputChange,
}: RobotCommandCenterProps) {
  const handleQuickCommand = useCallback(async (cmd: string) => {
    await executeKinematicsSingle({ command: cmd, speed: 180, duration_ms: 400 });
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
      {/* Connection Status Bar */}
      <ConnectionStatusBar
        ip={ip}
        online={esp32Online}
        latencyMs={esp32Latency}
        distanceCm={esp32DistanceCm}
        onEmergencyStop={onEmergencyStop}
      />

      {/* Main Grid */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left — Video Feed */}
        <div className="flex-1 p-3 min-w-0">
          <VideoFeedPanel ip={ip} />
        </div>

        {/* Right — Cognition Sidebar */}
        <div className="w-[320px] flex-shrink-0 flex flex-col gap-3 p-3 overflow-y-auto border-l border-zinc-800">
          {/* Emotion Visualizer */}
          <div className="flex flex-col items-center py-3 bg-zinc-900 rounded-2xl border border-zinc-800">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-3 flex items-center gap-1">
              <Cpu className="w-3 h-3" /> Cognitive State
            </p>
            <EmotionVisualizer emotion={emotion as Emotion} />
          </div>

          {/* Response Bubble */}
          <ResponseBubble
            text={robotSpeakingText}
            isStreaming={isRobotStreaming}
            emotion={emotion as Emotion}
          />

          {/* Kinematics Log */}
          <KinematicsLog log={kinematicsLog} distanceCm={esp32DistanceCm} />

          {/* Quick Action D-Pad */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-3 text-center flex items-center justify-center gap-1">
              <Zap className="w-3 h-3" /> Direct Control <span className="text-zinc-700 font-normal normal-case tracking-normal">(WASD/Arrows)</span>
            </p>
            <QuickActionBar onCommand={handleQuickCommand} />
          </div>
        </div>
      </div>

      {/* Bottom Input Bar */}
      <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2">
        <ChatInput
          onSend={onSend}
          disabled={isGenerating}
          voiceMode={false}
          value={inputText}
          onChange={onInputChange}
          isMuted={isMuted}
          onMuteChange={onMuteChange}
          selectedTool={selectedTool}
          onToolSelect={onToolSelect}
        />
      </div>
    </div>
  );
}
