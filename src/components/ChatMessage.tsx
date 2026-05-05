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
  Terminal
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
    toast.success("Copied to clipboard");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={clsx('flex gap-4 mb-8 w-full group', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar Section */}
      <div className="flex-shrink-0 mt-1">
        <div className={clsx(
          "w-9 h-9 rounded-xl flex items-center justify-center shadow-sm border transition-transform duration-300 group-hover:scale-105",
          isUser 
            ? "bg-white border-zinc-200 text-zinc-600" 
            : "bg-zinc-900 border-zinc-800 text-white"
        )}>
          {isUser ? <User size={18} /> : <Bot size={18} />}
        </div>
      </div>
      
      {/* Content Section */}
      <div className={clsx(
        'flex flex-col gap-1.5 max-w-[85%] md:max-w-[80%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        <div className="flex items-center gap-2 px-2 mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
            {isUser ? 'Authorized User' : 'Winky Intelligence'}
          </span>
          {!isUser && message.isStreaming && (
            <span className="flex gap-1">
              <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce" />
            </span>
          )}
        </div>

        {/* --- THINKING/LOGIC BLOCK --- */}
        {isAssistant && message.thought && (
          <div className="flex flex-col items-start w-full mb-1">
            <button 
              onClick={() => setIsThoughtOpen(!isThoughtOpen)}
              className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wider border group/btn",
                isThoughtOpen 
                  ? "bg-zinc-100 border-zinc-200 text-zinc-600" 
                  : "bg-zinc-50/50 border-transparent text-zinc-400 hover:bg-zinc-100 hover:border-zinc-200"
              )}
            >
              <Brain size={14} className={clsx(message.isThinking ? "animate-pulse text-violet-500" : "text-zinc-400")} />
              <span>{message.isThinking ? "Processing Logic..." : "Internal Reasoning"}</span>
              <div className="w-px h-3 bg-zinc-300 mx-1" />
              {isThoughtOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            
            <AnimatePresence>
              {isThoughtOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden w-full"
                >
                  <div className="mt-1 mb-3 p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200/60 text-[12px] text-zinc-500 leading-relaxed font-mono shadow-inner relative">
                    <div className="absolute top-2 right-3 opacity-20">
                      <Terminal size={12} />
                    </div>
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {message.thought}
                    </Markdown>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        
        {/* --- MAIN MESSAGE BUBBLE --- */}
        <div className={clsx(
          'p-4 shadow-sm border relative transition-all duration-300',
          isUser 
            ? 'bg-zinc-900 border-zinc-800 text-white rounded-[1.5rem] rounded-tr-none' 
            : 'bg-white border-zinc-200 text-zinc-800 rounded-[1.5rem] rounded-tl-none shadow-zinc-200/50',
          message.isError && 'bg-red-50 border-red-100 text-red-900'
        )}>
          
          <div className={clsx(
            'prose prose-sm max-w-none break-words leading-relaxed selection:bg-violet-100',
            isUser ? 'prose-invert text-zinc-100' : 'prose-zinc text-zinc-800'
          )}>
            <Markdown remarkPlugins={[remarkGfm]}>
              {message.text || (message.isThinking && !message.thought ? "..." : "")}
            </Markdown>
          </div>

          {/* --- GROUNDING SOURCES (Web Search UI) --- */}
          {isAssistant && message.groundingChunks && message.groundingChunks.length > 0 && (
            <div className="mt-5 pt-4 border-t border-zinc-100">
               <div className="flex items-center gap-2 mb-3 text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em]">
                 <Globe size={12} className="text-emerald-500" /> Grounded Sources
               </div>
               <div className="flex flex-wrap gap-2">
                 {message.groundingChunks.map((chunk, idx) => (
                    chunk.web?.uri && (
                      <a 
                        key={idx}
                        href={chunk.web.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-50 hover:bg-white hover:shadow-md hover:border-zinc-300 border border-zinc-200 rounded-lg text-[11px] font-semibold text-zinc-600 transition-all active:scale-95"
                      >
                        <span className="w-4 h-4 flex items-center justify-center bg-white rounded border border-zinc-200 text-[9px] font-bold text-zinc-400">{idx + 1}</span>
                        <span className="truncate max-w-[150px]">{chunk.web.title || 'Referenced Source'}</span>
                      </a>
                    )
                 ))}
               </div>
            </div>
          )}
          
          {/* Metadata: Time, Status, Copy */}
          <div className={clsx(
            "flex items-center gap-3 mt-4 text-[9px] font-bold uppercase tracking-widest transition-opacity duration-300",
            isUser ? "justify-end opacity-40" : "justify-start opacity-0 group-hover:opacity-40"
          )}>
            {!isUser && (
              <button 
                onClick={copyToClipboard}
                className="hover:text-violet-600 transition-colors flex items-center gap-1"
              >
                <Copy size={10} /> Copy
              </button>
            )}
            {message.timestamp && <span>{formatTime(message.timestamp)}</span>}
            {isUser && message.status && (
               <span className="flex items-center gap-0.5">
                {message.status === 'read' ? <CheckCheck className="w-3 h-3 text-blue-500" /> : <Check className="w-3 h-3" />}
                {message.status}
               </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
