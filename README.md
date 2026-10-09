# Gaming Mode

One click before playing, one click after.

- **First click:** saves your open Brave tabs and closes Brave, quits the other memory-heavy apps listed in `gaming-mode.js`, and opens a fresh Safari window, the lightest browser on a Mac (about 290 MB, against several GB for Brave with tabs). It then shows what it closed and the free memory before and after.
- **Second click:** reopens Brave with the saved tabs and the same launch flags (so its `--remote-debugging-port` comes back), reopens the apps it closed, and closes the Safari window if Gaming Mode opened it.

Saved tab lists are also kept as text files in `~/Library/Application Support/Gaming Mode/`.

- Apps quit normally, so anything with unsaved work still asks you to save.
- Discord, Spotify and OBS are never touched.
- Quitting VS Code also ends any Claude Code session running in it.

## Use

Click **Gaming Mode** in the Dock, or search for it in Spotlight.

## Change which apps it closes

Edit the `QUIT` list of bundle IDs in `gaming-mode.js`, then run `./build.sh`. To find an app's bundle ID:

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
