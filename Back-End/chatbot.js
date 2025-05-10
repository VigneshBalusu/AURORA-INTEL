// src/chatbot.js (using @google/generative-ai SDK - COMPLETE)
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
// Ensure MODEL_NAME is set, e.g., "gemini-pro" or the more specific "gemini-1.0-pro"
const MODEL_NAME = process.env.GOOGLE_GEMINI_API_MODEL || "gemini-1.0-pro";

if (!API_KEY) {
  console.error("CRITICAL ERROR: Missing Google Gemini API Key (GOOGLE_GEMINI_API_KEY)");
  throw new Error("Missing Google Gemini API Key configuration (GOOGLE_GEMINI_API_KEY)");
}
if (!MODEL_NAME) {
  console.error("CRITICAL ERROR: Missing Google Gemini Model Name (GOOGLE_GEMINI_API_MODEL)");
  throw new Error("Missing Google Gemini Model Name configuration (GOOGLE_GEMINI_API_MODEL)");
}


const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: MODEL_NAME,
  // Default safety settings - adjust as needed
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
  // Default generation config - adjust as needed
  // generationConfig: {
  //   temperature: 0.7,
  //   topP: 0.95,
  //   topK: 40,
  //   maxOutputTokens: 2048, // Gemini Pro default is 2048 for text
  // }
});

// --- formatResponsePlainText function (ensure this is your robust version) ---
function formatResponsePlainText(text) {
  if (typeof text !== 'string') {
    console.warn("formatResponsePlainText received non-string input:", text);
    return "I had a little trouble formatting that response."; // User-friendly message
  }
  // 1) Basic cleaning
  let cleaned = text
    .replace(/<\/?[^>]+(>|$)/g, "")       // Remove HTML tags
    .replace(/[*#_`~](?=\S)|(?<=\S)[*#_`~]/g, "") // Remove markdown characters only if they are formatting, not part of words like "C#"
    .replace(/\u00A0/g, " ")             // Normalize non-breaking spaces
    .trim();

  // 2) Split into lines, clean each, and filter out "empty" or purely decorative lines.
  const lines = cleaned.split('\n')
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => {
      if (line.length === 0) return false;
      if (!/[a-zA-Z0-9]/.test(line)) return false; // Must contain some alphanumeric
      // Avoid numbering lines that are just list markers if AI outputs them strangely
      if (line.length <= 3 && /^\s*(\d+\.|[-*+])\s*$/.test(line)) return false;
      return true;
    });

  if (lines.length === 0) {
    return "I'm sorry, I couldn't generate a meaningful response from that.";
  }

  // 3) Re-join lines and then split into sentences/segments.
  const rejoinedText = lines.join(" \n"); // Join with space and newline to preserve paragraph breaks if intended
  
  // Split into segments based on sentence terminators followed by space and uppercase, or multiple newlines
  const rawSegments = rejoinedText.split(/(?<=[.?!])\s+(?=[A-Z0-9])|\n\s*\n+/);
  
  const segments = rawSegments
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s.length > 1 && /[a-zA-Z]/.test(s)); // Keep segments with actual text

  // 4) If fewer than 3 meaningful segments, return the cleaned rejoined text.
  if (segments.length < 3) {
    return segments.join(" ").trim(); // Join segments with a space
  }

  // 5) Otherwise, format each segment as a numbered point.
  return segments
    .map((s, i) => {
      const withoutLeading = s.replace(/^\s*(?:[*\-+]|\d+\.?)\s*/, "").trim();
      return `${i + 1}. ${withoutLeading}`;
    })
    .join("\n");
}
// --- End of formatResponsePlainText ---


/**
 * Prepares history for the SDK's startChat method, including the system instruction.
 * @param {Array<Object>} appHistory - Your application's history format [{role: 'user'|'bot', content: '...'}]
 * @returns {Array<Object>} History formatted for the Gemini SDK [{role: 'user'|'model', parts: [{text: '...'}]}]
 */
// In chatbot.js, inside prepareHistoryForSDK function

// In chatbot.js, inside prepareHistoryForSDK function

function prepareHistoryForSDK(appHistory = []) {
  const sdkHistory = [];

  // System Instruction - Generalized for better contextual understanding
  sdkHistory.push({
    role: "user", // Instruction framed as a user turn
    parts: [{
      text: `(CRITICAL SYSTEM INSTRUCTION for AUROA INTEL, the AI assistant you are playing:
You MUST follow these rules for understanding context in our conversation:

1.  YOUR IMMEDIATE PREVIOUS RESPONSE IS THE PRIMARY CONTEXT: When I (the user) ask a short follow-up question or use a pronoun (like "it", "that", "he", "his", "she", "her", "they", "their", "its", "founder", "CEO", "age", etc.), you MUST assume this follow-up or pronoun refers to the main subject, person, company, or concept YOU (AUROA INTEL) explicitly mentioned and focused on in YOUR *immediately preceding response*.

2.  DIRECTLY ANSWER USING THAT CONTEXT: Based on this understanding, answer my follow-up question directly using the context from YOUR last statement.
    *   Example Scenario:
        *   If YOU just said: "XYZ is a company that makes widgets."
        *   And I then ask: "its founder" or "tell me more about it" or "their main product".
        *   You MUST understand "its", "it", or "their" refers to "XYZ company" and provide information about XYZ's founder or main product, or more details about XYZ.
    *   DO NOT ask for clarification like "What does 'it' refer to?" or "Whose founder are you asking about?" if YOU just provided the clear subject in your previous response.

3.  HANDLING NEW, UNRELATED TOPICS: If my new question *clearly* introduces a completely new subject that is NOT a direct follow-up to your last response, then (and only then) should you treat it as a fresh query and answer based on your general knowledge. Do not try to force connections to unrelated past topics.

4.  YOUR GOAL: Be a helpful, contextually aware assistant. Prioritize understanding my follow-ups based on what YOU just said.

Failure to correctly use the context from your immediately preceding response to answer my direct follow-ups (especially rule #2) is a critical error in your function as AUROA INTEL.)`
    }]
  });
  sdkHistory.push({
    role: "model", // Model's conceptual acknowledgment
    parts: [{ text: "Understood. I will strictly follow these instructions. I will use the subject of my immediately preceding response as the primary context for user follow-ups and pronoun resolution, and I will answer directly without unnecessary clarification if the context is clear from my last statement." }]
  });

  // Convert and append actual conversation history from your application's format
  appHistory.forEach(msg => {
    if (msg.content && msg.content.trim() !== "") {
      sdkHistory.push({
        role: msg.role === "bot" ? "model" : "user",
        parts: [{ text: msg.content.trim() }]
      });
    }
  });
  return sdkHistory;
}

export async function generateChatbotAnswer(prompt, appHistory = []) {
  if (!prompt || prompt.trim() === "") {
    // Return a structured answer even for empty prompts
    return { answer: "It looks like you didn't ask a question. How can I help you today?" };
  }

  const sdkCompliantHistory = prepareHistoryForSDK(appHistory);

  // Start a new chat session with the constructed history for each call.
  // This is suitable for stateless API backends where you manage history persistence.
  const chat = model.startChat({
    history: sdkCompliantHistory,
    generationConfig: { temperature: 0.6 }, // EXPERIMENT HERE

    // You can override generationConfig or safetySettings here for this specific call if needed
    // generationConfig: { temperature: 0.6 },
  });

  // For debugging: Log the history being sent to the SDK
  // console.log("Sending to Gemini SDK. History being used:", JSON.stringify(sdkCompliantHistory, null, 2));
  // console.log("User Prompt:", prompt.trim());

  try {
    const result = await chat.sendMessage(prompt.trim());
    const response = result.response;
    
    // Check for blocking reasons first
    if (response.promptFeedback?.blockReason) {
        console.error("Gemini SDK - Prompt Blocked:", response.promptFeedback);
        throw new Error(`Your request was blocked: ${response.promptFeedback.blockReason}. Please rephrase your question.`);
    }
    if (response.candidates?.[0]?.finishReason === "SAFETY") {
        console.error("Gemini SDK - Response Blocked by Safety:", response.candidates[0].safetyRatings);
        throw new Error("My response was blocked due to safety settings. Please try a different topic.");
    }
    if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        console.warn("Gemini SDK - Response Truncated (MAX_TOKENS)");
        // The text will still be there, but it's good to be aware.
    }


    const rawText = response.text(); // SDK provides a convenience text() method

    if (typeof rawText !== "string" || rawText.trim() === "") {
      console.warn("Gemini SDK returned empty or non-string text. Full response object:", response);
      // Check for other finish reasons if text is empty
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
          throw new Error(`Response generation stopped unexpectedly due to: ${finishReason}.`);
      }
      throw new Error("I received an empty response. Could you try asking in a different way?");
    }

    return { answer: formatResponsePlainText(rawText) };

  } catch (error) {
    console.error("Error in generateChatbotAnswer (SDK):", error.message);
    // Provide a user-friendly error message.
    // Avoid exposing raw error details like API keys or too much internal info to the client.
    if (error.message.includes("API key not valid")) {
        return { answer: "There's an issue with the AI service configuration. Please notify support."};
    }
    return { answer: `I encountered an issue: ${error.message}. Please try again or rephrase.` };
  }
}

// Example of how you might use this in your backend API endpoint:
//
// app.post('/api/chat', async (req, res) => {
//   const { prompt, history } = req.body;
//   if (!prompt) {
//     return res.status(400).json({ error: "Prompt is required." });
//   }
//   try {
//     const result = await generateChatbotAnswer(prompt, history || []);
//     res.json(result); // Sends { answer: "..." }
//   } catch (e) {
//     // This catch is mostly for unexpected errors not handled within generateChatbotAnswer
//     console.error("Unhandled error in /api/chat:", e);
//     res.status(500).json({ error: "Failed to get a response from the chatbot." });
//   }
// });