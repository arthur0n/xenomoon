// A live session's last CHAT_WINDOW chat items, the snapshot every browser
// connection is sent. Pure: no I/O, no timers.
import { chatItem, lastChatItems } from "../../lib/chat-items.js";

/** @typedef {import("../../lib/types.js").HistoryItem} HistoryItem */

/**
 * @typedef {object} ChatWindow
 * @property {(item: HistoryItem) => void} add Append one item; the oldest drops past CHAT_WINDOW.
 * @property {(message: import("../../lib/chat-items.js").ChatSource) => HistoryItem | null} addMessage
 *   Append the message's chat item; returns it, or null when the message carries none.
 * @property {() => HistoryItem[]} items A copy of the current items, oldest first.
 */

/**
 * A chat window starting from `seed` (kept to its last CHAT_WINDOW items).
 * @param {HistoryItem[]} [seed] @returns {ChatWindow}
 */
export function createChatWindow(seed = []) {
  let list = lastChatItems(seed);
  /** @param {HistoryItem} item */
  const add = (item) => {
    list = lastChatItems([...list, item]);
  };
  return {
    add,
    addMessage(message) {
      const item = chatItem(message);
      if (item) add(item);
      return item;
    },
    items: () => [...list],
  };
}
