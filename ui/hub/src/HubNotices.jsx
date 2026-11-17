// The page-level notices above the list: connecting, reconnecting (the last rows stay, marked as
// possibly old), no projects yet (how one is added, README.md "Quick start"), and the hub's own
// read errors from the snapshot, each in words.

/** @typedef {import("./hub-api.js").HubSnapshot} HubSnapshot */

/** One hub error in words; the hub sends { file, reason } (server rows.js:34), anything else as JSON.
 * @param {unknown} err @returns {string} */
function errorText(err) {
  const e = /** @type {{ file?: unknown, reason?: unknown }} */ (err ?? {});
  if (typeof e.file === "string" && typeof e.reason === "string") return `${e.file}: ${e.reason}`;
  return typeof err === "string" ? err : JSON.stringify(err);
}

/** @param {{ errors: unknown[] }} props */
function HubErrors({ errors }) {
  return (
    <section className="notice notice-error" aria-labelledby="hub-errors">
      <h2 id="hub-errors" className="notice-title">
        The hub could not read {errors.length === 1 ? "one file" : `${errors.length} files`}
      </h2>
      <p className="notice-text">
        Projects from the last good copy are shown; fix the file to update them.
      </p>
      <ul className="error-list">
        {errors.map((err, i) => (
          <li key={i} className="mono">
            {errorText(err)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoProjects() {
  return (
    <section className="empty" aria-labelledby="no-projects">
      <h2 id="no-projects" className="empty-title">
        No projects yet
      </h2>
      <p className="empty-text">Add one from inside an install folder, then it shows here:</p>
      <pre className="empty-cmd">
        <code>npm run install-project -- &lt;project folder&gt;</code>
      </pre>
    </section>
  );
}

/** @param {{ snapshot: HubSnapshot | null }} props */
export default function HubNotices({ snapshot }) {
  const live = snapshot?.connection === "live";
  return (
    <>
      <div role="status" className="status-region">
        {!snapshot && <p className="notice">Connecting to the hub…</p>}
        {snapshot?.connection === "reconnecting" && (
          <p className="notice notice-warn">
            <strong>Reconnecting to the hub.</strong>{" "}
            {snapshot.rows.length
              ? "The list below is the last one received and may be out of date."
              : "No list has been received yet."}
          </p>
        )}
      </div>
      {snapshot && snapshot.errors.length > 0 && <HubErrors errors={snapshot.errors} />}
      {live && snapshot.rows.length === 0 && <NoProjects />}
    </>
  );
}
