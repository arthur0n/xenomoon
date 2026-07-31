---
name: android-identity
description: How an Expo/RN app's user-visible identity (launcher label, icon, package) is actually resolved on Android, and how internal scaffolding names leak to users. Load when a wrong app name/icon ships, when renaming a product, or when auditing branding before a store release.
---

# Android app identity — where the launcher name really comes from

## The label leak

On iOS, the user-visible name is `ios.infoPlist.CFBundleDisplayName`. **Android has no
equivalent field in `app.json`** — prebuild writes `expo.name` straight into
`android/app/src/main/res/values/strings.xml` as `app_name`, and the manifest's
`android:label` points at it. So a project whose `expo.name` is an internal scaffolding
name (kept because renaming it breaks native project/module naming — a documented iOS
constraint) **ships that internal name as the Android launcher label**, even though
iOS looks fine. "Internal-only, invisible to users" claims are false on Android until
this is handled.

The fix is a config plugin, not a rename:

```js
const { withStringsXml, AndroidConfig } = require("expo/config-plugins");
module.exports = (config) =>
  withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: "app_name" }, _: "<User-Facing Name>" }],
      c.modResults,
    );
    return c;
  });
```

This is native config: it needs a prebuild + rebuild to reach a device (see the
stale-prebuild trap in `android-local-run`), and a new store build to reach testers.

## Verify the label end-to-end, not by reading config

1. `npx expo config --type introspect` — the mod results must show
   `android:label: '@string/app_name'` and the new string value.
2. After prebuild: `grep app_name android/app/src/main/res/values/strings.xml`.
3. After build: `aapt2 dump badging <apk> | grep application-label` — every locale
   variant must show the new name.
4. On device: screenshot the app drawer (`adb exec-out screencap -p`). This is the
   only check that proves what users see.

## Adjacent identity facts

- **Icon is separate** from the label: `android.adaptiveIcon` assets. A placeholder
  (default Expo chevron) survives a label fix — track it as its own work item. The
  store LISTING icon (uploaded in the console) is independent of the installed-app
  icon; fixing one does not fix the other.
- **Store listing name** can differ from the launcher label (e.g. a "safe" store name).
  Decide explicitly which surfaces get which name and write the decision into the
  project's naming canon (CLAUDE.md / AGENTS.md) — otherwise the next rename round
  re-litigates it.
- **Package id** (`android.package`) is permanent after first store upload. It never
  needs to match the display identity; never rename it for branding.
