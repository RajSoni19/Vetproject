// Business names (suppliers, products, companies) shown in non-Latin languages are written in that
// script by how they SOUND, never translated by meaning: "Temple Wines" -> "टेम्पल वाइन्स", not
// "मंदिर वाइन". Done by Gemini (the reader already used for invoices), a batch at a time.
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_GEMINI_MODEL } from "@/lib/ai-extraction";

export const TRANSLITERATION_SCRIPTS: Record<string, string> = {
  "hi-IN": "Hindi (Devanagari script)",
  "gu-IN": "Gujarati (Gujarati script)",
  "pa-IN": "Punjabi (Gurmukhi script)",
  "ur-PK": "Urdu (Perso-Arabic Nastaliq script)",
  ar: "Arabic (Arabic script)"
};
export const MAX_NAMES = 100, MAX_NAME_LENGTH = 150;

export function transliterationPrompt(locale: string, names: readonly string[]) {
  return `Transliterate each business or product name into ${TRANSLITERATION_SCRIPTS[locale]} so a reader of that script can say it the way it is pronounced in English.
Do NOT translate the meaning: "Temple Wines" must sound like "Temple Wines", never become the word for a temple or wine. Company endings "Ltd", "LTD", "Ltd.", "Limited", "PLC" and "LLP" are always written out as they sound in the target script (Ltd/Limited as "Limited"), never left in Latin letters. Keep digits, sizes (10kg, 70cl, 24 x 330ml), symbols, punctuation, product or stock codes (e.g. MC04, 1X500, 2ply) and the abbreviations VAT, UK, NRB, PET, ORS exactly as they are.
Return JSON {"names": [...]} with exactly ${names.length} strings, one for each input, in the same order.
Input: ${JSON.stringify(names)}`;
}

export async function transliterateNames(locale: string, names: readonly string[], env: Readonly<Record<string, string | undefined>> = process.env): Promise<string[]> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey || !TRANSLITERATION_SCRIPTS[locale] || !names.length) return [...names];
  const schema = { type: "object", properties: { names: { type: "array", items: { type: "string" } } }, required: ["names"] };
  const main = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL, backup = env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  const ask = async (model: string) => {
    const client = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });
    const result = await client.models.generateContent({ model, contents: transliterationPrompt(locale, names), config: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 8000, abortSignal: AbortSignal.timeout(20000) } });
    const parsed = JSON.parse(result.text ?? "") as { names?: unknown };
    if (!Array.isArray(parsed.names) || parsed.names.length !== names.length) throw new Error("count");
    return parsed.names.map((value, index) => typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_NAME_LENGTH * 2) : names[index]);
  };
  for (const model of [...new Set([main, backup].filter((value) => value && !/^(off|none|false)$/i.test(value)))]) {
    try { return await ask(model); } catch { /* busy or unexpected reply: try the next model, else keep the names */ }
  }
  return [...names];
}
