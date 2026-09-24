# HCM native shell and business interactions

The shell uses maintained UI5 ShellBar, UserMenu, UserSettingsDialog,
NotificationList and ProductSwitch controls. The current application title comes
from catalogue route metadata. Avatar images use the runtime account URL, with
initials when absent. Settings reuses the notification domain's editor and dirty
guard; the tray reuses My Notifications and its real API. No notification deletion
or production logout semantics were added.

Language/date/time preferences are non-sensitive browser overrides scoped to the
tenant and account. They drive native locale loading and notification timestamp
formatting; authored business content is not translated. Development Sign Out
clears the browser workspace and survives a tab reload until explicit re-entry.
Product destinations are optional validated public runtime configuration, not
single sign-on or authorization grants.

Business detail data uses UI5 Form/FormItem. DynamicPage filters use the native
responsive form grid with labels above controls. FCL master rows support native
row activation and navigation indicators. Shared Object Page navigation offers
close and maximize/minimize without changing business action ownership. The
selected launchpad Space/Page survives app navigation and browser Back within the
current workspace.

## Reproduction

Start the local database, API and web using the [root setup guide](../../../README.md).
Use the avatar menu's Settings > User Information to select David Wallace.
Open Role Management from Administration, apply a filter, activate a row, expand
and restore the detail, close it, then use the shell Back button. Administration
and its selected Page remain selected. Settings provides Appearance, Language &
Region and the persisted Notifications editor. A dirty notification draft asks
for explicit discard before settings closes.

Focused real-runtime browser coverage:

```sh
pnpm exec playwright test --config=apps/hcm/web-e2e/local-launchpad.config.mts native-shell-interactions.spec.ts
pnpm exec playwright test --config=apps/hcm/web-e2e/local-launchpad.config.mts role-management.spec.ts --grep 'retains begin|TEST-ROLE-MANAGEMENT-005'
```

These five scenarios cover settings persistence and dirty guards, API-backed
notifications, product navigation, sign-out/re-entry, keyboard row navigation,
phone detail controls, filter-grid geometry, return placement, and existing real
role create/edit behavior. Tests use the running local API; business data is not
intercepted or replaced with browser fixtures.

## Checks and scope

- Affected-project lint; runtime, navigation, shell, shared-floorplan and app tests.
- Production HCM web build, architecture verification, documentation verification
  and native page-structure checks.
- The page-structure guard also rejects `dl/dt/dd` in business feature templates.
- Storybook remains on hold. No stories or theme implementation changed; repeated
  per-screen theme certification is outside this UI interaction change.
- Backend schema and command behavior are unchanged. Document Requests activation
  and the six deferred production-integration apps remain deferred.

Verification on 2026-09-25 passed affected lint (28 projects), unit tests in six
projects, the five focused browser scenarios, tooling tests, architecture,
documentation, formatting and page-structure checks. The production build passed
with an initial-bundle warning: 500.73 kB against the 500 kB warning threshold
(734 bytes over). The error budget was not exceeded.

The shell [FDD](../fdd/FDD-HCM-PRODUCTION-SHELL.md) and
[TDD](../tdd/TDD-HCM-PRODUCTION-SHELL.md) describe the current ownership and runtime
contracts. Historical slice validation records remain historical evidence.
