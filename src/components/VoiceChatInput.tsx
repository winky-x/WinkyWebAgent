import React, { useState, useRef, useEffect } from 'react';
import { 
  Paperclip, 
  Mic, 
  MicOff, 
  ArrowUp, 
  Loader, 
  Trash2 
} from 'lucide-react';
import { Attachment } from '@/lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';

export interface VoiceChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  value: string;
  onChange: (val: string) => void;
  isMuted: boolean;
  onMuteChange: (muted: boolean) => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  bgColor?: string;
}

export function VoiceChatInput({ 
  onSend, 
  disabled, 
  value, 
  onChange, 
  isMuted, 
  onMuteChange, 
  attachments,
  setAttachments,
  bgColor
}: VoiceChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  const handleSend = () => {
    if (disabled) return;
    if (value.trim() || attachments.length > 0) {
      onSend(value, attachments);
      onChange('');
      setAttachments([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      newAttachments.push({ mimeType: file.type, data, url: URL.createObjectURL(file) });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const newAtt = [...prev];
      URL.revokeObjectURL(newAtt[index].url);
      newAtt.splice(index, 1);
      return newAtt;
    });
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto px-1 sm:px-4 pb-1 sm:pb-4">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        multiple 
        accept="image/*,video/*,audio/*" 
      />

      {/* ATTACHMENTS BAR FOR VOICE MODE */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-wrap gap-2 mb-3 px-2 overflow-hidden"
          >
            {attachments.map((att, idx) => (
              <motion.div 
                key={idx} 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="relative group rounded-2xl overflow-hidden border border-zinc-200 bg-white shadow-sm p-1"
              >
                {att.mimeType.startsWith('image/') ? (
                  <img src={att.url} className="h-16 w-16 object-cover rounded-xl" />
                ) : (
                  <div className="h-16 w-16 flex items-center justify-center bg-violet-50 rounded-xl text-violet-500">
                    <Mic className="w-6 h-6" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="absolute -top-1 -right-1 bg-zinc-900 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CLASSIC VOICE MODE INPUT CONTAINER */}
      <div 
        style={bgColor ? { backgroundColor: bgColor } : undefined}
        className={clsx(
          "flex flex-col gap-1 sm:gap-2 p-1 sm:p-2 rounded-[2rem] sm:rounded-[2.5rem] transition-all duration-500 relative",
          !bgColor && "bg-white/70 backdrop-blur-3xl shadow-2xl shadow-zinc-200/50",
          "border border-white/20 ring-1 ring-zinc-200/50",
          disabled ? "opacity-60 grayscale shadow-none" : "hover:border-violet-300/50 focus-within:ring-4 focus-within:ring-violet-500/10 focus-within:border-violet-400/50 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_20px_40px_-20px_rgba(0,0,0,0.1)]"
        )}
      >
        <div className="flex items-end gap-1 sm:gap-2 pr-1 sm:pr-2">
          {/* LEFT ACTIONS */}
          <div className="flex items-center gap-1 pl-1 sm:pl-2 mb-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 sm:p-3 text-zinc-400 hover:text-violet-600 hover:bg-violet-50 rounded-full transition-all active:scale-90"
              disabled={disabled}
            >
              <Paperclip size={20} />
            </button>
          </div>

          {/* TEXT AREA */}
          <div className="flex-1 min-w-0 min-h-[44px] sm:min-h-[52px] flex items-center py-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Neural transmission..."
              className="w-full max-h-40 min-h-[38px] sm:min-h-[44px] px-1 sm:px-2 py-1.5 sm:py-3 bg-transparent resize-none focus:outline-none text-zinc-800 placeholder:text-zinc-400 font-medium leading-normal text-[15px] sm:text-[16px] selection:bg-violet-100"
              rows={1}
              disabled={disabled}
            />
          </div>

          {/* RIGHT ACTIONS */}
          <div className="flex items-center gap-1 sm:gap-2 mb-1">
            <button
              type="button"
              onClick={() => onMuteChange(!isMuted)}
              className={clsx(
                "p-2 sm:p-3 rounded-full transition-all duration-500 shadow-md",
                isMuted ? "bg-rose-100 text-rose-600 hover:bg-rose-200" : "bg-emerald-100 text-emerald-600 hover:bg-emerald-200 ring-4 ring-emerald-50 animate-pulse"
              )}
              disabled={disabled}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || (!value.trim() && attachments.length === 0)}
              className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full transition-all duration-300 shadow-lg disabled:opacity-30 disabled:scale-95 bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 text-white hover:shadow-violet-200 hover:scale-105 active:scale-95"
            >
              {disabled ? <Loader className="w-5 h-5 animate-spin" /> : <ArrowUp size={24} className="drop-shadow-md" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
