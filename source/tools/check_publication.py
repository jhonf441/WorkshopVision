#!/usr/bin/env python3
"""Is every plugin ready to be made public and submitted to the Duet3D plugin catalog? Reads the facts, prints one table, exits 1 on any FAIL.

    python tools/check_publication.py [Id ...]

What the catalog asks (https://plugins.duet3d.com/guide/submission.html, DuetSoftwareFramework PLUGINS.md):
  - the plugin lives in a GitHub repository whose name is the plugin id, not used by another plugin of the catalog;
  - README.md and PLUGIN.md (exact case; PLUGIN.md, when it exists, is the plugin's page in the catalog) and plugin.json (exact case, under 16 KB);
  - at least one release that downloads as a zip;
  - manifest: name of letters, digits, spaces, - and _ (1 to 64 characters); permissions written with a lower-case first letter; the zip holds no
    path with "..", nothing under sd/firmware/, no sd/sys/config.g or sd/sys/config-override.g.
It also checks what a reviewer looks at first (license, homepage, description, issues, topics, security policy, sums).
Nothing is changed: it only reads (files here, `gh api` for GitHub).
"""
import json
import os
import re
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
TP = os.path.dirname(HERE)
SERVICE = os.path.join(os.path.dirname(TP), "WorkshopService")
OWNER = "jhonf441"
PERMS = {"commandExecution", "codeInterceptionRead", "codeInterceptionReadWrite", "managePlugins", "manageUserSessions", "objectModelRead",
         "objectModelReadWrite", "registerHttpEndpoints", "readFilaments", "writeFilaments", "readFirmware", "writeFirmware", "readGCodes",
         "writeGCodes", "readMacros", "writeMacros", "readSystem", "writeSystem", "readWeb", "writeWeb", "fileSystemAccess", "launchProcesses",
         "networkAccess", "superUser"}
RISKY = {"superUser", "manageUserSessions", "writeFirmware"}


def plugin_ids():
    ids = ["WorkshopService"]
    for base in ("src", "vue"):
        for d in sorted(os.listdir(os.path.join(TP, base))):
            if d.startswith("Workshop") and d not in ("WorkshopConfig", "WorkshopTranslations") and os.path.isfile(os.path.join(TP, base, d, "plugin.json")):
                ids.append(d)
    return ids


def manifest_path(pid):
    if pid == "WorkshopService":
        return os.path.join(SERVICE, "plugin.json")
    for base in ("src", "vue"):
        p = os.path.join(TP, base, pid, "plugin.json")
        if os.path.isfile(p):
            return p
    return None


def gh(path):
    r = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def check_manifest(pid, out):
    p = manifest_path(pid)
    size = os.path.getsize(p)
    m = json.load(open(p, encoding="utf-8"))
    out("manifest under 16 KB", size < 16 * 1024, "%d bytes" % size)
    out("id equals the repository name", m.get("id") == pid, m.get("id"))
    out("name: letters, digits, space, - and _ (max 64)", bool(re.fullmatch(r"[A-Za-z0-9 _-]{1,64}", m.get("name") or "")), m.get("name"))
    out("author, version and license are there", all(m.get(k) for k in ("author", "version", "license")), "%s %s %s" % (m.get("author"), m.get("version"), m.get("license")))
    out("homepage is the repository", m.get("homepage") == "https://github.com/%s/%s" % (OWNER, pid), m.get("homepage"))
    out("tags (the catalog takes them from the manifest)", bool(m.get("tags")), ",".join(m.get("tags") or []))
    perms = m.get("sbcPermissions") or []
    out("permissions: valid names, lower-case first letter", all(x in PERMS for x in perms), ",".join(x for x in perms if x not in PERMS))
    out("no root-level permission asked", not (set(perms) & RISKY), ",".join(sorted(set(perms) & RISKY)))
    return m


def check_zips(pid, m, out):
    folder = os.path.join(SERVICE, "dist", "release") if pid == "WorkshopService" else os.path.join(TP, "dist", "release")
    for line in ("3.6",):  # only the DWC 3.6 line is published
        name = "%s-%s-dwc%s.zip" % (pid, m["version"], line)
        path = os.path.join(folder, name)
        if not os.path.isfile(path):
            out("zip %s exists" % line, False, name)
            continue
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            bad = [n for n in names if ".." in n.replace("\\", "/").split("/") or n.startswith("sd/firmware/") or n in ("sd/sys/config.g", "sd/sys/config-override.g")]
            zm = json.loads(z.read("plugin.json"))
            out("zip %s: allowed paths only" % line, not bad, ",".join(bad[:3]))
            out("zip %s: dwcVersion is exactly %s, manifest under 16 KB, id and version match" % (line, line),
                zm.get("dwcVersion") == line and len(z.read("plugin.json")) < 16 * 1024 and zm.get("id") == pid and zm.get("version") == m["version"],
                "%s %s" % (zm.get("dwcVersion"), zm.get("version")))
            if m.get("sbcExecutable"):
                out("zip %s: has its executable" % line, any(n.endswith("/" + m["sbcExecutable"]) or n == "dsf/" + m["sbcExecutable"] for n in names), m["sbcExecutable"])


def check_repo(pid, m, out):
    r = gh("repos/%s/%s" % (OWNER, pid))
    if not r:
        out("repository exists", False, "gh api failed")
        return
    out("repository exists (visibility)", True, "private" if r.get("private") else "PUBLIC")
    out("description", bool(r.get("description")), r.get("description") or "")
    out("topics (duet3d, dwc-plugin ...)", bool(r.get("topics")), ",".join(r.get("topics") or []))
    out("issues enabled (Share my measurement, bug reports)", bool(r.get("has_issues")), "")
    out("default branch is main", r.get("default_branch") == "main", r.get("default_branch"))
    tree = gh("repos/%s/%s/contents" % (OWNER, pid)) or []
    names = {t["name"] for t in tree}
    out("README.md at the root", "README.md" in names, "")
    out("PLUGIN.md at the root (the page of the catalog; images with absolute URLs)", "PLUGIN.md" in names, "")
    out("plugin.json at the root", "plugin.json" in names, "")
    out("LICENSE", "LICENSE" in names, "")
    out("CHANGELOG.md", "CHANGELOG.md" in names, "")
    out("SECURITY.md (how to report a vulnerability)", "SECURITY.md" in names, "")
    out("source/ and BUILDING.md (reproducible build)", "source" in names and "BUILDING.md" in names, "")
    rel = gh("repos/%s/%s/releases/tags/v%s" % (OWNER, pid, m["version"]))
    assets = [a["name"] for a in (rel or {}).get("assets", [])]
    out("release v%s with the 3.6 zip (and no 3.7 zip) and SHA256SUMS.txt" % m["version"],
        bool(rel) and sum(a.endswith(".zip") for a in assets) == 1 and not any("dwc3.7" in a for a in assets) and "SHA256SUMS.txt" in assets, ",".join(assets))
    raw = gh("repos/%s/%s/contents/plugin.json" % (OWNER, pid))
    if raw:
        import base64
        try:
            remote = json.loads(base64.b64decode(raw["content"]))
            out("plugin.json of the repository is the current version", remote.get("version") == m["version"], remote.get("version"))
            zm_pub = zip_manifest(pid, m["version"])
            same = all(remote.get(k) == zm_pub.get(k) for k in ("dwcVersion", "sbcDsfVersion", "sbcRequired", "dwcDependencies", "sbcExecutable")) if zm_pub else False
            out("plugin.json of the repository says what the published 3.6 zip says (dwcVersion, sbc fields, dependencies)", same,
                "repo dwc %s / zip dwc %s" % (remote.get("dwcVersion"), (zm_pub or {}).get("dwcVersion")))
        except Exception:  # noqa: BLE001
            out("plugin.json of the repository is readable", False, "")


def zip_manifest(pid, version):
    """The plugin.json inside the published DWC 3.6 zip (what the catalog must be told), or None."""
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    folder = os.path.join(os.path.dirname(here), "WorkshopService", "dist", "release") if pid == "WorkshopService" else os.path.join(here, "dist", "release")
    path = os.path.join(folder, "%s-%s-dwc3.6.zip" % (pid, version))
    if not os.path.isfile(path):
        return None
    with zipfile.ZipFile(path) as z:
        return json.loads(z.read("plugin.json"))


def main():
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or plugin_ids()
    failed = 0
    for pid in ids:
        print("== %s" % pid)
        rows = []

        def out(what, ok, note=""):
            rows.append((what, ok, note))
            print("  %-4s %s%s" % ("OK" if ok else "FAIL", what, ("   [%s]" % note) if note else ""))

        m = check_manifest(pid, out)
        check_zips(pid, m, out)
        check_repo(pid, m, out)
        failed += sum(1 for _, ok, _ in rows if not ok)
    print("\n%d checks failed" % failed)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
