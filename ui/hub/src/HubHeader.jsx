// The hub page's top bar: the XenomoonForge mark and word, and the state of the link to the hub
// in words (live, connecting, reconnecting), never by colour alone.

const MARK = new URL("../../assets/mark.webp", import.meta.url).href;

/** @type {Record<string, string>} */
const CONNECTION_TEXT = {
  connecting: "connecting",
  live: "live",
  reconnecting: "reconnecting",
};

/** @param {{ connection: "connecting" | "live" | "reconnecting" }} props */
export default function HubHeader({ connection }) {
  return (
    <header className="hub-header">
      <div className="brand">
        <img className="brand-mark" src={MARK} alt="" width="28" height="28" />
        <h1 className="brand-word">
          XenomoonForge <span className="brand-sub">Hub</span>
        </h1>
      </div>
      <p className="link-state" data-connection={connection}>
        <span className="link-dot" aria-hidden="true" />
        <span className="visually-hidden">Link to the hub: </span>
        {CONNECTION_TEXT[connection]}
      </p>
    </header>
  );
}
