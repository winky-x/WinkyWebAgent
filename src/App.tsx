/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatSession, Attachment, GenerateOptions, Message, generateSpeechStream, PCMStreamPlayer } from '@/lib/gemini';
import { LiveSession } from '@/lib/live';
import { Sparkles, Volume2, Atom, ArrowRight, Zap, Trash2, AudioLines, SquareDashedMousePointer, Globe, Radio, Terminal, ShieldAlert } from 'lucide-react';
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
  const [isOsintMode, setIsOsintMode] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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

  // Handle incoming redirect and auto-send
  useEffect(() => {
    const handleIncomingForward = async () => {
      const params = new URLSearchParams(window.location.search);
      const autoSend = params.get('auto_send');
      const incomingText = params.get('q');
      const incomingTool = params.get('tool');
      let incomingAttachments: Attachment[] = [];

      // 1. Process base64 attachments from the URL hash
      if (window.location.hash.startsWith('#attachments=')) {
        try {
          const encodedData = window.location.hash.slice('#attachments='.length);
          const parsed = JSON.parse(decodeURIComponent(encodedData));

          incomingAttachments = parsed.map((att: any) => ({
            mimeType: att.mimeType,
            data: att.data, // base64 string
            url: `data:${att.mimeType};base64,${att.data}`
          }));
        } catch (error) {
          console.error('Failed to parse incoming attachments from hash:', error);
        }
      }

      if (autoSend === 'true') {
        // 2. Set the UI states
        if (incomingText) setInputText(incomingText);
        if (incomingTool) setSelectedTool(incomingTool);
        if (incomingAttachments.length > 0) setAttachments(incomingAttachments);

        // 3. Automatically trigger the send function
        if (activeView === 'chat' && voiceMode) {
          // In Voice Mode, wait for WebSocket connection to be active so response is spoken
          const checkConnection = setInterval(() => {
            if (liveSessionRef.current && liveSessionRef.current.isConnected) {
              clearInterval(checkConnection);
              handleSend(incomingText || '', incomingAttachments);
              setInputText('');
              setAttachments([]);
            }
          }, 100);

          // Safety timeout after 5 seconds to fallback to REST stream
          setTimeout(() => {
            clearInterval(checkConnection);
            if (!liveSessionRef.current || !liveSessionRef.current.isConnected) {
              handleSend(incomingText || '', incomingAttachments);
              setInputText('');
              setAttachments([]);
            }
          }, 5000);
        } else {
          setTimeout(() => {
            handleSend(incomingText || '', incomingAttachments);
            setInputText('');
            setAttachments([]);
          }, 100);
        }

        // 4. Clean up the URL so it doesn't re-trigger on page refresh
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    handleIncomingForward();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      fetch(`http://${ip}/api/wakeup`, { method: 'GET', mode: 'no-cors' }).catch(() => { });
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
  }, [activeView, voiceMode]);

  // Sync mute state to Live session without triggering full reconnect
  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.setMuted(isMuted);
    }
  }, [isMuted]);

  const stopSpeaking = () => {
    if (currentAudioSourceRef.current) {
      try { currentAudioSourceRef.current.stop(); } catch (_) { }
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

    // Force reset UI message trackers so new responses start in a fresh bubble
    currentAssistantMessageId.current = '';
    currentAssistantText.current = '';
    currentUserMessageId.current = '';
    currentUserText.current = '';
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
      let resolvedModelId = 'gemini-2.5-flash-lite';
      if (activeView === 'robot') {
        resolvedModelId = 'gemini-2.5-flash-lite';
      } else if (currentSelectedTool === 'fast_google_search') {
        resolvedModelId = 'gemini-2.5-flash-lite';
      } else if (currentSelectedTool === 'detailed_google_search') {
        resolvedModelId = 'gemini-2.5-flash';
      } else if (voiceMode) {
        resolvedModelId = 'gemini-2.5-flash-lite';
      } else {
        resolvedModelId = 'gemini-3.1-flash-lite-preview';
      }

      const stream = chatSessionRef.current!.sendMessageStream(safeText, safeAttachments, {
        voiceMode: activeView === 'robot' ? true : voiceMode,
        isRobotMode: activeView === 'robot',
        isOsintMode: isOsintMode,
        selectedTool: currentSelectedTool || '',
        provider: 'google',
        modelId: resolvedModelId
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
    <div className={`flex flex-col h-screen font-sans transition-colors duration-700 relative overflow-hidden ${!voiceMode && activeView === 'chat' ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'}`}>
      {/* Ambient Animated Mesh Background for Thinking Mode */}
      {!voiceMode && activeView === 'chat' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isOsintMode ? 0.6 : 0.5 }}
            transition={{ duration: 1 }}
            className={`absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[140px] ${isOsintMode ? 'bg-[#880808]/30' : 'bg-violet-600/20'}`}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isOsintMode ? 0.4 : 0.35 }}
            transition={{ duration: 1, delay: 0.3 }}
            className={`absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full blur-[140px] ${isOsintMode ? 'bg-red-900/20' : 'bg-indigo-600/20'}`}
          />
          <div className="absolute inset-0 bg-[radial-gradient(#475569_1px,transparent_1px)] [background-size:24px_24px] opacity-10" />
        </div>
      )}

      <header className={`flex flex-row items-center justify-between px-2 sm:px-6 py-2 sm:py-4 backdrop-blur-xl border-b sticky top-0 z-50 transition-colors duration-500 ${isOsintMode ? 'bg-zinc-950/90 border-red-900/40 shadow-lg shadow-red-950/20' : (!voiceMode && activeView === 'chat' ? 'bg-zinc-900/80 border-zinc-800/80' : 'bg-white/70 border-zinc-200/50')}`}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-sm transition-all duration-500 ${isSpeaking ? 'bg-emerald-500 ring-4 ring-emerald-50' : (isOsintMode ? 'bg-red-950 border border-red-800/60 ring-2 ring-red-700/30' : 'bg-none')}`}>
            <img
              src="/logo.png"
              alt="Winky Logo"
              className={`w-5 h-5 sm:w-6 sm:h-6 object-contain transition-transform duration-500 ${isSpeaking ? 'scale-110' : 'hover:scale-110'}`}
            />
          </div>
          <div>
            <h1 className={`text-base sm:text-xl font-bold tracking-tight font-display transition-colors duration-500 ${!voiceMode && activeView === 'chat' ? 'text-white' : 'text-zinc-900'}`}>Winky AI</h1>
            <p className={`hidden sm:flex text-xs items-center gap-1 font-medium transition-colors duration-500 ${!voiceMode && activeView === 'chat' ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {isOsintMode ? (
                <span className="flex items-center gap-1.5 font-mono text-red-400 font-bold">
                  <Terminal className="w-3 h-3 text-red-500 animate-pulse" />
                  HACKING SYSTEM READY
                </span>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  {activeView === 'robot' ? 'IoT Platform Mode' : voiceMode ? 'Voice Mode Active' : 'Thinking Mode (Deep Cognitive Intelligence)'}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Global Nav Elements */}
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            onClick={() => { setActiveView('robot'); setImgError(false); }}
            className={`flex items-center gap-1 sm:gap-2 px-1.5 py-1 sm:px-4 sm:py-2 rounded-xl text-sm font-bold transition-all duration-300 ${activeView === 'robot' ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20' : !voiceMode ? 'bg-zinc-800 text-violet-300 hover:bg-zinc-700 border border-zinc-700' : 'bg-violet-50 text-violet-600 hover:bg-violet-100/80 border border-violet-100/50'}`}
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
              className={`p-2 rounded-xl transition-colors ${!voiceMode && activeView === 'chat' ? 'text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40' : 'text-zinc-400 hover:text-rose-500 hover:bg-rose-50'}`}
              title="Clear Chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {activeView === 'chat' && (
            <div className={`flex items-center p-0.5 sm:p-1 rounded-xl border backdrop-blur-sm transition-colors duration-500 ${!voiceMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-zinc-100/80 border-zinc-200/50'}`}>
              <button
                onClick={() => { setVoiceMode(true); stopSpeaking(); }}
                className={`flex items-center gap-1 sm:gap-2 px-1.5 py-1 sm:px-4 sm:py-1.5 rounded-lg text-[10px] sm:text-sm font-semibold transition-all duration-300 ${voiceMode ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Volume2 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="inline">Voice</span>
              </button>
              <button
                onClick={() => { setVoiceMode(false); stopSpeaking(); }}
                className={`flex items-center gap-1 sm:gap-2 px-1.5 py-1 sm:px-4 sm:py-1.5 rounded-lg text-[10px] sm:text-sm font-semibold transition-all duration-300 ${!voiceMode ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30 ring-1 ring-violet-400/30' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <Atom className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="inline">Think</span>
              </button>
            </div>
          )}

        </div>
      </header>

      {/* Main Viewport Content Splitter */}
      {activeView === 'robot' ? (
        <div className="flex-1 min-h-0 overflow-hidden relative z-10">
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
            attachments={attachments}
            setAttachments={setAttachments}
          />
        </div>
      ) : (
        /* Legacy Standard View Presentation */
        <>
          <main className="flex-1 overflow-y-auto pb-20 sm:pb-32 relative z-10">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center justify-center min-h-full text-center px-4 py-4 sm:py-12"
              >
                <div className={`w-16 h-16 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center mb-4 sm:mb-8 transition-all duration-500 shadow-sm ${voiceMode
                  ? 'bg-transparent text-black'
                  : 'bg-zinc-900/90 border border-zinc-800 text-violet-400 shadow-2xl shadow-violet-950/40'
                  }`}>
                  {voiceMode ? (
                    <AudioLines className="w-8 h-8 sm:w-14 sm:h-14 animate-pulse text-zinc-900" />
                  ) : (
                    <Atom className="w-8 h-8 sm:w-12 sm:h-12 animate-pulse text-violet-400" />
                  )}
                </div>
                <h2 className={`text-2xl sm:text-4xl font-bold mb-2 sm:mb-4 font-display tracking-tight transition-colors duration-500 ${!voiceMode ? 'text-white' : 'text-zinc-900'}`}>
                  {voiceMode ? "Let's Talk!" : "Cognitive Reasoning Mode"}
                </h2>
                <p className={`max-w-md mb-6 sm:mb-12 text-sm sm:text-lg transition-colors duration-500 ${!voiceMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {voiceMode
                    ? "I'll respond quickly and speak my answers out loud. Perfect for conversation!"
                    : "Deep problem solving, web browsing, math computation & real-time telemetry."}
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
                      icon: <Sparkles className="w-5 h-5 text-violet-400" />,
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
                        className={`p-4 sm:p-6 rounded-3xl text-left transition-all duration-500 overflow-hidden relative border
                            ${!voiceMode
                            ? 'bg-zinc-900/80 border-zinc-800/80 shadow-2xl text-white'
                            : 'bg-white border-zinc-200/80 shadow-sm text-zinc-900'}
                            ${isHovered ? (!voiceMode ? 'shadow-violet-950/50 scale-[1.02] border-violet-500/60 ring-4 ring-violet-500/20 z-10' : 'shadow-xl scale-[1.02] border-violet-200 ring-4 ring-violet-50 z-10') : ''}
                            ${isOthersHovered ? 'opacity-50 scale-[0.98]' : ''}
                          `}
                      >
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                          <div className={`p-1.5 sm:p-2 rounded-xl border ${!voiceMode ? 'bg-zinc-800 border-zinc-700/60' : 'bg-zinc-50 border-zinc-100'}`}>
                            {feature.icon}
                          </div>
                          <h3 className={`text-base sm:text-lg font-bold font-display ${!voiceMode ? 'text-white' : 'text-zinc-900'}`}>{feature.title}</h3>
                        </div>
                        <p className={`text-xs sm:text-sm transition-all duration-300 ${!voiceMode ? 'text-zinc-400' : 'text-zinc-500'} ${isHovered ? 'opacity-0 h-0' : 'opacity-100 h-auto'}`}>
                          {feature.desc}
                        </p>

                        <div className={`transition-all duration-500 flex flex-col gap-2 ${isHovered ? 'opacity-100 max-h-96 mt-2' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                          <div className={`h-px w-full mb-2 ${!voiceMode ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
                          {feature.details.map((detail, dIdx) => (
                            <button
                              key={dIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                typeTextToInput(detail.prompt);
                              }}
                              className={`flex items-center justify-between text-xs sm:text-sm font-medium p-2 sm:p-3 rounded-xl transition-colors text-left w-full group border ${!voiceMode
                                ? 'bg-zinc-800/60 text-zinc-300 hover:bg-violet-950/60 hover:text-violet-300 border-transparent hover:border-violet-800/50'
                                : 'bg-zinc-50 text-zinc-700 hover:bg-violet-50 hover:text-violet-700 border-transparent hover:border-violet-100'}`}
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
                  <ChatMessage key={msg.id} message={msg} isDarkMode={!voiceMode} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </main>

          <div className={`fixed bottom-0 left-0 right-0 p-2 sm:p-4 pointer-events-none z-40 transition-colors duration-500 ${!voiceMode ? 'bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent' : 'bg-gradient-to-t from-zinc-50 via-zinc-50/90 to-transparent'}`}>
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
                attachments={attachments}
                setAttachments={setAttachments}
                isOsintMode={isOsintMode}
                onToggleOsintMode={(active) => {
                  setIsOsintMode(active);
                  if (active) {
                    setVoiceMode(false); // OSINT Security Mode forces dark thinking mode
                    toast.success("HACKING SYSTEM READY", {
                      description: "ENABLED Defensive Security Directives."
                    });
                  } else {
                    toast.info("Standard Mode Restored");
                  }
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
