import "server-only";
// The only place that talks to an AI provider. To add another provider, keep
// this function's signature; the route and the browser do not change.
import { GoogleGenAI, MediaResolution, ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import { AI_INVOICE_JSON_SCHEMA, AI_INVOICE_PROMPT, parseAiInvoice, type AiInvoice, type AiUsage } from "@/lib/ai-invoice";
import { AI_STATEMENT_JSON_SCHEMA, AI_STATEMENT_PROMPT, parseAiStatement, type AiStatement } from "@/lib/ai-statement";

export type AiPage = { mimeType: string; bytes: Uint8Array };
export type AiFailureCode = "NOT_CONFIGURED" | "TIMEOUT" | "RATE_LIMITED" | "PROVIDER_ERROR" | "INVALID_RESPONSE";
export class AiExtractionError extends Error {
  readonly code: AiFailureCode;
  readonly providerStatus: number | null;
  constructor(code: AiFailureCode, providerStatus: number | null = null) { super(code); this.name = "AiExtractionError"; this.code = code; this.providerStatus = providerStatus; }
}

type GenerateResult = { text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number } };
export type GeminiClient = { models: { generateContent(request: GenerateContentParameters): Promise<GenerateResult> } };
export type ExtractOptions = {
  env?: Readonly<Record<string, string | undefined>>;
  client?: GeminiClient;
  timeoutMs?: number;
  retryDelayMs?: number;
};

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
// Used when the main model is busy ("high demand" 503 or 429): measured working when the main model
// was overloaded for every request. Set GEMINI_FALLBACK_MODEL=off to disable.
export const DEFAULT_FALLBACK_MODEL = "gemini-3.1-flash-lite";
// Below the browser's 30 seconds, so a slow request still falls back cleanly.
// Gemini often takes 15-40 seconds per page (measured), so allow 50s; the route allows 60s.
const DEFAULT_TIMEOUT_MS = 50000;
const MAX_OUTPUT_TOKENS = 16000;

export const aiExtractionConfigured = (env: Readonly<Record<string, string | undefined>> = process.env) => Boolean(env.GEMINI_API_KEY?.trim());

function errorStatus(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}
const count = (value: number | undefined) => typeof value === "number" ? value : null;

export async function extractWithGemini(pages: readonly AiPage[], options: ExtractOptions = {}): Promise<{ invoice: AiInvoice; usage: AiUsage; model: string }> {
  const { data, usage, model } = await runGemini(pages, AI_INVOICE_PROMPT, AI_INVOICE_JSON_SCHEMA, parseAiInvoice, options);
  return { invoice: data, usage, model };
}

// Bank statements (photo or PDF): every transaction row, for bank VAT matching.
export async function extractStatementWithGemini(pages: readonly AiPage[], options: ExtractOptions = {}): Promise<{ statement: AiStatement; usage: AiUsage; model: string }> {
  const { data, usage, model } = await runGemini(pages, AI_STATEMENT_PROMPT, AI_STATEMENT_JSON_SCHEMA, parseAiStatement, options);
  return { statement: data, usage, model };
}

async function runGemini<T>(pages: readonly AiPage[], prompt: string, schema: object, parse: (value: unknown) => T, options: ExtractOptions): Promise<{ data: T; usage: AiUsage; model: string }> {
  const env = options.env ?? process.env, apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey && !options.client) throw new AiExtractionError("NOT_CONFIGURED");
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const client: GeminiClient = options.client ?? new GoogleGenAI({ apiKey });
  const fallbackSetting = env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  const fallbackModel = /^(off|none|false)$/i.test(fallbackSetting) || fallbackSetting === model ? null : fallbackSetting;
  // Gemini 2.5 models need the v1beta API for JSON output and a thinking budget instead of a level.
  const fallbackClient: GeminiClient = options.client ?? new GoogleGenAI({ apiKey, apiVersion: "v1beta" });
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS, retryDelayMs = options.retryDelayMs ?? 1000;
  // Gemini usually answers in 5-10s but sometimes never answers at all (measured). Waiting longer
  // does not help; asking again does. So each attempt gets about half the time, and an attempt
  // that is busy (503) or silent is retried once within the overall limit.
  const attemptMs = Math.max(1, Math.floor(timeoutMs * 0.48));
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
  const config = {
    responseMimeType: "application/json",
    responseJsonSchema: schema,
    // Photos need high resolution for small print; for PDFs Google advises medium.
    // Thinking is at its lowest level because thinking tokens are billed as output.
    mediaResolution: pages.every((page) => page.mimeType === "application/pdf") ? MediaResolution.MEDIA_RESOLUTION_MEDIUM : MediaResolution.MEDIA_RESOLUTION_HIGH,
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    maxOutputTokens: MAX_OUTPUT_TOKENS
  };
  const contents = [{ role: "user", parts: [
    ...pages.map((page) => ({ inlineData: { mimeType: page.mimeType, data: Buffer.from(page.bytes).toString("base64") } })),
    { text: prompt }
  ] }];
  // Abandons the wait even if a client ignores the abort signal.
  const timedOut = new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new AiExtractionError("TIMEOUT")), { once: true }));
  void timedOut.catch(() => undefined);
  let usedModel = model;
  const call = (backup = false) => {
    const name = backup && fallbackModel ? fallbackModel : model, api = backup && fallbackModel ? fallbackClient : client;
    const thinking = /gemini-2\./.test(name) ? { thinkingBudget: 0 } : config.thinkingConfig;
    usedModel = name;
    const attempt = new AbortController(), stop = () => attempt.abort();
    abort.signal.addEventListener("abort", stop, { once: true });
    const attemptTimer = setTimeout(stop, attemptMs);
    const silent = new Promise<never>((_, reject) => attempt.signal.addEventListener("abort", () => reject(new AiExtractionError("TIMEOUT")), { once: true }));
    void silent.catch(() => undefined);
    return Promise.race([api.models.generateContent({ model: name, contents, config: { ...config, thinkingConfig: thinking, abortSignal: attempt.signal } as typeof config }), silent, timedOut])
      .finally(() => { clearTimeout(attemptTimer); abort.signal.removeEventListener("abort", stop); });
  };
  try {
    let result: GenerateResult | undefined, backup = false;
    // Busy (503/429): up to three tries, switching between the main and the backup model (Google's
    // "high demand" spikes hit one model at a time). Silent: asked once more on the same model.
    for (let tries = 1; !result; tries++) {
      try { result = await call(backup); }
      catch (error) {
        const busy = errorStatus(error) === 503 || errorStatus(error) === 429, silent = error instanceof AiExtractionError && error.code === "TIMEOUT";
        if ((!busy && !silent) || abort.signal.aborted || tries >= (busy ? 3 : 2)) throw error;
        if (busy) { await Promise.race([new Promise((resolve) => setTimeout(resolve, retryDelayMs)), timedOut]); if (fallbackModel !== null) backup = !backup; }
      }
    }
    let data: T;
    try { data = parse(JSON.parse(result.text ?? "")); }
    catch { throw new AiExtractionError("INVALID_RESPONSE"); }
    const usage = result.usageMetadata;
    return { data, model: usedModel, usage: { promptTokens: count(usage?.promptTokenCount), outputTokens: count(usage?.candidatesTokenCount), thinkingTokens: count(usage?.thoughtsTokenCount), totalTokens: count(usage?.totalTokenCount) } };
  } catch (error) {
    if (error instanceof AiExtractionError) throw error;
    if (abort.signal.aborted) throw new AiExtractionError("TIMEOUT");
    const status = errorStatus(error);
    throw new AiExtractionError(status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR", status);
  } finally { clearTimeout(timer); }
}
