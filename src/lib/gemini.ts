/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Winky AI - Core Generative Engine (Production Grade v3.1)
 */

import { GoogleGenAI, ThinkingLevel, Content } from "@google/genai";
import { toolDeclarations, executeTool } from "./tools";
import { SYSTEM_INSTRUCTION } from "./prompt";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Attachment {
  mimeType: string;
  data: string;
  url: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thought?: string;
  isThinking?: boolean;
  attachments?: Attachment[];
  groundingChunks?: any[];
  isStreaming?: boolean;
  timestamp?: Date;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  isError?: boolean;
}

export interface StreamChunk {
  text: string;
  thought: string;
  isDone: boolean;
  isThinking: boolean;
  groundingChunks?: any[] | null;
}

export interface GenerateOptions {
  voiceMode: boolean;
  selectedTool?: string;
  provider: 'google' | 'openrouter';
  modelId: string;
}

// ============================================================================
// Environment & API Key Configuration
// ============================================================================

const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    if ((import.meta as any).env[key]) return (import.meta as any).env[key];
  }
  return typeof process !== 'undefined' && process.env[key] ? (process.env[key] as string) : "";
};

const GEMINI_KEYS = [
  getEnvVar("VITE_GEMINI_API_KEY") || getEnvVar("GEMINI_API_KEY"),
  getEnvVar("VITE_GEMINI_API_KEY_2") || getEnvVar("GEMINI_API_KEY_2")
].filter(Boolean);

const OPENROUTER_KEYS = [
  getEnvVar("VITE_OPENROUTER_API_KEY") || getEnvVar("OPENROUTER_API_KEY"),
  getEnvVar("VITE_OPENROUTER_API_KEY_2") || getEnvVar("OPENROUTER_API_KEY_2")
].filter(Boolean);

const createOpenRouterClient = (apiKey: string) => new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: apiKey,
  dangerouslyAllowBrowser: true,
  defaultHeaders: { 
    "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://winky.ai", 
    "X-Title": "Winky AI Agent" 
  }
});

// ============================================================================
// Main Chat Session Manager
// ============================================================================

export class ChatSession {
  history: Content[] = [];

  async *sendMessageStream(
    text: string, 
    attachments: Attachment[], 
    options: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    if (!text && attachments.length === 0) return;

    // Prepare message parts
    const parts: any[] = [];
    if (text) parts.push({ text });
    for (const att of attachments) {
      parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
    }
    
    this.history.push({ role: "user", parts });

    try {
      if (options.provider === 'openrouter') {
        yield* this.handleOpenRouterStream(options.modelId);
      } else {
        yield* this.handleGoogleStream(options);
      }
    } catch (error: any) {
      console.error("Stream Error:", error);
      throw new Error(error.message || "An error occurred during generation.");
    }
  }

  private async *handleGoogleStream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    // API Key Rotation Logic
    const activeKey = GEMINI_KEYS[0] || "";
    const ai = new GoogleGenAI({ apiKey: activeKey });
    
    let isDone = false;
    let accumulatedText = "";
    let accumulatedThought = "";

    while (!isDone) {
      const config: any = {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: toolDeclarations }],
        safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }]
      };

      if (options.selectedTool) {
        config.toolConfig = {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: [options.selectedTool] }
        };
      }

      // Gemini 3 Thinking Configuration
      if (!options.voiceMode && options.modelId.includes('thinking')) {
        config.thinkingConfig = { 
          thinkingLevel: ThinkingLevel.HIGH,
          includeThoughts: true 
        };
      }

      const stream = await ai.models.generateContentStream({
        model: options.modelId,
        contents: this.history,
        config,
      });

      let currentLoopText = "";
      let currentLoopThought = "";
      let functionCalls: any[] = [];
      let groundingChunks: any[] | null = null;

      for await (const chunk of stream) {
        const c = chunk as any;
        
        if (c.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          groundingChunks = c.candidates[0].groundingMetadata.groundingChunks;
        }

        if (c.thought) {
          currentLoopThought += c.thought;
          yield { 
            text: accumulatedText + currentLoopText, 
            thought: accumulatedThought + currentLoopThought, 
            groundingChunks, 
            isDone: false, 
            isThinking: true 
          };
        }

        if (c.text) {
          currentLoopText += c.text;
          yield { 
            text: accumulatedText + currentLoopText, 
            thought: accumulatedThought + currentLoopThought, 
            groundingChunks, 
            isDone: false, 
            isThinking: false 
          };
        }

        if (c.functionCalls?.length > 0) functionCalls = c.functionCalls;
      }

      // Finalize history for this turn
      const modelParts: any[] = [];
      if (currentLoopText) modelParts.push({ text: currentLoopText });
      if (currentLoopThought) modelParts.push({ thought: currentLoopThought } as any);
      if (functionCalls.length > 0) modelParts.push(...functionCalls.map(fc => ({ functionCall: fc })));
      
      this.history.push({ role: "model", parts: modelParts });

      if (functionCalls.length > 0) {
        const functionResponses = [];
        for (const fc of functionCalls) {
          yield { 
            text: accumulatedText + currentLoopText + `\n\n*Using tool: ${fc.name}...*\n`, 
            thought: accumulatedThought + currentLoopThought, 
            isDone: false, 
            isThinking: true 
          };
          const result = await executeTool(fc.name, fc.args);
          functionResponses.push({ functionResponse: { name: fc.name, response: { content: result } } });
        }
        this.history.push({ role: "user", parts: functionResponses });
        accumulatedText += currentLoopText + "\n\n";
        accumulatedThought += currentLoopThought;
      } else {
        isDone = true;
        yield { 
          text: accumulatedText + currentLoopText, 
          thought: accumulatedThought + currentLoopThought, 
          groundingChunks, 
          isDone: true, 
          isThinking: false 
        };
      }
    }
  }

  private async *handleOpenRouterStream(modelId: string): AsyncGenerator<StreamChunk> {
    const apiKey = OPENROUTER_KEYS[0];
    if (!apiKey) throw new Error("OpenRouter API key missing.");
    const client = createOpenRouterClient(apiKey);

    const messages = this.history.map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts.map((p: any) => p.text || '').join('')
    }));

    const stream = await client.chat.completions.create({
      model: modelId,
      messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, ...messages] as any,
      stream: true,
    });

    let fullText = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullText += content;
      yield { text: fullText, thought: "", isDone: false, isThinking: false };
    }

    this.history.push({ role: "model", parts: [{ text: fullText }] });
    yield { text: fullText, thought: "", isDone: true, isThinking: false };
  }
}

// ============================================================================
// Text-to-Speech (High Fidelity)
// ============================================================================

export async function generateSpeech(text: string): Promise<AudioBuffer> {
  const activeKey = GEMINI_KEYS[0] || GEMINI_KEYS[1];
  if (!activeKey) throw new Error("No API key for TTS.");
  
  const ai = new GoogleGenAI({ apiKey: activeKey });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts", 
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" } 
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");

  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const buffer = await audioContext.decodeAudioData(bytes.buffer);
  return buffer;
}

export function playAudioBuffer(buffer: AudioBuffer, onEnded?: () => void) {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.onended = () => onEnded?.();
  source.start();
  return source;
}
