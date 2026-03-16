import { GoogleGenAI, ThinkingLevel, Content } from "@google/genai";
import { toolDeclarations, executeTool } from "./tools";
import { SYSTEM_INSTRUCTION } from "./prompt";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface Attachment {
  mimeType: string;
  data: string; // base64 encoded string
  url: string; // object URL for preview
}

export interface GenerateOptions {
  voiceMode: boolean;
  selectedTool?: string;
}

export class ChatSession {
  history: Content[] = [];

  async *sendMessageStream(text: string, attachments: Attachment[], options: GenerateOptions) {
    const parts: any[] = [];
    if (text) parts.push({ text });
    for (const att of attachments) {
      parts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.data,
        }
      });
    }

    this.history.push({ role: "user", parts });

    let isDone = false;
    let finalFullText = "";

    while (!isDone) {
      const model = options.voiceMode ? "gemini-3-flash-preview" : "gemini-3.1-pro-preview";
      const config: any = {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: toolDeclarations }]
      };

      if (options.selectedTool) {
        config.toolConfig = {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: [options.selectedTool]
          }
        };
      }

      if (!options.voiceMode) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const stream = await ai.models.generateContentStream({
        model,
        contents: this.history,
        config,
      });

      let fullText = "";
      let functionCalls: any[] = [];
      let groundingChunks = null;

      for await (const chunk of stream) {
        const c = chunk as any;
        if (c.text) {
          fullText += c.text;
          yield { text: finalFullText + fullText, isDone: false, isThinking: !options.voiceMode };
        }
        if (c.functionCalls && c.functionCalls.length > 0) {
          functionCalls = c.functionCalls;
        }
        if (c.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          groundingChunks = c.candidates[0].groundingMetadata.groundingChunks;
        }
      }

      const modelParts: any[] = [];
      if (fullText) modelParts.push({ text: fullText });
      if (functionCalls.length > 0) {
        modelParts.push(...functionCalls.map(fc => ({ functionCall: fc })));
      }
      
      if (modelParts.length > 0) {
        this.history.push({ role: "model", parts: modelParts });
      }

      if (functionCalls.length > 0) {
        const functionResponses = [];
        for (const fc of functionCalls) {
          yield { text: finalFullText + fullText + `\n\n*Using tool: ${fc.name}...*\n`, isDone: false, isThinking: true };
          const result = await executeTool(fc.name, fc.args);
          functionResponses.push({
            functionResponse: {
              name: fc.name,
              id: fc.id,
              response: result
            }
          });
        }
        this.history.push({ role: "user", parts: functionResponses });
        finalFullText += fullText + "\n\n";
        // Loop continues to send the function responses back to the model
      } else {
        isDone = true;
        finalFullText += fullText;
        yield { text: finalFullText, isDone: true, groundingChunks, isThinking: false };
      }
    }
  }
}

export async function generateSpeech(text: string): Promise<AudioBuffer> {
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
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const buffer = audioContext.createBuffer(1, bytes.length / 2, 24000);
  const channelData = buffer.getChannelData(0);
  const dataView = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length / 2; i++) {
    channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
  }
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
