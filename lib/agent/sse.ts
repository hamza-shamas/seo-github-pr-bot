import type { AgentEvent } from "./types";

/** Build an SSE writer over a ReadableStream controller. Each event is
 * encoded as `event: <type>\ndata: <json>\n\n` per the SSE spec. */
export function makeSseWriter(controller: ReadableStreamDefaultController<Uint8Array>) {
  const encoder = new TextEncoder();
  return (event: AgentEvent) => {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    controller.enqueue(encoder.encode(payload));
  };
}
