import { Type, FunctionDeclaration } from "@google/genai";

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "fast_google_search",
    description: "Purpose: Quick fact-checking and immediate answers. Target Mode: Voice Mode. Expected Behavior: Performs a lightweight search and returns only the top snippet or a highly concise summary for quick, spoken replies.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Search query" }
      },
      required: ["query"]
    }
  },
  {
    name: "detailed_google_search",
    description: "Purpose: Deep research and comprehensive information gathering. Target Mode: Thinking Mode. Expected Behavior: Performs a deep search, returning multiple results, full snippets, and URLs. Ideal for complex queries requiring extensive context.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Search query" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_accurate_weather",
    description: "Purpose: Real-time, highly accurate weather data retrieval. Target Mode: Voice/Thinking Mode. Expected Behavior: Accepts a location and returns current conditions, temperature, precipitation chance, and a short forecast.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING, description: "City name or location, e.g., San Francisco, CA" }
      },
      required: ["location"]
    }
  },
  {
    name: "read_webpage_content",
    description: "Purpose: Deep diving into specific links found via search. Target Mode: Thinking Mode. Expected Behavior: Accepts a URL, scrapes the main article/text content, and returns the raw text. Essential for when the AI needs to read a full article to answer a question.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "URL of the webpage to read" }
      },
      required: ["url"]
    }
  },
  {
    name: "evaluate_math_expression",
    description: "Purpose: Accurate calculations without relying on LLM hallucination. Target Mode: Voice/Thinking Mode. Expected Behavior: Safely evaluates complex mathematical expressions and returns the exact numeric result.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        expression: { type: Type.STRING, description: "Mathematical expression to evaluate, e.g., (452 * 1.08) / 12" }
      },
      required: ["expression"]
    }
  },
  {
    name: "get_current_time_and_date",
    description: "Purpose: Temporal awareness for the assistant. Target Mode: Voice/Thinking Mode. Expected Behavior: Returns the exact current time, day of the week, and date in the user's local timezone.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        timeZone: { type: Type.STRING, description: "Optional timezone string, e.g., America/New_York. If omitted, uses the user's local timezone." }
      }
    }
  },
  {
    name: "get_crypto_price",
    description: "Purpose: Fetches the current price of a cryptocurrency in USD. Target Mode: Voice/Thinking Mode. Expected Behavior: Accepts a cryptocurrency ID and returns its current market price in US Dollars.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        coinId: { type: Type.STRING, description: "The ID of the cryptocurrency (e.g., 'bitcoin', 'ethereum', 'dogecoin')." }
      },
      required: ["coinId"]
    }
  }
];

export const executeTool = async (name: string, args: any): Promise<any> => {
  try {
    switch (name) {
      case "fast_google_search": {
        try {
          // Using DuckDuckGo HTML via AllOrigins proxy for fast search
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://html.duckduckgo.com/html/?q=${args.query}`)}`;
          const res = await fetch(proxyUrl);
          if (!res.ok) throw new Error("Network response was not ok");
          const data = await res.json();
          const html = data.contents;
          
          // Extract the first snippet
          const snippetMatch = html.match(/<a class="result__snippet[^>]*>(.*?)<\/a>/i);
          if (snippetMatch) {
            const cleanSnippet = snippetMatch[1].replace(/<[^>]+>/g, '');
            return { result: cleanSnippet };
          }
          return { result: "No concise answer found. Consider using detailed_google_search." };
        } catch (e: any) {
          return { error: "Error: Could not fetch search results. Please inform the user." };
        }
      }
      
      case "detailed_google_search": {
        try {
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://html.duckduckgo.com/html/?q=${args.query}`)}`;
          const res = await fetch(proxyUrl);
          if (!res.ok) throw new Error("Network response was not ok");
          const data = await res.json();
          const html = data.contents;
          
          const results = [];
          const regex = /<h2 class="result__title">.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>.*?<a class="result__snippet[^>]*>(.*?)<\/a>/gs;
          let match;
          let count = 0;
          
          while ((match = regex.exec(html)) !== null && count < 5) {
            results.push({
              url: match[1],
              title: match[2].replace(/<[^>]+>/g, '').trim(),
              snippet: match[3].replace(/<[^>]+>/g, '').trim()
            });
            count++;
          }
          
          if (results.length > 0) {
            return { results };
          }
          return { error: "No results found." };
        } catch (e: any) {
          return { error: "Error: Could not fetch detailed search results. Please inform the user." };
        }
      }

      case "get_accurate_weather": {
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1`);
          const geoData = await geoRes.json();
          if (!geoData.results || geoData.results.length === 0) return { error: "Location not found" };
          const { latitude, longitude, name, country, timezone } = geoData.results[0];
          
          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum&timezone=${encodeURIComponent(timezone || 'auto')}`);
          if (!weatherRes.ok) throw new Error("Weather API error");
          const weatherData = await weatherRes.json();
          
          return {
            location: `${name}, ${country}`,
            current: weatherData.current,
            daily_forecast: weatherData.daily,
            units: weatherData.current_units
          };
        } catch (e: any) {
          return { error: "Error: Could not fetch weather data. Please inform the user." };
        }
      }

      case "read_webpage_content": {
        try {
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(args.url)}`;
          const res = await fetch(proxyUrl);
          if (!res.ok) throw new Error("Network response was not ok");
          const data = await res.json();
          const html = data.contents;
          
          // Very basic HTML to text extraction
          let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                         .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
                         .replace(/<[^>]+>/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
                         
          // Truncate to avoid massive payloads
          if (text.length > 15000) {
            text = text.substring(0, 15000) + "... [Content truncated]";
          }
          
          return { content: text };
        } catch (e: any) {
          return { error: `Error: Could not read webpage content from ${args.url}. Please inform the user.` };
        }
      }

      case "evaluate_math_expression": {
        try {
          // Extremely safe evaluation using Function, stripping everything except math chars
          const sanitized = args.expression.replace(/[^0-9+\-*/(). %]/g, '');
          if (!sanitized) return { error: "Invalid mathematical expression" };
          const result = new Function(`return (${sanitized})`)();
          return { result, expression: sanitized };
        } catch (e: any) {
          return { error: "Error: Invalid mathematical expression. Please inform the user." };
        }
      }

      case "get_current_time_and_date": {
        try {
          const now = new Date();
          const options: Intl.DateTimeFormatOptions = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'long'
          };
          
          if (args.timeZone) {
            options.timeZone = args.timeZone;
          }
          
          const formatted = now.toLocaleString('en-US', options);
          return { 
            current_date_and_time: formatted,
            iso_string: now.toISOString(),
            timeZone_used: args.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
          };
        } catch (e: any) {
          return { error: "Error: Could not determine time. Please check the timezone string." };
        }
      }

      case "get_crypto_price": {
        try {
          const coinId = args.coinId.toLowerCase();
          const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
          if (!res.ok) throw new Error("Network response was not ok");
          const data = await res.json();
          if (data[coinId] && data[coinId].usd) {
            return { price_usd: data[coinId].usd, coin: coinId };
          }
          return { error: `Could not find price for ${coinId}. Please check the coin ID.` };
        } catch (e: any) {
          return { error: `Error fetching crypto price: ${e.message}` };
        }
      }

      default:
        return { error: `Tool ${name} not found` };
    }
  } catch (err: any) {
    return { error: `Unexpected Error: ${err.message}` };
  }
};
