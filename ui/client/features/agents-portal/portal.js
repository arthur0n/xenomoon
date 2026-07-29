// Agents portal — the data-driven "external agents" section of the Settings (⚙) modal.
// Renders one connect card per entry of GET /api/agents (the server-side registry,
// ui/server/agents/registry.js) with a guided wizard flow per card: detect (auto-check
// on open) → guide install (collapsible steps + Set up) → fields (key/url/model) →
// Test → Enable → roles. Adding a future agent needs NO edit here — it's one registry
// descriptor server-side; this module renders whatever the catalog says.
import { $, el } from "../../core/dom.js";
import { fetchJSON, postJSON } from "../../../lib/json.js";
import { refreshPaidAgents } from "./paid-agents.js";

/** @typedef {import("../../../lib/types.js").AgentPublicDescriptor} AgentDescriptor */
/** @typedef {import("../../../lib/types.js").AgentField} AgentField */

/** The model <select>'s "type your own id" sentinel entry. */
const CUSTOM = "__custom__";
/** How many probe-reported models fit in the one-line ✓ verdict. */
const VERDICT_MODELS_SHOWN = 4;

/** Live DOM refs for one rendered card, keyed by agent id.
 * @typedef {{ desc: AgentDescriptor, enabled: HTMLInputElement, status: HTMLElement,
 *   output: HTMLElement, outputPre: HTMLElement,
 *   inputs: Map<string, HTMLInputElement | HTMLSelectElement>, custom: HTMLInputElement | null,
 *   roles: Map<string, HTMLInputElement> }} Card */
/** @type {Map<string, Card>} */
const cards = new Map();

/** Show a status verdict line on a card. @param {HTMLElement} status @param {"" | "pending" | "ok" | "bad"} tone @param {string} text */
function setStatus(status, tone, text) {
  status.className = `settings-status ${tone}`.trim();
  status.textContent = text;
}

/** Fill the card's collapsible output block (hidden while empty) — this is where the
 * setup/auth scripts' printed guidance (auth commands, URLs, errors) becomes visible.
 * @param {Card} card @param {string | undefined} text */
function showOutput(card, text) {
  const t = (text ?? "").trim();
  card.output.style.display = t ? "" : "none";
  card.outputPre.textContent = t;
}

/** One-line human verdict for a check result. Shapes vary per agent (HermesCheck,
 * CodexCheck, …) so this reads the shared fields: ok / caveat / error, plus the nicest
 * detail available (models list, version, auth mode).
 * @param {{ ok?: boolean, caveat?: string, error?: string, models?: string[], version?: string, authMode?: string }} r */
function verdictText(r) {
  if (r.ok && r.caveat) return { tone: /** @type {const} */ ("bad"), text: `⚠ ${r.caveat}` };
  if (r.ok) {
    const models = r.models?.length
      ? ` — models: ${r.models.slice(0, VERDICT_MODELS_SHOWN).join(", ")}`
      : "";
    const ver = r.version ? ` — v${r.version}` : "";
    const mode = r.authMode ? ` (${r.authMode})` : "";
    return { tone: /** @type {const} */ ("ok"), text: `✓ Ready${ver}${mode}${models}` };
  }
  return { tone: /** @type {const} */ ("bad"), text: `✗ ${r.error ?? "Not ready."}` };
}

/** Probe one agent with whatever field values are currently typed (blank secret →
 * server falls back to the saved one) and show the one-line verdict. @param {Card} card */
async function testAgent(card) {
  $("settings-error").textContent = "";
  setStatus(card.status, "pending", "Testing…");
  try {
    /** @type {Record<string, string>} */
    const body = {};
    for (const [key, input] of card.inputs) {
      if (input instanceof HTMLInputElement) body[key] = input.value.trim();
    }
    const r = /** @type {Record<string, never>} */ (
      await postJSON(`/api/agents/${card.desc.id}/check`, body)
    );
    const v = verdictText(r);
    setStatus(card.status, v.tone, v.text);
  } catch {
    setStatus(card.status, "bad", "✗ Test failed — is the UI server up to date? (restart it)");
  }
}

/** Re-sync a card's non-secret field values from the server catalog — setup scripts
 * rewrite the saved config (URL/port/model), and a stale rendered field would otherwise
 * OVERRIDE the fresh saved value on the next Test (typed values win over saved ones).
 * @param {Card} card */
async function refreshCardFields(card) {
  try {
    const catalog = /** @type {AgentDescriptor[]} */ (await fetchJSON("/api/agents"));
    const fresh = catalog.find((d) => d.id === card.desc.id);
    if (!fresh) return;
    card.desc = fresh;
    for (const [key, input] of card.inputs) {
      const field = fresh.fields.find((f) => f.key === key);
      if (!field || field.secret) continue; // secrets stay blank (= keep saved)
      const value = statusText(fresh.status, key);
      if (input instanceof HTMLInputElement && value) input.value = value;
    }
  } catch {
    /* refresh is best-effort — the card still works, just possibly stale */
  }
}

/** Run the vendor-CLI sign-in for an agent (`POST /api/agents/:id/auth`): the server
 * probes auth state and, when needed (or `force`), runs the vendor's browser sign-in
 * command — the same one the terminal flow prints (e.g. `hermes portal open`).
 * @param {Card} card @param {boolean} force */
async function runAgentAuth(card, force) {
  $("settings-error").textContent = "";
  setStatus(card.status, "pending", `Checking ${card.desc.label} sign-in…`);
  try {
    const r =
      /** @type {{ ok: boolean, authed: boolean, opened: boolean, output?: string, error?: string }} */ (
        await postJSON(`/api/agents/${card.desc.id}/auth`, { force })
      );
    showOutput(card, r.output);
    if (r.opened) {
      setStatus(card.status, "ok", "→ Sign-in opened in your browser. Finish there, then Test.");
    } else if (r.authed) {
      setStatus(card.status, "ok", "✓ Already signed in. RESTART the session to activate.");
    } else {
      setStatus(
        card.status,
        "bad",
        `✗ Sign-in check failed — ${r.error ?? "see the output below"}`,
      );
    }
  } catch {
    setStatus(card.status, "bad", "✗ Sign-in request failed — is the UI server up to date?");
  }
}

/** Run the agent's server-side setup script and report. The integration's prompt block
 * loads at SESSION START, so success always says RESTART; `manual` adds any follow-up
 * step the server can't do (e.g. Hermes' browser OAuth) — and when the agent declares
 * an auth flow, we chain straight into it so the browser sign-in opens by itself.
 * @param {Card} card */
async function runAgentSetup(card) {
  $("settings-error").textContent = "";
  setStatus(card.status, "pending", `Setting up ${card.desc.label}…`);
  try {
    const r = /** @type {{ ok: boolean, error?: string, manual?: string, output?: string }} */ (
      await postJSON(`/api/agents/${card.desc.id}/setup`, {})
    );
    showOutput(card, r.output);
    if (r.ok) {
      const manual = r.manual ? `${r.manual} ` : "";
      setStatus(card.status, "ok", `✓ Set up. ${manual}RESTART the session to activate.`);
      void refreshPaidAgents(); // setup may have just enabled the agent — repaint the strip
      await refreshCardFields(card); // setup rewrote the config — stale fields would override it on Test
      if (card.desc.hasAuth) await runAgentAuth(card, false);
    } else {
      setStatus(card.status, "bad", `✗ Setup failed — ${r.error ?? "see the output below"}`);
    }
  } catch {
    setStatus(card.status, "bad", "✗ Setup request failed — is the UI server up to date?");
  }
}

/** Fill a model <select> with the status's curated ids + a "custom…" entry, selecting
 * `current` (revealing the custom input when it isn't in the list).
 * @param {HTMLSelectElement} sel @param {HTMLInputElement} custom @param {string[]} models @param {string} current */
function fillModelSelect(sel, custom, models, current) {
  sel.replaceChildren();
  for (const id of models) {
    const opt = /** @type {HTMLOptionElement} */ (el("option", "", id));
    opt.value = id;
    sel.append(opt);
  }
  const customOpt = /** @type {HTMLOptionElement} */ (el("option", "", "custom…"));
  customOpt.value = CUSTOM;
  sel.append(customOpt);
  const known = models.includes(current);
  sel.value = known ? current : CUSTOM;
  custom.style.display = known ? "none" : "";
  if (!known && current) custom.value = current;
  sel.addEventListener("change", () => {
    custom.style.display = sel.value === CUSTOM ? "" : "none";
  });
}

/** The saved string value behind a field key ("" when unset/not a string).
 * @param {AgentDescriptor["status"]} status @param {string} key */
function statusText(status, key) {
  const v = status[key];
  return typeof v === "string" ? v : "";
}

/** Build one field row (label + input/select) and register it on the card.
 * @param {Card} card @param {AgentField} field @param {HTMLElement} into */
function renderField(card, field, into) {
  const status = card.desc.status;
  const label = el("label", "form-label", field.label);
  into.append(label);
  if (field.type === "select") {
    const sel = /** @type {HTMLSelectElement} */ (el("select", "form-input"));
    const custom = /** @type {HTMLInputElement} */ (el("input", "form-input"));
    custom.placeholder = "custom model id, e.g. provider/model-name";
    fillModelSelect(sel, custom, status.models ?? [], statusText(status, field.key));
    into.append(sel, custom);
    card.inputs.set(field.key, sel);
    card.custom = custom;
  } else {
    const input = /** @type {HTMLInputElement} */ (el("input", "form-input"));
    if (field.type === "password") {
      input.type = "password";
      input.autocomplete = "off";
    }
    input.placeholder = field.secret
      ? status.hasKey
        ? "key saved — leave blank to keep it"
        : (field.placeholder ?? "")
      : (field.placeholder ?? "");
    if (!field.secret) input.value = statusText(status, field.key);
    into.append(input);
    card.inputs.set(field.key, input);
  }
  if (field.note) into.append(el("p", "modal-sub muted", field.note));
}

/** Build the collapsible first-time install section. @param {AgentDescriptor} d */
function renderInstall(d) {
  const details = el("details", "settings-install");
  if (!d.install) return details;
  details.append(el("summary", "", `${d.install.summary} ▾`));
  details.append(el("p", "modal-sub muted", d.install.intro));
  details.append(el("pre", "settings-code", d.install.code));
  const after = d.install.after + (d.runbook ? ` Full runbook: ${d.runbook}.` : "");
  details.append(el("p", "modal-sub muted", after));
  return details;
}

/** Build one agent card into the portal list. @param {AgentDescriptor} d @param {HTMLElement} list */
function renderCard(d, list) {
  /** @type {Card} */
  const card = {
    desc: d,
    enabled: /** @type {HTMLInputElement} */ (el("input")),
    status: el("div", "settings-status"),
    output: el("details", "settings-install"),
    outputPre: el("pre", "settings-code"),
    inputs: new Map(),
    custom: null,
    roles: new Map(),
  };
  card.output.append(el("summary", "", "Setup output ▾"), card.outputPre);
  card.output.style.display = "none";
  const head = el("p", "modal-sub");
  head.append(el("strong", "", d.label));
  head.append(document.createTextNode(` — ${d.blurb} `));
  if (d.docHref) {
    const a = /** @type {HTMLAnchorElement} */ (el("a", "", "Learn more"));
    a.href = d.docHref;
    a.target = "_blank";
    a.rel = "noreferrer";
    head.append(a);
  }
  list.append(head, renderInstall(d));

  const toggle = el("label", "form-label settings-toggle");
  card.enabled.type = "checkbox";
  card.enabled.checked = d.status.enabled;
  toggle.append(card.enabled, document.createTextNode(` Enable ${d.label}`));
  list.append(toggle);

  for (const field of d.fields) renderField(card, field, list);

  if (d.roles.length > 1) {
    const rolesRow = el("div", "form-label");
    rolesRow.append(document.createTextNode("Roles: "));
    for (const role of d.roles) {
      const lab = el("label", "settings-toggle");
      const box = /** @type {HTMLInputElement} */ (el("input"));
      box.type = "checkbox";
      box.checked = d.status.roles.includes(role);
      lab.append(box, document.createTextNode(` ${role}`));
      rolesRow.append(lab);
      card.roles.set(role, box);
    }
    list.append(rolesRow);
  }

  list.append(card.status, card.output);
  const actions = el("div", "modal-actions");
  actions.style.justifyContent = "flex-start";
  const test = el("button", "btn ghost", `Test ${d.label}`);
  test.setAttribute("type", "button");
  test.onclick = () => {
    void testAgent(card);
  };
  actions.append(test);
  if (d.hasSetup) {
    const setup = el("button", "btn ghost", `Set up ${d.label}`);
    setup.setAttribute("type", "button");
    setup.onclick = () => {
      void runAgentSetup(card);
    };
    actions.append(setup);
  }
  if (d.hasAuth) {
    const signIn = el("button", "btn ghost", "Sign in (browser)");
    signIn.setAttribute("type", "button");
    signIn.onclick = () => {
      void runAgentAuth(card, true);
    };
    actions.append(signIn);
  }
  list.append(actions, el("hr", "settings-divider"));
  cards.set(d.id, card);
}

/** Fetch the catalog and (re)render every card, then auto-probe each one so the user
 * opens the panel onto live "Ready / not ready" chips instead of blanks (the detect
 * step of the wizard). Local probes are cheap; Hermes' hits localhost only. */
export async function openPortal() {
  const list = $("agents-portal-list");
  list.replaceChildren();
  cards.clear();
  const catalog = /** @type {AgentDescriptor[]} */ (await fetchJSON("/api/agents"));
  for (const d of catalog) renderCard(d, list);
  for (const card of cards.values()) void testAgent(card);
}

/** The /api/settings payload for every rendered card: enabled + roles + typed field
 * values (blank secret → omitted, so the server keeps the saved key). */
export function collectAgentSettings() {
  /** @type {Record<string, Record<string, unknown>>} */
  const payload = {};
  for (const [id, card] of cards) {
    /** @type {Record<string, unknown>} */
    const block = { enabled: card.enabled.checked };
    for (const [key, input] of card.inputs) {
      const isSelect = input instanceof HTMLSelectElement;
      const value =
        isSelect && input.value === CUSTOM ? (card.custom?.value.trim() ?? "") : input.value.trim();
      const field = card.desc.fields.find((f) => f.key === key);
      if (field?.secret) {
        if (value) block[key] = value; // blank → keep the saved secret
      } else {
        block[key] = value;
      }
    }
    if (card.roles.size) {
      block.roles = [...card.roles].filter(([, box]) => box.checked).map(([role]) => role);
    } else {
      block.roles = card.desc.defaultRoles;
    }
    payload[id] = block;
  }
  return payload;
}
