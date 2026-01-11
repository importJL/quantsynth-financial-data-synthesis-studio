
import { GoogleGenAI, Type } from "@google/genai";
import { ModelType, SynthesisParameters } from "../types";

// Helper to ensure we always use the latest API key
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getEconomicScenario = async (scenarioPrompt: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Convert this economic scenario into mathematical parameters for a stochastic model.
    Scenario: ${scenarioPrompt}
    
    Return a JSON object with:
    - name: Short title
    - description: One sentence rationale
    - modelType: [EQUITY_GBM, EQUITY_MERTON_JUMP, INTEREST_RATE_VASICEK, INTEREST_RATE_CIR, MACRO_INFLATION, OU_PROCESS]
    - assetClass: [EQUITY, FIXED_INCOME, FX, COMMODITY, FORWARD, FUTURE, OPTION, SWAP, SWAPTION, CENTRAL_BANK_RATE, INFLATION_RATE, UNEMPLOYMENT_RATE, TOTAL_PRODUCTIVITY, GDP_GROWTH]
    - parameters: { initialValue, mu, sigma, kappa, theta, lambda, jumpMu, jumpSigma, seasonalAmplitude, riskFreeRate, impliedVol, cdsSpread, domesticRate, foreignRate, peRatio, expectedEarnings }`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          modelType: { type: Type.STRING },
          assetClass: { type: Type.STRING },
          parameters: {
            type: Type.OBJECT,
            properties: {
              initialValue: { type: Type.NUMBER },
              mu: { type: Type.NUMBER },
              sigma: { type: Type.NUMBER },
              kappa: { type: Type.NUMBER },
              theta: { type: Type.NUMBER },
              lambda: { type: Type.NUMBER },
              jumpMu: { type: Type.NUMBER },
              jumpSigma: { type: Type.NUMBER },
              seasonalAmplitude: { type: Type.NUMBER },
              riskFreeRate: { type: Type.NUMBER },
              impliedVol: { type: Type.NUMBER },
              cdsSpread: { type: Type.NUMBER },
              domesticRate: { type: Type.NUMBER },
              foreignRate: { type: Type.NUMBER },
              peRatio: { type: Type.NUMBER },
              expectedEarnings: { type: Type.NUMBER }
            }
          }
        },
        required: ["name", "modelType", "assetClass", "parameters"]
      }
    }
  });

  try {
    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse AI response", response.text);
    throw new Error("Invalid response format from AI studio");
  }
};

export const getAnalysisInsights = async (resultJson: string) => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Provide 3 sharp, bulleted quantitative insights for this data summary: ${resultJson}. If Equity, comment on valuation multiples like P/E if provided.`,
      config: {
        systemInstruction: "You are a senior quantitative researcher. Be concise and institutional-grade."
      }
    });
    return response.text;
  } catch (e) {
    console.error("Insights error", e);
    return "Insights unavailable at this time due to high service demand.";
  }
};
