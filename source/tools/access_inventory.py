"""Scanner of the operations of the API that a plugin of the workshop names in its code (phase 5 of the access control plan).

Ported from the read-only inventory of phase 0 (informes/control-acceso/tools/inventory_plugins.py) so that the manifests of TallerPlugins can be
generated again at any time from THIS checkout: the paths come from the checkout, the contract from the service (see gen_permissions.py).

Method: tokenise JS / Vue / PY sources (comments removed), take every string literal shaped like an operation name (a.b or a.b.c, lower case) and cross
it with the operations of the API contract. Literals that are not in the contract but whose first segment is a namespace of the contract are reported
as unknown candidates (to review by hand). The wrappers that build the name from a prefix are listed in DYNAMIC (found by hand, checked in the report).
"""
import collections
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TP = ROOT
OPS = {}
NS = set()


def configure(contract_ops):
    """Sets the operations of the API (the `ops` of dsf/golden/api_contract.json) the scan crosses the literals with."""
    OPS.clear()
    OPS.update(contract_ops)
    NS.clear()
    NS.update(o.split(".")[0] for o in OPS)


OPRE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$")
PREFRE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*\.$")
CHECK = re.compile(r"(workshopCan|canDo|tvCan|tzLjCan|lockReasonOp|lockKindOp|\bcan|Can|roleCan|allowed|why_not|opAllowed)\w*\s*\(\s*$")
EXCL = {"node_modules", "dist", "test", "tests", "__pycache__", "i18n", "releases"}

def files(roots, exts):
    for r in roots:
        base = os.path.join(TP, r)
        for d, ds, fs in os.walk(base):
            ds[:] = [x for x in ds if x not in EXCL]
            for f in fs:
                if f.endswith(exts) and not f.endswith((".test.js", ".spec.js")):
                    yield os.path.join(d, f)

def js_literals(src):
    """yield (line, string_body, preceding_text_on_code) skipping comments."""
    i, n, line = 0, len(src), 1
    last = ""  # last 80 code chars
    while i < n:
        c = src[i]
        if c == "\n": line += 1; last += c; i += 1; continue
        if c == "/" and i + 1 < n and src[i+1] == "/":
            while i < n and src[i] != "\n": i += 1
            continue
        if c == "/" and i + 1 < n and src[i+1] == "*":
            j = src.find("*/", i + 2); j = n if j < 0 else j + 2
            line += src.count("\n", i, j); i = j; continue
        if c in "'\"`":
            q, j, ln0 = c, i + 1, line
            buf = []
            while j < n and src[j] != q:
                if src[j] == "\\": buf.append(src[j+1:j+2]); j += 2; continue
                if src[j] == "\n":
                    line += 1
                    if q != "`": break
                buf.append(src[j]); j += 1
            yield ln0, "".join(buf), last[-60:]
            last += "S"; i = j + 1; continue
        last += c; i += 1
        if len(last) > 200: last = last[-100:]

def py_literals(src):
    for ln, l in enumerate(src.splitlines(), 1):
        s = l.strip()
        if s.startswith("#"): continue
        for m in re.finditer(r"""(['"])([^'"\n]*)\1""", l):
            yield ln, m.group(2), l[:m.start()][-60:]

I18N_CALLEE = re.compile(r"(?:^|[^\w$])(?:t|nT|tA|tx|ts|tzTx|tvTx|tz|tv|te|h\.t|this\.t|this\.tA|this\.ts|\$t|i18n\.t|workshopApiT|T)\s*\(\s*$")
def api_ish(ctx):
    """True when the literal is an argument of an API-like callee, or sits in a list/table (not of a translator call)."""
    m = re.search(r"([\w$.]+)\s*\(\s*$", ctx)
    if m:
        return bool(re.search(r"api|call|op$|ops|fetch|post|request|send|can|invoke|act|run|guard|reason", m.group(1), re.I)) and not I18N_CALLEE.search(ctx)
    return bool(re.search(r"[\[,:{]\s*$", ctx))
# Wrappers that build the operation name as <prefix>.<literal first argument>: (prefix, wrapper function). Found by hand with the
# PRE (prefix) report of this tool; each one is checked in the report.
DYNAMIC = [("motors", "request", ""), ("config", "callConfig", ""), ("config", "callApi", "WorkshopConfig/"), ("notifications", "noticeCmd", ""),
           ("pid", "m9003", "Pid.vue"), ("meter", "m9003", "MeterConfig.vue"), ("lights", "lightsApi", ""), ("bigpart", "tgPi", "")]
TEMPLATE_DYN = re.compile(r"^[a-z][a-z0-9_]*\.(?:[a-z0-9_]+\.)*\$\{")
def scan(roots):
    uses = collections.defaultdict(list)   # op -> [(file,line,kind)]
    unknown = collections.defaultdict(list)
    prefixes = collections.defaultdict(list)
    for f in files(roots, (".js", ".vue", ".py", ".mjs")):
        rel = os.path.relpath(f, TP).replace("\\", "/")
        src = open(f, encoding="utf-8", errors="replace").read()
        if f.endswith(".vue"):
            src = re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), src, flags=re.S)
            it = js_literals_vue(src)
        elif f.endswith(".py"): it = py_literals(src)
        else: it = js_literals(src)
        for ln, s, ctx in it:
            s = s.strip()
            if OPRE.match(s):
                kind = "check" if CHECK.search(ctx) else "use"
                if s in OPS: uses[s].append((rel, ln, kind))
                elif s.split(".")[0] in NS and api_ish(ctx): unknown[s].append((rel, ln, kind, ctx.strip()[-40:]))
            elif PREFRE.match(s) and s.split(".")[0] in NS and len(s) > 3:
                prefixes[s].append((rel, ln))
            elif TEMPLATE_DYN.match(s) and s.split(".")[0] in NS:
                prefixes[s].append((rel, ln))
        if not f.endswith(".py"):
            for pre, fn, only in DYNAMIC:
                if only not in rel: continue
                for m in re.finditer(r"(?<![\w$])" + fn + r"\(\s*['\"]([a-z_0-9]+)['\"]", src):
                    op = pre + "." + {"adjust": "fit"}.get(m.group(1), m.group(1)) if pre == "bigpart" else pre + "." + m.group(1)  # TG_OPS maps adjust -> fit (48-large.js:21)
                    ln = src.count(chr(10), 0, m.start()) + 1
                    (uses if op in OPS else unknown)[op].append((rel, ln, "dyn") if op in OPS else (rel, ln, "dyn", fn))
    return uses, unknown, prefixes

def js_literals_vue(src):
    # <script> blocks through the tokenizer; template / style: quoted op-looking literals by regex (no apostrophe trouble)
    for m in re.finditer(r"<script[^>]*>(.*?)</script>", src, flags=re.S):
        off = src.count("\n", 0, m.start(1))
        for ln, s, ctx in js_literals(m.group(1)): yield ln + off, s, ctx
    for m in re.finditer(r"<template[^>]*>.*</template>", src, flags=re.S):
        off = src.count("\n", 0, m.start())
        for mm in re.finditer(r"""(['"])([a-z][a-z0-9_.]*)\1""", m.group(0)):
            yield off + m.group(0).count("\n", 0, mm.start()) + 1, mm.group(2), m.group(0)[max(0, mm.start()-60):mm.start()]



# ---- the plugins of the access model: Id -> (namespace, the prefixes of the API operations it owns). Decided from the inventory of phase 0
# (INVENTARIO-PLUGINS.md, 1.1 and 2.4): a prefix has ONE owner; what a plugin calls outside its prefixes is declared `shared`.
# WorkshopConfig (no development, not installed) and WorkshopModelAgent (its own API, no operation of the service, no table of roles) are not here.
PLUGINS = {
    "WorkshopWorkbench": ("workbench", ["bigpart", "frame", "job", "livejob", "trace", "workstate"]),
    "WorkshopMachine": ("machine", ["machine"]),
    "WorkshopMotors": ("motors", ["motors"]),
    "WorkshopActivity": ("activity", ["activity", "notifications"]),
    "WorkshopPrinting": ("printing", ["bedcal", "bedestimates", "bedzones", "gcodelib", "jobs", "layerrecipes", "pelletlayers", "pid"]),
    "WorkshopPower": ("power", ["energy", "meter", "power"]),
    "WorkshopPiHealth": ("pihealth", ["health"]),
    "WorkshopCamera": ("camera", ["camera"]),
    "WorkshopControlBar": ("controlbar", []),
    "WorkshopJog": ("jog", ["jog"]),
    "WorkshopModel": ("model", []),
    "WorkshopLights": ("lights", ["light", "lights", "statuslight"]),
    "WorkshopRS485": ("rs485", []),
    "WorkshopVision": ("vision", ["vision"]),
}
SRC_PLUGINS = {"WorkshopWorkbench", "WorkshopCamera", "WorkshopControlBar", "WorkshopJog", "WorkshopVision"}
# The operation a page builds from a variable that no literal shows (found by hand in phase 0, final_table.py).
MANUAL = {"WorkshopMotors": [("motors.disable", "vue/WorkshopMotors/dwc36/dwc-src/enable.js")]}


def roots_of(plugin):
    """The folders the code of a plugin is made of: its own, the ones its _includes.txt names (JS plugins), the DSF server it carries."""
    if plugin in SRC_PLUGINS:
        roots = ["src/" + plugin]
        inc = os.path.join(TP, "src", plugin, "_includes.txt")
        if os.path.isfile(inc):
            with open(inc, encoding="utf-8") as f:
                roots += ["src/" + ln.strip() for ln in f if ln.strip() and not ln.strip().startswith("#")]
        return roots
    roots = ["vue/%s/dwc36" % plugin]
    if os.path.isdir(os.path.join(TP, "vue", plugin, "dsf")):
        roots.append("vue/%s/dsf" % plugin)
    return roots


def operations_of(plugin):
    """({operation: [(file, line, kind)]}, unknown candidates) of one plugin, test mocks left out."""
    uses, unknown, _prefixes = scan(roots_of(plugin))
    uses = {op: [u for u in lst if "mock" not in u[0]] for op, lst in uses.items()}
    uses = {op: lst for op, lst in uses.items() if lst}
    for op, rel in MANUAL.get(plugin, []):
        uses.setdefault(op, []).append((rel, 0, "dyn"))
    return uses, unknown


def shared_clients():
    """The operations the shared clients of every plugin name (src/_shared and vue/_shared36)."""
    out = set()
    for root in ("src/_shared", "vue/_shared36"):
        uses = scan([root])[0]
        out |= {op for op, lst in uses.items() if any(kind != "check" and not f.endswith("/role-view.js") for f, _l, kind in lst)}  # role-view.js only holds tables of what the buttons check
    return out
