/**
 * DeepSeek API client.
 *
 * DeepSeek exposes an OpenAI-compatible /chat/completions endpoint.
 * We use the `deepseek-chat` model for translation because it is
 * fast and cheap, and supports JSON mode via `response_format`.
 *
 * The API key MUST be passed server-side only — never expose it to
 * the browser. The UI collects it from the user, but it is sent
 * only inside server-side fetch calls.
 */

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekCallOptions {
  apiKey: string;
  model?: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  signal?: AbortSignal;
}

export interface DeepSeekCallResult {
  content: string;
  finish_reason: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callDeepSeek(
  opts: DeepSeekCallOptions
): Promise<DeepSeekCallResult> {
  if (!opts.apiKey) {
    throw new Error(
      "DeepSeek API key is missing. Set DEEPSEEK_API_KEY on the server or pass it via the UI settings."
    );
  }

  const body: Record<string, unknown> = {
    model: opts.model ?? "deepseek-chat",
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    stream: false,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${text}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error("DeepSeek returned no choices");
  }
  return {
    content: choice.message?.content ?? "",
    finish_reason: choice.finish_reason,
    usage: data.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

/**
 * Streamed DeepSeek call. Yields incremental text chunks as they
 * arrive — used for the "research" panel so the user can watch the
 * model think through the movie context in real time.
 */
export async function* streamDeepSeek(
  opts: DeepSeekCallOptions
): AsyncGenerator<string, void, unknown> {
  if (!opts.apiKey) {
    throw new Error("DeepSeek API key is missing.");
  }
  const body: Record<string, unknown> = {
    model: opts.model ?? "deepseek-chat",
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    stream: true,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      } catch {
        // ignore partial JSON
      }
    }
  }
}
