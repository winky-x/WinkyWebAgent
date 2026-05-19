/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatSession, Attachment, GenerateOptions, Message, generateSpeechStream, PCMStreamPlayer } from '@/lib/gemini';
import { LiveSession } from '@/lib/live';
import { Sparkles, Volume2, BrainCircuit, ArrowRight, Zap, Trash2, AudioLines, SquareDashedMousePointer, Globe, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { executeKinematicsSequential, executeKinematicsSingle, pingESP32, KinematicsLogEntry } from './lib/robotManager';
import { RobotCommandCenter } from '@/components/RobotCommandCenter';
import { useRobotKeyboard } from './hooks/useRobotKeyboard';

// ============================================================================
// SpeechOrchestrator — Sequential, Gapless, Race-Condition-Free TTS
// ============================================================================
class SpeechOrchestrator {
  private textBuffer: string = '';
  private alreadyProcessedLength: number = 0;
  private processingChain: Promise<void> = Promise.resolve();
  private player: PCMStreamPlayer;
  private isCancelled: boolean = false;
  private readonly SENTENCE_DELIMITER = /[.?!।\n]/;
  private readonly MAX_WORDS_BEFORE_FLUSH = 30;

  constructor(player: PCMStreamPlayer) {
    this.player = player;
  }

  /**
   * Called with the FULL accumulated text from the stream on every chunk.
   * Internally diffs against already-processed length to get the new delta.
   */
  push(fullText: string): void {
    if (this.isCancelled) return;
    // Extract only the new delta text since last push
    const newDelta = fullText.slice(this.alreadyProcessedLength);
    this.alreadyProcessedLength = fullText.length;
    this.textBuffer += newDelta;
    this._tryExtractSentences();
  }

  /** Force-flush any remaining text in buffer (call when stream ends) */
  flush(): void {
    if (this.isCancelled) return;
    const remaining = this.textBuffer.trim();
    if (remaining) {
      console.log('[TTS Queue] Flushing remainder:', remaining.substring(0, 40));
      this._enqueue(remaining);
      this.textBuffer = '';
    }
  }

  cancel(): void {
    this.isCancelled = true;
    this.textBuffer = '';
    this.alreadyProcessedLength = 0;
    this.player.stop();
  }

  private _tryExtractSentences(): void {
    // Extract ALL complete sentences — fixes Bug #4 (single-match regex)
    while (true) {
      const delimiterIdx = this.textBuffer.search(this.SENTENCE_DELIMITER);
      if (delimiterIdx === -1) {
        // No delimiter yet — check overflow word count threshold
        const wordCount = this.textBuffer.trim().split(/\s+/).filter(Boolean).length;
        if (wordCount >= this.MAX_WORDS_BEFORE_FLUSH) {
          const lastSpaceIdx = this.textBuffer.lastIndexOf(' ');
          if (lastSpaceIdx > 0) {
            const sentence = this.textBuffer.slice(0, lastSpaceIdx).trim();
            this.textBuffer = this.textBuffer.slice(lastSpaceIdx + 1);
            this._enqueue(sentence);
            continue;
          }
        }
        break;
      }
      const sentence = this.textBuffer.slice(0, delimiterIdx + 1).trim();
      this.textBuffer = this.textBuffer.slice(delimiterIdx + 1).trimStart();
      if (sentence) this._enqueue(sentence);
    }
  }

  private _enqueue(sentence: string): void {
    // CRITICAL: Promise chain ensures sentences are ALWAYS sequential — fixes Bug #1
    this.processingChain = this.processingChain.then(async () => {
      if (this.isCancelled || !this.player.isActive) return;
      const clean = sentence
        .replace(/\*Using tool:.*?\*\n?/g, '')
        .replace(/[`*_#]/g, '')
        .trim();
      if (!clean) return;
      console.log('[TTS Queue] Enqueuing sentence:', clean.substring(0, 40));
      try {
        const stream = generateSpeechStream(clean);
        for await (const pcmChunk of stream) {
          if (this.isCancelled || !this.player.isActive) return;
          await this.player.feed(pcmChunk);
        }
      } catch (err) {
        if (!this.isCancelled) {
          console.error('[SpeechOrchestrator] TTS error:', err);
        }
      }
    });
  }

  async waitForCompletion(): Promise<void> {
    return this.processingChain;
  }
}
// ============================================================================

export default function App() {
  const [activeView, setActiveView] = useState<'chat' | 'robot'>('chat');
  const [currentEmotion, setCurrentEmotion] = useState<string>('neutral');
  const [imgError, setImgError] = useState(false);
  const hasBootedRef = useRef(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const pcmPlayerRef = useRef<PCMStreamPlayer | null>(null);
  // Robot Mode telemetry state
  const [esp32Online, setEsp32Online] = useState<boolean | null>(null);
  const [esp32Latency, setEsp32Latency] = useState<number>(0);
  const [esp32DistanceCm, setEsp32DistanceCm] = useState<number | undefined>(undefined);
  const [kinematicsLog, setKinematicsLog] = useState<KinematicsLogEntry[]>([]);
  const [robotSpeakingText, setRobotSpeakingText] = useState<string>('');
  const [isRobotStreaming, setIsRobotStreaming] = useState<boolean>(false);

  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentAssistantMessageId = useRef<string>('');
  const currentAssistantText = useRef<string>('');
  const currentUserMessageId = useRef<string>('');
  const currentUserText = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatSessionRef = useRef<ChatSession | null>(null);
  if (!chatSessionRef.current) {
    chatSessionRef.current = new ChatSession();
  }

  const liveSessionRef = useRef<LiveSession | null>(null);
  if (!liveSessionRef.current) {
    liveSessionRef.current = new LiveSession();
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Robot Mode Startup + ESP32 Health Monitor
  useEffect(() => {
    if (activeView !== 'robot') return;
    const ip = (import.meta as any).env.VITE_WINKY_IP || '192.168.1.100';

    if (!hasBootedRef.current) {
      hasBootedRef.current = true;
      // Initial connection check
      pingESP32(ip).then(({ online, latencyMs, distanceCm }) => {
        setEsp32Online(online);
        setEsp32Latency(latencyMs);
        if (distanceCm !== undefined) setEsp32DistanceCm(distanceCm);
      });
      // Fire wakeup signal
      fetch(`http://${ip}/api/wakeup`, { method: 'GET', mode: 'no-cors' }).catch(() => {});
      // Boot greeting
      setTimeout(() => {
        handleSend("System: You have just booted up. Look at your surroundings and greet the user autonomously.");
      }, 800);
    }

    // Periodic health ping every 5 seconds
    const pingInterval = setInterval(async () => {
      const { online, latencyMs, distanceCm } = await pingESP32(ip);
      setEsp32Online(online);
      setEsp32Latency(latencyMs);
      if (distanceCm !== undefined) setEsp32DistanceCm(distanceCm);
    }, 5000);

    return () => clearInterval(pingInterval);
  }, [activeView]);

  // Keyboard control — only active in Robot Mode, not when input focused
  useRobotKeyboard(activeView === 'robot');

  useEffect(() => {
    if (activeView === 'chat' && voiceMode && liveSessionRef.current) {
      liveSessionRef.current.onMessage = (msg) => {
        if (msg.role === 'assistant') {
          if (!currentAssistantMessageId.current) {
            currentAssistantMessageId.current = crypto.randomUUID();
            currentAssistantText.current = msg.text || '';

            if (currentUserMessageId.current && !currentUserText.current.trim()) {
              setMessages(prev => prev.filter(m => m.id !== currentUserMessageId.current));
            }

            currentUserMessageId.current = '';
            currentUserText.current = '';

            const uiText = (currentAssistantText.current || '').split(/\*Using tool:[^*]*\*/g).join('');
            setMessages(prev => {
              const updatedPrev = prev.map(m => m.role === 'user' ? { ...m, status: 'read' as const } : m);
              return [...updatedPrev, {
                id: currentAssistantMessageId.current,
                role: 'assistant',
                text: uiText,
                isStreaming: !msg.isFinal,
                timestamp: new Date()
              }];
            });
            setIsSpeaking(true);
          } else {
            currentAssistantText.current += (msg.text || '');
            const uiText = (currentAssistantText.current || '').split(/\*Using tool:[^*]*\*/g).join('');

            setMessages(prev => prev.map(m =>
              m.id === currentAssistantMessageId.current
                ? { ...m, text: uiText, isStreaming: !msg.isFinal }
                : m
            ));
          }

          if (msg.isFinal) {
            currentAssistantMessageId.current = '';
            currentAssistantText.current = '';
            setIsSpeaking(false);
          }
        } else if (msg.role === 'user') {
          if (!currentUserMessageId.current) {
            currentUserMessageId.current = crypto.randomUUID();
            currentUserText.current = msg.text || '';

            setMessages(prev => [...prev, {
              id: currentUserMessageId.current,
              role: 'user',
              text: currentUserText.current,
              isStreaming: !msg.isFinal,
              timestamp: new Date(),
              status: 'sent'
            }]);
          } else {
            if (msg.isTranscription) {
              currentUserText.current = msg.text || '';
            } else {
              currentUserText.current += (msg.text || '');
            }

            setMessages(prev => prev.map(m =>
              m.id === currentUserMessageId.current
                ? { ...m, text: currentUserText.current, isStreaming: !msg.isFinal }
                : m
            ));
          }

          if (msg.isFinal) {
            currentUserMessageId.current = '';
            currentUserText.current = '';
          }
        }
      };

      liveSessionRef.current.onRawMessage = (msg: any) => { };

      liveSessionRef.current.onInterrupted = () => {
        setIsSpeaking(false);
        currentAssistantMessageId.current = '';
        currentAssistantText.current = '';
      };

      liveSessionRef.current.onError = (error) => {
        console.error("Live API Error:", error);
        toast.error(error.message || "Voice connection error.");
        setIsSpeaking(false);
        setVoiceMode(false);
      };

      liveSessionRef.current.setMuted(isMuted);
      liveSessionRef.current.connect();
    } else {
      if (liveSessionRef.current) {
        liveSessionRef.current.disconnect();
      }
    }

    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.disconnect();
      }
    };
  }, [activeView, voiceMode, isMuted]);

  const stopSpeaking = () => {
    if (currentAudioSourceRef.current) {
      try { currentAudioSourceRef.current.stop(); } catch (_) {}
      currentAudioSourceRef.current = null;
    }
    if (pcmPlayerRef.current) {
      pcmPlayerRef.current.stop(); // sets isActive=false, kills all scheduled sources
      pcmPlayerRef.current = null; // dereference so next request creates a fresh player
    }
    if (liveSessionRef.current) {
      liveSessionRef.current.stopAudio();
    }
    setIsSpeaking(false);
  };

  const handleEmergencyStop = () => {
    stopSpeaking();
    executeKinematicsSingle({ command: 'stop', speed: 0, duration_ms: 100 });
    toast.error('Emergency Stop fired — all motors halted.');
  };

  const typeTextToInput = (text: string) => {
    setInputText(text);
  };

  const captureRobotVision = async (): Promise<Attachment | null> => {
    const ip = (import.meta as any).env.VITE_WINKY_IP || '192.168.1.100';
    try {
      // Attempt to capture a single frame from the robot's camera
      const response = await fetch(`http://${ip}/capture`);
      if (!response.ok) throw new Error("Hardware capture failed");
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({
            mimeType: 'image/jpeg',
            data: base64,
            url: URL.createObjectURL(blob)
          });
        };
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn("[Vision Capture] Hardware frame offline:", err);
      return null;
    }
  };

  const handleSend = async (text: string, attachments: Attachment[] = []) => {
    stopSpeaking();

    const safeText = text || '';
    const safeAttachments = [...(attachments || [])];
    const isSystemTrigger = safeText.startsWith("System:");

    // Autonomous Vision: Auto-attach robot's eye view when in Robot Mode
    if (activeView === 'robot' && !isSystemTrigger) {
      const visionFrame = await captureRobotVision();
      if (visionFrame) {
        safeAttachments.push(visionFrame);
      }
    }

    // Only inject visible bubble if it's a direct user turn
    if (!isSystemTrigger) {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        text: safeText,
        attachments: safeAttachments,
        timestamp: new Date(),
        status: 'sent'
      };
      setMessages((prev) => [...prev, userMessage]);
    }

    // Direct Voice relay if standard view is configured and session is active
    if (activeView === 'chat' && voiceMode && liveSessionRef.current && liveSessionRef.current.isConnected) {
      if ((safeText.trim() || safeAttachments.length > 0) && !isSystemTrigger) {
        setMessages(prev => prev.map(m => m.role === 'user' ? { ...m, status: 'read' as const } : m));
        liveSessionRef.current.sendText(safeText, safeAttachments);
        return;
      }
    }

    setIsGenerating(true);

    const assistantMessageId = crypto.randomUUID();
    setMessages((prev) => {
      const updatedPrev = prev.map(m => m.role === 'user' ? { ...m, status: 'read' as const } : m);
      return [
        ...updatedPrev,
        {
          id: assistantMessageId,
          role: 'assistant',
          text: isSystemTrigger ? 'Initializing ESP32-CAM · HC-SR04 · L298N · LCD...' : '',
          isStreaming: true,
          timestamp: new Date()
        },
      ];
    });

    const currentSelectedTool = selectedTool;
    setSelectedTool('');

    // Always create a FRESH player and orchestrator per request — fixes Bug #3
    const freshPlayer = new PCMStreamPlayer();
    pcmPlayerRef.current = freshPlayer;
    const orchestrator = new SpeechOrchestrator(freshPlayer);

    try {
      const stream = chatSessionRef.current!.sendMessageStream(safeText, safeAttachments, {
        voiceMode: activeView === 'robot' ? true : voiceMode,
        isRobotMode: activeView === 'robot',
        selectedTool: currentSelectedTool || '',
        provider: 'google',
        modelId: activeView === 'robot' ? 'gemini-2.5-flash-lite' : (voiceMode ? 'gemini-2.5-flash-lite' : 'gemini-3.1-flash-lite-preview')
      });

      let finalText = "";
      let finalThought = "";

      for await (const chunk of stream) {
        if (chunk.text) finalText = chunk.text;
        if (chunk.thought) finalThought = chunk.thought;

        let uiText = "";
        let currentParsedEmotion = currentEmotion;

        if (activeView === 'robot') {
          // Task 3: Parse stream chunks dynamically to separate cognition parameters safely
          const cleaned = finalText.replace(/```json/g, '').replace(/```/g, '').trim();

          const spokenMatch = cleaned.match(/"spoken_reply"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          if (spokenMatch && spokenMatch[1]) {
            uiText = spokenMatch[1];
          } else {
            uiText = cleaned.includes('"spoken_reply"') ? "Analyzing spatial nodes..." : cleaned;
          }

          const emotionMatch = cleaned.match(/"emotion"\s*:\s*"([^"]+)"/);
          if (emotionMatch && emotionMatch[1]) {
            currentParsedEmotion = emotionMatch[1];
            setCurrentEmotion(currentParsedEmotion);
          }
        } else {
          uiText = (finalText || '').split(/\*Using tool:[^*]*\*/g).join('');

          // Feed the orchestrator with the full accumulated UI text — it diffs internally
          if (voiceMode) {
            setIsSpeaking(true);
            orchestrator.push(uiText);
          }
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                ...msg,
                text: uiText,
                thought: finalThought,
                isThinking: chunk.isThinking,
                isStreaming: !chunk.isDone,
                groundingChunks: chunk.groundingChunks || msg.groundingChunks,
              }
              : msg
          )
        );
      }

      // Completion Handler
      if (activeView === 'robot') {
        const cleaned = finalText.replace(/```json/g, '').replace(/```/g, '').trim();
        let finalSpoken = "";
        let actionsToRun: any[] = [];

        try {
          const parsed = JSON.parse(cleaned);
          finalSpoken = parsed.spoken_reply || "";
          if (parsed.emotion) setCurrentEmotion(parsed.emotion);
          if (parsed.physical_action && Array.isArray(parsed.physical_action)) {
            actionsToRun = parsed.physical_action;
          }
        } catch (e) {
          // Fallback parsing heuristics if invalid formatting arrives
          const spokenMatch = cleaned.match(/"spoken_reply"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          finalSpoken = spokenMatch ? spokenMatch[1] : "Telemetry finalized successfully.";

          const emotionMatch = cleaned.match(/"emotion"\s*:\s*"([^"]+)"/);
          if (emotionMatch && emotionMatch[1]) setCurrentEmotion(emotionMatch[1]);

          const actionBlock = cleaned.match(/"physical_action"\s*:\s*\[([\s\S]*?)\]/);
          if (actionBlock && actionBlock[1]) {
            const cmdMatch = actionBlock[1].match(/"command"\s*:\s*"([^"]+)"/);
            const speedMatch = actionBlock[1].match(/"speed"\s*:\s*(\d+)/);
            const durMatch = actionBlock[1].match(/"duration_ms"\s*:\s*(\d+)/);
            if (cmdMatch) {
              actionsToRun.push({
                command: cmdMatch[1],
                speed: speedMatch ? parseInt(speedMatch[1], 10) : 200,
                duration_ms: durMatch ? parseInt(durMatch[1], 10) : 1000
              });
            }
          }
        }

        // Apply clean final text
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, text: finalSpoken, isStreaming: false }
              : msg
          )
        );

        // Set text for ResponseBubble in RobotCommandCenter
        setRobotSpeakingText(finalSpoken);
        setIsRobotStreaming(false);

        // Execute kinematics SEQUENTIALLY with log callback
        if (actionsToRun.length > 0) {
          executeKinematicsSequential(actionsToRun, (entry) => {
            setKinematicsLog(prev => [...prev.slice(-9), entry]); // keep last 10
          });
        }

        // Streaming TTS via SpeechOrchestrator (same as chat mode — low latency)
        if (finalSpoken) {
          setIsSpeaking(true);
          const robotPlayer = new PCMStreamPlayer();
          pcmPlayerRef.current = robotPlayer;
          const robotOrchestrator = new SpeechOrchestrator(robotPlayer);
          robotOrchestrator.push(finalSpoken);
          robotOrchestrator.flush();
          robotOrchestrator.waitForCompletion().then(() => setIsSpeaking(false));
        }

      } else {
        if (voiceMode) {
          orchestrator.flush();                   // Drain any remaining unpunctuated text
          await orchestrator.waitForCompletion(); // Wait for all audio to finish before cleanup
          setIsSpeaking(false);
        }
      }

    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || "Failed to generate response");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
              ...msg,
              text: msg.text ? msg.text : error.message || 'Failed to generate response.',
              isStreaming: false,
              isError: true,
            }
            : msg
        )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    chatSessionRef.current = new ChatSession();
    toast.success("Chat cleared");
  };



  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-sans">
      <header className="flex flex-row items-center justify-between px-2 sm:px-6 py-2 sm:py-4 bg-white/70 backdrop-blur-xl border-b border-zinc-200/50 sticky top-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3">
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-sm transition-all duration-500 ${isSpeaking ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-none'}`}>
              <img
                src="/logo.png"
                alt="Winky Logo"
                className={`w-5 h-5 sm:w-6 sm:h-6 object-contain transition-transform duration-500 ${isSpeaking ? 'scale-110' : 'hover:scale-110'}`}
              />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-zinc-900 tracking-tight font-display">Winky AI</h1>
              <p className="hidden sm:flex text-xs text-zinc-500 items-center gap-1 font-medium">
                <Sparkles className="w-3 h-3 text-violet-500" />
                {activeView === 'robot' ? 'IoT Platform Mode' : voiceMode ? 'Voice Mode Active' : 'Thinking Mode'}
              </p>
            </div>
        </div>

        {/* Global Nav Elements */}
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            onClick={() => { setActiveView('robot'); setImgError(false); }}
            className={`flex items-center gap-1 sm:gap-2 px-1.5 py-1 sm:px-4 sm:py-2 rounded-xl text-sm font-bold transition-all duration-300 ${activeView === 'robot' ? 'bg-violet-600 text-white shadow-md shadow-violet-100' : 'bg-violet-50 text-violet-600 hover:bg-violet-100/80 border border-violet-100/50'}`}
          >
            <Radio className={`w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 ${activeView === 'robot' ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Initialize Winky Physical Agent</span>
            <span className="inline sm:hidden text-[10px]">WinkyRobot</span>
            
          </button>

          {activeView === 'robot' && (
            <button
              onClick={() => setActiveView('chat')}
              className="px-3 py-2 bg-zinc-100 text-zinc-600 hover:text-zinc-900 rounded-xl text-sm font-semibold transition-colors"
            >
              Standard View
            </button>
          )}

          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
              title="Clear Chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {activeView === 'chat' && (
            <div className="flex items-center bg-zinc-100/80 p-0.5 sm:p-1 rounded-xl border border-zinc-200/50 backdrop-blur-sm">
              <button
                onClick={() => { setVoiceMode(true); stopSpeaking(); }}
                className={`flex items-center gap-1 sm:gap-2 px-1.5 py-1 sm:px-4 sm:py-1.5 rounded-lg text-[10px] sm:text-sm font-semibold transition-all duration-300 ${voiceMode ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <Volume2 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="inline">Voice</span>
              </button>
              <button
                onClick={() => { setVoiceMode(false); stopSpeaking(); }}
                className={`flex items-center gap-1 sm:gap-2 px-1.5 py-1 sm:px-4 sm:py-1.5 rounded-lg text-[10px] sm:text-sm font-semibold transition-all duration-300 ${!voiceMode ? 'bg-white text-violet-600 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <BrainCircuit className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="inline">Think</span>
              </button>
            </div>
          )}

        </div>
      </header>

      {/* Main Viewport Content Splitter */}
      {activeView === 'robot' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <RobotCommandCenter
            ip={(import.meta as any).env.VITE_WINKY_IP || '192.168.1.100'}
            esp32Online={esp32Online}
            esp32Latency={esp32Latency}
            esp32DistanceCm={esp32DistanceCm}
            kinematicsLog={kinematicsLog}
            messages={messages}
            isGenerating={isGenerating}
            isSpeaking={isSpeaking}
            emotion={currentEmotion as any}
            robotSpeakingText={robotSpeakingText}
            isRobotStreaming={isRobotStreaming}
            onSend={handleSend}
            onEmergencyStop={handleEmergencyStop}
            isMuted={isMuted}
            onMuteChange={setIsMuted}
            selectedTool={selectedTool}
            onToolSelect={setSelectedTool}
            inputText={inputText}
            onInputChange={setInputText}
          />
        </div>
      ) : (
        /* Legacy Standard View Presentation */
        <>
          <main className="flex-1 overflow-y-auto pb-20 sm:pb-32">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center justify-center min-h-full text-center px-4 py-4 sm:py-12"
              >
                <div className={`w-16 h-16 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center mb-4 sm:mb-8 transition-all duration-300 shadow-sm ${voiceMode
                  ? 'bg-transparent text-black'
                  : (Date.now() % 2 === 0)
                    ? 'bg-black border border-zinc-800 text-white'
                    : 'bg-violet-50 border border-violet-100 text-violet-600'
                  }`}>
                  {voiceMode ? (
                    <AudioLines className="w-8 h-8 sm:w-14 sm:h-14 animate-pulse" />
                  ) : (
                    (Date.now() % 2 === 0) ? (
                      <Globe className="w-8 h-8 sm:w-10 sm:h-10 animate-spin-slow" />
                    ) : (
                      <SquareDashedMousePointer className="w-8 h-8 sm:w-10 sm:h-10 animate-spin-slow" />
                    )
                  )}
                </div>
                <h2 className="text-2xl sm:text-4xl font-bold text-zinc-900 mb-2 sm:mb-4 font-display tracking-tight">
                  {voiceMode ? "Let's Talk!" : "How can I help today?"}
                </h2>
                <p className="text-zinc-500 max-w-md mb-6 sm:mb-12 text-sm sm:text-lg">
                  {voiceMode
                    ? "I'll respond quickly and speak my answers out loud. Perfect for conversation!"
                    : "I'll take my time to reason through complex problems using advanced tools."}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl w-full" onMouseLeave={() => setHoveredCard(null)}>
                  {[
                    {
                      title: 'Smart Tools',
                      desc: 'Web Search, Weather, Math, Time & more',
                      icon: <Zap className="w-5 h-5 text-amber-500" />,
                      details: [
                        { label: 'Fast Web Search', prompt: "What's the latest news on AI?" },
                        { label: 'Real-time Weather', prompt: "What's the weather in Tokyo right now?" },
                        { label: 'Complex Math', prompt: "Calculate (452 * 1.08) / 12." },
                        { label: 'Time & Date', prompt: "What time is it in London?" }
                      ],
                    },
                    {
                      title: 'Deep Reasoning',
                      desc: 'Complex problem solving & logic',
                      icon: <Sparkles className="w-5 h-5 text-violet-500" />,
                      details: [
                        { label: 'Read Webpages', prompt: "Read https://en.wikipedia.org/wiki/Quantum_computing and summarize it." },
                        { label: 'Code Generation', prompt: "Write a React component for a modern login form." },
                        { label: 'Data Analysis', prompt: "Compare the economic models of capitalism and socialism." }
                      ],
                    },
                  ].map((feature, idx) => {
                    const isHovered = hoveredCard === idx;
                    const isOthersHovered = hoveredCard !== null && hoveredCard !== idx;

                    return (
                      <div
                        key={idx}
                        onMouseEnter={() => setHoveredCard(idx)}
                        className={`p-4 sm:p-6 bg-white rounded-3xl border border-zinc-200/80 shadow-sm text-left transition-all duration-500 overflow-hidden relative
                            ${isHovered ? 'shadow-xl scale-[1.02] border-violet-200 ring-4 ring-violet-50 z-10' : ''}
                            ${isOthersHovered ? 'opacity-50 scale-[0.98]' : ''}
                          `}
                      >
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                          <div className="p-1.5 sm:p-2 bg-zinc-50 rounded-xl border border-zinc-100">
                            {feature.icon}
                          </div>
                          <h3 className="text-base sm:text-lg font-bold text-zinc-900 font-display">{feature.title}</h3>
                        </div>
                        <p className={`text-zinc-500 text-xs sm:text-sm transition-all duration-300 ${isHovered ? 'opacity-0 h-0' : 'opacity-100 h-auto'}`}>
                          {feature.desc}
                        </p>

                        <div className={`transition-all duration-500 flex flex-col gap-2 ${isHovered ? 'opacity-100 max-h-96 mt-2' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                          <div className="h-px w-full bg-zinc-100 mb-2" />
                          {feature.details.map((detail, dIdx) => (
                            <button
                              key={dIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                typeTextToInput(detail.prompt);
                              }}
                              className="flex items-center justify-between text-xs sm:text-sm text-zinc-700 font-medium bg-zinc-50 hover:bg-violet-50 hover:text-violet-700 p-2 sm:p-3 rounded-xl transition-colors text-left w-full group border border-transparent hover:border-violet-100"
                            >
                              <span>{detail.label}</span>
                              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <div className="max-w-3xl mx-auto w-full pb-8 pt-6 px-4">
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </main>

          <div className="fixed bottom-0 left-0 right-0 p-2 sm:p-4 bg-gradient-to-t from-zinc-50 via-zinc-50 to-transparent pointer-events-none z-40">
            <div className="max-w-3xl mx-auto w-full pointer-events-auto">
              <ChatInput
                onSend={handleSend}
                disabled={isGenerating}
                voiceMode={voiceMode}
                value={inputText}
                onChange={setInputText}
                isMuted={isMuted}
                onMuteChange={setIsMuted}
                selectedTool={selectedTool}
                onToolSelect={setSelectedTool}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
