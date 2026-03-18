/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessage, Message } from '@/components/ChatMessage';
import { ChatSession, Attachment, generateSpeech, playAudioBuffer } from '@/lib/gemini';
import { LiveSession } from '@/lib/live';
import { Bot, Sparkles, Volume2, BrainCircuit, ArrowRight, Zap, Trash2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

// MCP IMPORTS
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [isMcpConnected, setIsMcpConnected] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef(new ChatSession());
  const liveSessionRef = useRef<LiveSession | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // MCP Client Refs
  const mcpClientRef = useRef<Client | null>(null);

  // --- MCP INITIALIZATION ---
  useEffect(() => {
    const initMCP = async () => {
      try {
        // Connect to the Vercel endpoint we created
        const transport = new SSEClientTransport(new URL("/api/mcp", window.location.href));
        const client = new Client(
          { name: "winky-web-ui", version: "1.0.0" },
          { capabilities: {} }
        );

        await client.connect(transport);
        mcpClientRef.current = client;
        setIsMcpConnected(true);
        console.log("MCP Server Connected");
      } catch (err) {
        console.error("MCP Connection Failed:", err);
        toast.error("Could not connect to Web Agent server.");
      }
    };

    initMCP();

    return () => {
      mcpClientRef.current?.close();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- LIVE VOICE SESSION LOGIC ---
  useEffect(() => {
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
              currentAssistantText = msg.text;
              
              if (currentUserMessageId) {
                const idToRemove = currentUserMessageId;
                if (!currentUserText.trim()) {
                  setMessages(prev => prev.filter(m => m.id !== idToRemove));
                }
                currentUserMessageId = '';
                currentUserText = '';
              }

              setMessages(prev => {
                const updatedPrev = prev.map(m => m.role === 'user' ? { ...m, status: 'read' as const } : m);
                return [...updatedPrev, {
                  id: currentAssistantMessageId,
                  role: 'assistant',
                  text: currentAssistantText,
                  isStreaming: !msg.isFinal,
                  timestamp: new Date()
                }];
              });
              setIsSpeaking(true);
            } else {
              if (msg.isTranscription) {
                if (msg.text) currentAssistantText = msg.text;
              } else {
                currentAssistantText += msg.text;
              }
              
              setMessages(prev => prev.map(m => 
                m.id === currentAssistantMessageId 
                  ? { ...m, text: currentAssistantText, isStreaming: !msg.isFinal } 
                  : m
              ));
            }
            
            if (msg.isFinal) {
              currentAssistantMessageId = '';
              currentAssistantText = '';
              setIsSpeaking(false);
            }
          } else if (msg.role === 'user') {
            if (!currentUserMessageId) {
              currentUserMessageId = crypto.randomUUID();
              currentUserText = msg.text;
              
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
                currentUserText += msg.text;
              }
              
              setMessages(prev => prev.map(m => 
                m.id === currentUserMessageId 
                  ? { ...m, text: currentUserText, isStreaming: !msg.isFinal } 
                  : m
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
          toast.error("Voice connection error.");
          setVoiceMode(false);
        };

        liveSessionRef.current.setMuted(isMuted);
        liveSessionRef.current.connect();
      } else {
        liveSessionRef.current.setMuted(isMuted);
      }
    } else {
      liveSessionRef.current?.disconnect();
      liveSessionRef.current = null;
    }
  }, [voiceMode, isMuted]);

  const handleSend = async (text: string, attachments: Attachment[]) => {
    if (currentAudioSourceRef.current) {
      currentAudioSourceRef.current.stop();
    }
    setIsSpeaking(false);

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

    // UI Placeholder for Assistant
    setMessages((prev) => [
      ...prev.map(m => m.role === 'user' ? { ...m, status: 'read' as const } : m),
      {
        id: assistantMessageId,
        role: 'assistant',
        text: '',
        isStreaming: true,
        timestamp: new Date()
      },
    ]);

    try {
      let responseText = "";

      // IF WEB AGENT IS SELECTED: Route through MCP
      if (selectedTool === 'web_agent' && mcpClientRef.current) {
        const result = await mcpClientRef.current.callTool({
          name: "web_agent",
          arguments: { action: "navigate", url: text }
        });
        // @ts-ignore
        responseText = result.content[0].text;
      } else {
        // DEFAULT: Route through Gemini
        const stream = chatSessionRef.current.sendMessageStream(text, attachments, { 
          voiceMode, 
          selectedTool: selectedTool || undefined 
        });
        
        for await (const chunk of stream) {
          responseText = chunk.text;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, text: chunk.text, isStreaming: !chunk.isDone }
                : msg
            )
          );
        }
      }

      // If MCP was used, update the final text
      if (selectedTool === 'web_agent') {
        setMessages((prev) => prev.map(msg => 
          msg.id === assistantMessageId ? { ...msg, text: responseText, isStreaming: false } : msg
        ));
      }

      // TTS Logic for non-live mode
      if (voiceMode && responseText) {
        const audioBuffer = await generateSpeech(responseText.replace(/[*_#`]/g, ''));
        const source = playAudioBuffer(audioBuffer, () => setIsSpeaking(false));
        currentAudioSourceRef.current = source;
        setIsSpeaking(true);
      }

    } catch (error: any) {
      toast.error(error.message || "Failed to generate response");
      setMessages((prev) => prev.map((msg) =>
        msg.id === assistantMessageId ? { ...msg, text: 'Error: ' + error.message, isStreaming: false, isError: true } : msg
      ));
    } finally {
      setIsGenerating(false);
      setSelectedTool('');
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
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm transition-all duration-500 ${isSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-900'}`}>
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight font-display">Winky AI</h1>
            <p className="text-xs text-zinc-500 flex items-center gap-1 font-medium">
              <Sparkles className={`w-3 h-3 ${isMcpConnected ? 'text-emerald-500' : 'text-violet-500'}`} />
              {isMcpConnected ? 'Web Agent Ready' : 'Gemini Active'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {messages.length > 0 && (
            <button onClick={clearChat} className="p-2 text-zinc-400 hover:text-rose-500 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center bg-zinc-100/80 p-1 rounded-xl border border-zinc-200/50">
            <button
              onClick={() => setVoiceMode(true)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${voiceMode ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
            >
              <Volume2 className="w-4 h-4" /> Voice
            </button>
            <button
              onClick={() => setVoiceMode(false)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${!voiceMode ? 'bg-white text-violet-600 shadow-sm' : 'text-zinc-500'}`}
            >
              <BrainCircuit className="w-4 h-4" /> Think
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        {messages.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center min-h-full text-center px-4 py-12">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8 bg-zinc-900 text-white">
              <Globe className="w-10 h-10" />
            </div>
            <h2 className="text-4xl font-bold text-zinc-900 mb-4 tracking-tight">How can I help you today?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full mt-8">
                <button onClick={() => { setSelectedTool('web_agent'); setInputText('https://google.com'); }} className="p-6 bg-white border border-zinc-200 rounded-2xl text-left hover:border-violet-500 transition-all">
                    <Zap className="w-5 h-5 text-amber-500 mb-2" />
                    <div className="font-bold">Use Web Agent</div>
                    <div className="text-sm text-zinc-500">Control a browser via Supabase broadcast</div>
                </button>
                <button onClick={() => setInputText('What is the weather?')} className="p-6 bg-white border border-zinc-200 rounded-2xl text-left hover:border-violet-500 transition-all">
                    <Sparkles className="w-5 h-5 text-violet-500 mb-2" />
                    <div className="font-bold">General AI</div>
                    <div className="text-sm text-zinc-500">Ask anything using Gemini 1.5</div>
                </button>
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

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-zinc-50 to-transparent z-40">
        <div className="max-w-3xl mx-auto w-full">
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
