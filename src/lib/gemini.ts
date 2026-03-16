import { GoogleGenAI, ThinkingLevel, Content } from "@google/genai";
import { toolDeclarations, executeTool } from "./tools";
import { SYSTEM_INSTRUCTION } from "./prompt";
import { mcpClient } from "./mcp-client"; // Import the MCP client

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
    // Check if this is an MCP tool call (web agent)
    if (options.selectedTool === 'web_agent') {
      try {
        // Ensure MCP client is connected
        const connected = await mcpClient.connect();
        if (!connected) {
          throw new Error('Web Agent server not available');
        }
        
        // Parse the text to extract parameters for the tool
        let toolArgs = this.parseWebAgentArgs(text);

        // Call the MCP tool
        const result = await mcpClient.callTool('web_agent', toolArgs);
        
        // Format the response
        const toolResponse = result.content?.[0]?.text || 'Web agent executed successfully';
        
        // Yield the result as a stream chunk
        yield {
          text: `**Using Web Agent:** ${toolResponse}\n\nI've completed the web action you requested.`,
          isDone: true,
          isThinking: false
        };
        
        return;
      } catch (error) {
        console.error('MCP tool error:', error);
        yield {
          text: `**Error using Web Agent:** ${error instanceof Error ? error.message : 'Unknown error'}`,
          isDone: true,
          isError: true,
          isThinking: false
        };
        return;
      }
    }

    // Your existing code for normal Gemini flow
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

      // Add MCP tool to tool declarations if connected
      if (mcpClient.isConnected()) {
        const mcpTools = mcpClient.getAvailableTools();
        if (mcpTools.length > 0) {
          // Convert MCP tools to Gemini function declarations
          const mcpDeclarations = mcpTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }));
          config.tools[0].functionDeclarations = [
            ...config.tools[0].functionDeclarations,
            ...mcpDeclarations
          ];
        }
      }

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
          
          // Check if this is an MCP tool
          if (fc.name === 'web_agent' && mcpClient.isConnected()) {
            const result = await mcpClient.callTool(fc.name, fc.args);
            functionResponses.push({
              functionResponse: {
                name: fc.name,
                id: fc.id,
                response: { result: result.content?.[0]?.text || 'Web agent executed successfully' }
              }
            });
          } else {
            // Regular tool execution
            const result = await executeTool(fc.name, fc.args);
            functionResponses.push({
              functionResponse: {
                name: fc.name,
                id: fc.id,
                response: result
              }
            });
          }
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

  // Helper method to parse web agent arguments
  private parseWebAgentArgs(text: string): any {
    // Default args
    const args: any = {
      url: 'https://google.com',
      action: 'navigate'
    };

    // Extract URL
    const urlMatch = text.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,})/g);
    if (urlMatch) {
      let url = urlMatch[0];
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      args.url = url;
    }

    // Detect action
    const lowerText = text.toLowerCase();
    if (lowerText.includes('click')) args.action = 'click';
    else if (lowerText.includes('type') || lowerText.includes('input')) args.action = 'type';
    else if (lowerText.includes('search')) args.action = 'search';
    else if (lowerText.includes('submit')) args.action = 'submit';

    // Extract selector
    const selectorMatch = text.match(/(?:click|type|input|find)\s+(?:the\s+)?["']([^"']+)["']/i);
    if (selectorMatch) {
      args.selector = selectorMatch[1];
    }

    // Extract value for typing
    const valueMatch = text.match(/type\s+["']([^"']+)["']/i);
    if (valueMatch) {
      args.value = valueMatch[1];
    }

    return args;
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
