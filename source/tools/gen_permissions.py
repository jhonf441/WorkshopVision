"""Writes (or checks) the permissions.json of every plugin of the workshop (phase 5 of the access control plan).

    PYTHONDONTWRITEBYTECODE=1 python tools/gen_permissions.py --service <WorkshopService>/dsf [--check] [--report]

What it does: scans the code of each plugin (tools/access_inventory.py), crosses it with the API contract and the tables of the service
(dsf/golden/api_contract.json, permissions.py, permission_caps.py, access_plugin_manifest.py: the service decides the levels of the profiles, this
script only asks it), and writes <plugin folder>/dsf/permissions.json (src/<Id>/dsf/ or vue/<Id>/dsf/: build.py puts the whole dsf/ folder of a
plugin in its zip and lists it in dsfFiles). The service reads <plugins folder>/<Id>/dsf/permissions.json.
  --check   writes nothing: exit 1 when a file is missing or differs from what the code says now (the structure test runs it)
  --report  prints what the scan found (operations per plugin, shared ones, administrator-only ones, the common client set)
The service folder can also come from the environment variable WORKSHOP_SERVICE_DSF.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
SATELLITE = {"WorkshopVision": "vision_access.py", "WorkshopRS485": "rs485_access.py", "WorkshopCamera": "camera_access.py (inside the service)"}


def load_service(dsf):
    """Imports the modules of the service from its dsf/ folder; returns (contract ops, access_plugin_manifest)."""
    sys.dont_write_bytecode = True
    sys.path.insert(0, dsf)
    with open(os.path.join(dsf, "golden", "api_contract.json"), encoding="utf-8") as f:
        ops = json.load(f)["ops"]
    import access_plugin_manifest
    return ops, access_plugin_manifest


def plugin_dir(inv, plugin):
    return os.path.join(inv.TP, "src" if plugin in inv.SRC_PLUGINS else "vue", plugin)


def manifest_of(inv, apm, plugin):
    namespace, prefixes = inv.PLUGINS[plugin]
    uses, _unknown = inv.operations_of(plugin)
    ops = sorted(uses)
    held, restricted = apm.derive(ops)
    m = {
        "version": apm.FORMAT_VERSION,
        "plugin": plugin,
        "namespace": namespace,
        "prefixes": sorted(prefixes),
        "ui": "ui:%s:open" % namespace,
        "operations": ops,
        "shared": [op for op in ops if apm.prefix_of(op) not in prefixes],
        "restricted": restricted,
        "targets": sorted({t for t in (apm.target_type_of(op) for op in ops) if t}),
        "profiles": {lv: {"title": apm.title_of(plugin, lv), "capabilities": held[lv]} for lv in apm.LEVELS},
    }
    if plugin in SATELLITE:
        m["satellite"] = SATELLITE[plugin]
    return m


def text_of(m):
    return json.dumps(m, indent=2, ensure_ascii=False) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--service", default=os.environ.get("WORKSHOP_SERVICE_DSF"))
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    if not a.service:
        sys.exit("give the dsf/ folder of WorkshopService: --service <path> or WORKSHOP_SERVICE_DSF")
    ops, apm = load_service(os.path.abspath(a.service))
    import access_inventory as inv
    inv.configure(ops)
    bad = []
    for plugin in sorted(inv.PLUGINS):
        m = manifest_of(inv, apm, plugin)
        path = os.path.join(plugin_dir(inv, plugin), "dsf", "permissions.json")
        text = text_of(m)
        if a.report:
            print("%-18s ops %-3d shared %-3d restricted %-2d targets %s" % (plugin, len(m["operations"]), len(m["shared"]), len(m["restricted"]), m["targets"]))
            print("    restricted: %s" % m["restricted"])
        if a.check:
            if not os.path.isfile(path) or open(path, encoding="utf-8", newline="").read() != text:
                bad.append(path)
        else:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(text)
    common = inv.shared_clients()
    missing = sorted(common - set(apm.COMMON_OPERATIONS))
    if a.report or missing:
        print("common client operations: %d; named by the shared clients and NOT in COMMON_OPERATIONS: %s" % (len(common), missing))
    if bad:
        print("out of date or missing:\n  " + "\n  ".join(bad))
    sys.exit(1 if bad or missing else 0)


if __name__ == "__main__":
    main()
