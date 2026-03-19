import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Check, CheckCheck, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { Attachment } from '@/lib/gemini';
import { motion, AnimatePresence } from 'motion/react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thought?: string;      // Added for thinking process
  isThinking?: boolean;   // Added for loading state
  attachments?: Attachment[];
  groundingChunks?: any[];
  isStreaming?: boolean;
  timestamp?: Date;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  isError?: boolean;
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  // State to handle the collapsing thought box
  const [isThoughtOpen, setIsThoughtOpen] = React.useState(false);
  
  const formatTime = (date?: Date) => {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={clsx('flex gap-3 mb-6 w-full', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <div className="flex-shrink-0 mt-1">
        <div className={clsx(
          "w-8 h-8 rounded-full flex items-center justify-center shadow-sm",
          isUser ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white"
        )}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
      </div>
      
      <div className={clsx(
        'flex flex-col gap-1 max-w-[80%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        <span className="text-[11px] font-medium text-zinc-400 px-2">
          {isUser ? 'You' : 'Winky AI'}
        </span>

        {/* --- THINKING SECTION START --- */}
        {isAssistant && message.thought && (
          <div className="flex flex-col items-start w-full">
            <button 
              onClick={() => setIsThoughtOpen(!isThoughtOpen)}
              className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-all text-[10px] font-bold uppercase tracking-wider text-zinc-500 border border-zinc-200/50"
            >
              <Brain size={12} className={clsx(message.isThinking && "animate-pulse text-violet-500")} />
              <span>{message.isThinking ? "Thinking..." : "View Logic"}</span>
              {isThoughtOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            
            <AnimatePresence>
              {isThoughtOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden w-full mb-2"
                >
                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-[11px] italic text-zinc-500 leading-relaxed font-mono">
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {message.thought}
                    </Markdown>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {/* --- THINKING SECTION END --- */}
        
        <div className={clsx(
          'p-4 shadow-sm border',
          isUser 
            ? 'bg-zinc-900 border-zinc-800 text-white rounded-[1.5rem] rounded-tr-none' 
            : 'bg-white border-zinc-200/60 text-zinc-800 rounded-[1.5rem] rounded-tl-none',
          message.isError && 'bg-red-50 border-red-100 text-red-900'
        )}>
          
          <div className={clsx(
            'prose prose-sm max-w-none break-words leading-relaxed',
            isUser ? 'prose-invert text-white' : 'prose-zinc text-zinc-800'
          )}>
            <Markdown remarkPlugins={[remarkGfm]}>
              {message.text || (message.isThinking && !message.thought ? "..." : "")}
            </Markdown>
            
            {message.isStreaming && (
              <span className="inline-block w-2 h-2 ml-1 bg-violet-500 rounded-full animate-pulse" />
            )}
          </div>
          
          <div className={clsx(
            "flex items-center gap-1 mt-2 text-[10px] opacity-60",
            isUser ? "justify-end" : "justify-start"
          )}>
            {message.timestamp && <span>{formatTime(message.timestamp)}</span>}
            {isUser && message.status && (
               <span className="flex items-center">
                {message.status === 'read' ? <CheckCheck className="w-3 h-3 text-blue-500" /> : <Check className="w-3 h-3" />}
               </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
