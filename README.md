# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Troubleshooting: `TypeError: fetch failed` on `npm start` / `npx expo start` (Windows)

On startup, Expo CLI calls out to `api.expo.dev` to validate that your installed
package versions match the ones expected for your Expo SDK (this is what powers
the "should be updated for best compatibility" warnings). That call happens
inside `getNativeModuleVersionsAsync` → `validateDependenciesVersionsAsync`. If
that network request fails, Node's `fetch` (undici) surfaces it as a generic
`TypeError: fetch failed`, even though the real cause is always a network/TLS
condition between your machine and Expo's API, never application code.

If you hit this, check the following, roughly in order of likelihood on Windows:

1. **Flaky Wi‑Fi/VPN/hotspot connection.** This is by far the most common cause.
   Undici does not retry a dropped connection the way a browser does. Re-running
   `npx expo start` after the connection stabilizes usually succeeds immediately.
2. **Corporate proxy env vars.** Check `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`
   / `NO_PROXY` (`Get-ChildItem Env: | Where-Object Name -match 'PROXY'` in
   PowerShell). A stale or unreachable proxy will break this request even if
   your browser works fine (browsers often have separate proxy handling).
3. **SSL-inspecting antivirus/corporate firewall** (Kaspersky, Zscaler, Netskope,
   Fortinet, etc.). These re-sign HTTPS traffic with a local root certificate
   that's trusted by Windows' system store (so `curl`/browsers work) but **not**
   by Node's bundled CA bundle, which `undici` uses. Fix by pointing Node at your
   organization's root CA, not by disabling TLS verification:
   ```powershell
   $env:NODE_EXTRA_CA_CERTS = "C:\path\to\corporate-root-ca.pem"
   ```
4. **IPv6 route flapping.** If your network/VPN advertises IPv6 (`AAAA` records)
   but doesn't actually route it reliably, fetch attempts can intermittently
   fail. Force IPv4 resolution first as a safe, permanent fix:
   ```powershell
   setx NODE_OPTIONS "--dns-result-order=ipv4first"
   ```
5. **Verify independently of Expo**, to confirm whether it's your network or
   something Expo-specific:
   ```powershell
   node -e "fetch('https://api.expo.dev/v2/versions/latest').then(r=>console.log(r.status)).catch(e=>console.log(e))"
   ```
   If this fails the same way `npm start` does, it's a machine/network issue,
   not this project.

Do **not** "fix" this by permanently setting `EXPO_OFFLINE=1` or
`EXPO_NO_DEPENDENCY_VALIDATION=1` in project config — those are real Expo CLI
escape hatches for genuinely offline development, but they hide dependency
drift rather than fixing connectivity, so only use them ad hoc for a single
session when you know you're offline (e.g. `EXPO_OFFLINE=1 npx expo start`).

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
