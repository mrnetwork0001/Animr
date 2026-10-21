/**
 * 0G Compute as an AI SDK language model. Server-side only: the API key spends the account's credits.
 *
 * Talks to the 0G Compute Router, 0G's OpenAI-compatible gateway in front of the 0G Compute Network
 * (https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview):
 * POST {ZG_BASE_URL}/chat/completions with `Authorization: Bearer sk-…`.
 * The key is an `sk-` API key from https://pc.0g.ai → Dashboard → API Keys (mainnet).
 *
 * Env: ZG_API_KEY (required), ZG_MODEL, ZG_BASE_URL, ZG_JSON_MODE, ZG_THINKING, ZG_VERIFY_TEE.
 */
import { createOpenAICompatible, type MetadataExtractor } from "@ai-sdk/openai-compatible";
import { APICallError, extractJsonMiddleware, wrapLanguageModel, type JSONValue, type LanguageModelMiddleware } from "ai";

/** The Router turned down a call over verify_tee once (this process): stop sending it. */
let verifyTeeRejected = false;

/** 0G mainnet Router. The testnet Router only serves qwen2.5-omni. */
export const ZG_DEFAULT_BASE_URL = "https://router-api.0g.ai/v1";

/**
 * GLM-5.3, 0G's flagship: 6 endpoints (2 TEE enclaves run by the 0G Foundation, 4 TeeTLS channels via
 * Baidu and Tencent), all with JSON mode. Thanks to the enclaves it also works with "Private" keys.
 */
export const ZG_DEFAULT_MODEL = "glm-5.3";

/** Provider name, which is also the providerOptions and providerMetadata key. */
const PROVIDER = "0g";

/**
 * How Output.object is enforced (ZG_JSON_MODE). In every mode the schema is written into the system
 * prompt, the reply is trimmed to its JSON object, and the AI SDK validates it against the schema.
 * - json_object (default): `response_format: {type: "json_object"}`, the JSON mode 0G documents.
 * - json_schema: strict `json_schema`. The Router accepts it, but no upstream advertises it.
 * - prompt: no `response_format`, for models whose catalog entry doesn't list it.
 */
type ZgJsonMode = "json_object" | "json_schema" | "prompt";

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function isZgConfigured(): boolean {
  return env("ZG_API_KEY") !== undefined;
}

/**
 * ZG_VERIFY_TEE: on (default) | off. On, every call carries `verify_tee: true`, asking the Router to check
 * the serving provider's TEE signature and report the verdict as `x_0g_trace.tee_verified`.
 *
 * Measured on glm-5.3 (2026-10-19, 20 calls, 0x7DCF TeeML unless noted). Every call was answered with
 * `x-0g-e2ee: sealed` and tee_verified was absent from every trace (the Router publishes no verdict for
 * sealed traffic; absent means "no claim", not a failure), so these numbers are for a flag the Router did
 * not act on, and the cost of real verification is unmeasured:
 * - 8-token replies, alternating: median 1.83 s with, 1.86 s without (4 each);
 * - brain-sized replies (~800 tokens in): 2.87 / 3.67 / 3.79 s with vs 2.62 / 2.83 s without (warm; the
 *   cold first call took 3.18 s), so the median is 0.8-0.9 s slower with it on 3 vs 2-3 samples: within
 *   noise at this size, but not shown to be zero;
 * - no extra cost on the receipts.
 * It stays on so receipts pick up the verdict once the Router reports one. If the Router ever rejects the
 * field (HTTP 400/403/422), the call is retried once without it and the flag is dropped for this process
 * (see withVerifyTeeFallback); slowness is not detected: set ZG_VERIFY_TEE=off. Label receipts with
 * zgProviderInfo, and show "TEE verified" only when tee_verified is true.
 */
function verifyTeeEnabled(): boolean {
  return !verifyTeeRejected && !/^(off|false|0|no)$/i.test(env("ZG_VERIFY_TEE") ?? "");
}

/** For logs and UI; never includes the key. */
export function zgModelInfo(): { baseURL: string; model: string; configured: boolean; verifyTee: boolean } {
  return {
    baseURL: env("ZG_BASE_URL") ?? ZG_DEFAULT_BASE_URL,
    model: env("ZG_MODEL") ?? ZG_DEFAULT_MODEL,
    configured: isZgConfigured(),
    verifyTee: verifyTeeEnabled(),
  };
}

/**
 * Exposes the Router's `x_0g_trace` (request_id, serving provider's on-chain address, exact billing, and
 * tee_verified when the Router reports one) as `result.providerMetadata["0g"].trace`.
 */
const traceExtractor: MetadataExtractor = {
  extractMetadata: async ({ parsedBody }) => traceMetadata(readTrace(parsedBody)),
  createStreamExtractor: () => {
    let trace: JSONValue | undefined;
    return {
      processChunk: (chunk) => {
        trace = readTrace(chunk) ?? trace;
      },
      buildMetadata: () => traceMetadata(trace),
    };
  },
};

/** A chat model on the 0G Router, ready for generateText with Output.object. */
export function createZgLanguageModel(modelId?: string) {
  const { baseURL, model } = zgModelInfo();
  const id = modelId?.trim() || model;
  const mode = env("ZG_JSON_MODE");
  const jsonMode: ZgJsonMode = mode === "json_schema" || mode === "prompt" ? mode : "json_object";

  const provider = createOpenAICompatible({
    name: PROVIDER,
    baseURL,
    apiKey: env("ZG_API_KEY"),
    // Self-reported app name for the Router's usage stats, which read X-Title / HTTP-Referer.
    headers: { "X-Title": "Animr" },
    // true: strict `json_schema`. false: `json_object` (the schema goes into the prompt instead).
    supportsStructuredOutputs: jsonMode === "json_schema",
    transformRequestBody: jsonMode === "prompt" ? (body) => ({ ...body, response_format: undefined }) : undefined,
    metadataExtractor: traceExtractor,
  });

  return wrapLanguageModel({ model: provider.chatModel(id), middleware: zgMiddleware(id, jsonMode) });
}

type CallParams = Parameters<NonNullable<LanguageModelMiddleware["transformParams"]>>[0]["params"];

function zgMiddleware(modelId: string, jsonMode: ZgJsonMode): LanguageModelMiddleware {
  // Extra request-body fields for every call (providerOptions["0g"] is spread into the body).
  const thinking: Record<string, JSONValue> = { ...(env("ZG_THINKING") === "on" ? undefined : thinkingOff(modelId)) };
  const json = extractJsonMiddleware({ transform: extractJsonText });
  const isJsonCall = (params: { responseFormat?: { type: string } }) => params.responseFormat?.type === "json";

  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => {
      const { prompt, responseFormat, providerOptions: options } = params;
      // Read per call, so a verify_tee the Router rejected is dropped for every model made earlier too.
      const defaults: Record<string, JSONValue> = { ...thinking, ...(verifyTeeEnabled() && { verify_tee: true }) };
      const hasDefaults = Object.keys(defaults).length > 0;
      // The caller's providerOptions["0g"] win over the defaults, e.g. { verify_tee: false } for one call.
      const providerOptions = hasDefaults ? { ...options, [PROVIDER]: { ...defaults, ...options?.[PROVIDER] } } : options;
      if (responseFormat?.type !== "json") return { ...params, providerOptions };

      const instruction = jsonInstruction(responseFormat);
      const [first, ...rest] = prompt;
      return {
        ...params,
        providerOptions,
        prompt:
          first?.role === "system"
            ? [{ ...first, content: `${first.content}\n\n${instruction}` }, ...rest]
            : [{ role: "system", content: instruction }, ...prompt],
        // The prompt carries the schema now; left here, the provider would only warn that it ignores it.
        responseFormat: jsonMode === "json_schema" ? responseFormat : { type: "json" },
      };
    },
    wrapGenerate: async (options) => {
      const doGenerate = () =>
        withVerifyTeeFallback(options.params, options.doGenerate, (params) => options.model.doGenerate(params));
      return (isJsonCall(options.params) ? json.wrapGenerate?.({ ...options, doGenerate }) : undefined) ?? doGenerate();
    },
    wrapStream: async (options) => {
      const doStream = () => withVerifyTeeFallback(options.params, options.doStream, (params) => options.model.doStream(params));
      return (isJsonCall(options.params) ? json.wrapStream?.({ ...options, doStream }) : undefined) ?? doStream();
    },
  };
}

/**
 * Runs a call; if it carried verify_tee and the Router turned it down outright (HTTP 400, 403 or 422: rejected
 * before any model ran, so nothing was billed), retries it once without verify_tee. When the retry works, the flag
 * was the problem: it is dropped for the rest of this process (logged). Otherwise the original error is thrown.
 * Timeouts are not retried: the caller's own timeout covers the whole call, retry included.
 */
async function withVerifyTeeFallback<T>(
  params: CallParams,
  call: () => PromiseLike<T>,
  callWith: (params: CallParams) => PromiseLike<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const options = params.providerOptions?.[PROVIDER];
    const status = APICallError.isInstance(error) ? error.statusCode : undefined;
    if (options?.verify_tee !== true || (status !== 400 && status !== 403 && status !== 422) || params.abortSignal?.aborted) {
      throw error;
    }
    const rest = Object.fromEntries(Object.entries(options).filter(([key]) => key !== "verify_tee"));
    try {
      const result = await callWith({ ...params, providerOptions: { ...params.providerOptions, [PROVIDER]: rest } });
      if (!verifyTeeRejected) {
        verifyTeeRejected = true;
        console.warn(`[animr] 0G Router rejected verify_tee (HTTP ${status}); calls go on without it (set ZG_VERIFY_TEE=off to silence).`);
      }
      return result;
    } catch {
      throw error;
    }
  }
}

/** Thinking switch per model family, as advertised in supported_parameters on GET /v1/models (2026-10-19). */
function thinkingOff(modelId: string): Record<string, JSONValue> | undefined {
  if (/^(glm-5([.-]\d+)?$|0gm-)/i.test(modelId)) return { chat_template_kwargs: { enable_thinking: false } };
  if (/^(deepseek-v4|qwen)/i.test(modelId)) return { enable_thinking: false };
  return undefined; // e.g. glm-5.3-flash and minimax-m2.7 always think
}

function jsonInstruction({ schema, name, description }: { schema?: object; name?: string; description?: string }): string {
  return [
    "Reply with one JSON object only: no markdown code fences and no text before or after it.",
    name || description ? `Object: ${[name, description].filter(Boolean).join(" - ")}` : undefined,
    schema ? `It must match this JSON schema:\n${JSON.stringify({ ...schema, $schema: undefined })}` : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/** Recovers the JSON object when a model wraps it in code fences, a <think> block or prose. */
function extractJsonText(text: string): string {
  const trimmed = text.trim();
  if (isJson(trimmed)) return trimmed;
  const thinkEnd = trimmed.lastIndexOf("</think>");
  const body = thinkEnd === -1 ? trimmed : trimmed.slice(thinkEnd + "</think>".length);
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start !== -1 && end > start ? body.slice(start, end + 1) : trimmed;
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function readTrace(body: unknown): JSONValue | undefined {
  const trace = typeof body === "object" && body !== null ? (body as { x_0g_trace?: unknown }).x_0g_trace : undefined;
  return typeof trace === "object" && trace !== null ? (trace as JSONValue) : undefined;
}

function traceMetadata(trace: JSONValue | undefined) {
  return trace === undefined ? undefined : { [PROVIDER]: { trace } };
}

// --- Provider labels ---

/**
 * What a 0G provider's answers rest on, strongest first:
 * - TeeML: the model itself runs inside an attested TEE enclave (the Router's "private" tier).
 * - TeeTLS: a TEE broker relays the call to an upstream API (e.g. Baidu, Tencent) over attested TLS ("verified").
 * - standard: nothing to attest.
 */
export type ZgProviderLabel = "TeeML" | "TeeTLS" | "standard";

export type ZgProviderInfo = {
  label: ZgProviderLabel;
  /** Operator-declared name, e.g. "0G Foundation", or "Baidu / Tencent" for an address with two upstreams. */
  name?: string;
};

const PROVIDERS_TTL_MS = 60 * 60_000;
/** After a failed read, the next call tries again once this has passed. */
const PROVIDERS_RETRY_MS = 60_000;
const PROVIDERS_TIMEOUT_MS = 5_000;
const PROVIDERS_MAX_LISTS = 16;
const LABEL_RANK: Record<ZgProviderLabel, number> = { standard: 0, TeeTLS: 1, TeeML: 2 };

/** Per base URL and model: the provider list, in flight or settled (undefined when it couldn't be read). */
const providerLists = new Map<string, Promise<Map<string, ZgProviderInfo> | undefined>>();

/**
 * Labels the provider that served a call (`x_0g_trace.provider`, i.e. ZgReceipt.provider) from the Router's
 * public provider list, GET {baseURL}/providers?model=<model> (no key), cached ~1 h per model. `model`
 * defaults to the configured one; pass the decision's model for receipts made with another.
 * Resolves undefined for an address the list doesn't have, or when the list can't be read. Never throws.
 */
export async function zgProviderInfo(address: string, model?: string): Promise<ZgProviderInfo | undefined> {
  try {
    const wanted = typeof address === "string" ? address.trim().toLowerCase() : "";
    const { baseURL, model: configured } = zgModelInfo();
    const id = (typeof model === "string" && model.trim()) || configured;
    if (!/^0x[0-9a-f]{40}$/.test(wanted) || !/^[\w./:-]{1,128}$/.test(id)) return undefined;
    const info = (await providerList(baseURL.replace(/\/+$/, ""), id))?.get(wanted);
    return info && { ...info };
  } catch {
    return undefined;
  }
}

function providerList(baseURL: string, model: string): Promise<Map<string, ZgProviderInfo> | undefined> {
  const key = `${baseURL} ${model}`;
  const cached = providerLists.get(key);
  if (cached) return cached;

  const oldest = providerLists.size >= PROVIDERS_MAX_LISTS ? providerLists.keys().next().value : undefined;
  if (oldest !== undefined) providerLists.delete(oldest);
  const list: Promise<Map<string, ZgProviderInfo> | undefined> = fetchProviderList(baseURL, model).then(
    (providers) => {
      forgetLater(key, list, PROVIDERS_TTL_MS);
      return providers;
    },
    (error: unknown) => {
      // A Next.js signal (it carries a `digest`, e.g. the fetch a prerender abandons) says nothing about the Router.
      forgetLater(key, list, typeof error === "object" && error !== null && "digest" in error ? 0 : PROVIDERS_RETRY_MS);
      return undefined;
    },
  );
  providerLists.set(key, list);
  return list;
}

/** Expires a cache entry with a timer instead of reading the clock, which a prerender may not do. */
function forgetLater(key: string, list: Promise<unknown>, afterMs: number): void {
  const forget = () => {
    if (providerLists.get(key) === list) providerLists.delete(key);
  };
  if (afterMs <= 0) {
    forget();
    return;
  }
  const timer: unknown = setTimeout(forget, afterMs);
  // Node: don't keep a script alive just to expire the cache.
  (timer as { unref?: () => void }).unref?.();
}

async function fetchProviderList(baseURL: string, model: string): Promise<Map<string, ZgProviderInfo>> {
  const response = await fetch(`${baseURL}/providers?model=${encodeURIComponent(model)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(PROVIDERS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`0G Router GET /providers: HTTP ${response.status}`);
  const body: unknown = await response.json();
  const rows = typeof body === "object" && body !== null ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(rows)) throw new Error("0G Router GET /providers: no data array");

  // One address can list several rows (one per upstream); keep the weakest label so we never overclaim.
  const merged = new Map<string, { label: ZgProviderLabel; names: Set<string> }>();
  for (const row of rows as ProviderRow[]) {
    if (typeof row !== "object" || row === null || typeof row.address !== "string") continue;
    const address = row.address.trim().toLowerCase();
    const label = rowLabel(row);
    const entry = merged.get(address) ?? { label, names: new Set<string>() };
    if (LABEL_RANK[label] < LABEL_RANK[entry.label]) entry.label = label;
    const name = typeof row.provider_name === "string" ? row.provider_name.trim() : "";
    // "anonymous1", "anonymous2"… are placeholders, not names.
    if (name && !/^anonymous\d*$/i.test(name)) entry.names.add(name);
    merged.set(address, entry);
  }
  return new Map(
    [...merged].map(([address, { label, names }]) => [address, names.size > 0 ? { label, name: [...names].sort().join(" / ") } : { label }]),
  );
}

/** The fields of a GET /providers row that labelling reads. */
type ProviderRow = {
  address?: unknown;
  verifiability?: unknown;
  trust_mode?: unknown;
  tee_attested?: unknown;
  tee_acknowledged?: unknown;
  provider_name?: unknown;
};

function rowLabel(row: ProviderRow): ZgProviderLabel {
  if (row.tee_attested === false || row.tee_acknowledged === false) return "standard";
  const verifiability = typeof row.verifiability === "string" ? row.verifiability.toLowerCase() : "";
  const claimed: ZgProviderLabel = verifiability === "teeml" ? "TeeML" : verifiability === "teetls" ? "TeeTLS" : "standard";
  // trust_mode is the Router's routable tier (private = TeeML, verified = TeeTLS); trust the weaker of the two.
  const tier: ZgProviderLabel | undefined =
    row.trust_mode === "private" ? "TeeML" : row.trust_mode === "verified" ? "TeeTLS" : row.trust_mode === "standard" ? "standard" : undefined;
  return tier !== undefined && LABEL_RANK[tier] < LABEL_RANK[claimed] ? tier : claimed;
}
