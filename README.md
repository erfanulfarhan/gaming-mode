<p align="center"><img src="icon/icon.png" width="128" alt="Gaming Mode icon"></p>

# Gaming Mode for Mac

One click frees up memory before you play. Gaming Mode closes the apps you don't need, saves your browser tabs, and opens a lean browser window for your game. When you're done, click again and everything comes back.

It's a small app with no installs, accounts or background processes. It only runs when you click it.

## What a click does

- **Click:** closes every app you haven't chosen to keep, saves the tabs of any browser it closes, and opens a lean browser window for your game. Then it shows how much memory is in use before and after.
- **Click again:** closes the game window and reopens your browsers (with their tabs) and the other apps it closed.
- **Hold ⌥ Option and click:** choose **Close Everything** for a fresh start (every app closes, including the ones you keep, and your tabs are saved to a file), or open **Settings**.

The lean browser is Google Chrome, Edge or Brave with its own empty profile, no extensions, and background features switched off. On a 16 GB MacBook Air it used about 400 MB, while the same kind of browser with 18 tabs open used about 6 GB. Your normal browser profile isn't touched.

## Install

**Download:** get `Gaming-Mode.zip` from [Releases](../../releases), unzip it, and move **Gaming Mode** to your Applications folder. The app isn't notarized by Apple, so the first time you open it macOS says it can't verify it. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**. (Gaming Mode is a plain script: open it in Script Editor to read exactly what it does.)

**Or build it yourself** with the tools already on every Mac:

```
git clone https://github.com/erfanulfarhan/gaming-mode.git
cd gaming-mode
./build.sh
```

This installs it in `~/Applications` and adds it to the Dock. Use `./build.sh --no-dock` to skip the Dock.

## First click and Settings

The first click opens Settings:

1. **Apps to keep open.** Tick the apps that should stay open (hold ⌘ Command to tick more than one). Apps like Terminal, Discord, Spotify and Music are ticked to start with. Menu bar apps are marked "(menu bar)" and stay open unless you untick them.
2. **Game browser.** Lean Google Chrome works best for most browser games. You can also pick lean Edge, lean Brave, Safari, or no browser.
3. **Disk cache.** Close Everything can also clear macOS's disk cache for a little extra memory. It asks for your password each time, so it's off unless you turn it on.

To change these later, hold ⌥ Option and click, then choose Settings, or click **Settings…** on the message Gaming Mode shows after it runs.

## Good to know

- **Your work is safe.** Apps quit the normal way, so anything with unsaved work asks you to save first. Nothing is force-quit. Finder and macOS's own background parts are never touched.
- **Saving tabs needs one permission.** The first time Gaming Mode saves a browser's tabs, macOS asks: "Gaming Mode wants to control Google Chrome". Click **Allow**. If you don't, the tabs still aren't lost: your browser's **History → Recently Closed** has them.
- **Which browsers:** tabs are saved for Chrome, Brave, Edge, Vivaldi, Arc, Chromium and Safari. Firefox doesn't allow it, so turn on Firefox's "Open previous windows and tabs" setting instead. Restored tabs open in one window per browser.
- **Memory won't reach zero.** macOS itself, the window server and background services always need a few GB, so expect "memory in use" to fall, not disappear.
- **Built-in Game Mode:** macOS gives full-screen games priority on the CPU and GPU, but it doesn't close your other apps. Gaming Mode does that part, and the two work fine together.
- **Nothing leaves your Mac.** Gaming Mode makes no internet connections. If you started a browser with a `--remote-debugging-port`, it reads that browser's tab list from the local port instead of asking for permission.

Settings, saved tabs and the lean browser profiles are kept in `~/Library/Application Support/Gaming Mode`.

## Uninstall

Drag Gaming Mode out of the Dock, delete it from Applications (or `~/Applications`), and delete `~/Library/Application Support/Gaming Mode`.

## Requirements

macOS 13 Ventura or later. Tested on macOS 27 on Apple silicon.

## For developers

Everything lives in `gaming-mode.js` (JavaScript for Automation). Preview what a click would do without closing anything:

```
osascript -l JavaScript gaming-mode.js --dry-run
osascript -l JavaScript gaming-mode.js --dry-run --close-everything
```

To test changes safely, make a copy of `gaming-mode.js` and set `TEST_ONLY` to a throwaway app (for example `['com.apple.TV']`), `TEST_OPEN_FLAGS` to `['-g', '-j']`, and `DIR` to a scratch folder. Check that `--dry-run` on the copy lists only that app before running it. Keep `TEST_ONLY` a plain constant: `osascript` passes its own values to `run()`'s extra parameters, so a default parameter there is ignored.

`./build.sh --zip` also writes `dist/Gaming-Mode.zip` for a release. `icon/make-icon.swift` draws the icon.

## License

MIT. See [LICENSE](LICENSE).
