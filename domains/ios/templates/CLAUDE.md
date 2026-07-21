# {{PROJECT_NAME}} — project facts

> Policy/routing lives in the domain orchestrator.md; this file is project FACTS only.
> Fill in every `{{…}}` placeholder; delete any section that genuinely doesn't apply.
> The ios domain's agents and orchestrator read this file and treat it as
> authoritative — it overrides their generic defaults.

## Project overview

{{what it is — one or two sentences: who uses it, what it does}}

## Stack

- **App:** {{Expo SDK version + React Native version + TypeScript — e.g. Expo SDK 56, RN 0.85}}
- **Repo layout:** {{monorepo dirs and what each is, e.g. app/ (Expo client), api/ (backend), shared/}}
- **Native shell:** {{generated or ejected; workspace + scheme name, e.g. ios/<Name>.xcworkspace, scheme <Name>; CocoaPods/SPM; min iOS version}}
- **Auth:** {{provider + sign-in method, e.g. Sign in with Apple via <provider>; where the adapter lives}}
- **Backend seam:** {{what the app talks to — APIs, sockets, workers — and where their logs live}}

## Commands

- **Install:** {{e.g. pnpm install}}
- **Dev (Metro):** {{e.g. pnpm start — note the port and that only THIS checkout may own it}}
- **Sim build + launch:** {{the canonical simulator script — the domain `sim` key. Note if `expo run:ios`
  is unreliable here and the script uses raw xcodebuild instead; never re-derive the invocation ad hoc.}}
- **Validate:** {{type-check + lint + unit tests, e.g. pnpm validate}}
- **Test:** {{unit runner, e.g. pnpm test (vitest)}}
- **E2E / UAT:** {{the Maestro script — the domain `e2e` key, e.g. pnpm verify:sim. Run via /uat against
  an already-running app on a booted simulator; never an ad-hoc `maestro test`.}}
- **Session setup (one-time, manual):** {{how a human signs in once on the simulator so the session
  persists for UAT — e.g. launch the app, complete Sign in with Apple, session persists in keychain.
  Rotation = re-run it. Never automate the sign-in form.}}
- **Ship / release build:** {{e.g. pnpm ship — preflight env audit + EAS production build + auto-submit
  to TestFlight. Note the preflight script and that release builds are a deliberate manual act.}}

## Simulator

- **Target device:** {{e.g. iPhone 17 — the device the sim script boots and UAT expects}}
- **Metro port:** {{e.g. 8081 — the foreign-checkout guard applies; check `lsof` ownership before
  trusting any red-screen error}}

## Native rebuild triggers

JS/TS-only changes hot-reload via Metro. A **full native rebuild** (sim script; for release, a new
store build) is required when a change touches:

- {{native dependency added/upgraded}}
- {{Expo config: app config plugins, entitlements, splash, icons, permissions strings}}
- {{the native shell (ios/) or build-phase scripts}}
- {{project-specific triggers, and the labels used to track them, e.g. needs-build vs needs-native-build}}

## Conventions / convention floor

Project-specific hard rules every change must respect (the agents obey these over their defaults):

- {{e.g. dev logging goes through the guarded helper — never a bare console.warn (LogBox banners
  eat bottom-nav taps in Debug and break UAT)}}
- {{e.g. i18n: all user-facing strings through the label system; language/locale rules}}
- {{e.g. no `any`, zero-warning lint, config-shape asserts for app config}}
- {{add the rules that are actually non-negotiable here}}

## Acceptance testing (UAT)

Maestro flows, run via `/uat` against an **already-running** app on a **booted simulator** (the runner
never boots servers and never rebuilds the app). **POC-first:** the default `poc` scenario launches the
app with the persisted session, asserts a known post-login element, and confirms one user-scoped read
path renders non-empty. Nothing larger until that proves stable.

- **Flow directory:** {{e.g. .maestro/ — flows + the shared launch subflow + config}}
- **Launch subflow:** {{the shared subflow name; it owns system dialogs and app gates — every new hard
  gate in the app needs a case here, or every flow dies pre-app}}
- **Known post-login element:** {{the element the poc asserts, e.g. the home surface's main control}}
- **User-scoped read path:** {{the data surface the poc confirms non-empty}}
- **Out of harness scope:** {{what Maestro can't cross here — e.g. system camera/mic capture UI}}

UAT is **out-of-band** of the per-issue pipeline — it applies no `qa:*` / `review:*` labels and gates
no commit. A FAIL files a new `/feedback` bug; a BLOCKED is a harness/environment finding.

## Infrastructure

- **Release channel:** {{e.g. EAS build → TestFlight auto-submit; the CI workflow name + its trigger
  (manual workflow_dispatch vs push)}}
- **Issue/deploy gates:** {{labels + gates the repo uses, e.g. qa:pass hard-gates deploy;
  fixed-pending-deploy auto-closes on ship}}
- **Environments / env vars:** {{where env/secrets live — EAS env vars, dashboards; note the preflight
  rule: a new build-phase secret must be provisioned in EAS AND added to the preflight's required list
  BEFORE shipping, or the build dies late}}
- **gh account:** {{the specific gh account to use, if this project needs one — otherwise "use the active account"}}

## NEVER (project-specific)

- Never automate a real sign-in form or store credentials — persisted-session only.
- Never ship a release build without the preflight env audit.
- Never commit secrets / env values.
- {{e.g. never reintroduce a bare console.warn in Debug code paths}}
- {{add any other hard "never" specific to this project}}
