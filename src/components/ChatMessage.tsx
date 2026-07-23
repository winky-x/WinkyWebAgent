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
import { Message, Attachment } from '@/lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Thinking, ThinkingHeader, ThinkingContent } from './Thinking';
import { BlurText } from './BlurText';
import { CodeBlock } from './ai-elements/code-block';

const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    if (!inline && (match || codeString.includes('\n'))) {
      return (
        <CodeBlock 
          code={codeString} 
          language={match ? match[1] : "text"} 
        />
      );
    }
    return (
      <code className="px-1.5 py-0.5 rounded-md bg-zinc-800/80 font-mono text-[13px] text-violet-300 border border-zinc-700/50" {...props}>
        {children}
      </code>
    );
  },
  h1: ({ children }: any) => <h1 className="text-xl font-bold tracking-tight text-zinc-100 mt-5 mb-2.5 pb-1 border-b border-zinc-800/80">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-lg font-bold tracking-tight text-zinc-100 mt-4 mb-2">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-base font-semibold tracking-tight text-zinc-200 mt-3 mb-1.5">{children}</h3>,
  p: ({ children }: any) => <p className="leading-relaxed mb-3 text-zinc-200">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside space-y-1.5 my-2.5 text-zinc-200 pl-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside space-y-1.5 my-2.5 text-zinc-200 pl-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-zinc-200">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="my-3 pl-4 py-2 border-l-2 border-violet-500 bg-violet-500/10 rounded-r-xl text-zinc-300 italic text-sm">
      {children}
    </blockquote>
  ),
  table: ({ children }: any) => (
    <div className="my-4 w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/60 shadow-lg">
      <table className="w-full text-left text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-zinc-900/90 text-zinc-300 font-bold uppercase tracking-wider border-b border-zinc-800 text-[10px]">
      {children}
    </thead>
  ),
  tbody: ({ children }: any) => <tbody className="divide-y divide-zinc-800/60 text-zinc-300">{children}</tbody>,
  tr: ({ children }: any) => <tr className="hover:bg-zinc-900/40 transition-colors">{children}</tr>,
  th: ({ children }: any) => <th className="px-4 py-2.5 font-bold">{children}</th>,
  td: ({ children }: any) => <td className="px-4 py-2.5 leading-relaxed">{children}</td>,
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline underline-offset-4 transition-colors font-medium">
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-zinc-800" />,
};

interface ChatMessageProps {
  message: Message;
  isDarkMode?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isDarkMode = false }) => {
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
      className={clsx('flex gap-3 md:gap-4 mb-6 w-full group', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar Section for User */}
      {isUser && (
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-xs bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 text-white relative">
            <User size={15} className="drop-shadow-xs" />
          </div>
        </div>
      )}
      
      {/* Content Section */}
      <div className={clsx(
        'flex flex-col gap-1 max-w-[88%] md:max-w-[78%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        <div className="flex items-center gap-2 px-1 mb-0.5">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] bg-gradient-to-r from-zinc-400 to-zinc-500 bg-clip-text text-transparent">
            {isUser ? (
              'Authorized Operator'
            ) : (
              <BlurText text="WINKY CORE INTELLIGENCE" delay={150} animateBy="words" direction="top" />
            )}
          </span>
        </div>

        {/* --- PREMIUM REASONING / THINKING COMPONENT --- */}
        {isAssistant && message.thought && (
          <Thinking 
            isStreaming={message.isThinking || message.isStreaming} 
            thoughtText={message.thought} 
            isDarkMode={isDarkMode} 
          />
        )}
        
        {/* --- STUNNING UNREAL MESSAGE BUBBLE --- */}
        <div className={clsx(
          'p-0 relative transition-all duration-500',
          isUser 
            ? 'bg-zinc-900 border border-zinc-800/80 text-white rounded-[2rem] rounded-tr-none shadow-lg shadow-zinc-950/10 hover:border-zinc-700/60 p-5' 
            : 'bg-transparent text-zinc-100 py-1 px-0',
          message.isError && 'bg-rose-950/80 backdrop-blur-xl border border-rose-800 text-rose-200 shadow-rose-950/50 p-5 rounded-3xl'
        )}>
          
          <div className={clsx(
            'prose prose-sm md:prose-base max-w-none break-words leading-relaxed tracking-tight relative z-10 font-medium',
            isUser || isDarkMode ? 'prose-invert text-zinc-100 selection:bg-violet-500/40' : 'prose-zinc text-zinc-800 selection:bg-violet-100'
          )}>
            {isAssistant && message.isStreaming && message.text ? (
              <BlurText 
                text={message.text} 
                delay={35} 
                animateBy="words" 
                direction="top" 
                stepDuration={0.15} 
              />
            ) : (
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.text || (message.isThinking && !message.thought ? "Generating neural outputs..." : "")}
              </Markdown>
            )}
          </div>

          {/* Render Attachments if present */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-4 relative z-10">
              {message.attachments.map((att, idx) => {
                const src = att.url || `data:${att.mimeType};base64,${att.data}`;
                return (
                  <div key={idx} className="relative rounded-2xl overflow-hidden border border-zinc-200/20 bg-zinc-950/40 p-1.5 max-w-[260px] shadow-md transition-all duration-300 hover:scale-[1.02]">
                    {att.mimeType.startsWith('image/') ? (
                      <img 
                        src={src} 
                        alt="Attachment" 
                        className="max-h-48 object-contain rounded-xl"
                      />
                    ) : att.mimeType.startsWith('video/') ? (
                      <video 
                        src={src} 
                        controls 
                        className="max-h-48 rounded-xl"
                      />
                    ) : (
                      <div className="h-16 px-4 flex items-center gap-2 bg-zinc-800 rounded-xl text-zinc-300 text-xs">
                        <span>File Attachment ({att.mimeType})</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
          
          {/* Metadata: Time, Status, Copy (Rendered when streaming is complete) */}
          {(!isAssistant || !message.isStreaming) && (
            <div className={clsx(
              "flex items-center gap-3 mt-4 text-[9px] font-bold uppercase tracking-widest transition-all duration-300 relative z-10",
              isUser ? "justify-end text-zinc-400" : "items-center gap-3 text-zinc-400"
            )}>
              {!isUser && (
                <button 
                  onClick={copyToClipboard}
                  className="hover:text-zinc-200 transition-all flex items-center gap-1 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md border border-zinc-800 shadow-xs"
                >
                  <Copy size={11} /> Copy
                </button>
              )}
              <div className="flex items-center gap-2">
                {message.timestamp && <span>{formatTime(message.timestamp)}</span>}
                {isUser && message.status && (
                   <span className="flex items-center gap-0.5">
                    {message.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-violet-400 animate-in fade-in" /> : <Check className="w-3.5 h-3.5 text-zinc-500" />}
                   </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
