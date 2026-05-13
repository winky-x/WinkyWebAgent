/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Bot, 
  User, 
  Check, 
  CheckCheck, 
  Brain, 
  ChevronDown, 
  ChevronUp, 
  Globe,
  Copy,
  Terminal,
  Sparkles,
  Cpu
} from 'lucide-react';
import clsx from 'clsx';
import { Message } from '@/lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  // State for the collapsible "Thinking" block
  const [isThoughtOpen, setIsThoughtOpen] = React.useState(message.isThinking || false);
  
  // Auto-open thinking box if the AI starts thinking
  React.useEffect(() => {
    if (message.isThinking) {
      setIsThoughtOpen(true);
    }
  }, [message.isThinking]);

  const formatTime = (date?: Date) => {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.text);
    toast.success("Packet copied to clipboard");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={clsx('flex gap-3 md:gap-5 mb-10 w-full group', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar Section with Unreal Glows */}
      <div className="flex-shrink-0 mt-1.5">
        <div className={clsx(
          "w-10 h-10 rounded-2xl flex items-center justify-center shadow-md transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 relative",
          isUser 
            ? "bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 text-white shadow-violet-500/20" 
            : "bg-gradient-to-tr from-zinc-900 via-zinc-800 to-black text-white border border-zinc-700/50 shadow-zinc-950/30"
        )}>
          {isUser ? (
            <User size={18} className="drop-shadow-sm" />
          ) : (
            <div className="relative flex items-center justify-center">
              <Cpu size={18} className="text-violet-400 group-hover:text-violet-300 transition-colors relative z-10" />
              <div className="absolute inset-[-4px] border border-violet-500/20 rounded-full animate-spin-slow" />
            </div>
          )}
          
          {/* Subtle Outer Glow Rings */}
          <div className={clsx(
            "absolute inset-0 rounded-2xl blur-md -z-10 opacity-40 transition-opacity duration-500 group-hover:opacity-80",
            isUser ? "bg-violet-600" : "bg-violet-500/30"
          )} />
        </div>
      </div>
      
      {/* Content Section */}
      <div className={clsx(
        'flex flex-col gap-1.5 max-w-[88%] md:max-w-[82%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        <div className="flex items-center gap-2 px-1 mb-0.5">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] bg-gradient-to-r from-zinc-400 to-zinc-500 bg-clip-text text-transparent">
            {isUser ? 'Authorized Operator' : 'Winky Core Intelligence'}
          </span>
          {!isUser && message.isStreaming && (
            <span className="flex gap-1 items-center px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100/50">
              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" />
            </span>
          )}
        </div>

        {/* --- PREMIUM REASONING/THINKING BLOCK --- */}
        {isAssistant && message.thought && (
          <div className="flex flex-col items-start w-full mb-1">
            <button 
              onClick={() => setIsThoughtOpen(!isThoughtOpen)}
              className={clsx(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-xl transition-all duration-300 text-[11px] font-bold uppercase tracking-wider border backdrop-blur-md group/btn shadow-xs",
                isThoughtOpen 
                  ? "bg-violet-50/80 border-violet-200/80 text-violet-700 shadow-sm" 
                  : "bg-white/80 border-zinc-200/80 text-zinc-500 hover:bg-violet-50/40 hover:border-violet-200 hover:text-violet-600"
              )}
            >
              <Brain size={14} className={clsx(message.isThinking ? "animate-pulse text-violet-600" : "text-violet-500")} />
              <span className="font-display tracking-wide">{message.isThinking ? "Hyper-Cognition Active..." : "Internal Reasoning Stream"}</span>
              <div className="w-px h-3 bg-zinc-200 mx-0.5" />
              {isThoughtOpen ? <ChevronUp size={14} className="text-violet-500" /> : <ChevronDown size={14} className="text-zinc-400 group-hover/btn:text-violet-500 transition-colors" />}
            </button>
            
            <AnimatePresence>
              {isThoughtOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0, scale: 0.98 }}
                  animate={{ height: 'auto', opacity: 1, scale: 1 }}
                  exit={{ height: 0, opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden w-full mt-2 origin-top"
                >
                  <div className="p-4 rounded-2xl bg-zinc-900/95 backdrop-blur-2xl border border-zinc-800 text-[12px] text-zinc-300 leading-relaxed font-mono shadow-2xl relative overflow-hidden group/thought">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-violet-500 via-indigo-500 to-purple-500" />
                    <div className="absolute top-2 right-3 opacity-20 text-violet-400 flex items-center gap-1 text-[9px] uppercase tracking-widest font-sans">
                      <Terminal size={12} /> Live Trace
                    </div>
                    <div className="selection:bg-violet-500/30 selection:text-white">
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {message.thought}
                      </Markdown>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        
        {/* --- STUNNING UNREAL MESSAGE BUBBLE --- */}
        <div className={clsx(
          'p-0 relative transition-all duration-500',
          isUser 
            ? 'bg-zinc-900 border border-zinc-800/80 text-white rounded-[2rem] rounded-tr-none shadow-lg shadow-zinc-950/10 hover:border-zinc-700/60 p-5' 
            : 'bg-transparent text-zinc-800 py-2',
          message.isError && 'bg-rose-50/95 backdrop-blur-xl border border-rose-200 text-rose-900 shadow-rose-100/50 p-5 rounded-3xl'
        )}>
          
          <div className={clsx(
            'prose prose-sm md:prose-base max-w-none break-words leading-relaxed tracking-tight relative z-10 font-medium',
            isUser ? 'prose-invert text-zinc-100 selection:bg-violet-500/40' : 'prose-zinc text-zinc-800 selection:bg-violet-100'
          )}>
            <Markdown remarkPlugins={[remarkGfm]}>
              {message.text || (message.isThinking && !message.thought ? "Generating neural outputs..." : "")}
            </Markdown>
          </div>

          {/* --- GROUNDING SOURCES (Web Search UI) --- */}
          {isAssistant && message.groundingChunks && message.groundingChunks.length > 0 && (
            <div className="mt-5 pt-4 border-t border-zinc-100 relative z-10">
               <div className="flex items-center gap-1.5 mb-3 text-[10px] font-black text-violet-600 uppercase tracking-[0.2em] font-display">
                 <Globe size={12} className="text-emerald-500 animate-pulse" /> Grounded Telemetry Sources
               </div>
               <div className="flex flex-wrap gap-2">
                 {message.groundingChunks.map((chunk, idx) => (
                    chunk.web?.uri && (
                      <a 
                        key={idx}
                        href={chunk.web.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 hover:bg-violet-50 hover:shadow-md hover:border-violet-200 border border-zinc-200/80 rounded-xl text-[11px] font-semibold text-zinc-700 hover:text-violet-700 transition-all duration-300 active:scale-95 group/link"
                      >
                        <span className="w-4 h-4 flex items-center justify-center bg-white group-hover/link:bg-violet-600 group-hover/link:text-white rounded-lg border border-zinc-200 group-hover/link:border-violet-600 text-[9px] font-bold text-zinc-500 transition-colors">{idx + 1}</span>
                        <span className="truncate max-w-[180px]">{chunk.web.title || 'Referenced Source'}</span>
                      </a>
                    )
                 ))}
               </div>
            </div>
          )}
          
          {/* Metadata: Time, Status, Copy */}
          <div className={clsx(
            "flex items-center gap-3 mt-4 text-[9px] font-bold uppercase tracking-widest transition-all duration-300 relative z-10",
            isUser ? "justify-end text-zinc-400" : "justify-between text-zinc-400"
          )}>
            {!isUser && (
              <button 
                onClick={copyToClipboard}
                className="opacity-0 group-hover:opacity-100 hover:text-violet-600 transition-all flex items-center gap-1 hover:scale-105 bg-zinc-50 hover:bg-violet-50 px-2 py-1 rounded-md border border-zinc-200/60"
              >
                <Copy size={10} /> Copy
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {message.timestamp && <span>{formatTime(message.timestamp)}</span>}
              {isUser && message.status && (
                 <span className="flex items-center gap-0.5">
                  {message.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-violet-400 animate-in fade-in" /> : <Check className="w-3.5 h-3.5 text-zinc-500" />}
                 </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
