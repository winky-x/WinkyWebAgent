# Prompt: Overhaul and Upgrade MCP Tools for Voice & Thinking Modes

**Role:** You are an Expert AI Developer and System Architect specializing in real-time voice assistants and Model Context Protocol (MCP) tool integrations.

**Objective:** Completely overhaul the current set of MCP tools in the application. The existing tools (e.g., basic weather, currency, jokes, etc.) are not useful enough for a production-grade assistant. You need to remove the 5 existing "toy" tools and replace them with 6 highly robust, real-world, and genuinely useful tools. 

**Context:** The application operates in two primary modes:
1. **Voice Mode:** Requires extremely low latency and concise answers. Tools used here must be fast.
2. **Thinking Mode:** Allows for deeper reasoning and longer wait times. Tools used here can return large amounts of data for comprehensive analysis.

The AI should be able to autonomously decide which tool to use based on the active mode and the user's request.

---

## Task Requirements

### 1. Remove Old Tools
Identify and completely remove the 5 existing, low-value tools (e.g., currency converter, joke generator, basic weather, etc.) from the codebase. Clean up all associated interfaces, routing, and function declarations.

### 2. Implement 6 New High-Value Tools
Implement the following 6 tools. Ensure they are fully functional, have robust error handling, and use reliable APIs (prefer free, no-auth APIs like Open-Meteo for weather, or standard scraping libraries, unless API keys are strictly provided via environment variables).

#### Tool 1: `fast_google_search`
* **Purpose:** Quick fact-checking and immediate answers.
* **Target Mode:** Default for **Voice Mode**.
* **Behavior:** Performs a lightweight search and returns only the top snippet or a highly concise summary. Must execute in under 1 second.

#### Tool 2: `detailed_google_search`
* **Purpose:** Deep research and comprehensive information gathering.
* **Target Mode:** Recommended for **Thinking Mode**.
* **Behavior:** Performs a deep search, returning multiple results, full snippets, and URLs. The AI can use this to synthesize a detailed report.

#### Tool 3: `get_accurate_weather`
* **Purpose:** Real-time, highly accurate weather data.
* **Target Mode:** Both Voice and Thinking modes.
* **Behavior:** Accepts a location (city, coordinates) and returns current conditions, temperature, precipitation chance, and a short forecast. Use a reliable API like Open-Meteo. Must be fast.

#### Tool 4: `read_webpage_content`
* **Purpose:** Deep diving into specific links found via search.
* **Target Mode:** Thinking Mode.
* **Behavior:** Accepts a URL, scrapes the main article/text content (stripping HTML/ads), and returns the raw markdown/text. Essential for when the AI needs to read a full article to answer a question.

#### Tool 5: `evaluate_math_expression`
* **Purpose:** Accurate calculations without relying on LLM hallucination.
* **Target Mode:** Both Voice and Thinking modes.
* **Behavior:** Safely evaluates complex mathematical expressions (e.g., `(452 * 1.08) / 12`) and returns the exact numeric result.

#### Tool 6: `get_current_time_and_date`
* **Purpose:** Temporal awareness for the assistant.
* **Target Mode:** Both Voice and Thinking modes.
* **Behavior:** Returns the exact current time, day of the week, and date in the user's local timezone. Crucial for queries like "What time is it?" or "What's the date next Tuesday?".

---

## Implementation Guidelines

1. **Function Declarations:** Write precise, highly descriptive JSON Schema definitions for each tool so the Gemini model understands exactly *when* and *how* to use them.
2. **Mode Awareness:** In the system prompt or tool descriptions, explicitly instruct the AI: *"Use `fast_google_search` when in Voice Mode for quick replies. Use `detailed_google_search` when in Thinking Mode or when the user asks for a deep dive."*
3. **Error Handling:** If a tool fails (e.g., network timeout), it must return a graceful error string (e.g., `"Error: Could not fetch search results. Please inform the user."`) rather than crashing the application.
4. **TypeScript:** Ensure all tool inputs and outputs are strictly typed.

**Please proceed with modifying the codebase to implement these changes.**
