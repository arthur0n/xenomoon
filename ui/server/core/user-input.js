// User-input plumbing shared by the session: build the SDK user turn from the
// browser's user_input message (pasted images ride along as base64 image
// blocks), and redact that base64 back out of the ndjson session log.

/** @typedef {import("../../lib/types.js").ClientMsg} ClientMsg */
/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */

/** Build the SDK user turn for a user_input message. Pasted images become
 * base64 image blocks ahead of the text; an empty text block is dropped (the
 * API rejects it) when images carry the turn.
 * @param {Extract<ClientMsg, { type: "user_input" }>} msg
 * @returns {SDKUserMessage} */
export function userInputTurn(msg) {
  const images = msg.images ?? [];
  const content = /** @type {Extract<SDKUserMessage["message"]["content"], unknown[]>} */ ([
    ...images.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.media_type, data: img.data },
    })),
    ...(msg.text || !images.length ? [{ type: "text", text: msg.text }] : []),
  ]);
  return {
    type: "user",
    parent_tool_use_id: null,
    message: { role: "user", content },
  };
}

/** Redact pasted-image base64 from a logged user_input message — keep sizes only.
 * @param {OutMsg} obj @returns {OutMsg} */
export function redactImages(obj) {
  if (obj.type !== "user_input" || !Array.isArray(obj.images)) return obj;
  const images = /** @type {Array<{ media_type: string, data: string }>} */ (obj.images);
  return {
    ...obj,
    images: images.map((img) => ({ ...img, data: `[${img.data.length} base64 chars]` })),
  };
}
