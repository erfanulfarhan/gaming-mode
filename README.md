# Gaming Mode

One click before playing, one click after.

- **First click:** saves your open Brave tabs (and the flags Brave was started with), closes every open app, then opens a lean Chrome window for the game. Lean Chrome is Google Chrome with its own clean profile (in `~/Library/Application Support/Gaming Mode/Chrome profile`), no extensions, and background features switched off, so it stays around 400 MB. It's kept separate from your normal Chrome. The click then shows what it closed and the memory in use before and after.
- **Second click:** closes the lean Chrome window, reopens Brave with the saved tabs and flags (so `--remote-debugging-port` comes back), and reopens the apps it closed.

Never closed: Finder, Terminal, and the menu bar apps Stats and BetterDisplay (closing BetterDisplay can change the display). NeatDownloadManager is closed, and its downloads resume when it reopens. Saved tab lists are also kept as text files in `~/Library/Application Support/Gaming Mode/`.

- Apps quit normally, so anything with unsaved work still asks you to save.
- Quitting VS Code also ends any Claude Code session running in it.

## Use

Click **Gaming Mode** in the Dock, or search for it in Spotlight.

## Change which apps it keeps

Add bundle IDs to `NEVER_QUIT` (apps that stay open) or `ALSO_QUIT` (menu bar apps to close) in `gaming-mode.js`, then run `./build.sh`. To find an app's bundle ID:

```
osascript -e 'id of app "App Name"'
```

To see what the next click would do, without changing anything:

```
osascript -l JavaScript gaming-mode.js --dry-run
```

## Notes

- macOS manages memory itself, so freeing memory only helps when apps are actually using it. The biggest win is usually fewer open browser tabs. Brave's Memory Saver (Settings, then System) puts tabs you aren't using to sleep.
- `icon/make-icon.swift` draws the icon. `build.sh` copies `icon/GamingMode.icns` into the app.

## Testing

Never test by clicking the real app while you need your open apps. Instead, copy `gaming-mode.js`, then in the copy set `TEST_ONLY` to a throwaway app (for example `['com.apple.TV']`), `TEST_OPEN_FLAGS` to `['-g', '-j']`, and `DIR` to a scratch folder. Check that `--dry-run` on the copy lists only that app before running it for real. These have to be plain constants: osascript passes its own values into `run()`'s extra parameters, so a default parameter there is silently ignored.
