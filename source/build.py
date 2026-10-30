#!/usr/bin/env python3
"""
build.py -- builds, versions and installs the workshop's DWC plugins.

Two kinds of plugin:
  src/<Id>/   hand-written JS plugins (bar, jog, camera). They are built
              anywhere (PC or Pi) with Python alone.
  vue/<Id>/   Vue pages (consumption, motors, activity). TWO source trees, one per DWC line (docs/DWC-LINES.md):
                dwc-src/  DWC 3.7 (Vue 3 / Vuetify 4), compiled by scripts/build-plugin-pkg.js of a DuetWebControl 3.7
                          clone (Vite; env TALLER_DWC_SRC, default ~/Projects/dwc-src-37); vue/_shared/ goes with it
                dwc36/    DWC 3.6 (Vue 2 / Vuetify 2): dwc36/plugin.json + dwc36/dwc-src/ + dwc36/test/, compiled by
                          scripts/build-plugin.js of a DuetWebControl 3.6 clone (webpack; env TALLER_DWC_SRC_36, default
                          ~/Projects/dwc-src); vue/_shared36/ goes with it
              Both only on the PC. --dwc 3.6 | 3.7 | universal builds the line(s) like the JS plugins; the shared DWC
              clones are protected by <clone>.lock folders while a build runs.
--install installs locally if PluginManager exists (on the Pi) or, from the PC,
copies the zip over SSH to the Pi and installs it there.

Macros on the SD: if a plugin has src/<Id>/sd/ (e.g. sd/sys/workzero.g),
those files go in the zip (sdFiles) and DSF copies them to /opt/dsf/sd/ on
install. DSF OVERWRITES them without asking (and does NOT delete them on uninstall), so
before installing each one is compared with the SD:
  - equal to the one being installed, or equal to that of the version installed before
    -> it is installed (the change came from the repo)
  - different from both -> someone edited it directly on the SD: it is NOT installed.
    --pull-sd <Id> brings those changes into the repo; --force-sd overwrites them.
What is going to be overwritten is always backed up in ~/sd-backup/<Id>-<date>/ (Pi).
The user's data never goes in sd/ (sys/workshop/zones/, sys/workshop/zones/cutarea.g,
macros/laser/<material>.g).

src/_shared/*.js is prepended to ALL the JS plugins (common utilities).
Code shared only by SOME plugins (the bed map page of src/_zones is used by
WorkshopWorkbench): src/<Id>/_includes.txt
lists folders of src/ (one per line, e.g. "_zones"); their *.js go after
_shared and before the plugin's, and their sd/ is added to the plugin's macros
(if a file is in both, the plugin's wins).
Each JS plugin lives in src/<Id>/:
    plugin.json   manifest (the VERSION lives here; dwcFiles is set by this script)
    CHANGELOG.md  version history (written by --bump)
    *.js          code, concatenated in alphabetical order (00-core.js,
                  10-panel.js, ...) inside ONE module function,
                  so all the files share the same scope.

Output:
    dist/<Id>.zip                         latest build
    releases/<Id>/<Id>-<version>.zip      archive of each version (for --rollback)

The .js name carries a hash of the content: every change is a new file,
so the browser never serves an old cached version.

The code is wrapped in the chunk format required by DWC's loader
(self["webpackChunkduetwebcontrol"].push with the key
"./src/plugins/<Id>/index.js") and in a try/catch: if the plugin's startup
throws an exception, DWC deactivates it by itself and removes it from
enabledPlugins (loadDwcPlugins -> catch -> settings/disableDwcPlugin).

DWC 3.7 (same sources, --dwc 3.7|both): dist/37/<Id>.zip with a plain IIFE in dwc/js/ (see IIFE_HEAD), the texts registered
with DWC.registerPluginMessages and dwcVersion 3.7 in the manifest. The default (--dwc 3.6) builds exactly what it always did.
src/_shared/00-dwc-host.js is the only file that touches DWC internals and detects 3.6 or 3.7 at run time.

Release (docs/DWC-LINES.md): ONE STRICT ZIP PER DWC LINE, never a universal one. `python3 build.py --dwc both` (alias --release) writes
dist/release/<Id>-<version>-dwc3.6.zip (manifest dwcVersion "3.6", sbcDsfVersion "3.6") and -dwc3.7.zip ("3.7") + SHA256SUMS.txt, so DWC
itself refuses the wrong one; `python3 build.py --check-release` verifies them (tools/release_zips.py). --dwc universal is deprecated.

Usage:
    python3 build.py                              builds all
    python3 build.py WorkshopJog --install          builds and installs one (same version)
    python3 build.py WorkshopJog --bump minor -m "what changed" --install
                                                  new version: plugin.json +
                                                  CHANGELOG.md + installs + archives
                                                  + commit + git tag <Id>-v<ver>
    python3 build.py --list                       versions installed / in code / archived
    python3 build.py --rollback WorkshopJog 1.0.0   reinstalls an archived version

Versions (semver): patch = fix, minor = new compatible feature,
major = a change that breaks something (e.g. another zone file format).

"""
import argparse
import datetime
import hashlib
import io
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import release_zips  # noqa: E402  (strict per-line zips: manifests, run-time guard, release check)
SRC = os.path.join(ROOT, "src")
SHARED = os.path.join(SRC, "_shared")
VUE = os.path.join(ROOT, "vue")
VUE_SHARED = os.path.join(VUE, "_shared")
VUE_SHARED_36 = os.path.join(VUE, "_shared36")
DIST = os.path.join(ROOT, "dist")
RELEASES = os.path.join(ROOT, "releases")
PLUGIN_MANAGER = "/opt/dsf/bin/PluginManager"
LOCAL = os.path.exists(PLUGIN_MANAGER)  # True when running on the Pi
def _local_ssh():
    # user@host of the Pi for --install from the PC: TALLER_SSH variable or
    # build.local.json {"ssh": "user@host"} (not in git); otherwise, DuetPi's.
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "build.local.json")) as f:
            return json.load(f).get("ssh")
    except Exception:
        return None


SSH_HOST = os.environ.get("TALLER_SSH") or _local_ssh() or "pi@duet3.local"
DWC_SRC = os.environ.get("TALLER_DWC_SRC", os.path.join(os.path.expanduser("~"), "Projects", "dwc-src-37"))
# the DWC 3.6 clone (webpack, Vue 2) that builds the dwc36/ side of the Vue plugins
DWC_SRC_36 = os.environ.get("TALLER_DWC_SRC_36", os.path.join(os.path.expanduser("~"), "Projects", "dwc-src"))
LOCK_WAIT_SECONDS = int(os.environ.get("TALLER_LOCK_WAIT", "1800"))
STATUS_URL = "http://localhost/machine/status" if LOCAL else "http://" + SSH_HOST.split("@")[-1] + "/machine/status"
SOURCE_DIRS = ["src", "vue"]
# Canonical versions file: ALWAYS on the Pi (even if built on the PC),
# so --list and --rollback see the same from anywhere.
PI_RELEASES = "plugins/TallerPlugins/releases"  # relative to the home on the Pi

WRAPPER_HEAD = """/* {id} {version} ({commit}) -- generado por build.py, NO editar: la fuente esta en src/{id}/ */
(self["webpackChunkduetwebcontrol"] = self["webpackChunkduetwebcontrol"] || []).push([
  ["{id}"],
  {{
    "./src/plugins/{id}/index.js": function (module, exports, __webpack_require__) {{
      "use strict";
      try {{
"""
WRAPPER_TAIL = """
      }} catch (e) {{
        // Nunca dejar que una excepcion de arranque llegue a DWC: lo
        // desactivaria y lo sacaria de enabledPlugins.
        console.error("[{id}] error al arrancar el plugin:", e);
      }}
    }},
  }},
]);
"""


# DWC 3.7 (Vue 3 / Vite): a plugin is a plain classic script under dwc/js/ listed in plugin.json dwcFiles; DWC injects it with a
# <script src> after the manifest checks and exposes everything through window.DWC. There is no module system and no hook that
# disables the plugin on a startup error (a script that throws is just logged), the try/catch only keeps the page clean.
IIFE_HEAD = """/* {id} {version} ({commit}) -- generated by build.py (DWC 3.7), DO NOT edit: the source is in src/{id}/ */
(function () {{
  "use strict";
  try {{
"""
IIFE_TAIL = """
  }} catch (e) {{
    console.error("[{id}] error starting the plugin:", e);
  }}
}})();
"""

# Build mode with DWC (2026-10-17): FAST by default (webpack cache, no maps nor .gz nor service worker:
# tools/vue.config.fast.js, it does not touch dwc-src) and FULL with --completa or TALLER_BUILD_COMPLETO=1 (DWC's config as
# is).
# When testing the fast one is used; before uploading to the repo (tools/export_public.py requires it) the version is redone
# with --completa.
MODO = {"completa": os.environ.get("TALLER_BUILD_COMPLETO") == "1"}
RAPIDA_CFG = os.path.join(ROOT, "tools", "vue.config.fast.js")


def keep_in_zip(name):
    """A-21: source maps (*.map) do not ship in the plugin zips (they expose the sources and weigh as much as the code); set
    TALLER_SOURCEMAPS=1 to keep the ones the DWC build produced (prereleases for debugging)."""
    return os.environ.get("TALLER_SOURCEMAPS") == "1" or not name.endswith(".map")


STOPPED = {"WorkshopConfig"}  # in the repo but without development: skipped when no plugin is named
BUILD_MODE = {}  # plugin id -> mode (rapida | completa) of the DWC 3.6 build just made; archive() records it


def modo_36():
    """Mode of the DWC 3.6 (webpack) build: fast unless --completa / TALLER_BUILD_COMPLETO=1 or the fast config is missing."""
    return "completa" if MODO["completa"] or not os.path.isfile(RAPIDA_CFG) else "rapida"


def env_dwc_36():
    env = dict(os.environ)
    if modo_36() == "rapida":
        env["VUE_CLI_SERVICE_CONFIG_PATH"] = RAPIDA_CFG
    env["TALLER_DWC_SRC"] = DWC_SRC_36  # tools/vue.config.fast.js and the 3.6 test hooks read the clone from here
    return env


class dwc_lock:
    """Exclusive use of a shared DWC clone: the folder <clone>.lock is created with mkdir (atomic) and removed on exit, only if this
    process created it. Waits (TALLER_LOCK_WAIT seconds, default 1800) when another build holds it; never removes a foreign lock."""

    def __init__(self, clone):
        self.path = clone.rstrip("/\\") + ".lock"
        self.mine = False

    def __enter__(self):
        import time
        t0 = time.time()
        announced = False
        while True:
            try:
                os.mkdir(self.path)
                self.mine = True
                return self
            except FileExistsError:
                if time.time() - t0 > LOCK_WAIT_SECONDS:
                    sys.exit(f"{self.path} is held by another build for more than {LOCK_WAIT_SECONDS} s; not touching it")
                if not announced:
                    print(f"  waiting for {self.path} (another build uses this DWC clone)...")
                    announced = True
                time.sleep(5)

    def __exit__(self, *exc):
        if self.mine:
            try:
                os.rmdir(self.path)
            except OSError:
                pass
        return False


def modo_actual():
    # DWC 3.7 (Vite) has no fast variant: its build is always the full one
    if os.path.isfile(os.path.join(DWC_SRC, "vite.config.mts")):
        return "completa"
    return "completa" if MODO["completa"] or not os.path.isfile(RAPIDA_CFG) else "rapida"


def env_dwc():
    env = dict(os.environ)
    if modo_actual() == "rapida":
        env["VUE_CLI_SERVICE_CONFIG_PATH"] = RAPIDA_CFG
        env["TALLER_DWC_SRC"] = DWC_SRC
    return env


def git(*args, check=True):
    r = subprocess.run(["git", "-C", ROOT] + list(args), capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"git {' '.join(args)} fallo: {(r.stdout + r.stderr).strip()}")
    return r.stdout.strip()


def git_commit_label():
    sha = git("rev-parse", "--short", "HEAD", check=False) or "sin-git"
    dirty = git("status", "--porcelain", "--", *SOURCE_DIRS, check=False)
    return sha + ("+cambios" if dirty else "")


def _ids_in(base):
    if not os.path.isdir(base):
        return []
    return [d for d in os.listdir(base) if not d.startswith("_") and os.path.isfile(os.path.join(base, d, "plugin.json"))]


def all_ids():
    return sorted(set(_ids_in(SRC) + _ids_in(VUE)))  # a Vue folder wins over a src one with the same Id (see is_vue)


def is_vue(plugin_id):
    return os.path.isfile(os.path.join(VUE, plugin_id, "plugin.json"))


def has_36(plugin_id):
    """True if the Vue plugin carries the DWC 3.6 (Vue 2) side: vue/<Id>/dwc36/ with its plugin.json and dwc-src/."""
    d = os.path.join(VUE, plugin_id, "dwc36")
    return os.path.isfile(os.path.join(d, "plugin.json")) and os.path.isdir(os.path.join(d, "dwc-src"))


def plugin_dir(plugin_id):
    return os.path.join(VUE if is_vue(plugin_id) else SRC, plugin_id)


def manifest_path(plugin_id):
    return os.path.join(plugin_dir(plugin_id), "plugin.json")


def load_manifest(plugin_id):
    with open(manifest_path(plugin_id), encoding="utf-8") as f:
        manifest = json.load(f)
    if manifest.get("id") != plugin_id:
        sys.exit(f"{plugin_id}: plugin.json tiene id {manifest.get('id')!r}")
    # DWC compares dwcVersion/sbcDsfVersion component by component up to the
    # length of the shorter one (dwc-src/src/plugins/index.ts checkVersion): "3.6.3"
    # leaves the plugin incompatible with DWC 3.6.4. Only major.minor ("3.6").
    for campo in ("dwcVersion", "sbcDsfVersion"):
        v = manifest.get(campo)
        if v and len(str(v).split(".")) > 2:
            sys.exit(f"{plugin_id}: plugin.json {campo} {v!r}: usar solo mayor.menor (ej. '3.6') o DWC/DSF lo rechazan en la proxima version de parche")
    return manifest


def bump(plugin_id, part, message):
    manifest = load_manifest(plugin_id)
    old = manifest.get("version", "0.0.0")
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", old)
    if not m:
        sys.exit(f"{plugin_id}: version {old!r} no es X.Y.Z")
    major, minor, patch = map(int, m.groups())
    if part == "major":
        major, minor, patch = major + 1, 0, 0
    elif part == "minor":
        minor, patch = minor + 1, 0
    else:
        patch += 1
    new = f"{major}.{minor}.{patch}"
    manifest["version"] = new
    with open(manifest_path(plugin_id), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    if is_vue(plugin_id) and has_36(plugin_id):
        # the DWC 3.6 manifest of a Vue plugin carries the same version (tests/lines-divergence.test.js)
        p36 = os.path.join(VUE, plugin_id, "dwc36", "plugin.json")
        with open(p36, encoding="utf-8") as f:
            m36 = json.load(f)
        m36["version"] = new
        with open(p36, "w", encoding="utf-8", newline="\n") as f:
            json.dump(m36, f, indent=2, ensure_ascii=False)
            f.write("\n")

    log_path = os.path.join(plugin_dir(plugin_id), "CHANGELOG.md")
    prev = ""
    if os.path.exists(log_path):
        with open(log_path, encoding="utf-8") as f:
            prev = f.read()
    head = f"# {plugin_id} -- historial de versiones\n\n"
    if prev.startswith(head):
        prev = prev[len(head):]
    entry = f"## {new} -- {datetime.date.today().isoformat()}\n\n- {message}\n\n"
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(head + entry + prev)
    print(f"{plugin_id}: version {old} -> {new}")
    return new


def build(plugin_id):
    pdir = os.path.join(SRC, plugin_id)
    manifest = load_manifest(plugin_id)
    own = sorted(n for n in os.listdir(pdir) if n.endswith(".js"))
    if not own:
        sys.exit(f"{plugin_id}: no hay archivos .js en {pdir}")
    # src/_shared/*.js goes first in ALL the plugins (common utilities and
    # the window.__taller registry through which the bar finds the panels).
    shared = sorted(n for n in os.listdir(SHARED) if n.endswith(".js")) if os.path.isdir(SHARED) and not standalone(plugin_id) else []
    parts = [os.path.join(SHARED, n) for n in shared]
    for d in incluidos(plugin_id):
        parts += [os.path.join(d, n) for n in sorted(n for n in os.listdir(d) if n.endswith(".js"))]
    parts += [os.path.join(pdir, n) for n in own]

    version = manifest.get("version", "0.0.0")
    commit = git_commit_label()
    body = (
        f'\n      var PLUGIN_ID = "{plugin_id}";\n'
        f'      var PLUGIN_VERSION = "{version}";\n'
        f'      var PLUGIN_COMMIT = "{commit}";\n'
        "      // run-time guard: this build is for DWC 3.6 only (tools/release_zips.py)\n"
        "      " + release_zips.guard_inline(plugin_id, "3.6") + "\n"
    )
    # i18nT(): texts that were moved to src/<folder>/i18n/es.json. A plugin that is not built with the
    # official pipeline yet (no _official.txt) gets the Spanish texts embedded, so it keeps working
    # exactly as before (the old DOM layer still translates them to English).
    body += (
        "\n      var __TT = " + json.dumps(_merge_i18n(plugin_id, "es"), ensure_ascii=False) + ";\n"
        "      var i18nT = function (key, params) {\n"
        "        var v = String(key).split('.').reduce(function (o, k) { return o && o[k]; }, __TT);\n"
        "        if (typeof v !== 'string') return key;\n"
        "        return params ? v.replace(/\\{(\\w+)\\}/g, function (m, n) { return params[n] != null ? params[n] : m; }) : v;\n"
        "      };\n"
    )
    for path in parts:
        with open(path, encoding="utf-8") as f:
            body += f"\n/* ---- {os.path.relpath(path, SRC)} ---- */\n" + f.read()

    js = WRAPPER_HEAD.format(id=plugin_id, version=version, commit=commit) + body + WRAPPER_TAIL.format(id=plugin_id)
    digest = hashlib.sha256(js.encode("utf-8")).hexdigest()[:8]
    js_rel = f"js/{plugin_id}.{digest}.js"

    manifest["dwcFiles"] = [js_rel]
    # own backend (src/<Id>/dsf/, e.g. WorkshopVision): it goes in dsf/ of the zip and
    # is listed in dsfFiles; plugin.json declares sbcExecutable and its permissions
    dsf_dir = os.path.join(pdir, "dsf")
    dsf_files = []
    if os.path.isdir(dsf_dir):
        for raiz, dirs, archivos in os.walk(dsf_dir):
            dirs[:] = [x for x in dirs if x != "__pycache__"]
            for n in sorted(archivos):
                if n.endswith((".pyc", ".log")):
                    continue
                dsf_files.append(os.path.relpath(os.path.join(raiz, n), dsf_dir).replace(os.sep, "/"))
        manifest["dsfFiles"] = sorted(dsf_files)
    sd_files = sd_file_list(plugin_id)
    manifest["sdFiles"] = sd_files
    os.makedirs(DIST, exist_ok=True)
    zip_path = os.path.join(DIST, f"{plugin_id}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("plugin.json", json.dumps(manifest, indent=2, ensure_ascii=False))
        z.writestr("dwc/" + js_rel, js)
        for rel in sd_files:
            with open(sd_path(plugin_id, rel), "rb") as f:
                z.writestr("sd/" + rel, f.read())
        for rel in dsf_files:
            with open(os.path.join(dsf_dir, rel), "rb") as f:
                z.writestr("dsf/" + rel, f.read())
    extra = f" + {len(sd_files)} macros en sd/" if sd_files else ""
    extra += f" + backend dsf/ ({len(dsf_files)} archivos)" if dsf_files else ""
    print(f"{plugin_id} {version} ({commit}): {js_rel} ({len(js)} bytes, {len(parts)} archivos){extra}")
    return zip_path, version


def build_37(plugin_id):
    """Zip for DWC 3.7 from the same sources: plain IIFE in dwc/js/, texts registered with DWC.registerPluginMessages,
    manifest dwcVersion 3.7. Output: dist/37/<Id>.zip (never the 3.6 dist/<Id>.zip)."""
    pdir = os.path.join(SRC, plugin_id)
    manifest = load_manifest(plugin_id)
    own = sorted(n for n in os.listdir(pdir) if n.endswith(".js"))
    if not own:
        sys.exit(f"{plugin_id}: no hay archivos .js en {pdir}")
    shared = sorted(n for n in os.listdir(SHARED) if n.endswith(".js")) if os.path.isdir(SHARED) and not standalone(plugin_id) else []
    parts = [os.path.join(SHARED, n) for n in shared]
    for d in incluidos(plugin_id):
        parts += [os.path.join(d, n) for n in sorted(n for n in os.listdir(d) if n.endswith(".js"))]
    parts += [os.path.join(pdir, n) for n in own]

    version = manifest.get("version", "0.0.0")
    commit = git_commit_label()
    # vue-i18n 11 reads "|" and "@" as syntax: same escaping the Vue plugins get (review #9)
    messages = {lang: i18n_escape_tree(_merge_i18n(plugin_id, lang)) for lang in ("es", "en")}
    body = (
        f'\n    var PLUGIN_ID = "{plugin_id}";\n'
        f'    var PLUGIN_VERSION = "{version}";\n'
        f'    var PLUGIN_COMMIT = "{commit}";\n'
        "    // run-time guard: this build is for DWC 3.7.x only (tools/release_zips.py)\n"
        "    " + release_zips.guard_inline(plugin_id, "3.7") + "\n"
        "    // texts: plugins.<Id>.<area>.<key> in DWC's shared vue-i18n instance\n"
        "    DWC.registerPluginMessages(PLUGIN_ID, " + json.dumps(messages, ensure_ascii=False) + ");\n"
        "    var i18nT = function (key, params) { return DWC.i18n.global.t('plugins.' + PLUGIN_ID + '.' + key, params || {}); };\n"
    )
    data = plugin_data(plugin_id)
    if data:
        body += "    var PLUGIN_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    for path in parts:
        with open(path, encoding="utf-8") as f:
            body += f"\n/* ---- {os.path.relpath(path, SRC)} ---- */\n" + f.read()
    js = IIFE_HEAD.format(id=plugin_id, version=version, commit=commit) + body + IIFE_TAIL.format(id=plugin_id)
    digest = hashlib.sha256(js.encode("utf-8")).hexdigest()[:8]
    js_rel = f"js/{plugin_id}.{digest}.js"

    manifest["dwcVersion"] = "3.7"
    manifest["dwcFiles"] = [js_rel]
    dsf_dir = os.path.join(pdir, "dsf")
    dsf_files = []
    if os.path.isdir(dsf_dir):
        for raiz, dirs, archivos in os.walk(dsf_dir):
            dirs[:] = [x for x in dirs if x != "__pycache__"]
            for n in sorted(archivos):
                if not n.endswith((".pyc", ".log")):
                    dsf_files.append(os.path.relpath(os.path.join(raiz, n), dsf_dir).replace(os.sep, "/"))
        manifest["dsfFiles"] = sorted(dsf_files)
    sd_files = sd_file_list(plugin_id)
    manifest["sdFiles"] = sd_files
    out_dir = os.path.join(DIST, "37")
    os.makedirs(out_dir, exist_ok=True)
    zip_path = os.path.join(out_dir, f"{plugin_id}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("plugin.json", json.dumps(manifest, indent=2, ensure_ascii=False))
        z.writestr("dwc/" + js_rel, js)
        for rel in sd_files:
            with open(sd_path(plugin_id, rel), "rb") as f:
                z.writestr("sd/" + rel, f.read())
        for rel in dsf_files:
            with open(os.path.join(dsf_dir, rel), "rb") as f:
                z.writestr("dsf/" + rel, f.read())
    print(f"{plugin_id} {version} ({commit}) [DWC 3.7]: {js_rel} ({len(js)} bytes, {len(parts)} archivos) -> {zip_path}")
    return zip_path, version


def _universal_zip_module():
    """tools/universal_zip.py (the merge of a DWC 3.6 zip and a DWC 3.7 zip into one; see docs-internal/UNIVERSAL-ZIP.md)."""
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    try:
        import universal_zip
    finally:
        sys.path.pop(0)
    return universal_zip


def build_universal(plugin_id):
    """One zip for DWC 3.6 AND 3.7: the 3.6 build and the 3.7 build merged by tools/universal_zip.py into dist/<Id>.zip (dwcVersion "3").
    JS plugin: the 3.6 wrapper (build(), no DWC clone needed) and the 3.7 IIFE (build_37). Vue plugin: webpack build of vue/<Id>/dwc36/
    (build_vue_36) and Vite build of vue/<Id>/dwc-src/ (build_vue_37). The two line zips stay in dist/lines/."""
    lines = os.path.join(DIST, "lines")
    os.makedirs(lines, exist_ok=True)
    if is_vue(plugin_id):
        if not has_36(plugin_id):
            sys.exit(f"{plugin_id}: no DWC 3.6 sources (vue/{plugin_id}/dwc36/ is missing), no universal zip")
        z36, version = build_vue_36(plugin_id)
    else:
        # the _official.txt plugins register their i18n catalogs (plugins.<Id>.*) with DWC 3.6 only through the official pipeline
        # (build_js_oficial); the plain wrapper (build) leaves every registerRoute caption a raw key on 3.6
        z36, version = build_js_oficial(plugin_id) if oficial(plugin_id) else build(plugin_id)
    p36 = os.path.join(lines, f"{plugin_id}-dwc3.6.zip")
    shutil.move(z36, p36)
    z37, _ = build_vue_37(plugin_id) if is_vue(plugin_id) else build_37(plugin_id)
    p37 = os.path.join(lines, f"{plugin_id}-dwc3.7.zip")
    shutil.copyfile(z37, p37)
    out = os.path.join(DIST, f"{plugin_id}.zip")
    _universal_zip_module().combine(p36, p37, out)
    print(f"{plugin_id} {version}: universal DWC 3.6 + 3.7 -> {out}")
    return out, version


RELEASE = os.path.join(DIST, "release")


def build_line(plugin_id, line):
    """The STRICT zip of one DWC line (docs/DWC-LINES.md): dist/<line>/<Id>.zip, dwcVersion exactly "<line>" (sbcDsfVersion too where the
    plugin has an SBC part), only the code of that line, no source maps, .gz companions of the big bundles. 3.6 uses the official 3.6
    pipeline where required (_official.txt JS plugins, every Vue plugin); 3.7 the IIFE / Vite builds."""
    if line == "3.6":
        raw, version = build_vue_36(plugin_id) if is_vue(plugin_id) else (build_js_oficial(plugin_id) if oficial(plugin_id) else build(plugin_id))
    else:
        raw, version = build_vue_37(plugin_id) if is_vue(plugin_id) else build_37(plugin_id)
    out = os.path.join(DIST, line, f"{plugin_id}.zip")
    release_zips.finalize_zip(raw, out, line)
    return out, version


def build_release(plugin_id, reuse=False):
    """Both strict zips of a plugin into dist/release/<Id>-<version>-dwc3.6.zip and -dwc3.7.zip (the files that get installed or published).
    reuse: no compiling, finalize the zips already in dist/3.6 and dist/3.7 again."""
    os.makedirs(RELEASE, exist_ok=True)
    out = []
    for line in release_zips.LINES:
        if reuse:
            zp, version = os.path.join(DIST, line, f"{plugin_id}.zip"), load_manifest(plugin_id).get("version", "0.0.0")
            if not os.path.isfile(zp):
                sys.exit(f"{plugin_id}: no {zp} to reuse")
            release_zips.finalize_zip(zp, zp, line)
        else:
            zp, version = build_line(plugin_id, line)
        dest = os.path.join(RELEASE, release_zips.release_name(plugin_id, version, line))
        shutil.copyfile(zp, dest)
        out.append(dest)
        print(f"  {os.path.relpath(dest, ROOT)} ({os.path.getsize(dest) // 1024} KB)")
        archive_line(plugin_id, dest)
    if not reuse:  # how these zips were compiled: --github-release --publish only accepts 'completa'
        with open(os.path.join(RELEASE, f"{plugin_id}-{version}.modo"), "w") as f:
            f.write("completa" if MODO.get("completa") else "rapida")
    return out


def archive_line(plugin_id, zip_path):
    """releases/<Id>/<Id>-<version>-dwc3.6.zip / -dwc3.7.zip: the strict zip of each line, for --rollback ('<version>-dwc3.6' is the version
    argument). Like archive(), an existing file is the published one and is never replaced."""
    d = os.path.join(RELEASES, plugin_id)
    os.makedirs(d, exist_ok=True)
    dest = os.path.join(d, os.path.basename(zip_path))
    if os.path.exists(dest):
        return dest
    shutil.copyfile(zip_path, dest)
    return dest


def changelog_section(plugin_id, version):
    """The CHANGELOG.md lines of one version (the '## <version> -- date' block), or '' when there is none."""
    for d in SOURCE_DIRS:
        p = os.path.join(ROOT, d, plugin_id, "CHANGELOG.md")
        if os.path.isfile(p):
            text = open(p, encoding="utf-8").read()
            m = re.search(r"^## " + re.escape(version) + r"[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
            return m.group(1).strip() if m else ""
    return ""


def cmd_github_release(ids, publish):
    """--github-release: one GitHub Release per plugin and version on jhonf441/<Id> with both strict zips and SHA256SUMS.txt.
    Default is a dry run: it writes the notes to dist/github-release/ and prints the gh commands. --publish runs them, only for zips compiled
    with --completa that pass --check-release, and never replaces a release that exists."""
    ids = ids or [i for i in all_ids() if i not in STOPPED]
    out = os.path.join(DIST, "github-release")
    os.makedirs(out, exist_ok=True)
    if publish and cmd_check_release(ids):
        sys.exit("--check-release found problems: nothing is published")
    sums = os.path.join(RELEASE, "SHA256SUMS.txt")
    for pid in ids:
        version = load_manifest(pid).get("version", "0.0.0")
        zips = [os.path.join(RELEASE, release_zips.release_name(pid, version, line)) for line in release_zips.LINES]
        missing = [z for z in zips if not os.path.isfile(z)]
        if missing:
            sys.exit(f"{pid}: missing {', '.join(os.path.basename(z) for z in missing)} (python build.py --dwc both {pid} --completa)")
        tag, repo = f"v{version}", f"jhonf441/{pid}"  # one repository per plugin: the tag is just the version
        notes = os.path.join(out, f"{pid}-{version}.md")
        body = changelog_section(pid, version) or "(no changelog entry for this version)"
        with open(notes, "w", encoding="utf-8") as f:
            f.write(body + "\n\n")
            f.write(f"Which zip: `{pid}-{version}-dwc3.6.zip` for DuetWebControl / DSF 3.6.x, `{pid}-{version}-dwc3.7.zip` for 3.7.x. ")
            f.write("DWC refuses the zip of the other line. Install it in Settings > Plugins. SHA-256 sums: SHA256SUMS.txt.\n")
        cmd = ["gh", "release", "create", tag, *zips, sums, "--repo", repo, "--title", f"{pid} {version}", "--notes-file", notes]
        print(f"{pid} {version}: " + " ".join(cmd))
        if not publish:
            continue
        mode_file = os.path.join(RELEASE, f"{pid}-{version}.modo")
        if not os.path.isfile(mode_file) or open(mode_file).read().strip() != "completa":
            sys.exit(f"{pid}: the zips were not compiled with --completa: rebuild (python build.py --dwc both {pid} --completa) before publishing")
        if subprocess.run(["gh", "release", "view", tag, "--repo", repo], capture_output=True).returncode == 0:
            print(f"  ({tag} already exists on {repo}: not touched)")
            continue
        subprocess.run(cmd, check=True)
    if not publish:
        print("(dry run: nothing was published; add --publish to create these releases)")
    return 0


def cmd_check_release(ids):
    """--check-release: verifies every strict zip of dist/release (see tools/release_zips.py check_zip). Returns the exit code."""
    perms = release_zips._sbc_permissions(DWC_SRC_36)
    ids = ids or [i for i in all_ids() if i not in STOPPED]
    bad = 0
    print(f"{'zip':<52} {'zip KB':>7} {'js KB':>7}  result")

    def show(name, problems, info):
        nonlocal bad
        print(f"{name:<52} {info.get('zip_bytes', 0) // 1024:>7} {info.get('js_bytes', 0) // 1024:>7}  " + ("ok" if not problems else "FAIL"))
        for p in problems:
            print("    - " + p)
        bad += bool(problems)

    for pid in ids:
        version = load_manifest(pid).get("version", "0.0.0")
        for line in release_zips.LINES:
            path = os.path.join(RELEASE, release_zips.release_name(pid, version, line))
            if not os.path.isfile(path):
                print(f"{os.path.basename(path):<52} {'-':>7} {'-':>7}  MISSING")
                bad += 1
                continue
            problems, info = release_zips.check_zip(path, line, pid, version, official=(not is_vue(pid) and oficial(pid) and line == "3.6"), perms=perms, standalone=(not is_vue(pid) and standalone(pid)))
            show(os.path.basename(path), problems, info)
    if os.path.isdir(RELEASE):
        # service zips, when they were copied next to the plugins (they are built by WorkshopService tools/build_release.py)
        for n in sorted(os.listdir(RELEASE)):
            m = re.fullmatch(r"WorkshopService-(\d+\.\d+\.\d+)-dwc(3\.[67])\.zip", n)
            if m:
                problems, info = release_zips.check_zip(os.path.join(RELEASE, n), m.group(2), "WorkshopService", m.group(1), perms=perms)
                show(n, problems, info)
        for n in sorted(os.listdir(RELEASE)):
            m = re.fullmatch(r"(Workshop\w+?)-(\d+\.\d+\.\d+)-dwc3\.[67]\.zip", n)
            if m and m.group(1) in ids and m.group(2) != load_manifest(m.group(1)).get("version"):
                print(f"  note: {n} is not the source version (stale, not checked)")
        for p in release_zips.check_sums(RELEASE):
            print("  - " + p)
            bad += 1
    print("release check: " + ("FAILED (%d)" % bad if bad else "all clean"))
    return 1 if bad else 0


def standalone(plugin_id):
    """True if the plugin carries no src/_shared code (marker file src/<Id>/_standalone.txt): a tiny plugin that needs only the
    DWC 3.7 public surface (window.DWC) and must not ship the 360 KB of shared helpers in both of its bundles."""
    return os.path.isfile(os.path.join(SRC, plugin_id, "_standalone.txt"))


def plugin_data(plugin_id):
    """JSON files of src/<Id>/data/ (subfolders too, key "sub/name") as {name: parsed}: static data the DWC 3.7 bundle embeds as PLUGIN_DATA (the 3.6 bundle does not)."""
    d = os.path.join(SRC, plugin_id, "data")
    out = {}
    for root, _dirs, files in os.walk(d):
        for n in sorted(files):
            if n.endswith(".json"):
                rel = os.path.relpath(os.path.join(root, n), d).replace(os.sep, "/")
                with open(os.path.join(root, n), encoding="utf-8") as f:
                    out[rel[:-5]] = json.load(f)
    return dict(sorted(out.items()))


def incluidos(plugin_id):
    """Folders of src/ that this plugin includes (src/<Id>/_includes.txt)."""
    f = os.path.join(plugin_dir(plugin_id), "_includes.txt")
    if not os.path.isfile(f):
        return []
    out = []
    for linea in open(f, encoding="utf-8"):
        linea = linea.split("#", 1)[0].strip()
        if linea:
            d = os.path.join(SRC, linea)
            if not os.path.isdir(d):
                sys.exit(f"{plugin_id}: _includes.txt nombra {linea}, que no existe en src/")
            out.append(d)
    return out


def sd_bases(plugin_id):
    """sd/ folders of the plugin: first the included ones, the plugin's own last (it wins)."""
    return [os.path.join(d, "sd") for d in incluidos(plugin_id)] + [os.path.join(plugin_dir(plugin_id), "sd")]


def sd_path(plugin_id, rel):
    """Real file of a macro (the plugin's if it has it, otherwise the included one)."""
    for base in reversed(sd_bases(plugin_id)):
        p = os.path.join(base, rel)
        if os.path.isfile(p):
            return p
    return os.path.join(sd_bases(plugin_id)[-1], rel)


def sd_file_list(plugin_id):
    out = set()
    for base in sd_bases(plugin_id):
        for root, _dirs, files in os.walk(base):
            for n in files:
                out.add(os.path.relpath(os.path.join(root, n), base).replace(os.sep, "/"))
    return sorted(out)


def pi_shell(cmd, check=True):
    # Runs a shell command on the Pi (local if we are already on the Pi).
    if LOCAL:
        r = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
    else:
        r = subprocess.run(["ssh", SSH_HOST, cmd], capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"Fallo en la Pi: {cmd[:120]}...\n{(r.stdout + r.stderr).strip()}")
    return r.stdout


def _md5_lines(text):
    out = {}
    for line in text.splitlines():
        parts = line.split(None, 1)
        if len(parts) == 2:
            out[parts[1].strip()] = parts[0]
    return out


def sd_live_md5(files):
    if not files:
        return {}
    q = " ".join(shlex.quote(f) for f in files)
    return _md5_lines(pi_shell(f"cd /opt/dsf/sd && md5sum -- {q} 2>/dev/null; true"))


def sd_zip_md5_on_pi(zip_on_pi, files):
    # md5 of sd/<f> inside a zip that is on the Pi (version installed before).
    py = (
        "import zipfile,hashlib,sys\n"
        "try:\n z=zipfile.ZipFile(sys.argv[1])\nexcept Exception:\n sys.exit(0)\n"
        "names=set(z.namelist())\n"
        "for f in sys.argv[2:]:\n"
        " n='sd/'+f\n"
        " if n in names: print(hashlib.md5(z.read(n)).hexdigest(), f)\n"
    )
    q = " ".join(shlex.quote(f) for f in files)
    return _md5_lines(pi_shell(f"python3 -c {shlex.quote(py)} {shlex.quote(zip_on_pi)} {q}", check=False))


def ensure_sd_writable(files):
    # DSF (user "dsf") has to be able to WRITE each macro it installs;
    # otherwise the install fails halfway and leaves the plugin
    # uninstalled (it happened with macros/power/shutdown-after-job.g, owned
    # by the Pi's user with 644). Existing files: if they are ours, they are
    # given g+w and group dsf; if that is not possible, it is not installed. New files:
    # the folder (or the first one that exists going up) has to be
    # writable by dsf.
    py = """
import os, sys, pwd, grp
me = pwd.getpwuid(os.getuid()).pw_name
dsf_gid = grp.getgrnam("dsf").gr_gid
bad = []
def ok(p):
    st = os.stat(p)
    own = pwd.getpwuid(st.st_uid).pw_name
    return (own == "dsf" and st.st_mode & 0o200) or (st.st_gid == dsf_gid and st.st_mode & 0o020)
for f in sys.argv[1:]:
    p = "/opt/dsf/sd/" + f
    if os.path.exists(p):
        if ok(p):
            continue
        if pwd.getpwuid(os.stat(p).st_uid).pw_name == me:
            os.chown(p, -1, dsf_gid)
            os.chmod(p, os.stat(p).st_mode | 0o020)
            print("arreglado", f)
            continue
        bad.append(f)
    else:
        d = os.path.dirname(p)
        while not os.path.exists(d):
            d = os.path.dirname(d)
        if not ok(d):
            bad.append(f + " (carpeta " + d + ")")
for b in bad:
    print("NO", b)
"""
    q = " ".join(shlex.quote(f) for f in files)
    out = pi_shell(f"python3 -c {shlex.quote(py)} {q}")
    fixed = [l[10:] for l in out.splitlines() if l.startswith("arreglado ")]
    bad = [l[3:] for l in out.splitlines() if l.startswith("NO ")]
    if fixed:
        print(f"  permisos corregidos (g+w, grupo dsf): {', '.join(fixed)}")
    if bad:
        sys.exit(
            "NO se instalo: DSF no podria escribir estas macros (y un install fallido deja el plugin "
            "desinstalado):\n  " + "\n  ".join(bad) + "\nDales permiso de escritura al grupo dsf y reintenta."
        )


def check_sd_before_install(plugin_id, zip_path, force):
    # See the big comment at the beginning of the file ("Macros on the SD").
    with zipfile.ZipFile(zip_path) as z:
        files = json.loads(z.read("plugin.json")).get("sdFiles") or []
        new = {f: hashlib.md5(z.read("sd/" + f)).hexdigest() for f in files}
    if not files:
        return
    ensure_sd_writable(files)
    live = sd_live_md5(files)
    prev_ver = installed_versions().get(plugin_id)
    prev = {}
    if prev_ver:
        home_rel = f"{PI_RELEASES}/{plugin_id}/{plugin_id}-{prev_ver}.zip"
        prev = sd_zip_md5_on_pi(home_rel if not LOCAL else os.path.join(RELEASES, plugin_id, f"{plugin_id}-{prev_ver}.zip"), files)
    overwrite = [f for f in files if f in live and live[f] != new[f]]
    conflicts = [f for f in overwrite if prev.get(f) != live[f]]
    if conflicts and not force:
        sys.exit(
            f"{plugin_id}: NO se instalo. Estas macros se editaron directo en la SD (distintas del repo y de la "
            f"version instalada {prev_ver or '?'}):\n  "
            + "\n  ".join(conflicts)
            + f"\nTraelas al repo con: python build.py --pull-sd {plugin_id}  (revisa el diff y commitea)"
            "\no pisalas con --force-sd (igual quedan respaldadas)."
        )
    if overwrite:
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = f"$HOME/sd-backup/{plugin_id}-{stamp}"
        q = " ".join(shlex.quote(f) for f in overwrite)
        pi_shell(f"mkdir -p {dest} && cd /opt/dsf/sd && cp --parents -- {q} {dest}/")
        print(f"  macros que se reemplazan: {', '.join(overwrite)} (respaldo en ~/sd-backup/{plugin_id}-{stamp}/)")
        if conflicts:
            print(f"  (--force-sd: se pisaron cambios hechos en la SD: {', '.join(conflicts)})")


def cmd_pull_sd(plugin_id):
    # Brings into the repo the sd/ macros as they are now on the SD.
    files = sd_file_list(plugin_id)
    if not files:
        sys.exit(f"{plugin_id} no tiene carpeta sd/")
    q = " ".join(shlex.quote(f) for f in files)
    if LOCAL:
        data = subprocess.run(["bash", "-c", f"cd /opt/dsf/sd && tar cf - -- {q}"], capture_output=True).stdout
    else:
        data = subprocess.run(["ssh", SSH_HOST, f"cd /opt/dsf/sd && tar cf - -- {q}"], capture_output=True).stdout
    import io
    import tarfile

    changed = []
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        for m in t.getmembers():
            if not m.isfile():
                continue
            content = t.extractfile(m).read()
            path = sd_path(plugin_id, m.name)
            old = open(path, "rb").read() if os.path.exists(path) else None
            if old != content:
                with open(path, "wb") as f:
                    f.write(content)
                changed.append(m.name)
    print(f"{plugin_id}: {len(changed)} macros traidas de la SD" + (": " + ", ".join(changed) if changed else " (ya estaban iguales)"))
    if changed:
        print("  Revisa con 'git diff' y commitea antes de la proxima version.")


def oficial(plugin_id):
    """True if this hand-written JS plugin is built with the official DWC pipeline
    (marker file src/<Id>/_official.txt): its code is wrapped in a dwc-src/index.js module
    and compiled by build-plugin.js, with the official localization (plugins.<Id>.*)."""
    return os.path.isfile(os.path.join(SRC, plugin_id, "_official.txt"))


def _merge_i18n(plugin_id, lang):
    """Merges <folder>/i18n/<lang>.json of _shared, the included folders and the plugin itself
    (each folder owns its top-level areas; a repeated area is an error)."""
    out = {}
    folders = ([] if standalone(plugin_id) else [SHARED]) + incluidos(plugin_id) + [os.path.join(SRC, plugin_id)]
    for d in folders:
        f = os.path.join(d, "i18n", lang + ".json")
        if not os.path.isfile(f):
            continue
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        for area, val in data.items():
            if area in out:
                sys.exit(f"{plugin_id}: el area i18n {area!r} esta repetida ({f})")
            out[area] = val
    return out


JS_INDEX_HEAD = """import './i18n-register.js'
import i18n from '../../i18n'
import * as __routes from '../../routes'

/* {id} {version} ({commit}) -- generated by build.py, DO NOT edit: the source is in src/{id}/ */
try {{
  (function () {{
    "use strict";
    var PLUGIN_ID = "{id}";
    var PLUGIN_VERSION = "{version}";
    var PLUGIN_COMMIT = "{commit}";
    // run-time guard: this build is for DWC 3.6 only (tools/release_zips.py)
    {guard}
    // texts of the plugin: plugins.<Id>.<area>.<key> (src/<folder>/i18n/es.json, en.json)
    var i18nT = function (key, params) {{ return i18n.t("plugins." + PLUGIN_ID + "." + key, params); }};
    // the hand-written code asked the DWC bundle for its router: same module, imported properly
    var __webpack_require__ = function (id) {{
      if (id === "./src/routes/index.ts") return __routes;
      throw new Error("unsupported require: " + id);
    }};
"""
JS_INDEX_TAIL = """
  }})();
}} catch (e) {{
  // An exception while starting must never reach DWC (it would disable the plugin).
  console.error("[{id}] error starting the plugin:", e);
}}
"""


def build_js_oficial(plugin_id):
    if not os.path.isfile(os.path.join(DWC_SRC_36, "scripts", "build-plugin.js")):
        sys.exit(f"{plugin_id}: necesita el clon de DuetWebControl 3.6 en {DWC_SRC_36} (variable TALLER_DWC_SRC_36)")
    pdir = os.path.join(SRC, plugin_id)
    manifest = load_manifest(plugin_id)
    version = manifest.get("version", "0.0.0")
    commit = git_commit_label()
    own = sorted(n for n in os.listdir(pdir) if n.endswith(".js"))
    if not own:
        sys.exit(f"{plugin_id}: no hay archivos .js en {pdir}")
    shared = sorted(n for n in os.listdir(SHARED) if n.endswith(".js")) if os.path.isdir(SHARED) and not standalone(plugin_id) else []
    parts = [os.path.join(SHARED, n) for n in shared]
    for d in incluidos(plugin_id):
        parts += [os.path.join(d, n) for n in sorted(n for n in os.listdir(d) if n.endswith(".js"))]
    parts += [os.path.join(pdir, n) for n in own]

    stage = os.path.join(DIST, "stage", plugin_id)
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(os.path.join(stage, "dwc-src", "i18n"))
    code = JS_INDEX_HEAD.format(id=plugin_id, version=version, commit=commit, guard=release_zips.guard_inline(plugin_id, "3.6"))
    for path in parts:
        with open(path, encoding="utf-8") as f:
            code += f"\n/* ---- {os.path.relpath(path, SRC)} ---- */\n" + f.read()
    code += JS_INDEX_TAIL.format(id=plugin_id)
    with open(os.path.join(stage, "dwc-src", "index.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(code)
    langs = {}
    for lang in ("es", "en"):
        langs[lang] = _merge_i18n(plugin_id, lang)
        with open(os.path.join(stage, "dwc-src", "i18n", lang + ".json"), "w", encoding="utf-8") as f:
            json.dump(langs[lang], f, ensure_ascii=False, indent="\t")
    with open(os.path.join(stage, "dwc-src", "i18n-register.js"), "w", encoding="utf-8") as f:
        f.write(
            "// Official DWC plugin localization: plugins." + plugin_id + ".* (generated by build.py)\n"
            "import { registerPluginLocalization } from '../../i18n'\n"
            "import es from './i18n/es.json'\nimport en from './i18n/en.json'\n\n"
            "registerPluginLocalization('" + plugin_id + "', 'es', es)\n"
            "registerPluginLocalization('" + plugin_id + "', 'en', en)\n"
        )
    sd_files = sd_file_list(plugin_id)
    dsf_dir = os.path.join(pdir, "dsf")
    dsf_files = []
    if os.path.isdir(dsf_dir):
        for raiz, dirs, archivos in os.walk(dsf_dir):
            dirs[:] = [x for x in dirs if x != "__pycache__"]
            for n in sorted(archivos):
                if not n.endswith((".pyc", ".log")):
                    dsf_files.append(os.path.relpath(os.path.join(raiz, n), dsf_dir).replace(os.sep, "/"))
    m = {k: v for k, v in manifest.items() if k not in ("dwcFiles", "sdFiles", "dsfFiles")}
    with open(os.path.join(stage, "plugin.json"), "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2, ensure_ascii=False)

    out = os.path.join(DWC_SRC_36, "dist", f"{plugin_id}-{version}.zip")
    BUILD_MODE[plugin_id] = modo_36()
    print(f"{plugin_id} {version} ({commit}) [DWC 3.6]: compilando con DWC en {DWC_SRC_36} (modo {modo_36()})...")
    with dwc_lock(DWC_SRC_36):
        if os.path.exists(out):
            os.remove(out)
        r = subprocess.run(["node", "scripts/build-plugin.js", stage], cwd=DWC_SRC_36, capture_output=True, text=True, env=env_dwc_36())
        if r.returncode != 0 or not os.path.exists(out):
            print((r.stdout + r.stderr)[-3000:])
            sys.exit(f"{plugin_id}: fallo el build de DWC 3.6")
        with open(out, "rb") as f:
            built_bytes = f.read()
    os.makedirs(DIST, exist_ok=True)
    zip_path = os.path.join(DIST, f"{plugin_id}.zip")
    with zipfile.ZipFile(io.BytesIO(built_bytes)) as zin, zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if not keep_in_zip(item.filename):
                continue
            data = zin.read(item.filename)
            if item.filename == "plugin.json":
                pj = json.loads(data.decode("utf-8"))
                pj["sdFiles"] = sd_files
                if dsf_files:
                    pj["dsfFiles"] = sorted(dsf_files)
                data = json.dumps(pj, indent=2, ensure_ascii=False).encode("utf-8")
            zout.writestr(item, data)
        for rel in sd_files:
            with open(sd_path(plugin_id, rel), "rb") as f:
                zout.writestr("sd/" + rel, f.read())
        for rel in dsf_files:
            with open(os.path.join(dsf_dir, rel), "rb") as f:
                zout.writestr("dsf/" + rel, f.read())
    with zipfile.ZipFile(zip_path) as z:
        js = [n for n in z.namelist() if n.startswith("dwc/js/") and n.endswith(".js")]
    print("  " + ", ".join(j[4:] for j in js) + (f" + {len(sd_files)} macros en sd/" if sd_files else "") + (f" + backend dsf/ ({len(dsf_files)} archivos)" if dsf_files else ""))
    return zip_path, version


def _link_node_modules(stage):
    """stage/node_modules -> DWC_SRC/node_modules, so the npm packages DWC already has (chart.js) resolve while the plugin is
    bundled. Without a package.json in the stage, build-plugin.js installs nothing. Returns the function that removes the link
    (the target is never touched)."""
    link = os.path.join(stage, "node_modules")
    target = os.path.join(DWC_SRC, "node_modules")
    if os.name == "nt":
        r = subprocess.run(["cmd", "/c", "mklink", "/J", link, target], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit("no pude enlazar node_modules: " + (r.stdout + r.stderr).strip())
    else:
        os.symlink(target, link)

    def unlink():
        try:
            os.rmdir(link) if os.name == "nt" else os.unlink(link)
        except OSError:
            pass
    return unlink


def _vue_extras(plugin_id, built_zip, zip_path):
    """Copies the built zip to zip_path adding what DWC's build script does not know: the plugin's SD macros (sdFiles -- the 3.7
    pkg script lists sd/ as rrfFiles, but DSF reads sdFiles) and its DSF backend (dsfFiles)."""
    pdir = plugin_dir(plugin_id)
    sd_files = sd_file_list(plugin_id)
    dsf_dir = os.path.join(pdir, "dsf")
    dsf_files = []
    if os.path.isdir(dsf_dir):
        for raiz, dirs, archivos in os.walk(dsf_dir):
            dirs[:] = [x for x in dirs if x != "__pycache__"]
            for n in sorted(archivos):
                if not n.endswith((".pyc", ".log")):
                    dsf_files.append(os.path.relpath(os.path.join(raiz, n), dsf_dir).replace(os.sep, "/"))
    with zipfile.ZipFile(built_zip) as zin, zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if not keep_in_zip(item.filename):
                continue
            data = zin.read(item.filename)
            if item.filename == "plugin.json":
                pj = json.loads(data.decode("utf-8"))
                if sd_files:
                    pj["sdFiles"] = sd_files
                if dsf_files:
                    pj["dsfFiles"] = sorted(dsf_files)
                data = json.dumps(pj, indent=2, ensure_ascii=False).encode("utf-8")
            zout.writestr(item, data)
        for rel in sd_files:
            with open(sd_path(plugin_id, rel), "rb") as f:
                zout.writestr("sd/" + rel, f.read())
        for rel in dsf_files:
            with open(os.path.join(dsf_dir, rel), "rb") as f:
                zout.writestr("dsf/" + rel, f.read())
    return len(sd_files), len(dsf_files)


def i18n_escape(text):
    """vue-i18n 11 (DWC 3.7) reads '|' as the plural separator and '@' as a linked message; the catalogs of vue/ (and the svc area
    copied from the service) use both as plain text. In the staged catalogs they become the literal placeholders {'|'} and {'@'}
    (placeholders like {name} stay as they are)."""
    parts = re.split(r"(\{[^{}]*\})", text)
    return "".join(p if (p.startswith("{") and p.endswith("}")) else p.replace("|", "{'|'}").replace("@", "{'@'}") for p in parts)


def i18n_escape_tree(node):
    if isinstance(node, str):
        return i18n_escape(node)
    if isinstance(node, dict):
        return {k: i18n_escape_tree(v) for k, v in node.items()}
    if isinstance(node, list):
        return [i18n_escape_tree(v) for v in node]
    return node


def stage_vue(plugin_id, line="3.7", guard=True):
    """Stages vue/<Id> as a standalone DWC plugin dir: line 3.7 (default) in dist/stage/<Id> from vue/<Id>/ + vue/_shared, line 3.6 in
    dist/stage36/<Id> from vue/<Id>/dwc36/ + vue/_shared36. Everything of the shared folder is copied flat into dwc-src/, plugin-id.js is
    written and the shared i18n areas are merged into the plugin's catalogs (3.7 also escapes '|' and '@' for vue-i18n 11). sd/ and dsf/
    are left out (see _vue_extras). Returns the stage path. No DWC clone needed (tests use it)."""
    if line == "3.6":
        if not has_36(plugin_id):
            sys.exit(f"{plugin_id}: no DWC 3.6 sources (vue/{plugin_id}/dwc36/ is missing)")
        origin, shared_dir, stage_name, escape = os.path.join(VUE, plugin_id, "dwc36"), VUE_SHARED_36, "stage36", (lambda t: t)
    else:
        origin, shared_dir, stage_name, escape = plugin_dir(plugin_id), VUE_SHARED, "stage", i18n_escape_tree
    stage = os.path.join(DIST, stage_name, plugin_id)
    shutil.rmtree(stage, ignore_errors=True)
    shutil.copytree(origin, stage, ignore=shutil.ignore_patterns("CHANGELOG.md", "__pycache__", "*.pyc", "sd", "dsf", "test", "node_modules", "dwc36"))
    if os.path.isdir(shared_dir):
        for n in os.listdir(shared_dir):
            if os.path.isfile(os.path.join(shared_dir, n)):
                shutil.copyfile(os.path.join(shared_dir, n), os.path.join(stage, "dwc-src", n))
        # the shared pieces ask their texts as plugins.<Id>.shared.<key>: the id of the plugin being built and the shared catalogs
        with open(os.path.join(stage, "dwc-src", "plugin-id.js"), "w", encoding="utf-8", newline="\n") as f:
            f.write("export const PLUGIN_ID = " + json.dumps(plugin_id) + "\n")
        for lang in ("es", "en"):
            shared_f = os.path.join(shared_dir, "i18n", lang + ".json")
            own_f = os.path.join(stage, "dwc-src", "i18n", lang + ".json")
            if os.path.isfile(shared_f) and os.path.isfile(own_f):
                with open(shared_f, encoding="utf-8") as f:
                    shared_areas = json.load(f)
                with open(own_f, encoding="utf-8") as f:
                    own = json.load(f)
                for area, texts in shared_areas.items():
                    if area in own:
                        sys.exit(f"{plugin_id}: el area i18n {area!r} esta repetida ({shared_dir}/i18n y {own_f})")
                    own[area] = texts
                with open(own_f, "w", encoding="utf-8", newline="\n") as f:
                    json.dump(escape(own), f, ensure_ascii=False, indent="\t")
                    f.write("\n")
    if guard:  # the render tests stage without it: their fake host has no window.DWC.version
        release_zips.stage_guard(stage, plugin_id, line)
    return stage


def vue_sourcemap_env(environ):
    """Environment for DWC 3.7's build-plugin-pkg.js. A zip that goes to the machine must not carry .js.map source maps (they are served
    to anyone who opens the page). The 3.7 script keeps them out of the archive for stable versions ("hidden") but ships them for
    alpha/beta/rc or when DWC_SOURCEMAP is set in the shell, so it is pinned here: hidden (maps held back in the stage folder)
    unless TALLER_SOURCEMAP=1 asks for them."""
    env = dict(environ)
    env["DWC_SOURCEMAP"] = "1" if environ.get("TALLER_SOURCEMAP") == "1" else "hidden"
    return env


def zip_source_maps(names):
    """The .map files listed in a plugin zip."""
    return [n for n in names if n.endswith(".map")]


def build_vue(plugin_id, line="3.7"):
    """Builds a Vue plugin for one DWC line: 3.6 -> dist/<Id>.zip (webpack, dwc36/), 3.7 -> dist/37/<Id>.zip (Vite, dwc-src/)."""
    return build_vue_36(plugin_id) if line == "3.6" else build_vue_37(plugin_id)


def build_vue_36(plugin_id):
    # DWC 3.6's official pipeline: the staged plugin (stage_vue(line 3.6)) is compiled by scripts/build-plugin.js of the DuetWebControl
    # 3.6 clone, which builds ALL of DWC with the plugin inside (webpack; ~3 min full, much less in fast mode: tools/vue.config.fast.js)
    # and leaves dist/<Id>-<version>.zip inside the clone. The clone is shared: held under <clone>.lock for the whole build.
    if not has_36(plugin_id):
        sys.exit(f"{plugin_id}: no DWC 3.6 sources (vue/{plugin_id}/dwc36/ is missing)")
    if not os.path.isfile(os.path.join(DWC_SRC_36, "scripts", "build-plugin.js")):
        sys.exit(f"{plugin_id}: necesita el clon de DuetWebControl 3.6 en {DWC_SRC_36} (variable TALLER_DWC_SRC_36) con npm install hecho -- se arma en la PC, no en la Pi.")
    manifest = load_manifest(plugin_id)
    version = manifest.get("version", "0.0.0")
    with open(os.path.join(VUE, plugin_id, "dwc36", "plugin.json"), encoding="utf-8") as f:
        v36 = json.load(f).get("version")
    if v36 != version:
        sys.exit(f"{plugin_id}: version {v36!r} in dwc36/plugin.json differs from {version!r} in plugin.json (bump keeps them equal)")
    stage = stage_vue(plugin_id, "3.6")
    out = os.path.join(DWC_SRC_36, "dist", f"{plugin_id}-{version}.zip")
    BUILD_MODE[plugin_id] = modo_36()
    print(f"{plugin_id} {version} ({git_commit_label()}) [DWC 3.6]: compilando con DWC en {DWC_SRC_36} (modo {modo_36()})...")
    with dwc_lock(DWC_SRC_36):
        if os.path.exists(out):
            os.remove(out)
        r = subprocess.run(["node", "scripts/build-plugin.js", stage], cwd=DWC_SRC_36, capture_output=True, text=True, env=env_dwc_36())
        if r.returncode != 0 or not os.path.exists(out):
            print((r.stdout + r.stderr)[-3000:])
            sys.exit(f"{plugin_id}: fallo el build de DWC 3.6")
        os.makedirs(DIST, exist_ok=True)
        zip_path = os.path.join(DIST, f"{plugin_id}.zip")
        n_sd, n_dsf = _vue_extras(plugin_id, out, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        maps = zip_source_maps(z.namelist())
        if maps and os.environ.get("TALLER_SOURCEMAPS") != "1":
            sys.exit(f"{plugin_id}: el zip 3.6 trae mapas de fuente ({', '.join(maps)}); no se publican (TALLER_SOURCEMAPS=1 los pide)")
        js = [n for n in z.namelist() if n.startswith("dwc/js/") and n.endswith(".js")]
    print("  " + ", ".join(j[4:] for j in js) + (f" + {n_sd} macros en sd/" if n_sd else "") + (f" + backend dsf/ ({n_dsf} archivos)" if n_dsf else ""))
    return zip_path, version


def build_vue_37(plugin_id):
    # DWC 3.7's official pipeline: the staged STANDALONE plugin dir (stage_vue) is compiled by scripts/build-plugin-pkg.js of the
    # DuetWebControl 3.7 clone with Vite (only the plugin, seconds; the 3.6 webpack build compiled all of DWC in ~3 minutes) and
    # leaves <Id>-<version>.zip inside the stage. Type check, bundling and manifest file lists are the script's.
    if not os.path.isfile(os.path.join(DWC_SRC, "scripts", "build-plugin-pkg.js")):
        sys.exit(
            f"{plugin_id}: es un plugin Vue y necesita el clon de DuetWebControl 3.7 en {DWC_SRC} "
            "(variable TALLER_DWC_SRC) -- se arma en la PC, no en la Pi."
        )
    if not os.path.isdir(os.path.join(DWC_SRC, "node_modules")):
        sys.exit(f"{plugin_id}: falta node_modules en {DWC_SRC} (npm install en ese clon; build.py no lo hace)")
    manifest = load_manifest(plugin_id)
    version = manifest.get("version", "0.0.0")
    stage = stage_vue(plugin_id)
    out = os.path.join(stage, f"{plugin_id}-{version}.zip")
    print(f"{plugin_id} {version} ({git_commit_label()}) [DWC 3.7]: compilando con DWC 3.7 en {DWC_SRC} (Vite)...")
    with dwc_lock(DWC_SRC):
        unlink = _link_node_modules(stage)
        try:
            r = subprocess.run(["node", "scripts/build-plugin-pkg.js", stage], cwd=DWC_SRC, capture_output=True, text=True, env=vue_sourcemap_env(os.environ))
        finally:
            unlink()
    if r.returncode != 0 or not os.path.exists(out):
        print((r.stdout + r.stderr)[-4000:])
        sys.exit(f"{plugin_id}: fallo el build de DWC 3.7")
    os.makedirs(os.path.join(DIST, "37"), exist_ok=True)
    zip_path = os.path.join(DIST, "37", f"{plugin_id}.zip")
    n_sd, n_dsf = _vue_extras(plugin_id, out, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        maps = zip_source_maps(z.namelist())
        if maps and os.environ.get("TALLER_SOURCEMAP") != "1":
            sys.exit(f"{plugin_id}: el zip trae mapas de fuente ({', '.join(maps)}); no se publican (TALLER_SOURCEMAP=1 los pide)")
        js = [n for n in z.namelist() if n.startswith("dwc/js/") and n.endswith(".js")]
    print("  " + ", ".join(j[4:] for j in js) + (f" + {n_sd} macros en sd/" if n_sd else "") + (f" + backend dsf/ ({n_dsf} archivos)" if n_dsf else ""))
    return zip_path, version


def modo_path(plugin_id, version):
    return os.path.join(RELEASES, plugin_id, f"{plugin_id}-{version}.modo")


def escribir_modo(plugin_id, version):
    """Notes how the archived one was compiled (rapida | completa): tools/export_public.py requires 'completa' to publish."""
    with open(modo_path(plugin_id, version), "w", encoding="utf-8") as f:
        f.write((BUILD_MODE.get(plugin_id) or modo_actual()) + "\n")


def leer_modo(plugin_id, version):
    try:
        with open(modo_path(plugin_id, version), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return None  # archived before the fast mode existed: it was the usual full build


def archive(plugin_id, version, zip_path, replace=False):
    # The file of a version is what was published: a build without --bump
    # NEVER replaces it (it happened 2026-10-08: a test --install overwrote the
    # real 1.5.1). Only --bump (new version) writes, or if there is none yet.
    d = os.path.join(RELEASES, plugin_id)
    os.makedirs(d, exist_ok=True)
    dest = os.path.join(d, f"{plugin_id}-{version}.zip")
    name = os.path.basename(dest)
    rdir = f"{PI_RELEASES}/{plugin_id}"
    if not replace:
        exists = os.path.exists(dest) if LOCAL else pi_shell(f"test -f {rdir}/{name} && echo si; true").strip() == "si"
        if exists:
            print(f"  ({name} ya esta archivado: no se toca -- usa --bump para una version nueva)")
            return dest
    shutil.copyfile(zip_path, dest)
    escribir_modo(plugin_id, version)
    if not LOCAL:
        subprocess.run(["ssh", SSH_HOST, f"mkdir -p {rdir}"], check=True)
        r = subprocess.run(["scp", "-q", dest, f"{SSH_HOST}:{rdir}/"], capture_output=True, text=True)
        if r.returncode != 0:
            print(f"  (aviso: no se pudo copiar el archivo a la Pi: {(r.stdout + r.stderr).strip()})")
    return dest


DWC_SETTINGS = "/opt/dsf/sd/sys/dwc-settings.json"


def _plugin_activo(pid):
    """True if the plugin is in DWC's machine.enabledPlugins (None if it could not be read)."""
    py = "import json,sys;print(sys.argv[1] in json.load(open('%s'))['machine']['enabledPlugins'])" % DWC_SETTINGS
    out = pi_shell(f"python3 -c {shlex.quote(py)} {shlex.quote(pid)}", check=False).strip()
    return {"True": True, "False": False}.get(out)


def _reactivar(pid):
    """Puts the plugin back into enabledPlugins (through DSF's file API:
    the file belongs to dsf). A reinstall sometimes takes it out (DWC reloaded in between,
    or a plugin with a backend: seen with WorkshopRS485 and WorkshopVision, 2026-10-10)."""
    py = (
        "import json,sys;f='%s';d=json.load(open(f));l=d['machine']['enabledPlugins'];"
        "p=sys.argv[1];(p in l) or l.append(p);open('/tmp/dwcs-build.json','w').write(json.dumps(d))" % DWC_SETTINGS
    )
    pi_shell(
        f"python3 -c {shlex.quote(py)} {shlex.quote(pid)} && curl -s -o /dev/null -X PUT -H 'Content-Type: application/octet-stream' "
        f"--data-binary @/tmp/dwcs-build.json 'http://localhost/machine/file/0:/sys/dwc-settings.json'",
        check=False,
    )


def install(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        man0 = json.loads(z.read("plugin.json"))
    estaba_activo = _plugin_activo(man0["id"])
    # Python cache created by hand as the login user (testing the backend
    # with the venv's python) that DSF (user dsf) cannot delete: it made
    # the install fail halfway and left the plugin uninstalled (WorkshopVision,
    # 2026-10-10). It is deleted beforehand; it belongs to the user, so it can.
    pi_shell(
        f"find /opt/dsf/plugins/{shlex.quote(man0['id'])} -user \"$(id -un)\" -name '*.pyc' -delete 2>/dev/null; "
        f"find /opt/dsf/plugins/{shlex.quote(man0['id'])} -depth -user \"$(id -un)\" -type d -name __pycache__ -empty -delete 2>/dev/null; true",
        check=False,
    )
    if man0.get("sbcExecutable"):
        # DSF does not reinstall a plugin with its backend running ("Plugin must be
        # stopped before it can be uninstalled", seen with WorkshopRS485)
        cmd = [PLUGIN_MANAGER, "stop", man0["id"]]
        subprocess.run(cmd if LOCAL else ["ssh", SSH_HOST, " ".join(cmd)], capture_output=True, text=True)
    # PluginManager install does the complete update (new files
    # + manifest in DCS's memory), without sudo. DCS runs as "dsf" and cannot
    # read the user's home: a readable copy in /tmp is passed to it.
    name = os.path.basename(zip_path)
    if LOCAL:
        tmp_zip = os.path.join("/tmp", name)
        shutil.copyfile(zip_path, tmp_zip)
        os.chmod(tmp_zip, 0o644)
        r = subprocess.run([PLUGIN_MANAGER, "install", tmp_zip], capture_output=True, text=True)
    else:
        # From the PC: copy to the Pi over SSH and install there.
        up = subprocess.run(["scp", "-q", zip_path, f"{SSH_HOST}:/tmp/{name}"], capture_output=True, text=True)
        if up.returncode != 0:
            sys.exit(f"scp a {SSH_HOST} fallo: {(up.stdout + up.stderr).strip()}")
        r = subprocess.run(
            ["ssh", SSH_HOST, f"chmod 644 /tmp/{name} && {PLUGIN_MANAGER} install /tmp/{name}"],
            capture_output=True,
            text=True,
        )
    out = (r.stdout + r.stderr).strip()
    print("  " + out)
    # PluginManager can return 0 even if it fails ("Failed to install
    # plugin: Access to the path ... is denied", seen 2026-10-08) -- and an
    # install that fails leaves the plugin UNINSTALLED. The text is looked at too.
    if r.returncode != 0 or "Failed" in out:
        sys.exit(
            f"PluginManager install fallo ({r.returncode}). OJO: un install fallido puede dejar el plugin "
            "desinstalado -- arregla la causa y vuelve a instalar (o --rollback a la version anterior)."
        )
    # A plugin with its own backend (sbcExecutable, e.g. WorkshopRS485) is left
    # STOPPED after reinstalling (seen 2026-10-09): start it.
    with zipfile.ZipFile(zip_path) as z:
        man = json.loads(z.read("plugin.json"))
    if man.get("sbcExecutable"):
        silence_venv_banner(man["id"])  # before the first start of the new install, when the file is already there
        cmd = [PLUGIN_MANAGER, "start", man["id"]]
        s = subprocess.run(cmd if LOCAL else ["ssh", SSH_HOST, " ".join(cmd)], capture_output=True, text=True)
        print("  " + (s.stdout + s.stderr).strip())
        silence_venv_banner(man["id"])  # and after it, in case DSF only creates the venv when it starts
    # if it was active in DWC and the reinstall took it out, it is reactivated
    if estaba_activo and _plugin_activo(man["id"]) is False:
        _reactivar(man["id"])
        print(f"  {man['id']} habia quedado fuera de los plugins activos de DWC: reactivado")


def silence_venv_banner(plugin_id):
    """DSF writes plugin_path_change.py into the venv of a plugin with a backend (Vision, RS485): it prints two lines on EVERY start of Python
    ("... is now at the front of sys.path in venv") and DWC shows them as a notification with a technical path (UX review 2026-10-29). The lines
    only say that a path was moved: they are commented out. The file is group-writable by `dsf` and the login user is in that group; if it is
    not (or DSF writes it again) nothing breaks, the notice just shows."""
    pid = shlex.quote(plugin_id)
    pi_shell(
        f"for f in /opt/dsf/plugins/{pid}/venv/lib/python*/site-packages/plugin_path_change.py; do "
        f"[ -w \"$f\" ] && sed -i 's/^print(/#print(/' \"$f\"; done; true",
        check=False,
    )


def installed_versions():
    try:
        with urllib.request.urlopen(STATUS_URL, timeout=5) as r:
            plugins = json.load(r).get("plugins", {})
        return {k: v.get("version") for k, v in plugins.items()}
    except Exception:
        return {}


def archived_versions():
    # {Id: [versions]} read from the canonical file (the Pi).
    out = {}
    if LOCAL:
        for pid in os.listdir(RELEASES) if os.path.isdir(RELEASES) else []:
            out[pid] = [n[len(pid) + 1 : -4] for n in os.listdir(os.path.join(RELEASES, pid)) if n.endswith(".zip")]
        return out
    r = subprocess.run(["ssh", SSH_HOST, f"cd {PI_RELEASES} 2>/dev/null && ls */*.zip"], capture_output=True, text=True)
    for line in r.stdout.split():
        pid, name = line.split("/", 1)
        out.setdefault(pid, []).append(name[len(pid) + 1 : -4])
    return out


def cmd_list():
    inst = installed_versions()
    arch_all = archived_versions()
    print(f"{'Plugin':<16} {'instalada':<10} {'en codigo':<10} archivadas")
    for pid in all_ids():
        src_v = load_manifest(pid).get("version", "?")
        arch = sorted(
            arch_all.get(pid, []),
            key=lambda v: [int(x) for x in v.split(".")] if re.fullmatch(r"\d+\.\d+\.\d+", v) else [0],
        )
        print(f"{pid:<16} {inst.get(pid) or '-':<10} {src_v:<10} {', '.join(arch) or '-'}")


def cmd_rollback(plugin_id, version):
    name = f"{plugin_id}-{version}.zip"
    print(f"{plugin_id}: reinstalando version archivada {version}")
    if LOCAL:
        z = os.path.join(RELEASES, plugin_id, name)
        if not os.path.exists(z):
            sys.exit(f"No hay {z} -- ver 'python3 build.py --list'")
        install(z)
    else:
        src = f"{PI_RELEASES}/{plugin_id}/{name}"
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        pi_shell(
            f"test -f {src} && python3 -c \"import zipfile,json,sys; print(chr(10).join(json.loads(zipfile.ZipFile(sys.argv[1]).read('plugin.json')).get('sdFiles') or []))\" {src}"
            f" | (cd /opt/dsf/sd && xargs -r cp --parents -t $(mkdir -p $HOME/sd-backup/{plugin_id}-rollback-{stamp} && echo $HOME/sd-backup/{plugin_id}-rollback-{stamp}) 2>/dev/null); true",
            check=False,
        )
        r = subprocess.run(
            ["ssh", SSH_HOST, f"test -f {src} && cp {src} /tmp/{name} && chmod 644 /tmp/{name} && {PLUGIN_MANAGER} install /tmp/{name}"],
            capture_output=True,
            text=True,
        )
        print("  " + (r.stdout + r.stderr).strip())
        if r.returncode != 0:
            sys.exit(f"No se pudo reinstalar {src} en la Pi -- ver 'python build.py --list'")
    print("  (el codigo en src/ no cambio: el proximo --install vuelve a la version de src/)")


def cmd_lines(ids):
    """--lines: status table of the two DWC lines (tools/lines_status.py; offline)."""
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    try:
        import lines_status
    finally:
        sys.path.pop(0)
    lines_status.print_table(ROOT, ids or None)


def main():
    ap = argparse.ArgumentParser(description="Arma, versiona e instala los plugins Taller*")
    ap.add_argument("ids", nargs="*", help="plugins (por defecto todos)")
    ap.add_argument("--install", action="store_true", help="instalar con PluginManager")
    ap.add_argument("--bump", choices=["patch", "minor", "major"], help="nueva version")
    ap.add_argument("-m", "--message", help="que cambio (obligatorio con --bump)")
    ap.add_argument("--list", action="store_true", help="ver versiones")
    ap.add_argument("--rollback", nargs=2, metavar=("ID", "VERSION"), help="reinstalar una version archivada")
    ap.add_argument("--completa", action="store_true", help="compilar con la config completa de DWC (mapas, .gz, sin cache); sin --bump rehace la version actual y reemplaza el archivo si era rapida")
    ap.add_argument("--dwc", choices=["3.6", "3.7", "both", "universal"], default="3.6", help="which DWC line to build for: 3.6 (default; dist/<Id>.zip, strict 3.6 manifest, the one --install uses), 3.7 (dist/37/<Id>.zip), both = the RELEASE path (dist/3.6/<Id>.zip, dist/3.7/<Id>.zip and dist/release/<Id>-<version>-dwc3.6.zip + -dwc3.7.zip + SHA256SUMS.txt), universal = DEPRECATED, NOT FOR RELEASE (one zip with dwcVersion 3 that any 3.x DWC accepts, including unsupported ones; kept only for experiments). JS and Vue plugins")
    ap.add_argument("--release", action="store_true", help="same as --dwc both")
    ap.add_argument("--reuse", action="store_true", help="with --dwc both: do not compile, redo dist/release from the zips already in dist/3.6 and dist/3.7")
    ap.add_argument("--check-release", action="store_true", help="verify every zip of dist/release (strict dwcVersion / sbcDsfVersion, no maps or secrets, run-time guard, i18n on 3.6, sizes, .gz policy, SHA256SUMS.txt); exit 1 on a problem")
    ap.add_argument("--github-release", action="store_true", help="one GitHub Release per plugin version on jhonf441/<Id> with both strict zips + SHA256SUMS.txt; dry run by default (notes in dist/github-release/)")
    ap.add_argument("--publish", action="store_true", help="with --github-release: really create the releases (needs zips built with --completa and a clean --check-release)")
    ap.add_argument("--lines", action="store_true", help="tabla por plugin: tipo, lineas 3.6/3.7 presentes, version, sincronia de lo compartido y estado del zip universal (sin red)")
    ap.add_argument("--force-sd", action="store_true", help="instalar aunque pise macros editadas en la SD")
    ap.add_argument("--pull-sd", metavar="ID", help="traer al repo las macros sd/ tal como estan en la SD")
    a = ap.parse_args()

    if a.release:
        a.dwc = "both"
    if a.check_release:
        sys.exit(cmd_check_release(a.ids))
    if a.github_release:
        sys.exit(cmd_github_release(a.ids, a.publish))
    if a.lines:
        return cmd_lines(a.ids)
    if a.list:
        return cmd_list()
    if a.rollback:
        return cmd_rollback(*a.rollback)
    if a.pull_sd:
        return cmd_pull_sd(a.pull_sd)
    if a.bump and not a.message:
        ap.error("--bump necesita -m \"que cambio\"")
    if a.completa:
        MODO["completa"] = True
    ids = a.ids or all_ids()
    if not a.ids:
        # a run over every plugin leaves out the stopped WorkshopConfig (no development, no DWC 3.6 tree, not exported); name it to build it
        stopped = [i for i in ids if i in STOPPED]
        if stopped:
            print("(not built without being named: " + ", ".join(stopped) + " -- stopped)")
            ids = [i for i in ids if i not in STOPPED]
    # only what the build reads: the folders of the plugins being built and the shared ones (another agent can have work in progress in other plugins)
    mine = [os.path.join(d, i) for d in SOURCE_DIRS for i in ids] + [os.path.join(d, "_shared") for d in SOURCE_DIRS] + [os.path.join("vue", "_shared36")]
    if a.bump and git("status", "--porcelain", "--", *mine, check=False):
        sys.exit("Hay cambios sin commit en los plugins a compilar (o en _shared): commitealos antes de --bump, asi cada version apunta a un commit exacto.")

    if a.dwc in ("3.7", "both") and (a.install or a.bump):
        ap.error("--install y --bump trabajan sobre el zip 3.6; arma el 3.7 aparte con --dwc 3.7")
    if a.dwc == "universal":
        print("WARNING: --dwc universal is deprecated and NOT for release: its dwcVersion 3 is accepted by any 3.x DWC (3.5, 3.8...). Release with --dwc both.")
    if a.dwc == "3.7":
        for pid in ids:
            z37, _ = build_vue_37(pid) if is_vue(pid) else build_37(pid)
            release_zips.finalize_zip(z37, z37, "3.7")
        return
    if a.dwc == "both":
        for pid in ids:
            print(f"{pid}: release zips")
            build_release(pid, a.reuse)
        names = release_zips.write_sums(RELEASE)
        print(f"{RELEASE}: {len(names)} zips, SHA256SUMS.txt written")
        return

    for pid in ids:
        if a.bump:
            # Commit of the version BEFORE building: so the bundle carries the
            # exact commit of this version (without "+changes").
            new = bump(pid, a.bump, a.message)
            git("add", "--", manifest_path(pid), os.path.join(plugin_dir(pid), "CHANGELOG.md"))
            if is_vue(pid) and has_36(pid):
                git("add", "--", os.path.join(VUE, pid, "dwc36", "plugin.json"))
            git("commit", "-q", "-m", f"{pid} v{new}: {a.message}")
        if a.dwc == "universal":
            zip_path, version = build_universal(pid)
        else:
            zip_path, version = build_vue_36(pid) if is_vue(pid) else (build_js_oficial(pid) if oficial(pid) else build(pid))
            release_zips.finalize_zip(zip_path, zip_path, "3.6")  # strict 3.6 manifest, no maps, .gz of the big bundles
        if a.install:
            check_sd_before_install(pid, zip_path, a.force_sd)
            install(zip_path)
        # Archived AFTER installing correctly (if it is installed); --bump is a
        # new version and is the only thing that can write over an archive.
        # --completa without --bump: the same version is redone with the full config and replaces the fast
        # archive
        archive(pid, version, zip_path, replace=bool(a.bump) or (a.completa and leer_modo(pid, version) == "rapida"))
        if a.bump:
            git("tag", f"{pid}-v{version}")
            print(f"  commit + etiqueta {pid}-v{version}")


if __name__ == "__main__":
    main()
