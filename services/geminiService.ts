
import { GoogleGenAI } from "@google/genai";
import { ScanningData, OrderMaster } from "../types";

export const getProductionInsights = async (scanData: ScanningData[], orders: OrderMaster[]) => {
  // Try to get API key from various environment sources
  const apiKey = (import.meta.env?.VITE_GEMINI_API_KEY) || (process.env?.GEMINI_API_KEY) || (process.env?.API_KEY);
  
  if (!apiKey) {
    return "Gemini API key not found. Please set VITE_GEMINI_API_KEY in your environment.";
  }

  const ai = new GoogleGenAI({ apiKey });

  const dataSummary = `
    Current Scans: ${JSON.stringify(scanData.slice(-20))}
    Total Orders: ${orders.length}
    Unique Styles: ${Array.from(new Set(orders.map(o => o.style))).join(', ')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this garment production scanning data and provide a short summary of status and any potential bottlenecks. Data: ${dataSummary}`,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text || "No insights available at the moment.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Failed to fetch AI insights. Check your API configuration.";
  }
};
