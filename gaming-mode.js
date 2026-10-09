// Gaming Mode: one click before playing, one click after.
//
// On:  saves your Brave tabs, closes every open app (and the menu bar apps in
//      ALSO_QUIT; Stats stays so you can watch memory), then opens a lean Chrome window for the game: its
//      own clean profile with no extensions and background features off, so
//      it uses about 400 MB. Shows memory in use before and after. Apps quit
//      normally, so anything with unsaved work still asks you to save first.
// Off: the next click closes that Chrome window, reopens Brave with the saved
//      tabs (and the same launch flags, so its debug port comes back), and
//      reopens the other apps it closed.
//
// Build the app:    ./build.sh
// Preview a click:  osascript -l JavaScript gaming-mode.js --dry-run

ObjC.import('AppKit');

const SELF = 'com.erfanul.gamingmode';
const BRAVE = 'com.brave.Browser';
const CHROME = 'com.google.Chrome';
const SAFARI = 'com.apple.Safari';
const NEVER_QUIT = [SELF, 'com.apple.finder', 'com.apple.Terminal'];   // he keeps Terminal windows open
// Tests set these two to touch only a throwaway app and keep the browser in the background.
// They must be plain constants: osascript fills run()'s extra parameters itself, so a
// default parameter on run() is silently ignored (that closed every app during a test).
const TEST_ONLY = null;
const TEST_OPEN_FLAGS = [];
const ALSO_QUIT = [                   // menu bar apps worth closing too
  'com.NeatDownloadManager',          // downloads resume when it reopens
];                                    // Stats stays to watch memory; BetterDisplay stays too,
                                      // since closing it can change the display
const DONT_REOPEN = [
  'com.microsoft.autoupdate2', 'com.apple.systempreferences', 'com.apple.Preview',
  'com.apple.ActivityMonitor', 'com.apple.installer',
];
const WAIT_SECONDS = 15;   // how long to wait for apps to close before reporting
const HOME = $.NSHomeDirectory().js;
const DIR = HOME + '/Library/Application Support/Gaming Mode';
const STATE = DIR + '/state.json';
const GAME_PROFILE = DIR + '/Chrome profile';
const CHROME_FLAGS = [
  '--user-data-dir=' + GAME_PROFILE, '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-sync', '--disable-default-apps',
  '--disable-background-networking', '--disable-component-update',
  '--disable-features=OptimizationGuideModelDownloading,OptimizationHintsFetching,' +
    'OptimizationTargetPrediction,Translate,MediaRouter,AutofillServerCommunication',
];

const sys = Application.currentApplication();
sys.includeStandardAdditions = true;

function sh(cmd) {
  return sys.doShellScript(cmd, { alteringLineEndings: false });
}

function q(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function readState() {
  const s = $.NSString.stringWithContentsOfFileEncodingError(STATE, $.NSUTF8StringEncoding, null);
  try { return s.isNil() ? null : JSON.parse(s.js); } catch (e) { return null; }
}

function writeFile(path, text) {
  sh('/bin/mkdir -p ' + q(DIR));
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}

function isRunning(id) {
  return Application(id).running();
}

function installed(id) {
  return !$.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(id).isNil();
}

function appName(id) {
  const url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(id);
  return url.isNil() ? id : $.NSFileManager.defaultManager.displayNameAtPath(url.path).js.replace(/\.app$/, '');
}

function usedPercent() {
  const m = sh('/usr/bin/memory_pressure').match(/free percentage: (\d+)%/);
  return m ? 100 - Number(m[1]) : null;
}

// Every open app plus ALSO_QUIT, with the memory their processes use (helpers included).
function runningTargets() {
  const procs = sh('/bin/ps -axo rss=,comm=').split('\n')
    .map(line => line.match(/^\s*(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(m => ({ kb: Number(m[1]), path: m[2] }));
  const apps = $.NSWorkspace.sharedWorkspace.runningApplications;
  const found = [];
  for (let i = 0; i < apps.count; i++) {
    const app = apps.objectAtIndex(i);
    if (app.bundleIdentifier.isNil() || app.bundleURL.isNil()) continue;
    const id = app.bundleIdentifier.js;
    const regular = Number(app.activationPolicy) === 0;
    if (NEVER_QUIT.includes(id) || !(regular || ALSO_QUIT.includes(id))) continue;
    if (TEST_ONLY && !TEST_ONLY.includes(id)) continue;
    if (found.some(t => t.id === id)) continue;
    const bundle = app.bundleURL.path.js + '/';
    const kb = procs.filter(p => p.path.startsWith(bundle)).reduce((sum, p) => sum + p.kb, 0);
    found.push({ id, app, name: appName(id), kb });
  }
  return found.sort((a, b) => b.kb - a.kb);
}

// Brave's open tabs, read through its debug port when it has one (no permission
// prompt), otherwise by asking Brave itself. Also keeps the flags it was started with.
function braveSession() {
  const cmd = sh('/bin/ps -axo command=').split('\n')
    .find(c => c.startsWith('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser')) || '';
  // --restore-last-session would reopen the old tabs on top of the saved ones, so drop it.
  const flags = (cmd.match(/(?<=\s)--\S+/g) || []).filter(f => f !== '--restore-last-session');
  const keep = u => /^(https?|file):/.test(u);
  try {
    const list = JSON.parse(sh('/usr/bin/curl -s -m 3 http://127.0.0.1:9222/json/list'));
    return { flags, tabs: list.filter(t => t.type === 'page' && keep(t.url)).map(t => t.url) };
  } catch (e) {}
  try {
    const tabs = [].concat(...Application('Brave Browser').windows().map(w => w.tabs().map(t => t.url())));
    return { flags, tabs: tabs.filter(keep) };
  } catch (e) {
    return { flags, tabs: [] };
  }
}

// The lean Chrome started by Gaming Mode, told apart from a normal Chrome by its profile folder.
function gameChromePid() {
  const line = sh('/bin/ps -axo pid=,command=').split('\n')
    .find(l => l.includes('/Google Chrome.app/Contents/MacOS/Google Chrome ') && l.includes(GAME_PROFILE));
  return line ? Number(line.trim().split(/\s+/)[0]) : null;
}

function openGameBrowser(extraOpenFlags) {
  if (installed(CHROME)) {
    sh(['/usr/bin/open', ...extraOpenFlags, '-na', 'Google Chrome', '--args', ...CHROME_FLAGS].map(q).join(' '));
    return 'Chrome';
  }
  sh('/usr/bin/open -a Safari');
  return 'Safari';
}

function closeGameBrowser(state) {
  if (state.browser === 'Chrome') {
    const pid = gameChromePid();
    if (!pid) return;
    $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid).terminate;
    for (let waited = 0; waited < WAIT_SECONDS && gameChromePid(); waited += 0.5) delay(0.5);
  } else if (state.browser === 'Safari' && isRunning(SAFARI)) {
    $.NSRunningApplication.runningApplicationsWithBundleIdentifier(SAFARI).objectAtIndex(0).terminate;
  }
}

function gb(kb) {
  return (kb / 1048576).toFixed(1) + ' GB';
}

function listNames(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function show(message) {
  sys.displayDialog(message, {
    withTitle: 'Gaming Mode',
    buttons: ['OK'],
    defaultButton: 'OK',
    givingUpAfter: 12,
    withIcon: 'note',
  });
}

function turnOn() {
  const before = usedPercent();
  const targets = runningTargets();
  const brave = isRunning(BRAVE) ? braveSession() : null;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  if (brave && brave.tabs.length) writeFile(`${DIR}/brave-tabs-${stamp}.txt`, brave.tabs.join('\n') + '\n');

  targets.forEach(t => t.app.terminate);
  for (let waited = 0; waited < WAIT_SECONDS; waited += 0.5) {
    if (targets.every(t => !isRunning(t.id))) break;
    delay(0.5);
  }
  const closed = targets.filter(t => !isRunning(t.id));
  const stillOpen = targets.filter(t => isRunning(t.id));
  const braveClosed = Boolean(brave) && closed.some(t => t.id === BRAVE);

  const browser = openGameBrowser(TEST_OPEN_FLAGS);
  delay(3);   // let the browser settle and macOS reclaim the memory
  const after = usedPercent();

  writeFile(STATE, JSON.stringify({
    on: true,
    since: new Date().toISOString(),
    browser,
    brave: braveClosed ? brave : null,
    reopen: closed.map(t => t.id).filter(id => id !== BRAVE && !DONT_REOPEN.includes(id)),
  }, null, 2));

  let message = braveClosed ? `Saved your ${plural(brave.tabs.length, 'Brave tab')}. ` : '';
  message += closed.length
    ? `Closed ${listNames(closed.map(t => t.name))}, about ${gb(closed.reduce((s, t) => s + t.kb, 0))}.\n`
    : 'Nothing needed closing.\n';
  message += `Memory in use went from ${before}% to ${after}%.\n\n` +
    `A lean ${browser} window is open for your game. Click Gaming Mode again when you are done to get everything back.`;
  if (stillOpen.length) {
    message += `\n\nStill open: ${listNames(stillOpen.map(t => t.name))}. It may be waiting for you to save something.`;
  }
  show(message);
}

function turnOff(state) {
  closeGameBrowser(state);
  const done = [];
  if (state.brave) {
    if (isRunning(BRAVE)) {
      done.push(`Brave was already open, so your saved tabs are in ${DIR}`);
    } else {
      sh(['/usr/bin/open', '-a', 'Brave Browser', '--args', ...state.brave.flags, ...state.brave.tabs].map(q).join(' '));
      done.push(`reopened Brave with your ${plural(state.brave.tabs.length, 'tab')}`);
    }
  }
  const names = [];
  for (const id of state.reopen || []) {
    try {
      sh('/usr/bin/open -g -b ' + q(id));
      names.push(appName(id));
    } catch (e) {}
  }
  if (names.length) done.push(`reopened ${listNames(names)}`);
  writeFile(STATE, JSON.stringify({ on: false, since: new Date().toISOString() }, null, 2));
  const summary = done.join(', and ');
  show('Gaming Mode is off. ' + (summary ? summary[0].toUpperCase() + summary.slice(1) + '.' : 'Nothing needed reopening.'));
}

function run(argv) {
  const dryRun = Array.isArray(argv) && argv.includes('--dry-run');
  const state = readState();
  if (dryRun) {
    if (state && state.on) {
      return `Gaming Mode is on. The next click would close the lean ${state.browser} window, reopen Brave` +
        (state.brave ? ` with ${plural(state.brave.tabs.length, 'tab')}` : '') +
        ` and reopen ${plural((state.reopen || []).length, 'other app')}.`;
    }
    const targets = runningTargets();
    const brave = isRunning(BRAVE) ? braveSession() : null;
    return (brave ? `Would save ${plural(brave.tabs.length, 'Brave tab')} (flags: ${brave.flags.join(' ') || 'none'}).\n` : '') +
      (targets.length ? 'Would close:\n' + targets.map(t => `  ${t.name} (${gb(t.kb)})`).join('\n') +
        `\nAbout ${gb(targets.reduce((s, t) => s + t.kb, 0))} in total.` : 'Nothing to close.') +
      `\nThen open lean ${installed(CHROME) ? 'Chrome' : 'Safari'}. Memory in use now: ${usedPercent()}%.`;
  }
  if (state && state.on) turnOff(state); else turnOn();
}
