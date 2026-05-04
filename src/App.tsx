/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessage } from '@/components/ChatMessage';
import { Message, ChatSession, Attachment, generateSpeech, playAudioBuffer } from '@/lib/gemini';
import { LiveSession } from '@/lib/live';
import {
  Bot, Sparkles, Volume2, BrainCircuit, ArrowRight, Zap, Trash2, 
  AudioLines, SquareDashedMousePointer, Globe, ChevronDown, Database
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

// Agency-Level Model Configuration
const AVAILABLE_MODELS = [
  {
    id: 'gemini-3-flash',
    name: 'Winky Pro 3',
    provider: 'google' as const,
    canThink: false,
    badge: 'Fastest'
  },
  {
    id: 'gemini-3-flash',
    name: 'Winky Thinking 3',
    provider: 'google' as const,
    canThink: true,
    badge: 'Reasoning'
  },
  {
    id: 'stepfun/step-3.5-flash:free',
    name: 'Step-3.5 Flash',
    provider: 'openrouter' as const,
    canThink: false,
    badge: 'Free'
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'Nemotron Super',
    provider: 'openrouter' as const,
    canThink: false,
    badge: 'High-Mem'
  }
];

// Helper for conditional classes without needing extra libs
const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>('');

  // Unified Model State
  const [currentModel, setCurrentModel] = useState(AVAILABLE_MODELS[0]);
  const [showModelMenu, setShowModelMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef(new ChatSession());
  const liveSessionRef = useRef<LiveSession | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Voice & Live Session Logic
  useEffect(() => {
    chatSessionRef.current = new ChatSession();
    if (voiceMode) {
      if (!liveSessionRef.current) {
        liveSessionRef.current = new LiveSession();

        let currentAssistantMessageId = '';
        let currentAssistantText = '';
        let currentUserMessageId = '';
        let currentUserText = '';

        liveSessionRef.current.onMessage = (msg) => {
          if (msg.role === 'assistant') {
            if (!currentAssistantMessageId) {
              currentAssistantMessageId = crypto.randomUUID();
              currentAssistantText = msg.text || '';
              if (currentUserMessageId) {
                const idToRemove = currentUserMessageId;
                if (!currentUserText.trim()) {
                  setMessages(prev => prev.filter(m => m.id !== idToRemove));
                }
                currentUserMessageId = '';
                currentUserText = '';
              }
              const uiText = currentAssistantText.split(/\*Using tool:[^*]*\*/g).join('');
              setMessages(prev => {
                const updatedPrev = prev.map(m => m.role === 'user' ? { ...m, status: 'read' as const } : m);
                return [...updatedPrev, {
                  id: currentAssistantMessageId,
                  role: 'assistant',
                  text: uiText,
                  isStreaming: !msg.isFinal,
                  timestamp: new Date()
                }];
              });
              setIsSpeaking(true);
            } else {
              const idToUpdate = currentAssistantMessageId;
              currentAssistantText += (msg.text || '');
              const uiText = currentAssistantText.split(/\*Using tool:[^*]*\*/g).join('');
              setMessages(prev => prev.map(m =>
                m.id === idToUpdate ? { ...m, text: uiText, isStreaming: !msg.isFinal } : m
              ));
            }

            if (msg.isFinal) {
              if (!currentAssistantText.trim()) {
                setMessages(prev => prev.filter(m => m.id !== currentAssistantMessageId));
              }
              currentAssistantMessageId = '';
              currentAssistantText = '';
              setIsSpeaking(false);
            }
          } else if (msg.role === 'user') {
            if (!currentUserMessageId) {
              currentUserMessageId = crypto.randomUUID();
              currentUserText = msg.text || '';
              if (currentAssistantMessageId) {
                if (!currentAssistantText.trim()) {
                  setMessages(prev => prev.filter(m => m.id !== currentAssistantMessageId));
                }
                currentAssistantMessageId = '';
                currentAssistantText = '';
                setIsSpeaking(false);
              }
              setMessages(prev => [...prev, {
                id: currentUserMessageId,
                role: 'user',
                text: currentUserText,
                isStreaming: !msg.isFinal,
                timestamp: new Date(),
                status: 'sent'
              }]);
            } else {
              if (msg.isTranscription) {
                if (msg.text) currentUserText = msg.text;
              } else {
                currentUserText += (msg.text || '');
              }
              setMessages(prev => prev.map(m =>
                m.id === currentUserMessageId ? { ...m, text: currentUserText, isStreaming: !msg.isFinal } : m
              ));
            }
            if (msg.isFinal) {
              currentUserMessageId = '';
              currentUserText = '';
            }
          }
        };

        liveSessionRef.current.onInterrupted = () => {
          setIsSpeaking(false);
          currentAssistantMessageId = '';
          currentAssistantText = '';
        };

        liveSessionRef.current.onError = (error) => {
          toast.error(error.message || "Voice connection error.");
          setIsSpeaking(false);
          setVoiceMode(false);
        };

        liveSessionRef.current.setMuted(isMuted);
        liveSessionRef.current.connect();
      } else {
        liveSessionRef.current.setMuted(isMuted);
      }
    } else {
      if (liveSessionRef.current) {
        liveSessionRef.current.disconnect();
        liveSessionRef.current = null;
      }
    }
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.disconnect();
        liveSessionRef.current = null;
      }
    };
  }, [voiceMode, isMuted]);

  const stopSpeaking = () => {
    if (currentAudioSourceRef.current) {
      currentAudioSourceRef.current.stop();
      currentAudioSourceRef.current = null;
    }
    setIsSpeaking(false);
  };

  const handleSend = async (text: string, attachments: Attachment[]) => {
    stopSpeaking();
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      attachments,
      timestamp: new Date(),
      status: 'sent'
    };

    setMessages((prev) => [...prev, userMessage]);

    if (voiceMode && liveSessionRef.current) {
      if (text.trim()) liveSessionRef.current.sendText(text);
      return;
    }

    setIsGenerating(true);
    const assistantMessageId = crypto.randomUUID();
    
    setMessages((prev) => {
      const updatedPrev = prev.map(m => m.role === 'user' ? { ...m, status: 'read' as const } : m);
      return [...updatedPrev, {
        id: assistantMessageId,
        role: 'assistant',
        text: '',
        isStreaming: true,
        timestamp: new Date()
      }];
    });

    try {
      const stream = chatSessionRef.current.sendMessageStream(text, attachments, {
        voiceMode,
        selectedTool: selectedTool || undefined,
        provider: currentModel.provider,
        modelId: currentModel.id
      });

      let finalText = "";
      for await (const chunk of stream) {
        if (chunk.text) finalText += chunk.text;
        const uiText = finalText.split(/\*Using tool:[^*]*\*/g).join('');

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                ...msg,
                text: uiText,
                thought: chunk.thought || msg.thought,
                isThinking: chunk.isThinking,
                isStreaming: !chunk.isDone,
                groundingChunks: chunk.groundingChunks || msg.groundingChunks,
              }
              : msg
          )
        );
      }

      if (voiceMode && finalText) {
        setIsSpeaking(true);
        const cleanText = finalText.split(/\*Using tool:[^*]*\*/g).join('').replace(/[*_#`]/g, '');
        const audioBuffer = await generateSpeech(cleanText);
        currentAudioSourceRef.current = playAudioBuffer(audioBuffer, () => setIsSpeaking(false));
      }
    } catch (error: any) {
      toast.error(error.message || "Generation failed");
      setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, isStreaming: false, isError: true } : m));
    } finally {
      setIsGenerating(false);
      setSelectedTool('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-sans">
      <header className="flex items-center justify-between px-6 py-4 bg-white/70 backdrop-blur-xl border-b border-zinc-200/50 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-sm transition-all duration-500",
            isSpeaking ? "bg-emerald-500 ring-4 ring-emerald-50" : "bg-white border border-zinc-200"
          )}>
            <img src="/logo.png" alt="Logo" style={{ width: '30px', height: '30px' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight font-display">Winky AI</h1>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                <Database size={10} /> {currentModel.provider}
              </span>
              <span className="w-1 h-1 rounded-full bg-zinc-300" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
                {currentModel.badge}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all text-white shadow-lg"
            >
              <div className="flex flex-col items-start">
                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest leading-none mb-1">Engine</span>
                <span className="text-sm font-medium leading-none">{currentModel.name}</span>
              </div>
              <ChevronDown size={14} className={cn("text-zinc-500 transition-transform duration-300", showModelMenu && "rotate-180")} />
            </button>

            <AnimatePresence>
              {showModelMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  <div className="p-2 flex flex-col gap-1">
                    {AVAILABLE_MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setCurrentModel(model);
                          setShowModelMenu(false);
                          toast.success(`Active: ${model.name}`);
                        }}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl transition-all hover:bg-zinc-800 text-left group",
                          currentModel.id === model.id ? "bg-zinc-800/50 ring-1 ring-zinc-700" : ""
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-zinc-100">{model.name}</span>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-tight">{model.provider} API</span>
                        </div>
                        {model.canThink && (
                          <div className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/30 text-[9px] text-violet-400 font-bold uppercase">
                            Think
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center bg-zinc-100/80 p-1 rounded-xl border border-zinc-200/50 backdrop-blur-sm shadow-inner">
            <button
              onClick={() => { setVoiceMode(true); stopSpeaking(); }}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300",
                voiceMode ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/50" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              <Volume2 className="w-4 h-4" />
              Voice
            </button>
            <button
              onClick={() => { setVoiceMode(false); stopSpeaking(); }}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300",
                !voiceMode ? "bg-white text-violet-600 shadow-sm ring-1 ring-zinc-200/50" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              <BrainCircuit className="w-4 h-4" />
              Text
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-32 scrollbar-hide">
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-full text-center px-4 py-12"
          >
            <div className={cn(
                "w-20 h-20 rounded-3xl flex items-center justify-center mb-8 transition-all duration-500 shadow-xl border",
                voiceMode ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-violet-50 border-violet-100 text-violet-600"
            )}>
              {voiceMode ? <AudioLines className="w-10 h-10 animate-pulse" /> : <Sparkles className="w-10 h-10 animate-bounce" />}
            </div>
            <h2 className="text-4xl font-black text-zinc-900 mb-4 tracking-tight">
              {voiceMode ? "Let's Talk!" : "Winky Thinking Mode"}
            </h2>
            <p className="text-zinc-500 max-w-sm mb-12 text-lg leading-relaxed">
              {voiceMode 
                ? "Conversational AI at 24kHz. Speak naturally, I'm listening." 
                : `Using ${currentModel.name} for high-level reasoning and complex logic.`}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full">
              {[
                {
                  title: 'Smart Tools',
                  icon: <Zap className="w-5 h-5 text-amber-500" />,
                  prompts: ["What's the weather in London?", "Latest AI news summary"]
                },
                {
                  title: 'Reasoning',
                  icon: <BrainCircuit className="w-5 h-5 text-violet-500" />,
                  prompts: ["Write a React hook for API calls", "Explain quantum decoherence"]
                }
              ].map((group, idx) => (
                <div key={idx} className="p-6 bg-white rounded-3xl border border-zinc-200 shadow-sm text-left">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-zinc-50 rounded-xl border border-zinc-100">{group.icon}</div>
                    <h3 className="font-bold text-zinc-900">{group.title}</h3>
                  </div>
                  <div className="space-y-2">
                    {group.prompts.map((p, pIdx) => (
                      <button 
                        key={pIdx}
                        onClick={() => setInputText(p)}
                        className="w-full text-left text-sm p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-colors border border-transparent hover:border-zinc-200"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
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

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-zinc-50 via-zinc-50 to-transparent pointer-events-none z-40">
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
    </div>
  );
}
