"""Copies the texts the WorkshopService publishes (area "svc" of its page catalogs) into the shared catalogs here.

The service publishes its own texts (status light names, motor faults, process details, risks...) as {key, params}, and
every page translates them with its own i18n (src/_shared/06-service-text.js, vue/_shared/service-text.js), so two
viewers with different languages each read their own. The templates are the service's: WorkshopService/dsf/published_texts.py
writes them into WorkshopService/dwc-src/i18n/{es,en}.json (area "svc"), and this copies that area into

    src/_shared/i18n/{es,en}.json    (every JS plugin: i18nT('svc.<key>'))
    vue/_shared/i18n/{es,en}.json    (every Vue plugin: plugins.<Id>.svc.<key>)
    vue/_shared36/i18n/{es,en}.json  (the same for the DWC 3.6 line)

    python tools/sync_service_texts.py [path of the WorkshopService repo]   (default: $WORKSHOP_SERVICE_DIR or ../WorkshopService)
    python tools/sync_service_texts.py --check [path]                       exit 1 if a copy differs (tests/service-texts.test.js)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AREA = "svc"
TARGETS = [os.path.join(ROOT, "src", "_shared", "i18n"), os.path.join(ROOT, "vue", "_shared", "i18n"), os.path.join(ROOT, "vue", "_shared36", "i18n")]


def service_dir(argv):
    args = [a for a in argv if not a.startswith("--")]
    return args[0] if args else os.environ.get("WORKSHOP_SERVICE_DIR") or os.path.join(os.path.dirname(ROOT), "WorkshopService")


def source(svc_dir, lang):
    with open(os.path.join(svc_dir, "dwc-src", "i18n", lang + ".json"), encoding="utf-8") as f:
        return json.load(f)[AREA]


def main(argv):
    svc = service_dir(argv)
    check = "--check" in argv
    bad = []
    for lang in ("es", "en"):
        area = source(svc, lang)
        for d in TARGETS:
            p = os.path.join(d, lang + ".json")
            with open(p, encoding="utf-8") as f:
                data = json.load(f)
            if data.get(AREA) == area:
                continue
            if check:
                bad.append(os.path.relpath(p, ROOT))
                continue
            data[AREA] = area
            with open(p, "rb") as f:
                crlf = b"\r\n" in f.read()
            with open(p, "w", encoding="utf-8", newline="\r\n" if crlf else "\n") as f:  # keeps the line endings of the file
                json.dump(data, f, ensure_ascii=False, indent="\t")
                f.write("\n")
            print("updated " + os.path.relpath(p, ROOT))
    if check:
        print("out of date: " + ", ".join(bad) if bad else "up to date")
        return 1 if bad else 0
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
