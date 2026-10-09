// Gaming Mode for macOS
//
// Click:         closes the apps you don't need, saves your browser tabs, and opens a
//                lean browser window for your game. Click again to bring it all back.
// Option-click:  Close Everything (a fresh start that closes every app) or Settings.
// First click:   asks which apps to keep open and which browser to use for games.
//
// Apps quit the normal way, so anything with unsaved work asks you to save first.
// Settings and saved tabs live in ~/Library/Application Support/Gaming Mode.
//
// Build:    ./build.sh
// Preview:  osascript -l JavaScript gaming-mode.js --dry-run [--close-everything]

ObjC.import('AppKit');

const SELF = 'io.github.erfanulfarhan.gamingmode';
const ALWAYS_KEEP = [SELF, 'com.apple.finder'];
// Ticked the first time Settings opens; everyone can change them.
const SUGGESTED_KEEP = ['com.apple.Terminal', 'com.googlecode.iterm2', 'com.hnc.Discord',
  'com.spotify.client', 'com.apple.Music', 'com.obsproject.obs-studio'];
// A Chromium browser with its own empty profile and background features off uses a few
// hundred MB, against several GB for a browser full of tabs and extensions.
const GAME_BROWSERS = [
  { key: 'chrome', id: 'com.google.Chrome', label: 'Lean Google Chrome (best for most games)' },
  { key: 'edge', id: 'com.microsoft.edgemac', label: 'Lean Microsoft Edge' },
  { key: 'brave', id: 'com.brave.Browser', label: 'Lean Brave' },
  { key: 'safari', id: 'com.apple.Safari', label: 'Safari' },
  { key: 'none', id: null, label: "Don't open a browser" },
];
const LEAN_FLAGS = ['--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-sync', '--disable-default-apps', '--disable-background-networking',
  '--disable-component-update',
  '--disable-features=OptimizationGuideModelDownloading,OptimizationHintsFetching,' +
    'OptimizationTargetPrediction,Translate,MediaRouter,AutofillServerCommunication'];
// Browsers whose open tabs are saved before they close and reopened afterwards.
const TAB_BROWSERS = ['com.google.Chrome', 'com.brave.Browser', 'com.microsoft.edgemac',
  'org.chromium.Chromium', 'com.vivaldi.Vivaldi', 'company.thebrowser.Browser', 'com.apple.Safari'];
const DONT_REOPEN = ['com.apple.systempreferences', 'com.apple.ActivityMonitor',
  'com.apple.Preview', 'com.apple.installer', 'com.microsoft.autoupdate2'];
const WAIT_SECONDS = 15;     // how long apps get to close before the report
const OPTION_KEY = 1 << 19;  // NSEventModifierFlagOption

// Tests set these to touch only a throwaway app. They must be plain constants:
// osascript fills run()'s extra parameters itself, so a default parameter is ignored.
const TEST_ONLY = null;
const TEST_OPEN_FLAGS = [];

const DIR = $.NSHomeDirectory().js + '/Library/Application Support/Gaming Mode';
const SETTINGS = DIR + '/settings.json';
const STATE = DIR + '/state.json';

const sys = Application.currentApplication();
sys.includeStandardAdditions = true;

// --- small helpers ------------------------------------------------------------------

function sh(cmd) {
  return sys.doShellScript(cmd, { alteringLineEndings: false });
}

function q(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function readJSON(path) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  try { return s.isNil() ? null : JSON.parse(s.js); } catch (e) { return null; }
}

function writeFile(path, text) {
  sh('/bin/mkdir -p ' + q(path.replace(/\/[^/]*$/, '')));
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}

function appURL(id) {
  return $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(id);
}

function installed(id) {
  return !appURL(id).isNil();
}

function appName(id) {
  const url = appURL(id);
  return url.isNil() ? id : $.NSFileManager.defaultManager.displayNameAtPath(url.path).js.replace(/\.app$/, '');
}

function isRunning(id) {
  return Application(id).running();
}

function usedPercent() {
  const m = sh('/usr/bin/memory_pressure').match(/free percentage: (\d+)%/);
  return m ? 100 - Number(m[1]) : null;
}

function gb(kb) {
  return (kb / 1048576).toFixed(1) + ' GB';
}

function listNames(names) {
  names = [...new Set(names)];
  return names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

// Dialogs go through these three so a test can answer them.
function pick(items, options) {
  return sys.chooseFromList(items, options);
}

function ask(text, buttons, defaultButton) {
  return sys.displayDialog(text, { withTitle: 'Gaming Mode', buttons, defaultButton, withIcon: 'note' }).buttonReturned;
}

function show(text, buttons) {
  buttons = buttons || ['OK'];
  return sys.displayDialog(text, {
    withTitle: 'Gaming Mode', buttons, defaultButton: buttons[buttons.length - 1],
    givingUpAfter: 15, withIcon: 'note',
  }).buttonReturned;
}

// --- apps -----------------------------------------------------------------------------

// Every open app plus third-party menu bar apps, one entry per app (an app can run more
// than once), with the memory it uses including helpers. Apple's own background parts and
// helpers inside other apps are left out.
function runningApps() {
  const procs = sh('/bin/ps -axo rss=,comm=').split('\n')
    .map(l => l.match(/^\s*(\d+)\s+(.*)$/)).filter(Boolean)
    .map(m => ({ kb: Number(m[1]), path: m[2] }));
  const list = $.NSWorkspace.sharedWorkspace.runningApplications;
  const apps = [];
  for (let i = 0; i < list.count; i++) {
    const app = list.objectAtIndex(i);
    if (app.bundleIdentifier.isNil() || app.bundleURL.isNil()) continue;
    const id = app.bundleIdentifier.js;
    const path = app.bundleURL.path.js;
    const policy = Number(app.activationPolicy);
    const menuBar = policy === 1 && !id.startsWith('com.apple.');
    if (ALWAYS_KEEP.includes(id) || !(policy === 0 || menuBar) || path.includes('.app/Contents/')) continue;
    if (TEST_ONLY && !TEST_ONLY.includes(id)) continue;
    const seen = apps.find(a => a.id === id);
    if (seen) { seen.instances.push(app); continue; }
    const kb = procs.filter(p => p.path.startsWith(path + '/')).reduce((s, p) => s + p.kb, 0);
    apps.push({ id, instances: [app], menuBar, name: appName(id), kb });
  }
  return apps.sort((a, b) => b.kb - a.kb);
}

function closesInGamingMode(app, settings) {
  return app.menuBar ? settings.closeMenuBar.includes(app.id) : !settings.keep.includes(app.id);
}

// --- browsers -------------------------------------------------------------------------

function leanProfile(key) {
  return `${DIR}/Browser profiles/${key}`;
}

function mainProcessLines(id) {
  const exe = appURL(id).path.js + '/Contents/MacOS/';
  return sh('/bin/ps -axo pid=,command=').split('\n').map(l => l.trim()).filter(l => l.includes(exe));
}

// A browser's open tabs and the flags it was started with. Tabs come from its debug port
// when it has one, otherwise by asking the browser (macOS asks you once to allow that).
function saveTabs(id) {
  const line = mainProcessLines(id).find(l => !l.includes(`${DIR}/Browser profiles/`)) || '';
  const flags = line.split(/\s+/).filter(t => t.startsWith('--') && t !== '--restore-last-session');
  const keep = u => /^(https?|file):/.test(u);
  const port = (flags.find(f => f.startsWith('--remote-debugging-port=')) || '').split('=')[1];
  if (port) {
    try {
      const tabs = JSON.parse(sh(`/usr/bin/curl -s -m 3 http://127.0.0.1:${port}/json/list`));
      return { id, flags, tabs: tabs.filter(t => t.type === 'page' && keep(t.url)).map(t => t.url) };
    } catch (e) {}
  }
  try {
    const tabs = [].concat(...Application(id).windows().map(w => w.tabs().map(t => t.url())));
    return { id, flags, tabs: tabs.filter(keep) };
  } catch (e) {
    return { id, flags, tabs: [] };
  }
}

function reopenBrowser(saved) {
  const path = appURL(saved.id).path.js;
  const cmd = saved.id === 'com.apple.Safari'
    ? ['/usr/bin/open', '-a', path, ...saved.tabs]
    : ['/usr/bin/open', '-a', path, '--args', ...saved.flags, ...saved.tabs];
  sh(cmd.map(q).join(' '));
}

function openGameBrowser(key) {
  const b = GAME_BROWSERS.find(x => x.key === key);
  if (!b || !b.id || !installed(b.id)) return null;
  if (key === 'safari') {
    sh('/usr/bin/open -a Safari');
  } else {
    sh(['/usr/bin/open', ...TEST_OPEN_FLAGS, '-na', appURL(b.id).path.js, '--args',
      '--user-data-dir=' + leanProfile(key), ...LEAN_FLAGS].map(q).join(' '));
  }
  return key;
}

function closeGameBrowser(key) {
  const b = GAME_BROWSERS.find(x => x.key === key);
  if (!b || !b.id) return;
  if (key === 'safari') {
    if (isRunning(b.id)) $.NSRunningApplication.runningApplicationsWithBundleIdentifier(b.id).objectAtIndex(0).terminate;
    for (let w = 0; w < WAIT_SECONDS && isRunning(b.id); w += 0.5) delay(0.5);
    return;
  }
  const pidOf = () => {
    const line = mainProcessLines(b.id).find(l => l.includes(leanProfile(key)));
    return line ? Number(line.split(/\s+/)[0]) : null;
  };
  const pid = pidOf();
  if (!pid) return;
  $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid).terminate;
  for (let w = 0; w < WAIT_SECONDS && pidOf(); w += 0.5) delay(0.5);
}

// --- closing --------------------------------------------------------------------------

// Saves browser tabs, asks the apps to quit, and waits for them.
function closeApps(apps) {
  const saved = apps.map(a => a.id).filter(id => TAB_BROWSERS.includes(id)).map(saveTabs);
  let tabsFile = null;
  if (saved.some(s => s.tabs.length)) {
    tabsFile = `${DIR}/Saved tabs/${stamp()}.txt`;
    writeFile(tabsFile, saved.filter(s => s.tabs.length)
      .map(s => `${appName(s.id)}\n${s.tabs.join('\n')}`).join('\n\n') + '\n');
  }
  apps.forEach(a => a.instances.forEach(i => i.terminate));
  for (let w = 0; w < WAIT_SECONDS && apps.some(a => isRunning(a.id)); w += 0.5) delay(0.5);
  const closed = apps.filter(a => !isRunning(a.id));
  return {
    closed,
    stillOpen: apps.filter(a => isRunning(a.id)),
    saved: saved.filter(s => closed.some(c => c.id === s.id)),
    tabsFile,
  };
}

function summary(result, before, after) {
  let text = result.closed.length
    ? `Closed ${listNames(result.closed.map(a => a.name))}, about ${gb(result.closed.reduce((s, a) => s + a.kb, 0))}.\n`
    : 'Nothing needed closing.\n';
  text += `Memory in use went from ${before}% to ${after}%.`;
  if (result.stillOpen.length) {
    text += `\n\nStill open: ${listNames(result.stillOpen.map(a => a.name))}. It may be waiting for you to save something.`;
  }
  return text;
}

// --- the three things a click can do ---------------------------------------------------

function turnOn(settings) {
  const before = usedPercent();
  const result = closeApps(runningApps().filter(a => closesInGamingMode(a, settings)));
  const browserWasRunning = settings.browser === 'safari' && isRunning('com.apple.Safari');
  const browser = openGameBrowser(settings.browser);
  delay(3);   // let the browser settle and macOS reclaim the memory
  const after = usedPercent();
  writeFile(STATE, JSON.stringify({
    on: true, since: new Date().toISOString(), browser, browserWasRunning,
    browsers: result.saved,
    reopen: result.closed.map(a => a.id)
      .filter(id => !TAB_BROWSERS.includes(id) && !DONT_REOPEN.includes(id)),
  }, null, 2));
  let text = summary(result, before, after);
  const tabs = result.saved.reduce((s, b) => s + b.tabs.length, 0);
  if (tabs) text = `Saved your ${plural(tabs, 'browser tab')}. ` + text;
  text += browser ? `\n\nA ${browser === 'safari' ? 'Safari' : 'lean browser'} window is open for your game.` : '';
  text += '\nClick Gaming Mode again when you are done to get everything back.';
  if (show(text, ['Settings…', 'OK']) === 'Settings…') editSettings(settings);
}

function turnOff(state) {
  if (state.browser && !(state.browser === 'safari' && state.browserWasRunning)) closeGameBrowser(state.browser);
  const done = [];
  for (const saved of state.browsers || []) {
    if (isRunning(saved.id)) continue;
    reopenBrowser(saved);
    done.push(saved.tabs.length ? `${appName(saved.id)} with ${plural(saved.tabs.length, 'tab')}` : appName(saved.id));
  }
  for (const id of state.reopen || []) {
    try { sh('/usr/bin/open -g -b ' + q(id)); done.push(appName(id)); } catch (e) {}
  }
  writeFile(STATE, JSON.stringify({ on: false, since: new Date().toISOString() }, null, 2));
  show('Gaming Mode is off. ' + (done.length ? `Reopened ${listNames(done)}.` : 'Nothing needed reopening.'));
}

function closeEverything(settings, state) {
  const before = usedPercent();
  if (state && state.on && state.browser) closeGameBrowser(state.browser);
  const result = closeApps(runningApps());
  // Tabs saved by an earlier Gaming Mode click would otherwise be lost, so keep them too.
  const earlier = ((state && state.on && state.browsers) || []).filter(s => s.tabs.length);
  if (earlier.length) {
    const file = result.tabsFile || `${DIR}/Saved tabs/${stamp()}.txt`;
    const old = $.NSString.stringWithContentsOfFileEncodingError(file, $.NSUTF8StringEncoding, null);
    writeFile(file, (old.isNil() ? '' : old.js + '\n') +
      earlier.map(s => `${appName(s.id)}\n${s.tabs.join('\n')}`).join('\n\n') + '\n');
    result.tabsFile = file;
  }
  if (settings && settings.clearCache) {
    try { sys.doShellScript('/usr/sbin/purge', { administratorPrivileges: true }); } catch (e) {}
  }
  delay(2);
  const after = usedPercent();
  writeFile(STATE, JSON.stringify({ on: false, since: new Date().toISOString() }, null, 2));
  let text = 'Fresh start. ' + summary(result, before, after);
  if (result.tabsFile) text += '\n\nYour browser tabs are saved, so you can open them again later.';
  if (show(text, result.tabsFile ? ['Show Saved Tabs', 'OK'] : ['OK']) === 'Show Saved Tabs') {
    sh('/usr/bin/open -R ' + q(result.tabsFile));
  }
}

// --- settings -------------------------------------------------------------------------

function editSettings(current) {
  const known = current || { keep: SUGGESTED_KEEP, closeMenuBar: [], browser: 'chrome', clearCache: false };
  const rows = [];
  for (const a of runningApps()) {
    rows.push({ id: a.id, menuBar: a.menuBar, label: a.name + (a.menuBar ? ' (menu bar)' : '') });
  }
  for (const id of known.keep) {
    if (!rows.some(r => r.id === id) && installed(id)) rows.push({ id, menuBar: false, label: appName(id) });
  }
  rows.sort((a, b) => a.label.localeCompare(b.label));
  const ticked = rows.filter(r => r.menuBar ? !known.closeMenuBar.includes(r.id) : known.keep.includes(r.id));
  const chosen = pick(rows.map(r => r.label), {
    withTitle: 'Gaming Mode Settings',
    withPrompt: 'Which apps should stay open in Gaming Mode? Everything else closes. ' +
      'Hold ⌘ Command to select more than one.',
    defaultItems: ticked.map(r => r.label),
    multipleSelectionsAllowed: true, emptySelectionAllowed: true, okButtonName: 'Next',
  });
  if (chosen === false) return null;
  const keep = rows.filter(r => !r.menuBar && chosen.includes(r.label)).map(r => r.id)
    .concat(known.keep.filter(id => !rows.some(r => r.id === id)));   // kept apps not installed now
  const closeMenuBar = rows.filter(r => r.menuBar && !chosen.includes(r.label)).map(r => r.id)
    .concat(known.closeMenuBar.filter(id => !rows.some(r => r.id === id)));

  const options = GAME_BROWSERS.filter(b => !b.id || installed(b.id));
  const now = options.find(b => b.key === known.browser) || options[0];
  const b = pick(options.map(o => o.label), {
    withTitle: 'Gaming Mode Settings',
    withPrompt: 'Which browser should open for your game?',
    defaultItems: [now.label], okButtonName: 'Next',
  });
  if (b === false) return null;
  const clearCache = ask("Close Everything can also clear macOS's disk cache for a little more free memory. " +
    'It asks for your password each time.', ["Don't Clear It", 'Clear It Too'],
    known.clearCache ? 'Clear It Too' : "Don't Clear It") === 'Clear It Too';

  const settings = { keep, closeMenuBar, browser: options.find(o => o.label === b[0]).key, clearCache };
  writeFile(SETTINGS, JSON.stringify(settings, null, 2));
  return settings;
}

// --- preview and entry point -----------------------------------------------------------

function preview(settings, state, everything) {
  if (state && state.on && !everything) {
    const tabs = (state.browsers || []).reduce((s, b) => s + b.tabs.length, 0);
    return 'Gaming Mode is on. The next click closes the game browser and reopens ' +
      `${plural((state.browsers || []).length + (state.reopen || []).length, 'app')} (${plural(tabs, 'tab')}).`;
  }
  const s = settings || { keep: SUGGESTED_KEEP, closeMenuBar: [], browser: 'chrome', clearCache: false };
  const all = runningApps();
  const closing = all.filter(a => everything || closesInGamingMode(a, s));
  const staying = all.filter(a => !closing.includes(a));
  const browsers = closing.map(a => a.id).filter(id => TAB_BROWSERS.includes(id));
  return (settings ? '' : 'No settings yet, so the first click opens Settings. With the suggested ones:\n') +
    (closing.length ? 'Would close:\n' + closing.map(a => `  ${a.name} (${gb(a.kb)})`).join('\n') +
      `\nAbout ${gb(closing.reduce((t, a) => t + a.kb, 0))} in total.` : 'Nothing to close.') +
    (staying.length ? `\nWould keep: ${listNames(staying.map(a => a.name))}.` : '') +
    (browsers.length ? `\nWould save tabs from ${listNames(browsers.map(appName))}.` : '') +
    (everything ? '' : `\nThen open: ${(GAME_BROWSERS.find(b => b.key === s.browser) || {}).label || 'nothing'}.`) +
    `\nMemory in use now: ${usedPercent()}%.`;
}

function run(argv) {
  const args = Array.isArray(argv) ? argv : [];
  let settings = readJSON(SETTINGS);
  const state = readJSON(STATE);
  if (args.includes('--dry-run')) return preview(settings, state, args.includes('--close-everything'));
  if (args.includes('--settings')) return void editSettings(settings);

  if ((Number($.NSEvent.modifierFlags) & OPTION_KEY) || args.includes('--menu')) {
    const items = ['Close Everything (fresh start)', 'Settings',
      state && state.on ? 'Turn Gaming Mode Off' : 'Start Gaming Mode'];
    const c = pick(items, { withTitle: 'Gaming Mode', withPrompt: 'What would you like to do?',
      defaultItems: [items[0]], okButtonName: 'Go' });
    if (c === false) return;
    if (c[0] === items[0]) return void closeEverything(settings, state);
    if (c[0] === items[1]) return void editSettings(settings);
  }
  if (state && state.on) return void turnOff(state);
  if (!settings) settings = editSettings(null);
  if (settings) turnOn(settings);
}
