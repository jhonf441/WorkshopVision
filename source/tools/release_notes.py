#!/usr/bin/env python3
"""Release notes generated from the commits of a plugin: sections Added / Changed / Fixed (owner's request, 2026-11-07: the releases
carried no notes of what changed). Used by export_plugin_repos.py --releases and build.py --github-release; on its own it only prints.

    python tools/release_notes.py <Id> [--since <ref>] [--until <ref>] [--version <v>]      print the notes of <Id> (nothing is published)

Where the commits come from: `git log <since>..<until> -- <paths of the plugin>` in the repository of the plugin (TallerPlugins for the
plugins, WorkshopService for the service), without merges. `since` is the tag of the previous version of that plugin (build.py tags every
bump as <Id>-v<version>; the service has WorkshopService-v<version> tags) when none is given; with no previous tag the last LAST_N commits
of the plugin are taken and the notes say so.

How a commit is sorted (classify): a conventional prefix decides first (feat -> Added, fix -> Fixed, anything else -> Changed); without one,
the words of the subject decide (fix / bug / no longer / wrong / corrige / arregla... -> Fixed; add / new / nuevo / agrega... -> Added;
the rest -> Changed). The subject loses the prefixes this repository writes ("WorkshopPrinting v2.20.0: ", "Printing: ", "Service 2.30.6: ")
and repeated subjects appear once. Pure functions (classify, clean_subject, group, render) have no git: tests/test_release_notes.py feeds them.
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TP = os.path.dirname(HERE)
SERVICE_ID = "WorkshopService"


def _service_repo():
    """Projects/WorkshopService: next to TallerPlugins, or next to the folder of the worktrees of the agents (Projects/_worktrees-agents/<x>);
    $WORKSHOP_SERVICE_REPO wins when set."""
    env = os.environ.get("WORKSHOP_SERVICE_REPO")
    if env:
        return env
    for base in (os.path.dirname(TP), os.path.dirname(os.path.dirname(TP))):
        p = os.path.join(base, SERVICE_ID)
        if os.path.isdir(os.path.join(p, ".git")) or os.path.isfile(os.path.join(p, ".git")):
            return p
    return os.path.join(os.path.dirname(TP), SERVICE_ID)


SERVICE_REPO = _service_repo()
LAST_N = 40

SECTIONS = ("added", "changed", "fixed")
TITLES = {"added": "Added", "changed": "Changed", "fixed": "Fixed"}
PREFIX = re.compile(r"^(?P<type>feat|feature|fix|bugfix|hotfix|chore|refactor|perf|docs|doc|style|test|tests|build|ci|revert)(\([^)]*\))?!?:\s*", re.I)
PREFIX_SECTION = {"feat": "added", "feature": "added", "fix": "fixed", "bugfix": "fixed", "hotfix": "fixed"}
FIXED_WORDS = re.compile(r"\b(fix(es|ed|ing)?|bug(s)?|bugfix|hotfix|repair(s|ed)?|regression|broken|crash(es|ed)?|corrig\w*|arregl\w*|repar\w*|"
                         r"no longer|wrong|stale|missing|leak(s|ed)?|could not|did not|does not|was not|were not|ya no|falla\w*|error(es)?)\b", re.I)
ADDED_WORDS = re.compile(r"\b(add(s|ed|ing)?|new|introduc\w*|agreg\w*|nuev[oa]s?|a[nñ]ad\w*|first)\b", re.I)


# ---- pure ----------------------------------------------------------------------------------------------------------------------

def clean_subject(subject, pid):
    """The subject without the prefixes this repository writes before the real text: "<Id> v1.2.3: ", "<Short>: " (the id without
    "Workshop"), "Service 1.2.3: " for the service, and a conventional prefix "feat: " / "fix(scope): "."""
    s = " ".join(str(subject or "").split())
    short = pid[len("Workshop"):] if pid.startswith("Workshop") else pid
    patterns = [
        r"^%s\s+v?\d+(?:\.\d+)*\s*:\s*" % re.escape(pid),
        r"^%s\s+v?\d+(?:\.\d+)*\s*:\s*" % re.escape(short),
        r"^%s\s*:\s*" % re.escape(pid),
        r"^%s\s*:\s*" % re.escape(short),
    ]
    changed = True
    while changed:
        changed = False
        for p in patterns:
            n = re.sub(p, "", s, count=1, flags=re.I)
            if n != s:
                s, changed = n, True
    s = PREFIX.sub("", s, count=1)
    return s.strip()


def classify(subject):
    """'added' | 'changed' | 'fixed' for a commit subject (as written, prefixes included)."""
    s = str(subject or "")
    m = PREFIX.match(s)
    if m:
        return PREFIX_SECTION.get(m.group("type").lower(), "changed")
    if FIXED_WORDS.search(s):
        return "fixed"
    if ADDED_WORDS.search(s):
        return "added"
    return "changed"


def is_noise(subject):
    """Merge commits and empty subjects do not belong in the notes."""
    s = str(subject or "").strip()
    return not s or re.match(r"^(Merge|Revert \"Merge)\b", s) is not None


def group(commits, pid):
    """{section: [subject, ...]} from [(sha, subject), ...] in git log order (newest first), cleaned and without repeats."""
    out = {s: [] for s in SECTIONS}
    seen = set()
    for _sha, subject in commits:
        if is_noise(subject):
            continue
        section = classify(subject)
        text = clean_subject(subject, pid)
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        out[section].append(text)
    return out


def render(groups, since_label=None, count=None):
    """Markdown with the sections that have something ('' when none has). `since_label` names the range in one line."""
    parts = []
    for s in SECTIONS:
        items = groups.get(s) or []
        if items:
            parts.append("### %s\n\n%s" % (TITLES[s], "\n".join("- " + i for i in items)))
    if not parts:
        return ""
    head = ""
    if since_label:
        head = "Generated from the commits %s%s.\n\n" % (since_label, (" (%d commits)" % count) if count else "")
    return head + "\n\n".join(parts) + "\n"


# ---- git -----------------------------------------------------------------------------------------------------------------------

def _git(repo, *args):
    return subprocess.run(["git", "-C", repo] + list(args), capture_output=True, text=True, encoding="utf-8", errors="replace")


def version_key(v):
    return tuple(int(x) for x in re.findall(r"\d+", str(v)))


def previous_tag(repo, pid, version):
    """The tag <pid>-v<x> of the highest version below `version`, or None."""
    r = _git(repo, "tag", "-l", "%s-v*" % pid)
    if r.returncode != 0:
        return None
    below = [t for t in r.stdout.split() if version_key(t[len(pid) + 2:]) and version_key(t[len(pid) + 2:]) < version_key(version)]
    return max(below, key=lambda t: version_key(t[len(pid) + 2:])) if below else None


def commits(repo, since, until="HEAD", paths=None, last_n=None):
    """[(sha, subject), ...] newest first, without merges, of `since..until` (or the last `last_n` when since is None) touching `paths`."""
    args = ["log", "--no-merges", "--format=%H%x1f%s"]
    if since:
        args.append("%s..%s" % (since, until))
    else:
        args += ["-n", str(last_n or LAST_N), until]
    if paths:
        args += ["--"] + list(paths)
    r = _git(repo, *args)
    if r.returncode != 0:
        raise SystemExit("git log failed in %s: %s" % (repo, r.stderr.strip()))
    out = []
    for line in r.stdout.splitlines():
        if "\x1f" in line:
            sha, subject = line.split("\x1f", 1)
            out.append((sha.strip(), subject.strip()))
    return out


def repo_and_paths(pid):
    """(repository, paths inside it) of a plugin: the service is its own repository; a plugin is src/<Id> or vue/<Id> of TallerPlugins."""
    if pid == SERVICE_ID:
        return SERVICE_REPO, None
    paths = [os.path.join(base, pid) for base in ("src", "vue") if os.path.isdir(os.path.join(TP, base, pid))]
    return TP, (paths or [os.path.join("vue", pid)])


def notes_for(pid, version, since=None, until="HEAD", repo=None, paths=None):
    """The generated notes of <pid> up to `version` ('' when no commit is found). since: a ref; None = the previous tag, or the last LAST_N commits."""
    if repo is None:
        repo, paths = repo_and_paths(pid)
    if since is None:
        since = previous_tag(repo, pid, version)
    rows = commits(repo, since, until, paths)
    label = ("since %s" % since) if since else ("of the last %d (no previous tag of %s)" % (LAST_N, pid))
    return render(group(rows, pid), label, len(rows))


def _version_of(pid):
    import json
    repo, paths = repo_and_paths(pid)
    folder = repo if pid == SERVICE_ID else os.path.join(TP, paths[0])
    with open(os.path.join(folder, "plugin.json"), encoding="utf-8") as f:
        return json.load(f).get("version", "0.0.0")


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    opts = {}
    for i, a in enumerate(argv):
        if a in ("--since", "--until", "--version") and i + 1 < len(argv):
            opts[a[2:]] = argv[i + 1]
    pid = args[0]
    version = opts.get("version") or _version_of(pid)
    text = notes_for(pid, version, since=opts.get("since"), until=opts.get("until", "HEAD"))
    print(text if text else "(no commits found for %s up to %s)" % (pid, version))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
