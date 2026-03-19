/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessage, Message } from '@/components/ChatMessage';
import { ChatSession, Attachment, GenerateOptions, generateSpeech, playAudioBuffer } from '@/lib/gemini';
import { LiveSession } from '@/lib/live';
import { Bot, Sparkles, Volume2, BrainCircuit, ArrowRight, Zap, Trash2, Mic2, AudioLines, SquareDashedMousePointer, Component, Orbit, Spline, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>('');

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

              const uiText = currentAssistantText.replace(/\*Using tool:.*?\*\n?/g, '');

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

              // Always append new tokens for the AI
              currentAssistantText += (msg.text || '');
              
              // Clean out internal tool thoughts before showing to user
              const uiText = currentAssistantText.replace(/\*Using tool:.*?\*\n?/g, '');

              setMessages(prev => prev.map(m =>
                m.id === idToUpdate
                  ? { ...m, text: uiText, isStreaming: !msg.isFinal }
                  : m
              ));
            }

            if (msg.isFinal) {
              const idToRemove = currentAssistantMessageId;
              if (!currentAssistantText.trim()) {
                setMessages(prev => prev.filter(m => m.id !== idToRemove));
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
                const idToRemove = currentAssistantMessageId;
                if (!currentAssistantText.trim()) {
                  setMessages(prev => prev.filter(m => m.id !== idToRemove));
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
              const idToUpdate = currentUserMessageId;

              if (msg.isTranscription) {
                // Speech-to-text usually sends the full phrase as it updates
                if (msg.text) {
                  currentUserText = msg.text;
                }
              } else {
                currentUserText += (msg.text || '');
              }

              setMessages(prev => prev.map(m =>
                m.id === idToUpdate
                  ? { ...m, text: currentUserText, isStreaming: !msg.isFinal }
                  : m
              ));
            }

            if (msg.isFinal) {
              const idToRemove = currentUserMessageId;
              if (!currentUserText.trim()) {
                setMessages(prev => prev.filter(m => m.id !== idToRemove));
              }
              currentUserMessageId = '';
              currentUserText = '';
            }
          }
        };

        liveSessionRef.current.onRawMessage = (msg: any) => {
          console.log("Live API Message:", msg);
        };

        liveSessionRef.current.onInterrupted = () => {
          setIsSpeaking(false);
          currentAssistantMessageId = '';
          currentAssistantText = '';
        };

        liveSessionRef.current.onError = (error) => {
          console.error("Live API Error:", error);
          toast.error(error.message || "Voice connection error. Please try again.");
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

  const typeTextToInput = (text: string) => {
    setInputText(text);
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
      if (text.trim()) {
        liveSessionRef.current.sendText(text);
      }
      return;
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
          text: '',
          isStreaming: true,
          timestamp: new Date()
        },
      ];
    });

    const currentSelectedTool = selectedTool;
    setSelectedTool('');
try {
      const stream = chatSessionRef.current.sendMessageStream(text, attachments, {
        voiceMode,
        selectedTool: currentSelectedTool || undefined
      });

      let finalText = "";
      let finalThought = ""; // New: Track the monologue separately

      for await (const chunk of stream) {
        // 1. Capture the two different types of data from the stream
        if (chunk.text) finalText += chunk.text;
        if (chunk.thought) finalThought += chunk.thought;

        // 2. Clean the UI text of any tool usage markers
        const uiText = finalText.replace(/\*Using tool:.*?\*\n?/g, '');

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                ...msg,
                text: uiText, 
                thought: finalThought, // THIS sends it to the hidden box!
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
        try {
          const cleanText = finalText.replace(/\*Using tool:.*?\*\n?/g, '').replace(/[*_#`]/g, '');
          const audioBuffer = await generateSpeech(cleanText);
          const source = playAudioBuffer(audioBuffer, () => setIsSpeaking(false));
          currentAudioSourceRef.current = source;
        } catch (e) {
          console.error("TTS Error:", e);
          toast.error("Failed to generate speech audio.");
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
      <header className="flex items-center justify-between px-6 py-4 bg-white/70 backdrop-blur-xl border-b border-zinc-200/50 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-sm transition-all duration-500 ${isSpeaking ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-none'}`}>
            <img
              src="/logo.png"
              alt="Winky Logo"
              className={`w-6 h-6 object-contain transition-transform duration-500 ${isSpeaking ? 'scale-110' : 'group-hover:scale-110'}`}
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight font-display">Winky AI</h1>
            <p className="text-xs text-zinc-500 flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3 text-violet-500" />
              {voiceMode ? 'Voice Mode Active' : 'Thinking Mode Active'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
              title="Clear Chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center bg-zinc-100/80 p-1 rounded-xl border border-zinc-200/50 backdrop-blur-sm">
            <button
              onClick={() => { setVoiceMode(true); stopSpeaking(); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300 ${voiceMode ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              <Volume2 className="w-4 h-4" />
              Voice
            </button>
            <button
              onClick={() => { setVoiceMode(false); stopSpeaking(); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300 ${!voiceMode ? 'bg-white text-violet-600 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              <BrainCircuit className="w-4 h-4" />
              Think
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center justify-center min-h-full text-center px-4 py-12"
          >
            <div className={`w-22 h-22 rounded-3xl flex items-center justify-center mb-8 transition-all duration-300 shadow-sm ${voiceMode
                ? 'bg-transparent text-black' 
                : (Date.now() % 2 === 0)
                  ? 'bg-black border border-zinc-800 text-white' 
                  : 'bg-violet-50 border border-violet-100 text-violet-600' 
              }`}>
              {voiceMode ? (
                <AudioLines className="w-14 h-14 animate-pulse" />
              ) : (
                (Date.now() % 2 === 0) ? (
                  <Globe className="w-10 h-10 animate-spin-slow" />
                ) : (
                  <SquareDashedMousePointer className="w-10 h-10 animate-spin-slow" />
                )
              )}
            </div>
            <h2 className="text-4xl font-bold text-zinc-900 mb-4 font-display tracking-tight">
              {voiceMode ? (
                "Let's Talk!"
              ) : (
                [
                  "How can I help today?",
                  "What's on your mind?",
                  "Ready to build something?",
                  "Let's solve a problem.",
                  "How's your day going?"
                ][messages.length % 5]
              )}
            </h2>
            <p className="text-zinc-500 max-w-md mb-12 text-lg">
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
                    className={`p-6 bg-white rounded-3xl border border-zinc-200/80 shadow-sm text-left transition-all duration-500 overflow-hidden relative
                      ${isHovered ? 'shadow-xl scale-[1.02] border-violet-200 ring-4 ring-violet-50 z-10' : ''}
                      ${isOthersHovered ? 'opacity-50 scale-[0.98]' : ''}
                    `}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-zinc-50 rounded-xl border border-zinc-100">
                        {feature.icon}
                      </div>
                      <h3 className="text-lg font-bold text-zinc-900 font-display">{feature.title}</h3>
                    </div>
                    <p className={`text-zinc-500 text-sm transition-all duration-300 ${isHovered ? 'opacity-0 h-0' : 'opacity-100 h-auto'}`}>
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
                          className="flex items-center justify-between text-sm text-zinc-700 font-medium bg-zinc-50 hover:bg-violet-50 hover:text-violet-700 p-3 rounded-xl transition-colors text-left w-full group border border-transparent hover:border-violet-100"
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
