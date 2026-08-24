/**
 * Browser-side streaming client for the AI bridge (via Next.js proxy routes).
 *
 * ``streamAi`` handles both transports the endpoints can return:
 *   - ``text/event-stream`` — the live bridge (token deltas → done result).
 *   - ``application/json`` — the Playwright E2E mocks / non-streaming endpoints.
 *
 * Callers pass typed ``onDelta`` / ``onDone`` / ``onError`` handlers and receive
 * fully-typed results; no ``any`` is exposed.
 */

export interface ToolResultEvent {
  tool: string;
  ok: boolean;
  message: string;
}

export interface AiStreamEvent {
  type: "delta" | "done" | "error" | "tool_result";
  content?: string;
  result?: unknown;
  message?: string;
}

export interface StreamHandlers<TResult> {
  onDelta: (content: string) => void;
  onDone: (result: TResult) => void;
  onError?: (message: string) => void;
  onToolResult?: (result: ToolResultEvent) => void;
}

/**
 * POSTs JSON to an AI endpoint and returns the parsed result (non-streaming
 * endpoints: parse-resume, rank-candidates, interview-report, insights, …).
 */
export async function postAi<TResult>(
  path: string,
  body: unknown,
): Promise<TResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`AI bridge returned ${response.status}`);
  }
  return (await response.json()) as TResult;
}

/**
 * Uploads a file (multipart form-data) to an AI endpoint and returns the
 * parsed JSON result (used by resume parsing).
 */
export async function postAiFile<TResult>(
  path: string,
  file: File,
): Promise<TResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(path, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`AI bridge returned ${response.status}`);
  }
  return (await response.json()) as TResult;
}

export async function streamAi<TResult>(
  path: string,
  body: unknown,
  handlers: StreamHandlers<TResult>,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    await consumeEventStream(response, handlers);
    return;
  }

  if (!response.ok) {
    handlers.onError?.(`AI bridge returned ${response.status}`);
    return;
  }
  const json = (await response.json()) as TResult;
  handlers.onDone(json);
}

async function consumeEventStream<TResult>(
  response: Response,
  handlers: StreamHandlers<TResult>,
): Promise<void> {
  if (!response.body) {
    handlers.onError?.("Empty stream from AI bridge.");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleSseChunk(chunk, handlers);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function handleSseChunk<TResult>(
  chunk: string,
  handlers: StreamHandlers<TResult>,
): void {
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    let event: AiStreamEvent;
    try {
      event = JSON.parse(data) as AiStreamEvent;
    } catch {
      continue;
    }
    if (event.type === "delta" && typeof event.content === "string") {
      handlers.onDelta(event.content);
    } else if (event.type === "done") {
      handlers.onDone(event.result as TResult);
    } else if (event.type === "tool_result") {
      handlers.onToolResult?.(event.result as ToolResultEvent);
    } else if (event.type === "error" && typeof event.message === "string") {
      handlers.onError?.(event.message);
    }
  }
}
