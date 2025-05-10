// src/chatbot.js
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const API_URL = process.env.GOOGLE_GEMINI_API_URL;   // e.g. https://generativelanguage.googleapis.com/v1beta/models
const MODEL   = process.env.GOOGLE_GEMINI_API_MODEL; // e.g. "gemini-pro"

if (!API_KEY || !API_URL || !MODEL) {
  console.error("Missing config:", { API_KEY: !!API_KEY, API_URL: !!API_URL, MODEL: !!MODEL });
  throw new Error("Missing Google Gemini configuration");
}

const FULL_API_URL = `${API_URL.replace(/\/+$/, "")}/${MODEL}:generateContent?key=${API_KEY}`;

function formatResponsePlainText(text) {
  // 1) Basic cleaning: remove common markdown syntax, HTML tags, normalize non-breaking spaces, and trim.
  let cleaned = text
    .replace(/<\/?[^>]+(>|$)/g, "") // More aggressive HTML tag removal
    .replace(/[*#_`~]/g, "")       // Remove common markdown characters
    .replace(/\u00A0/g, " ")        // Normalize non-breaking spaces
    .trim();

  // 2) Split into lines, then clean each line and filter out "empty" or purely decorative lines.
  const lines = cleaned.split('\n')
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => {
      if (line.length === 0) return false;
      if (!/[a-zA-Z0-9]/.test(line)) return false;
      if (line.length <= 2 && /^\s*(\d+\.|[-*+])\s*$/.test(line)) return false;
      return true;
    });

  if (lines.length === 0) {
    return "I'm sorry, I couldn't generate a meaningful response based on that."; // Or ""
  }

  const rejoinedText = lines.join(" ");
  const rawSegments = rejoinedText.split(/(?<=[.?!])\s+(?=[A-Z0-9])|\n\s*\n/);
  const segments = rawSegments
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s.length > 1 && /[a-zA-Z]/.test(s));

  if (segments.length < 3) {
    return segments.join(" ").trim();
  }

  return segments
    .map((s, i) => {
      const withoutLeading = s.replace(/^\s*(?:[*\-+]|\d+\.?)\s*/, "").trim();
      return `${i + 1}. ${withoutLeading}`;
    })
    .join("\n");
}

/**
 * Convert chat history into Gemini API format.
 * Merges consecutive same-role messages by taking the content of the LATEST one.
 * Adds a more explicit system instruction to guide the model on contextual relevance and pronoun resolution.
 */
function formatHistoryForGemini(history = []) {
  const geminiHistory = [];

  if (history.length > 0) {
    // More explicit system instruction
    geminiHistory.push({
      role: "user",
      parts: [{ text: `System Instruction: You are AUROA INTEL, a helpful AI assistant.
1.  When answering the LATEST user question, ALWAYS consider the conversation history.
2.  If the LATEST user question is a direct follow-up or clearly related to YOUR (the model's) immediately preceding response, use that context to provide a relevant answer. For example, if you just talked about "Google" and the user then says "tell me more about it" or "what is its revenue?", "it" or "its" refers to "Google".
3.  When a user uses pronouns (e.g., 'it', 'he', 'she', 'they', 'that', 'this', 'his', 'her', 'its', 'their'), assume they are referring to the primary subject of YOUR (the model's) immediately preceding response, unless the user's current question clearly introduces a new subject or context.
4.  If the LATEST user question introduces a completely new topic or seems unrelated to the immediate preceding turns, answer it directly and independently based on your general knowledge. Do NOT try to force connections to unrelated past topics unless the user explicitly asks for such a connection (e.g., "how does that relate to X?").
5.  Be concise and helpful.
Focus on directly answering the user's LATEST question using the above guidelines for context.` }]
    });
    geminiHistory.push({ // Model acknowledges (conceptually)
      role: "model",
      parts: [{text: "Understood. I will follow these instructions to provide contextually relevant and helpful answers, paying close attention to pronoun references and the flow of conversation."}]
    });
  }
  
  const filtered = history
    .filter(m => m.role !== "error" && m.content && m.content.trim() !== "")
    .map(m => ({
      role: m.role === "bot" ? "model" : "user",
      parts: [{ text: m.content.trim() }],
    }));

  for (const msg of filtered) {
    const lastMessageInGeminiHistory = geminiHistory[geminiHistory.length - 1];
    if (lastMessageInGeminiHistory && lastMessageInGeminiHistory.role === msg.role) {
      lastMessageInGeminiHistory.parts = msg.parts; 
    } else {
      geminiHistory.push(msg);
    }
  }
  return geminiHistory;
}

export async function generateChatbotAnswer(prompt, history = []) {
  if (!prompt || prompt.trim() === "") {
    // Consider returning a canned response or specific error type
    return { answer: "Please provide a question or topic to discuss." };
    // Or: throw new Error("Prompt cannot be empty."); 
  }

  const messages = formatHistoryForGemini(history);
  messages.push({ role: "user", parts: [{ text: prompt.trim() }] });

  const payload = {
    contents: messages,
    // Optional: Consider adjusting generationConfig for more controlled responses
    // generationConfig: {
    //   temperature: 0.6, // Lower temperature for more focused/less random answers
    //   topP: 0.95,
    //   topK: 40,
    //   // maxOutputTokens: 1024, // Default is often fine
    // },
    // safetySettings: [ // Example safety settings
    //   { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    //   { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    //   { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    //   { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    // ],
  };

  // console.log("Payload to Gemini:", JSON.stringify(payload, null, 2)); // For deep debugging

  try {
    const resp = await fetch(FULL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await resp.json();

    if (!resp.ok) {
      console.error("Gemini API Error Response:", json);
      const errMsg = json.error?.message || `${resp.status} ${resp.statusText}`;
      if (json.promptFeedback?.blockReason) {
          throw new Error(`Content blocked: ${json.promptFeedback.blockReason}. Ratings: ${JSON.stringify(json.promptFeedback.safetyRatings)}`);
      }
      throw new Error(`Gemini API Error: ${errMsg}`);
    }

    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof rawText !== "string") {
      console.warn("Unexpected Gemini response structure. Full response:", json);
      if (json?.candidates?.[0]?.finishReason === "SAFETY") {
          throw new Error("Response generation stopped due to safety settings.");
      } else if (json?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
          throw new Error("Response truncated because maximum output tokens were reached.");
      }
      throw new Error("No valid text content received from Gemini.");
    }
    return { answer: formatResponsePlainText(rawText) };

  } catch (error) {
    console.error("Error in generateChatbotAnswer:", error);
    // Return a user-friendly error message
    return { answer: `I encountered an issue: ${error.message}. Please try again.` };
    // Or re-throw if you want the calling function to handle it differently:
    // throw error;
  }
} 