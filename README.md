<div align="center">
<img width="1200" height="475" alt="Winky AI Banner" src="https://github.com/winky-x/WinkyWebAgent/public/logo.png" />
</div>

# 🎙️ Winky AI - Your Sassy AI Companion

> **Advanced conversational AI agent with real-time tool access, voice mode, and deep reasoning capabilities**

Winky is a cutting-edge AI assistant made by Yuvraj Chandra. She combines natural conversation with intelligent tool integration, allowing her to search the web, analyze weather data, perform calculations, and reason through complex problems—all while keeping things playful and engaging.

---

## 👨‍💻 About the Creator

**Winky AI** was created by **Yuvraj Chandra**  
📍 **9th H, Police DAV Public School, Jalandhar, Punjab, India**

---

## ✨ Key Features

-  **Voice Mode**: Real-time voice interaction with natural speech synthesis
-  **Thinking Mode**: Deep reasoning with extended thought processes for complex problems
-  **Smart Tool Integration**: 
  - Web search (fast & detailed)
  - Real-time weather data
  - Mathematical calculations
  - Webpage content extraction
  - Cryptocurrency price tracking
  - Current time & date across timezones
- 💬 **Conversational AI**: Sassy, intelligent responses with personality
- 🌐 **Multilingual Support**: English, Hindi (Devanagari), and Punjabi (Gurmukhi)
- ⚡ **Streaming Responses**: Real-time text and thought updates
- 🎨 **Modern UI**: Beautiful, responsive interface with Tailwind CSS

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Gemini API Key** from [Google AI Studio](https://ai.google.dev/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/winky-x/WinkyWebAgent.git
   cd WinkyWebAgent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   Navigate to `http://localhost:5173` and start chatting with Winky!

---

## 📖 How to Use

### Voice Mode
- Click the **Voice** toggle in the header
- Speak naturally—Winky listens and responds with audio
- Perfect for hands-free interaction

### Thinking Mode
- Click the **Think** toggle for deep reasoning
- Winky will use extended thinking (High level) for complex queries
- See her internal reasoning process
- Better for research and problem-solving

### Available Commands
Try asking Winky:
- `"What's the weather in Tokyo?"`
- `"Calculate (452 * 1.08) / 12"`
- `"What's the latest news on AI?"`
- `"Read https://example.com and summarize it"`
- `"What's the current Bitcoin price?"`
- `"What time is it in New York?"`

---

## 🛠️ Technology Stack

| Technology | Purpose |
|-----------|---------|
| **React** | UI framework |
| **TypeScript** | Type-safe development |
| **Vite** | Fast build tool |
| **Tailwind CSS** | Styling |
| **Motion** | Smooth animations |
| **Sonner** | Toast notifications |
| **Ai Model API Integration** | AI engine |
| **Web Audio API** | Voice synthesis & capture |

---

## 🏗️ Project Structure

```
src/
├── components/        # React components
│   ├── ChatInput.tsx
│   ├── ChatMessage.tsx
│   └── ...
├── lib/
│   ├── gemini.ts     # Chat session & Gemini integration
│   ├── live.ts       # Voice mode (Live API)
│   ├── tools.ts      # Tool definitions & execution
│   ├── prompt.ts     # System instructions
│   └── ...
├── App.tsx           # Main application
└── main.tsx          # Entry point
```

---

## 🔐 Environment Variables

```env
VITE_GEMINI_API_KEY    # Your Gemini API key (required)
```

Get your API key from [Google AI Studio](https://ai.google.dev/aistudio)

---

## 🎯 Model Configuration

**Current Setup:**
- **Voice Mode**: `Fast, Conversational`
- **Thinking Mode**: `Reasoning With Extended Thinking`
- **Text-to-Speech**: `Natural Voice Synthesis`

---

## 📝 System Personality

Winky is designed with a unique personality:
- **Sassy & Confident**: Witty responses with light roasting
- **Intelligent**: Advanced reasoning and problem-solving
- **Playful**: Modern slang and conversational tone
- **Multilingual**: Mixes Hindi, Punjabi, and English naturally
- **Helpful**: Always ready to assist with real-world queries

---

## 🌐 Try Live

View and interact with Winky at: [WinkyAI](https://winkytalk.vercel.app/)

---

### 🔗 Check Out Other Projects by Yuvraj:
- [GitHub Profile](https://github.com/winky-x)
- More AI and web projects coming soon!

---

## 📄 License

This project is provided as-is for educational and personal use.

---

## 🤝 Contributing

Found a bug or have a suggestion? Feel free to open an issue or contribute!

---

## 💡 Tips & Tricks

- **Use Tool Selection**: Select a specific tool before querying for focused results
- **Combine Modes**: Switch between Voice and Thinking modes based on your needs
- **Clear Chat**: Use the trash icon to start a fresh conversation
- **Mute Option**: Mute your microphone while in Voice mode

---

## Support

For issues, questions, or feedback, reach out through:
- GitHub Issues: [Create an issue](https://github.com/winky-x/WinkyWebAgent/issues)
- Creator's GitHub: [@winky-x](https://github.com/winky-x)

---

<div align="center">

**Made with ❤️ by Yuvraj Chandra**

*"Keep it classy, keep it sassy."* — Winky

</div>
