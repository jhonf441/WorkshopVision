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
# WORKSHOP_SERVICE_DIR: where the WorkshopService sources are when this tree is a worktree (not next to WorkshopService)
SERVICE = os.environ.get("WORKSHOP_SERVICE_DIR") or os.path.join(os.path.dirname(TP), "WorkshopService")
START, END = "<!-- permissions:start -->", "<!-- permissions:end -->"

WHAT = {
    "commandExecution": "send G-code to the board",
    "codeInterceptionRead": "see the G-code the board receives",
    "codeInterceptionReadWrite": "intercept G-code (M3/M4/M5, a device fault) and let it through or change it",
    "objectModelRead": "read the state of the machine",
    "objectModelReadWrite": "read the state of the machine and publish its own data in it",
    "registerHttpEndpoints": "answer on its own address (an API endpoint under /machine/<Id>/)",
    "readSystem": "read files under 0:/sys",
    "readMacros": "read files under 0:/macros",
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
        system=["Internet access to `ntfy.sh` (or your own ntfy server) from the Pi, only if you turn the phone notifications on (off by default, see the safety notes)",
                "`/etc/sudoers.d/dsf-power`, only if you want the shutdown / restart buttons: you create it by hand (steps below)",
                "the G-code bridge (`sudo bridge/install.sh`): systemd unit, polkit rule and `/opt/workshop-bridge`; `sudo bridge/install.sh uninstall` removes them",
                "ports: the camera relay (8090 by default, all interfaces; `camera_relay.bind` keeps it on the Pi) and the G-code bridge (23)",
                "`ffmpeg` for timelapses and snapshots; `tinytuya` for a Tuya energy meter"],
        notes=["**No users: the network can only look.** Until the first administrator exists, the camera relay (8090), Vision (8095) and the G-code bridge (23) answer reads and queries from the network but refuse everything that changes something (the camera settings, calibration, G-code orders); only the Pi itself is not limited. Whoever reaches DWC is still an administrator (a DWC password is the protection there), so create the first administrator in the Users section. If you switch the roles off on purpose (with an administrator's PIN), the relay and Vision are open to the network again. A bridge without a password, an allowed list or a trusted address refuses every order: `install.sh` asks for one.",
               "**Nothing leaves your network by default.** Phone notifications (ntfy) are OFF until you turn them on in the Activity page, which asks you to confirm. Once on, event texts (job end, job pause, errors, Pi health, power) go to a third-party server, `https://ntfy.sh` unless you set your own, and a camera photo or short video is attached when the camera is configured and the type's attachment is set. Anyone who knows the random topic can read them, so keep it private. While they are on, the Pi also sends a `HEAD` request to that server to measure latency. Turn them off to stop all of it.",
               "The Pi health page pings a public address (`1.1.1.1`) for its \"internet\" latency only if you set `health.internet_check` to `true` in the service settings; it is off by default."],
        howto=['**How to: the shutdown / restart rule (sudoers)**', '', '1. On the Pi run `sudo visudo -f /etc/sudoers.d/dsf-power` and write this single line, then save:', '   `dsf ALL=(root) NOPASSWD: /usr/sbin/shutdown, /usr/sbin/reboot`', '2. Check the syntax: `sudo visudo -c` (it must report that the files parsed OK). Check what `dsf` may run: `sudo -l -U dsf`.', '3. Test without shutting down: `sudo -u dsf sudo -n -l /usr/sbin/shutdown` prints the path when the rule works and an error when it does not. The real test is the *Shut down now* button, which powers the Pi off.', '4. Undo: `sudo rm /etc/sudoers.d/dsf-power`. Without the file those buttons log an error and the system keeps running.', '', '**How to: the G-code bridge**', '', '1. From the `bridge` folder of the WorkshopService sources, on the Pi: `sudo ./install.sh` (the same command updates it later). It copies the code to `/opt/workshop-bridge`, writes and starts the unit `workshop-gcode-bridge.service` and writes the polkit rule `49-workshop-gcode-bridge.rules`, which lets the `dsf` user start and stop only that unit.', '2. Check: `systemctl status workshop-gcode-bridge`, or the "G-code bridge" section of the System service page.', '3. Undo: `sudo ./install.sh uninstall` removes the unit, the rule and `/opt/workshop-bridge` (your data in `0:/sys/workshop` stays); `sudo ./install.sh no-control` removes only the polkit rule (the page can then no longer start or stop the bridge).', '', '**About AppArmor**', '', '- DSF writes the profile `/etc/apparmor.d/dsf.<PluginId>` from the manifest when the plugin is INSTALLED, not when it is only reloaded or restarted. The permissions you approve in DWC become its lines (details and measurements: `docs/PERMISSIONS.md` of the WorkshopService repository).', '- To see whether it blocks something: `journalctl -k | grep DENIED | grep Workshop` (no output means no denial).', '- If the profile is old or a feature is denied after an update that changed the permissions, install the plugin again from DWC so DSF rewrites the profile, then check the command above once more.']),
    "WorkshopControlBar": dict(
        risk="Medium (buttons that shut the machine down or run your macros)",
        writes=["its buttons and groups in `0:/sys/workshop/config/`"],
        system=["the shutdown and restart buttons need the optional sudo rule of the service (`/etc/sudoers.d/dsf-power`)"],
        notes=["\"Shut down now\" cuts the power of EVERYTHING through the Tuya breaker if you configured one; it asks for confirmation."],
        howto=['**How to: the shutdown / restart rule**', '', '"Shut down now", "Shut down when done" and the full restart run `sudo -n shutdown` / `sudo -n reboot` as the `dsf` user, so they need the sudoers rule. Create it, check it and undo it as described in the section "How to: the shutdown / restart rule (sudoers)" of [WorkshopService](../WorkshopService/README.md): `sudo visudo -f /etc/sudoers.d/dsf-power`, line `dsf ALL=(root) NOPASSWD: /usr/sbin/shutdown, /usr/sbin/reboot`, check with `sudo visudo -c`, undo with `sudo rm /etc/sudoers.d/dsf-power`. Without it the buttons log an error and the system keeps running.']),
    "WorkshopJog": dict(
        risk="Medium-high (moves the machine)",
        writes=["its settings and saved positions in `0:/sys/workshop/`", "the macros it installs into `0:/sys/workshop/macros/` (for example `workzeroaxis.g`, `jogFreeSet.g`)"],
        system=[],
        notes=["Moving is checked by the service (one owner of the motion, homing, limits); STOP and the emergency stop always work."]),
    "WorkshopCamera": dict(
        risk="Low",
        writes=["photos and timelapse videos in `0:/workshop/camera/` (outside `sys/` on purpose: they weigh GB)", "its profiles in `0:/sys/workshop/config/`"],
        system=["`ffmpeg` on the Pi (done by the service) for videos"],
        notes=["The viewer and the relay follow the users of the service: with no users anyone on the network can watch the camera, but only the Pi itself can change the camera settings until the first administrator exists."]),
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
        writes=["its results in `0:/sys/workshop/` (`axis-test.csv`, step ceiling)"],
        system=[],
        notes=["It never writes driver registers (`M569.2` with a value is not in the code). It makes no request to the internet: the pulse reference table travels inside the plugin (`references.json`) and grows with each version. The only external address is the link behind **Share my measurement**, which opens a GitHub issue page in a new tab when you press it."]),
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
        risk="Low-medium (phone notices go to an Internet service once YOU turn them on; they are off by default)",
        writes=["the event history in the service database (7 daily backups kept)"],
        system=["phone notices use the free service ntfy.sh (or your own server); they need Internet access from the Pi and are OFF until you turn them on"],
        notes=["**Off by default.** Turning the phone notices on asks you to confirm, because from then on the event texts (and a camera photo or short video, if you choose one) are sent to a third-party server, `https://ntfy.sh` unless you set your own. Nothing is sent while they are off.",
               "The notice topic works like a password: whoever knows it can read your notices. Keep it private."]),
    "WorkshopWorkbench": dict(
        risk="Medium-high (moves the machine and runs laser and CNC jobs)",
        writes=["work zones `0:/sys/workshop/zones/p<N>.g`, `cutarea.g`", "materials, designs and positions under `0:/sys/workshop/`", "helper jobs in `0:/sys/workshop/gcodes/`",
                "CNC designs `0:/sys/workshop/data/cnc-designs.json` and the files made by the CNC toolpaths in `0:/gcodes/` (they are only written; starting one asks the CNC safety list)"],
        system=[],
        notes=["Laser jobs ask for confirmation, check the active zone and the cut area, and every `G1` it generates carries `S0` unless it must fire the laser.",
               "CNC files start with `sys/workshop/macros/guard/cncguard.g`, which cancels the job unless the machine is in CNC mode, homed and with the Z zero set and the depth and safe Z fit in the Z travel; the page also asks the CNC safety list before Start."]),
    "WorkshopVision": dict(
        risk="High (own Python process; fire watch can pause a job or send an emergency stop)",
        writes=["its settings, bed photos and calibration under `0:/sys/workshop/`"],
        system=["**Downloads from the Internet when you install it:** DSF fetches `opencv-python-headless`, `numpy` and `dsf-python` from PyPI (pypi.org) into the private venv `/opt/dsf/plugins/WorkshopVision/venv`, with the exact versions pinned in `plugin.json`. This happens only at install time and takes a few minutes; nothing is downloaded while the plugin runs. To install without Internet on the Pi, put the wheels of those three packages in a local pip cache or index first", "port 8095 (all interfaces by default; `WORKSHOP_VISION_BIND=127.0.0.1` keeps it on the Pi)"],
        notes=["The fire and smoke watch is a help, NOT a safety system. With no users, the network can only look on port 8095: calibration, photos and fire-watch answers are refused until the first administrator exists (the Pi itself is not limited)."]),
    "WorkshopPrinting": dict(
        risk="Medium (heats; edits the mode files)",
        writes=["`modefff.g`, `select*.g` and `printing.json` through a preview and a `.bak` copy", "its PID and pellet settings under `0:/sys/workshop/`"],
        system=[],
        notes=["Heating tests and PID tuning ask for a double tap and stay off unless you start them."]),
    "WorkshopRS485": dict(
        risk="High (own Python process; writes to an industrial bus; can send M25 / M112 on a device fault)",
        writes=["its devices, buses and profiles under `0:/sys/workshop/`"],
        system=["the `dsf` user must be in the `dialout` group to open the USB-RS485 adapter", "**Downloads from the Internet when you install it:** DSF fetches `pyserial` from PyPI (pypi.org) into the private venv `/opt/dsf/plugins/WorkshopRS485/venv`, with the exact version pinned in `plugin.json`. This happens only at install time; nothing is downloaded while the plugin runs. To install without Internet on the Pi, put the `pyserial` wheel in a local pip cache or index first"],
        notes=["Its API applies the roles before any write to a bus. A device with no axis only warns: it never pauses a job."]),
    "WorkshopModel": dict(
        risk="Medium (it changes global variables that your macros read, and sends the G-code you confirm)",
        api="machine",  # no backend: the page talks to the board through DWC itself
        writes=["the persistence macro `0:/sys/workshop-globals.g` for the globals you mark as persistent (generated by the plugin; you include it from `config.g`)",
                "its presets in `0:/sys/workshop/model/presets.json`, its snapshots of the model in `0:/sys/workshop/model/snapshots.json` and, in SBC mode, the watch history with the memory of the usage finder in `0:/sys/workshop/model/watch.json`"],
        system=[],
        notes=["It needs no backend and no DSF permissions: it talks to the board through the file and G-code API of DWC itself (`rr_` on a standalone Duet, DSF with a Raspberry Pi).",
               "The functions that need a Raspberry Pi (history kept on the Pi, background usage index, persistence applied at boot) turn on by themselves in SBC mode and are hidden on a standalone Duet.",
               "RRF cannot delete a global until a restart: the plugin says so instead of offering a delete button.",
               "The expression tester only sends `echo` or `M409` through the command preview, one line, and refuses an expression that starts with `>` (a write to a file)."]),
    "WorkshopModelAgent": dict(
        risk="Low-medium (own Python process on the Pi; it reads the object model and the macros and writes only its own folder; it sends no G-code)",
        writes=["its folder `0:/sys/workshop-model-agent/`: `settings.json` (written by its page), `history.sqlite` (with `-wal` / `-shm`), "
                "`snapshots/` and `snapshots/kept/`, `usage.json`, `state.json`",
                "its log `agent.log` in the plugin folder (`/opt/dsf/plugins/WorkshopModelAgent/dsf/`, cut at 512 KB, deleted with the plugin)"],
        system=["**Downloads from the Internet when you install it:** DSF fetches `dsf-python` (the version of your DSF line, pinned in `plugin.json`) from PyPI (pypi.org) into its private venv. This happens only at install time; nothing is downloaded while the plugin runs. To install without Internet on the Pi, put the `dsf-python` wheel in a local pip cache or index first"],
        notes=["It needs a Duet in SBC mode (it is a program on the Pi) and depends on no other plugin; Model Explorer finds it at run time.",
               "`commandExecution` is used for three commands only: WriteMessage (its notices), EvaluateExpression of `state.upTime` at start and "
               "ResolvePath of `0:/sys`; it sends no G-code, so nothing it does moves or heats the machine. The list measured on the Pi is "
               "pending: `docs/plugins/WorkshopModelAgent/PERMISSIONS.md`.",
               "No port and no network: its four endpoints (`/machine/WorkshopModelAgent/status`, `history`, `usage`, `action`) are served by DWC's own "
               "web server, which checks the DWC session first, and reach the agent over the DSF socket.",
               "It reads `0:/sys/config.g`, `0:/sys/workshop-globals.g` and the `.g` files of `0:/sys` and `0:/macros`; it never edits them.",
               "Notices are DWC messages (warning or error); with WorkshopService installed its event watcher records them in Activity and the phone "
               "gets the kinds you switched on there. Nothing is deleted without a notice first: snapshots over a limit wait a grace period."]),
}


# Where the code uses each DSF permission (file and function level), for the plugins whose permissions a reviewer will ask about. The table
# of the section gets a third column for these plugins. "unverified" means: not measured on the machine and not confirmed in DSF's own docs.
USES = {
    "WorkshopService": {
        "commandExecution": "G-code through `CommandConnection`: `dsf/jog_move.py` (jog moves), `dsf/status_light.py` (`M150` LEDs), `dsf/machine_ops.py`, `dsf/machine_workarea.py`, `dsf/machine_height.py`, `dsf/frame_ops.py` (Machine page actions, only the closed list of `dsf/machine_gcode.py`), `dsf/main.py`",
        "codeInterceptionReadWrite": "`dsf/main.py` (`InterceptConnection`, `M3`/`M4`/`M5` for the air assist and the live-job activity), `dsf/bed_zones_intercept.py` (`M140`/`M190` for bed zones) and `dsf/jog_move.py` (a lock that blocks motion codes while a jog runs)",
        "objectModelReadWrite": "`dsf/machine_state.py` (one subscription to the model) and `dsf/publisher.py` (`set_plugin_data` of the plugin's own data)",
        "networkAccess": "listens: the camera relay `dsf/camera_relay.py` (port 8090, `camera_relay.bind`) and the optional G-code bridge on port 23 (its own process); connects: the LAN (cameras, the Tuya meter in `dsf/tuya_meter.py`), DSF on `localhost`, and `ntfy.sh` only when you turn the phone notices on (`dsf/notifier.py`)",
        "registerHttpEndpoints": "`dsf/workshop_api.py`: `/machine/WorkshopService/api` (POST and GET)",
        "writeSystem": "SQLite file locks in `0:/sys/workshop/data/duet.db` (`dsf/db.py`); measured with `tools/permission_probe.py`: without it every API call is HTTP 500",
        "fileSystemAccess": "`/opt/dsf/conf/workshop-secrets.json`, `workshop-users.json`, `workshop-roles.json`, `workshop-api-token`, `workshop-camera.key` (`dsf/paths.py`, `dsf/config_store.py`, `dsf/users.py`, `dsf/role_store.py`, `dsf/api_ops.py`, `dsf/camera_key.py`); camera files in `/opt/dsf/sd/workshop/camera/` (`dsf/camera_*.py`); reads of `/proc` and `/sys/class/thermal` (`dsf/health_poller.py`, `dsf/cpu_meter.py`); the LED SPI device named in DSF's `config.json` (`dsf/pi_leds.py`). Measured: without it every call is 401. It could not be narrowed: the files are outside the folders the narrower permissions cover (unverified: DSF's list of folder permissions was not checked on the machine)",
        "launchProcesses": "`ffmpeg` (`dsf/camera_assembly.py`, `dsf/camera_timelapse.py`, `dsf/camera_notice.py`), `pinctrl` (`dsf/pi_leds.py`), `vcgencmd`, `ip`, `nmcli`, `ping`, `systemctl`, `journalctl` (`dsf/health_poller.py`), `systemctl` for the bridge unit (`dsf/bridge_service.py`), `sudo -n shutdown` / `sudo -n reboot` (`dsf/handlers/shutdown_all.py`, `dsf/handlers/reset_all.py`). Measured: without it `exec` of `ip` and `vcgencmd` is denied. DSF has no per-program permission",
    },
    "WorkshopVision": {
        "commandExecution": "`dsf/dsf_io.py` (`CommandConnection`): the G-code of a fire-watch action (pause `M25`, `M112`) and of the calibration photos",
        "objectModelRead": "`dsf/dsf_io.py` (one `SubscribeConnection` in patch mode with a filter list): job, mode, laser",
        "networkAccess": "listens on port 8095 (`WORKSHOP_VISION_BIND`, default all interfaces: `dsf/vision.py` `BIND` / `PORT`); connects to the camera relay `127.0.0.1:8090` and `127.0.0.1:8090/key` (`dsf/vision.py`), to DSF and the service on `127.0.0.1` for roles (`dsf/vision.py`, `dsf/dsf_io.py`), and to the cameras you configure on your LAN (`dsf/vision.py`, `dsf/direct_camera.py`). No Internet host",
        "fileSystemAccess": "reads and writes `0:/sys/workshop/config/vision.json`, `data/vision-bed.json`, `data/vision-fire-log.jsonl` and `data/vision-fire/` (fire-watch photos), reads `config/laser.json` (`dsf/vision.py`, `dsf/fire_watch.py`, `dsf/laser_calibration.py`) and reads `/opt/dsf/conf/workshop-api-token` (`dsf/dsf_io.py`). Not measured with the permission probe (only the service was): unverified whether a narrower DSF permission would cover them",
    },
    "WorkshopRS485": {
        "commandExecution": "`dsf/main.py` (`CommandConnection.perform_simple_code`): `M25` / `M112` on a device fault and the codes of its own actions",
        "codeInterceptionReadWrite": "`dsf/main.py` (`InterceptConnection`, Pre mode, with a filter list): reacts to the codes of a device with an axis",
        "objectModelReadWrite": "`dsf/main.py`: `set_plugin_data` of its device state",
        "fileSystemAccess": "reads and writes `0:/sys/workshop/config/rs485.json` and `data/rs485-history.json`, `rs485-seen.json`, `rs485-backups/` (`dsf/main.py`); opens the serial adapter `/dev/ttyUSB*` / `/dev/ttyACM*` and reads its sysfs data (`dsf/bus.py`, `dsf/diagnosis.py`); writes its log `rs485.log` in the plugin folder. Not measured with the permission probe: unverified whether a narrower permission would cover them",
        "registerHttpEndpoints": "`dsf/workshop_api.py`: `/machine/WorkshopRS485/api`, served by DWC's own web server",
        "networkAccess": "no listener of its own. Its only connection is to `http://127.0.0.1/machine/WorkshopService/api` for the role of the caller (`dsf/rs485_access.py`). Not measured: unverified whether DSF needs this permission for that loopback call or for its own IPC socket",
    },
}

# Extra lines for a plugin's section, kept apart from FACTS so the two can change independently: "system" (what it needs outside the zip) and
# "howto" (a how-to block shown after the existing one)
KIOSK = [
    "**How to: the `kiosk/` scripts**",
    "",
    "They are in the WorkshopService source repository, NOT in the zip: installing the plugin never copies them. You copy the ones you want to your home folder on the kiosk Pi; they run as your login user, not as `dsf`, and none of them needs `sudo` except `chromium-no-zoom` (to install it) and `capture.sh`.",
    "",
    "| Script | What it does | What it writes | How it starts | Remove |",
    "|---|---|---|---|---|",
    "| `ensure-emergencyfab.sh` | puts back into `machine.enabledPlugins` of `0:/sys/dwc-settings.json` the plugins DWC dropped, only when no screen has DWC open; skips plugins you stopped on purpose | that file, through DSF's file API on `http://localhost`; its log `~/ensure-emergencyfab.log` | line in `~/.config/labwc/autostart` | delete the line and the files |",
    "| `keyboard-watchdog.sh` | starts the on-screen keyboard (squeekboard) when a touch screen exists and it is not running | nothing | `~/.config/labwc/autostart` | delete the line |",
    "| `wifi-watchdog.sh` | keeps the Pi on the saved Wi-Fi profile `DUET`: switches the radio on, deletes duplicate profiles named `DUET <n>`, brings `DUET` up (`nmcli`) | NetworkManager connections | `~/.config/labwc/autostart` | delete the line (the profile named in `PROFILE` is not removed) |",
    "| `display-watchdog.sh`, `touch-unlock.sh` | take the black lock layer (`swaylock`) away with `SIGUSR1` after the touch controller re-enumerates or the screen is touched; they never kill it | nothing | `~/.config/labwc/autostart` | delete the lines |",
    "| `screensaver-on.sh`, `screensaver-off.sh` | the idle screensaver: put up and take away the black `swaylock` layer | `/tmp/duet-ss.pid` (removed) | called by `swayidle` | remove them from the `swayidle` command |",
    "| `kiosk-osk.py` | shows / hides the keyboard when the page asks, over D-Bus | nothing; listens on `127.0.0.1:8099` only | `~/.config/labwc/autostart` | delete the line |",
    "| `kiosk-three-fingers.py` | closes the kiosk browser (`pkill -f app=http://localhost`) when the screen is tapped with three fingers at once | nothing | `~/.config/labwc/autostart` | delete the line |",
    "| `chromium-shim.sh` | runs Chromium with `--autoplay-policy=no-user-gesture-required` so DWC can beep | nothing | copied as `~/kiosk-bin/chromium`, put first in `PATH` of the autostart | delete `~/kiosk-bin/chromium` and the `PATH` part |",
    "| `chromium-no-zoom` | adds `--disable-pinch` to Chromium | `/etc/chromium.d/98-no-zoom` (needs `sudo`) | read by Chromium's launcher | `sudo rm /etc/chromium.d/98-no-zoom` |",
    "| `capture.sh` | diagnostic for the G-code bridge: records port 23 with `tcpdump` until you press Ctrl+C | `/tmp/live_job.pcap` (needs `sudo`) | by hand only | nothing to remove |",
]

REMOVE_ALL = [
    "**How to: remove everything the Workshop set added outside the zip**",
    "",
    "Uninstalling a plugin from DWC removes only its own folder. This is everything else, in the order to do it. The last two rows DELETE YOUR DATA and cannot be undone: export the history and take a backup first.",
    "",
    "| What | Command | Deletes your data? |",
    "|---|---|---|",
    "| The plugins | in DWC *Settings > Plugins*, or `PluginManager uninstall <Id>`: the plugins that depend on `WorkshopService` first (stop Vision and RS485 before), `WorkshopService` last | no |",
    "| The AppArmor profile DSF wrote at install (`/etc/apparmor.d/dsf.<Id>`) | check `ls /etc/apparmor.d/dsf.*`; if one is left after uninstalling, `sudo apparmor_parser -R /etc/apparmor.d/dsf.<Id> && sudo rm /etc/apparmor.d/dsf.<Id>` (unverified: whether DSF removes it by itself) | no |",
    "| The shutdown / restart rule | `sudo tools/uninstall-system-rules.sh` (add `--dry-run` to only list); by hand: `sudo rm /etc/sudoers.d/dsf-power` and then `sudo visudo -c` | no |",
    "| The G-code bridge: unit, polkit rule, `/opt/workshop-bridge` | `sudo bridge/install.sh uninstall` (or `sudo tools/uninstall-system-rules.sh --bridge`) | no |",
    "| The kiosk helpers | the table above: delete their lines from `~/.config/labwc/autostart`, the copies in your home folder, `~/kiosk-bin/chromium`, and `sudo rm /etc/chromium.d/98-no-zoom` | no |",
    "| Keys, users, roles, API token, camera key | `sudo rm /opt/dsf/conf/workshop-secrets.json /opt/dsf/conf/workshop-users.json /opt/dsf/conf/workshop-roles.json /opt/dsf/conf/workshop-api-token /opt/dsf/conf/workshop-camera.key`. A new install makes a NEW camera key: an ESP32-CAM flashed with the old one stops authenticating | **yes** |",
    "| Settings, history database, zones, macros and camera files | `sudo rm -rf /opt/dsf/sd/sys/workshop /opt/dsf/sd/workshop`, and `/opt/dsf/sd/sys/workshop-model-agent` and `/opt/dsf/sd/sys/workshop-globals.g` if you used Model Explorer | **yes** |",
    "",
    "Changes you made through the pages to your own files (`config.g` LED count from Lights, the mode files from Printing) keep a `.bak` next to them; uninstalling does not revert them.",
]

EXTRA = {
    "WorkshopService": dict(
        system=["the `kiosk/` helper scripts of the touch-screen Pi, only if you copy them to your home folder (table below); they are not in the zip",
                "`sudo tools/uninstall-system-rules.sh` removes the sudoers rule again (and, with `--bridge`, the bridge)"],
        howto=KIOSK + [""] + REMOVE_ALL),
}


def manifest(pid):
    path = os.path.join(SERVICE, "plugin.json") if pid == "WorkshopService" else None
    if path is None:
        for base in ("src", "vue"):
            p = os.path.join(TP, base, pid, "plugin.json")
            if os.path.isfile(p):
                path = p
    if path is None or not os.path.isfile(path):
        return None  # the plugin folder is not in this tree yet (another branch): nothing to generate
    return json.load(open(path, encoding="utf-8"))


def section(pid, m):
    f = dict(FACTS[pid])
    ex = EXTRA.get(pid) or {}
    f["system"] = list(f["system"]) + list(ex.get("system") or [])
    f["howto"] = list(f.get("howto") or []) + ([""] if f.get("howto") and ex.get("howto") else []) + list(ex.get("howto") or [])
    perms = m.get("sbcPermissions") or []
    out = [START, "", "## Permissions and what it changes", "",
           "Risk: **%s**. Read this before installing; the full document is `security.md` of the Workshop plugins." % f["risk"], ""]
    if perms:
        uses = USES.get(pid)
        out += ["**DSF permissions** (DSF shows them and you approve them when you install; the zip asks for nothing else):", ""]
        if uses:
            out += ["| Permission | What it lets the plugin do | Where the code uses it |", "|---|---|---|"]
            out += ["| `%s` | %s | %s |" % (p, WHAT.get(p, "see the DSF documentation"), uses.get(p, "see `security.md`")) for p in perms]
        else:
            out += ["| Permission | What it lets the plugin do |", "|---|---|"]
            out += ["| `%s` | %s |" % (p, WHAT.get(p, "see the DSF documentation")) for p in perms]
        out += [""]
    elif f.get("api") == "machine":
        out += ["**DSF permissions:** none. It is a page of DWC (it runs in your browser) and talks to the board through the file and G-code API of DWC "
                "itself (`rr_` on a standalone Duet, DSF with a Raspberry Pi); it does not use `WorkshopService`.", ""]
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
    if f.get("howto"):
        out += f["howto"] + [""]
    if f["notes"]:
        out += ["**Safety notes:**"] + ["- " + n for n in f["notes"]] + [""]
    out += ["Uninstalling removes the plugin folder; your data in `0:/sys/workshop/` and `/opt/dsf/conf/workshop-*.json` stays.", "", END]
    return "\n".join(out)


NOTICE_START = "<!-- notice:start -->"
NOTICE_END = "<!-- notice:end -->"
NOTICE = NOTICE_START + chr(10) + ("> **Read before installing.** This plugin runs with real permissions on your machine. Read "
                                   "[SECURITY.md](SECURITY.md) and the section **Permissions and what it changes** below: they say what it can do, "
                                   "which files it writes, and what it sends outside your network (nothing, unless you turn a feature on).") + chr(10) + chr(10) + (
                                   "> **The Workshop users and roles do not protect DWC itself.** Anyone who can open DWC on your network can send G-code, "
                                   "move the machine, edit `config.g` and upload files, whatever the Workshop roles say: Duet has no roles of its own. Set a DWC "
                                   "password (`M551`) and keep the machine on a network you trust.") + chr(10) + NOTICE_END


def with_notice(text):
    """The notice sits right under the title of every README, between markers, so it is replaced and never duplicated."""
    if NOTICE_START in text and NOTICE_END in text:
        return re.sub(re.escape(NOTICE_START) + r".*?" + re.escape(NOTICE_END), lambda _m: NOTICE, text, flags=re.S)
    m = re.match(r"(# [^\n]*\n)", text)
    return NOTICE + chr(10) + chr(10) + text if m is None else text[:m.end()] + chr(10) + NOTICE + chr(10) + text[m.end():]


def apply(readme, block):
    text = with_notice(open(readme, encoding="utf-8").read())
    if START in text and END in text:
        text = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _m: block, text, flags=re.S)
    else:
        # before the section of limits when there is one, else at the end
        m = re.search(r"^## \d+\. Limits", text, flags=re.M)
        text = text[:m.start()] + block + "\n\n" + text[m.start():] if m else text.rstrip("\n") + "\n\n" + block + "\n"
    return text


OUT_START, OUT_END = "<!-- outside-zip:start -->", "<!-- outside-zip:end -->"


def outside_block():
    """The kiosk scripts and the remove-everything list, for publish/docs/security.md (same lists as the Service section)."""
    return chr(10).join([OUT_START, "", "## The kiosk scripts and removing everything", ""] + KIOSK[2:] + [""] + REMOVE_ALL[1:] + ["", OUT_END])


def apply_security(text):
    if OUT_START in text and OUT_END in text:
        return re.sub(re.escape(OUT_START) + r".*?" + re.escape(OUT_END), lambda _m: outside_block(), text, flags=re.S)
    m = re.search(r"^## Network ports and sign-in", text, flags=re.M)
    return text[:m.start()] + outside_block() + chr(10) + chr(10) + text[m.start():] if m else text.rstrip(chr(10)) + chr(10) + chr(10) + outside_block() + chr(10)


def main():
    check = "--check" in sys.argv
    stale = []
    for pid in FACTS:
        m = manifest(pid)
        if m is None:
            print("%s: no plugin.json in this tree, skipped" % pid)
            continue
        readme = os.path.join(TP, "docs", "plugins", pid, "README.md")
        new = apply(readme, section(pid, m))
        if new != open(readme, encoding="utf-8").read():
            stale.append(pid)
            if not check:
                with open(readme, "w", encoding="utf-8", newline=chr(10)) as fh:
                    fh.write(new)
    sec = os.path.join(TP, "publish", "docs", "security.md")
    if os.path.isfile(sec):
        cur = open(sec, encoding="utf-8").read()
        fresh = apply_security(cur)
        if fresh != cur:
            stale.append("publish/docs/security.md")
            if not check:
                with open(sec, "w", encoding="utf-8", newline=chr(10)) as fh:
                    fh.write(fresh)
    print(("out of date: " if check else "updated: ") + ", ".join(stale) if stale else "all up to date")
    sys.exit(1 if (check and stale) else 0)


if __name__ == "__main__":
    main()
