#!/usr/bin/env python3
"""Writes the section "Permissions and what it changes" of docs/plugins/<Id>/README.md from the manifest of each plugin plus the facts below.

    python tools/docs_permissions.py [--check]

The section lives between two HTML comments, so running it again replaces it (never duplicates it). --check writes nothing and exits 1 when a README
is out of date. What the permissions mean: https://github.com/Duet3D/DuetSoftwareFramework/blob/master/PLUGINS.md and publish/docs/security.md.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TP = os.path.dirname(HERE)
SERVICE = os.path.join(os.path.dirname(TP), "WorkshopService")
START, END = "<!-- permissions:start -->", "<!-- permissions:end -->"

WHAT = {
    "commandExecution": "send G-code to the board",
    "codeInterceptionRead": "see the G-code the board receives",
    "codeInterceptionReadWrite": "intercept G-code (M3/M4/M5, a device fault) and let it through or change it",
    "objectModelRead": "read the state of the machine",
    "objectModelReadWrite": "read the state of the machine and publish its own data in it",
    "registerHttpEndpoints": "answer on its own address (an API endpoint under /machine/<Id>/)",
    "readSystem": "read files under 0:/sys",
    "writeSystem": "lock files under 0:/sys (the history database needs it)",
    "fileSystemAccess": "read and write files outside the DSF folders (keys, camera files)",
    "launchProcesses": "start programs (ffmpeg, pinctrl, systemctl, sudo shutdown)",
    "networkAccess": "open network connections (notices, the meter, the camera, the service API)",
}

# per plugin: risk, what it writes, what it needs on the system, anything else the person must know
FACTS = {
    "WorkshopService": dict(
        risk="High (backend with broad permissions; it can shut the system down)",
        writes=["`0:/sys/workshop/` (settings, data, history database `duet.db`, macros it generates, work zones, backups)",
                "`/opt/dsf/conf/workshop-secrets.json` and `workshop-users.json` (mode 600), `workshop-camera.key`"],
        system=["`/etc/sudoers.d/dsf-power`, only if you want the shutdown / restart buttons: you create it by hand (see the security document)",
                "the G-code bridge (`sudo bridge/install.sh`): systemd unit, polkit rule and `/opt/workshop-bridge`; `sudo bridge/install.sh uninstall` removes them",
                "ports: the camera relay (8090 by default, all interfaces; `camera_relay.bind` keeps it on the Pi) and the G-code bridge (23)",
                "`ffmpeg` for timelapses and snapshots; `tinytuya` for a Tuya energy meter"],
        notes=["Without users, everybody who reaches DWC is an administrator and the relay and the bridge are open to the network: create the first administrator in the Users section."]),
    "WorkshopControlBar": dict(
        risk="Medium (buttons that shut the machine down or run your macros)",
        writes=["its buttons and groups in `0:/sys/workshop/config/`"],
        system=["the shutdown and restart buttons need the optional sudo rule of the service (`/etc/sudoers.d/dsf-power`)"],
        notes=["\"Shut down now\" cuts the power of EVERYTHING through the Tuya breaker if you configured one; it asks for confirmation."]),
    "WorkshopJog": dict(
        risk="Medium-high (moves the machine)",
        writes=["its settings and saved positions in `0:/sys/workshop/`", "the macros it installs into `0:/sys/workshop/macros/` (for example `workzeroaxis.g`, `jogFreeSet.g`)"],
        system=[],
        notes=["Moving is checked by the service (one owner of the motion, homing, limits); STOP and the emergency stop always work."]),
    "WorkshopCamera": dict(
        risk="Low",
        writes=["photos and timelapse videos in `0:/workshop/camera/` (outside `sys/` on purpose: they weigh GB)", "its profiles in `0:/sys/workshop/config/`"],
        system=["`ffmpeg` on the Pi (done by the service) for videos"],
        notes=["The viewer and the relay follow the users of the service: with no users anyone on the network can watch the camera."]),
    "WorkshopLights": dict(
        risk="Low-medium (it can edit the LED count in `config.g`)",
        writes=["scenes and colors in `0:/sys/workshop/config/`", "the LED count line `M950 ... U<n>` of `config.g`, only after a preview, a `.bak` copy and a second tap"],
        system=["a strip driven by the Pi needs an SPI bus: you add the line `dtoverlay=spi1-1cs` to `/boot/firmware/config.txt` yourself; the plugin never edits that file"],
        notes=[]),
    "WorkshopMachine": dict(
        risk="Medium-high (moves the machine, fires a low-power laser for the offsets)",
        writes=["`0:/sys/workshop/config/machine.json` (the machine profile, with a `.bak`)", "calibration records and maintenance counters (`machine-calibration`, `machine-maintenance` in the settings store)",
                "`config.g`, `bed.g` and the probe offset only through a plan with preview, a snapshot and a `.bak-<stamp>` copy"],
        system=[],
        notes=["Only a closed list of G-code kinds can be tried or written (`machine_gcode.py`); every trial reverts by itself after its time."]),
    "WorkshopMotors": dict(
        risk="Medium (its Test tab moves an axis; the stall detection changes the current of a driver)",
        writes=["its results in `0:/sys/workshop/` (`axis-test.csv`, step ceiling)", "the saved copy of the shared pulse table in the browser (localStorage)"],
        system=[],
        notes=["It never writes driver registers (`M569.2` with a value is not in the code). The shared reference table is read from `data/references.json` of this repository."]),
    "WorkshopPiHealth": dict(
        risk="Low",
        writes=["its history in the plugin data and the service database"],
        system=[],
        notes=["It reads the Pi (temperature, memory, Wi-Fi, services); it changes nothing."]),
    "WorkshopPower": dict(
        risk="Low",
        writes=["consumption history in the service database", "the key of the Tuya meter in `/opt/dsf/conf/workshop-secrets.json` (mode 600)"],
        system=["`tinytuya` to read the meter on your network (done by the service)"],
        notes=["Reading the meter does not need internet. The tariff and the monthly limit are yours."]),
    "WorkshopActivity": dict(
        risk="Low-medium (phone notices go to an Internet service)",
        writes=["the event history in the service database (7 daily backups kept)"],
        system=["phone notices use the free service ntfy.sh (or your own server); they need Internet access from the Pi"],
        notes=["The notice topic works like a password: whoever knows it can read your notices. Leave notices off if you do not want data to leave the machine."]),
    "WorkshopWorkbench": dict(
        risk="Medium-high (moves the machine and runs laser jobs)",
        writes=["work zones `0:/sys/workshop/zones/p<N>.g`, `cutarea.g`", "materials, designs and positions under `0:/sys/workshop/`", "helper jobs in `0:/sys/workshop/gcodes/`"],
        system=[],
        notes=["Laser jobs ask for confirmation, check the active zone and the cut area, and every `G1` it generates carries `S0` unless it must fire the laser."]),
    "WorkshopVision": dict(
        risk="High (own Python process; fire watch can pause a job or send an emergency stop)",
        writes=["its settings, bed photos and calibration under `0:/sys/workshop/`"],
        system=["Python packages in its own venv: `opencv-python-headless`, `numpy`, `dsf-python`", "port 8095 (all interfaces by default; `WORKSHOP_VISION_BIND=127.0.0.1` keeps it on the Pi)"],
        notes=["The fire and smoke watch is a help, NOT a safety system. With no users, anyone on the network can use port 8095."]),
    "WorkshopPrinting": dict(
        risk="Medium (heats; edits the mode files)",
        writes=["`modefff.g`, `select*.g` and `printing.json` through a preview and a `.bak` copy", "its PID and pellet settings under `0:/sys/workshop/`"],
        system=[],
        notes=["Heating tests and PID tuning ask for a double tap and stay off unless you start them."]),
    "WorkshopRS485": dict(
        risk="High (own Python process; writes to an industrial bus; can send M25 / M112 on a device fault)",
        writes=["its devices, buses and profiles under `0:/sys/workshop/`"],
        system=["the `dsf` user must be in the `dialout` group to open the USB-RS485 adapter", "Python package `pyserial` in its own venv"],
        notes=["Its API applies the roles before any write to a bus. A device with no axis only warns: it never pauses a job."]),
}


def manifest(pid):
    path = os.path.join(SERVICE, "plugin.json") if pid == "WorkshopService" else None
    if path is None:
        for base in ("src", "vue"):
            p = os.path.join(TP, base, pid, "plugin.json")
            if os.path.isfile(p):
                path = p
    return json.load(open(path, encoding="utf-8"))


def section(pid):
    m, f = manifest(pid), FACTS[pid]
    perms = m.get("sbcPermissions") or []
    out = [START, "", "## Permissions and what it changes", "",
           "Risk: **%s**. Read this before installing; the full document is `security.md` of the Workshop plugins." % f["risk"], ""]
    if perms:
        out += ["**DSF permissions** (DSF shows them and you approve them when you install; the zip asks for nothing else):", "",
                "| Permission | What it lets the plugin do |", "|---|---|"]
        out += ["| `%s` | %s |" % (p, WHAT.get(p, "see the DSF documentation")) for p in perms]
        out += [""]
    else:
        out += ["**DSF permissions:** none. It is a page of DWC (it runs in your browser) and everything it does goes through the API of `WorkshopService`, "
                "which applies the roles (viewer, operator, technician, administrator) in the server.", ""]
    dep = m.get("sbcPluginDependencies") or m.get("dwcDependencies") or []
    if dep:
        out += ["**Depends on:** " + ", ".join("`%s`" % d for d in dep) + " (install it first, uninstall it last).", ""]
    if m.get("sbcExecutable"):
        out += ["**Runs a program on the Pi:** `%s` as the `dsf` user (restarted by DSF if it stops)." % m["sbcExecutable"], ""]
    if f["writes"]:
        out += ["**Files it writes:**"] + ["- " + w for w in f["writes"]] + [""]
    if f["system"]:
        out += ["**What it needs outside the zip** (each one is a separate step you do on purpose and can undo):"] + ["- " + s for s in f["system"]] + [""]
    if f["notes"]:
        out += ["**Safety notes:**"] + ["- " + n for n in f["notes"]] + [""]
    out += ["Uninstalling removes the plugin folder; your data in `0:/sys/workshop/` and `/opt/dsf/conf/workshop-*.json` stays.", "", END]
    return "\n".join(out)


def apply(readme, block):
    text = open(readme, encoding="utf-8").read()
    if START in text and END in text:
        text = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _m: block, text, flags=re.S)
    else:
        # before the section of limits when there is one, else at the end
        m = re.search(r"^## \d+\. Limits", text, flags=re.M)
        text = text[:m.start()] + block + "\n\n" + text[m.start():] if m else text.rstrip("\n") + "\n\n" + block + "\n"
    return text


def main():
    check = "--check" in sys.argv
    stale = []
    for pid in FACTS:
        readme = os.path.join(TP, "docs", "plugins", pid, "README.md")
        new = apply(readme, section(pid))
        if new != open(readme, encoding="utf-8").read():
            stale.append(pid)
            if not check:
                with open(readme, "w", encoding="utf-8", newline=chr(10)) as fh:
                    fh.write(new)
    print(("out of date: " if check else "updated: ") + ", ".join(stale) if stale else "all up to date")
    sys.exit(1 if (check and stale) else 0)


if __name__ == "__main__":
    main()
