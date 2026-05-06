import { Type, FunctionDeclaration } from "@google/genai";
import { getGlobalPort } from './robotManager';

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "control_robot_hardware",
    description: "Commands the physical robot to move or toggle lights. Use 'F' for forward, 'L' for left, 'S' for stop, and 'H' for headlights.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: { type: Type.STRING, description: "Single character command: F, L, S, or H" }
      },
      required: ["command"]
    }
  },
  {
    name: "get_accurate_weather",
    description: "Purpose: Real-time, highly accurate weather data retrieval. Target Mode: Voice/Thinking Mode. Expected Behavior: Accepts a location and returns current conditions, temperature, precipitation, and forecasts.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING, description: "City name or location, e.g., San Francisco, CA" }
      },
      required: ["location"]
    }
  },
  {
    name: "evaluate_math_expression",
    description: "Purpose: Accurate calculations without relying on LLM hallucination. Target Mode: Voice/Thinking Mode. Expected Behavior: Safely evaluates complex mathematical expressions and returns precise results.",
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
    description: "Purpose: Fetches the current price of a cryptocurrency in USD. Target Mode: Voice/Thinking Mode. Expected Behavior: Accepts a cryptocurrency ID and returns its current market price in USD.",
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
      case "control_robot_hardware": {
        const port = getGlobalPort();
        
        if (!port || !port.writable) {
          return { error: "Robot not connected. Please click the 'Connect Robot' button in the UI first." };
        }

        try {
          const writer = port.writable.getWriter();
          const encoder = new TextEncoder();
          await writer.write(encoder.encode(args.command)); 
          writer.releaseLock();
          
          return { status: "Success", sent: args.command };
        } catch (err: any) {
          return { error: `Hardware write error: ${err.message}` };
        }
      }

      case "get_accurate_weather": {
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1`);
          const geoData = await geoRes.json();
          if (!geoData.results || geoData.results.length === 0) return { error: "Location not found" };
          const { latitude, longitude, name, country, timezone } = geoData.results[0];

          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=${timezone}`);
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

      case "evaluate_math_expression": {
        try {
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
