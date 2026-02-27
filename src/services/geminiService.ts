import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ModerationResult {
  safe: boolean;
  reason: string;
  detected_pii: boolean;
  is_bot: boolean;
}

export async function moderateContent(content: string): Promise<ModerationResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following content for a marketplace app called Huslr. 
      Check for:
      1. Personal information (phone numbers, email addresses, physical addresses).
      2. Scams, fraudulent offers, or suspicious "get rich quick" schemes.
      3. Inappropriate, offensive, or illegal content.
      4. Bot-like behavior (repetitive patterns, nonsensical text).

      Content: "${content}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            detected_pii: { type: Type.BOOLEAN },
            is_bot: { type: Type.BOOLEAN },
          },
          required: ["safe", "reason", "detected_pii", "is_bot"],
        },
      },
    });

    return JSON.parse(response.text || "{}") as ModerationResult;
  } catch (error) {
    console.error("Moderation error:", error);
    return { safe: true, reason: "", detected_pii: false, is_bot: false }; // Fallback to safe if AI fails
  }
}

export async function verifyAadharImage(base64Image: string): Promise<{ is_aadhar: boolean; confidence: number }> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: "Analyze this image. Is it an Indian Aadhar card? Check for the characteristic layout, logo, and fields like 'Government of India', 'Aadhaar', and the 12-digit number format (even if blurred). Return JSON." },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(',')[1] || base64Image
            }
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            is_aadhar: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER }
          },
          required: ["is_aadhar", "confidence"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Aadhar verification error:", error);
    return { is_aadhar: false, confidence: 0 };
  }
}
