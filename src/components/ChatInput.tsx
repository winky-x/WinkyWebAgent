import React from 'react';
import { VoiceChatInput } from './VoiceChatInput';
import { ThinkingChatInput } from './ThinkingChatInput';
import { Attachment } from '@/lib/gemini';

export interface ChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  voiceMode: boolean;
  value: string;
  onChange: (val: string) => void;
  isMuted: boolean;
  onMuteChange: (muted: boolean) => void;
  selectedTool?: string;
  onToolSelect?: (tool: string) => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  bgColor?: string;
  isOsintMode?: boolean;
  onToggleOsintMode?: (active: boolean) => void;
}

export function ChatInput(props: ChatInputProps) {
  if (props.voiceMode) {
    return <VoiceChatInput {...props} />;
  }
  return <ThinkingChatInput {...props} />;
}
