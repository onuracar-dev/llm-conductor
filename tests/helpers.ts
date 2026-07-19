import type { FetchLike, ProviderStreamEvent } from "../src/types";

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function sseResponse(
  messages: Array<{ event?: string; data: unknown }>,
  headers: Record<string, string> = {},
): Response {
  const body = messages.map((message) => {
    const event = message.event ? `event: ${message.event}\n` : "";
    const data = typeof message.data === "string" ? message.data : JSON.stringify(message.data);
    return `${event}data: ${data}\n\n`;
  }).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", ...headers },
  });
}

export function asFetch(mock: unknown): FetchLike {
  return mock as FetchLike;
}

export async function collectStream<T>(
  stream: AsyncIterable<ProviderStreamEvent<T>>,
): Promise<Array<ProviderStreamEvent<T>>> {
  const events: Array<ProviderStreamEvent<T>> = [];
  for await (const event of stream) events.push(event);
  return events;
}

export function requestBody(mock: { mock: { calls: unknown[][] } }, index = 0): Record<string, unknown> {
  const init = mock.mock.calls[index]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}
