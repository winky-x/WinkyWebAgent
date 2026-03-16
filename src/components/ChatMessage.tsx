import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Check, CheckCheck, Clock, Copy, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Attachment } from '@/lib/gemini';
import { motion } from 'motion/react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
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
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={clsx('flex gap-4 mb-6', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center text-zinc-600 shadow-sm">
            <User className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center text-white shadow-sm">
            <Bot className="w-4 h-4" />
          </div>
        )}
      </div>
      
      <div className={clsx(
        'flex flex-col gap-1 max-w-[85%] group/message',
        isUser ? 'items-end' : 'items-start'
      )}>
        <div className="text-xs font-semibold text-zinc-400 px-1 flex items-center gap-2">
          {isUser ? 'You' : 'Winky AI'}
          {!isUser && !message.isStreaming && message.text && (
            <button 
              onClick={() => {
                navigator.clipboard.writeText(message.text);
                toast.success('Copied to clipboard');
              }}
              className="opacity-0 group-hover/message:opacity-100 transition-opacity p-1 hover:bg-zinc-100 rounded-md text-zinc-400 hover:text-zinc-600"
              title="Copy message"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
        </div>
        
        <div className={clsx(
          'p-4 md:p-5 shadow-sm relative group transition-all duration-300',
          isUser 
            ? 'bg-zinc-900 text-white rounded-[2rem] rounded-tr-md' 
            : message.isError
              ? 'bg-red-50 border border-red-200/60 text-red-900 rounded-[2rem] rounded-tl-md'
              : 'bg-white border border-zinc-200/60 text-zinc-800 rounded-[2rem] rounded-tl-md'
        )}>
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {message.attachments.map((att, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden border border-zinc-200/20 bg-black/5">
                  {att.mimeType.startsWith('image/') ? (
                    <img src={att.url} alt="attachment" className="max-h-48 object-contain" />
                  ) : att.mimeType.startsWith('video/') ? (
                    <video src={att.url} controls className="max-h-48 object-contain" />
                  ) : (
                    <audio src={att.url} controls className="max-w-xs" />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className={clsx(
            'prose max-w-none break-words text-[15px] leading-relaxed',
            isUser 
              ? 'prose-invert prose-p:text-zinc-100' 
              : message.isError 
                ? 'prose-red prose-p:text-red-800'
                : 'prose-zinc prose-p:text-zinc-700'
          )}>
            {message.isError && (
              <div className="flex items-center gap-2 mb-2 text-red-600 font-semibold">
                <AlertCircle className="w-4 h-4" />
                <span>Error</span>
              </div>
            )}
            <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
            {message.isStreaming && (
              <span className={clsx(
                "inline-block w-1.5 h-4 ml-1 animate-pulse align-middle rounded-full",
                message.isError ? "bg-red-400" : "bg-zinc-400"
              )} />
            )}
          </div>
          
          <div className={clsx(
            "flex items-center gap-1 mt-2 text-[10px] font-medium select-none",
            isUser 
              ? "text-zinc-400 justify-end" 
              : message.isError 
                ? "text-red-400 justify-start"
                : "text-zinc-400 justify-start"
          )}>
            {message.timestamp && (
              <span>{formatTime(message.timestamp)}</span>
            )}
            {isUser && message.status && (
              <span className="ml-1 flex items-center">
                {message.status === 'sending' && <Clock className="w-3 h-3" />}
                {message.status === 'sent' && <Check className="w-3 h-3" />}
                {message.status === 'delivered' && <CheckCheck className="w-3 h-3" />}
                {message.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-400" />}
              </span>
            )}
          </div>
        </div>

        {message.groundingChunks && message.groundingChunks.length > 0 && (
          <div className="mt-1 p-3 bg-white/60 backdrop-blur-sm rounded-2xl border border-zinc-200/60 w-full">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              Sources
            </h4>
            <ul className="space-y-1.5">
              {message.groundingChunks.map((chunk, idx) => {
                const web = chunk.web;
                if (!web) return null;
                return (
                  <li key={idx} className="text-sm">
                    <a
                      href={web.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 hover:text-violet-700 hover:underline truncate block transition-colors"
                    >
                      {web.title || web.uri}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}
