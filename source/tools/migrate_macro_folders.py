#!/usr/bin/env python3
"""One-time move of the Workshop macros of the SD card into folders (run it ON the Pi, machine idle, at the same moment the
service and the plugins that call the new paths are installed).

  python3 migrate_macro_folders.py /opt/dsf/sd            # dry run: says what it would do
  python3 migrate_macro_folders.py /opt/dsf/sd --apply    # does it

What it does
  1. copies every file it is going to touch to <sd>/../sd-backup/macro-folders-<time>/ (same relative paths)
  2. moves sys/workshop/macros/<name>.g to sys/workshop/macros/<folder>/<name>.g (axis, zcal, focus, work, guard, laser, probe, system)
  3. rewrites the lines that call those macros by path ("0:/sys/workshop/macros/<name>.g" -> ".../<folder>/<name>.g") in the files of the
     SD that are not shipped by a plugin: macros/, sys/*.g, sys/workshop/zones/*.g, the moved macros themselves and the ones in examples/
     Files that already carry the new path are left alone, so running it twice changes nothing.
Nothing else is touched. The folders and the names are the table FOLDERS below; it is the same table the repository was changed with.
"""
import os
import re
import shutil
import sys
import time

FOLDERS = {
    "axis": "axis-limits axis-measure axis-microstep axis-move axis-probe axis-test axis-touch crash-cal step-ceiling",
    "zcal": "zcal zcal-goto zcal-mark zcal-probe zcal-szp zbedref zhere0 zmeasure zprobepoint zsurface",
    "focus": "focushere focusref focusrule laserfocus zfocusgo",
    "work": "workplaces workzero workzeroaxis wpload saveworkplace gotobed bedzones-set handcorner handfree framecutarea framerect jogFreeSet jogFreeFailsafe",
    "guard": "cutguard cncguard laserguard jobarm",
    "laser": "lasercorrection lasermark laseroffset livemark",
    "probe": "probedeploy probeoffsetmark meshzone visionpose",
    "system": "disable_pi_status enable_pi_status language lights rs485-read service-call",
}
FOLDER_OF = {n: f for f, names in FOLDERS.items() for n in names.split()}
NAMES = sorted(FOLDER_OF, key=len, reverse=True)
REF = re.compile(r"workshop/macros/(" + "|".join(re.escape(n) for n in NAMES) + r")\.g(?![\w-])")
# folders of the SD whose files may call the macros (never the logs, the configs of the service, the gcodes or the databases)
SCAN_DIRS = ["macros", "sys/workshop/zones", "sys/workshop/examples"]
SCAN_TOP = "sys"  # only *.g directly in sys/


def rewrite(text):
    return REF.sub(lambda m: "workshop/macros/%s/%s.g" % (FOLDER_OF[m.group(1)], m.group(1)), text)


def files_to_scan(sd):
    out = []
    top = os.path.join(sd, SCAN_TOP)
    for n in sorted(os.listdir(top)):
        p = os.path.join(top, n)
        if os.path.isfile(p) and n.endswith(".g"):
            out.append(p)
    for d in SCAN_DIRS:
        for root, _dirs, names in os.walk(os.path.join(sd, d)):
            for n in sorted(names):
                if n.endswith(".g"):
                    out.append(os.path.join(root, n))
    macros = os.path.join(sd, "sys", "workshop", "macros")
    for root, _dirs, names in os.walk(macros):
        for n in sorted(names):
            if n.endswith(".g"):
                out.append(os.path.join(root, n))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    if len(args) != 1:
        print(__doc__)
        return 2
    sd = os.path.abspath(args[0])
    macros = os.path.join(sd, "sys", "workshop", "macros")
    if not os.path.isdir(macros):
        print("no such folder: " + macros)
        return 2
    moves = []
    for n in sorted(os.listdir(macros)):
        base, ext = os.path.splitext(n)
        if ext == ".g" and os.path.isfile(os.path.join(macros, n)):
            if base in FOLDER_OF:
                moves.append((os.path.join(macros, n), os.path.join(macros, FOLDER_OF[base], n)))
            else:
                print("left in place (not in the table): " + n)
    leftovers = {a for a, b in moves if os.path.exists(b)}  # the plugin already put the new file there: the old one only goes away
    edits = []
    for p in files_to_scan(sd):
        if p in leftovers:
            continue
        try:
            with open(p, "rb") as f:
                raw = f.read()
        except OSError:
            print("skipped (not readable): " + p)
            continue
        enc = "utf-8"
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            enc = "latin-1"  # an old file in another code page: every byte is kept as it is
            text = raw.decode(enc)
        new = rewrite(text)
        if new != text:
            edits.append((p, new.encode(enc)))
    print("%d files to move, %d files to rewrite" % (len(moves), len(edits)))
    for a, b in moves:
        print("  move  " + os.path.relpath(a, sd) + " -> " + os.path.relpath(b, sd))
    for p, _new in edits:
        print("  edit  " + os.path.relpath(p, sd))
    if not apply:
        print("dry run: nothing changed (add --apply)")
        return 0
    root = os.path.join(os.path.dirname(sd), "sd-backup")
    if not os.access(os.path.dirname(sd), os.W_OK):
        root = os.path.join(os.path.expanduser("~"), "sd-backup")  # the parent of the SD belongs to root: the copies go to the home folder
    bak = os.path.join(root, "macro-folders-" + time.strftime("%Y%m%d-%H%M%S"))
    for src in [a for a, _b in moves] + [p for p, _n in edits]:
        dst = os.path.join(bak, os.path.relpath(src, sd))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
    print("copies in " + bak)
    for a, b in moves:
        os.makedirs(os.path.dirname(b), exist_ok=True)
        if os.path.exists(b):
            os.remove(a)  # the new one is already there (a plugin put it): the old one is a leftover
        else:
            os.replace(a, b)
    for p, new in edits:
        # a moved macro is edited at its new place
        target = p
        if not os.path.exists(target):
            base = os.path.basename(p)[:-2]
            if base in FOLDER_OF:
                target = os.path.join(macros, FOLDER_OF[base], os.path.basename(p))
        tmp = target + ".migrating"  # written next to it and renamed over it: works also for files that belong to another user in a folder we can write
        with open(tmp, "wb") as f:
            f.write(new)
        shutil.copymode(target, tmp)
        os.replace(tmp, target)
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
