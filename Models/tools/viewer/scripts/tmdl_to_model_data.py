#!/usr/bin/env python3
"""Build step 1 — TMDL (or model.bim) -> model-data.json for the Semantic Model Viewer.

This is a straight port of the viewer's `js/tmdl-parser.js`: the same regexes, the same
role/domain heuristics, the same output shape. Keep the two in sync — the browser parser
is used for drag-and-drop import, this script for the committed snapshot.

Usage:
    python3 tmdl_to_model_data.py "Models/demo/Contoso Retail.SemanticModel" \
        -o Models/tools/viewer/model-data.json

The input may be a *.SemanticModel folder, its `definition` folder, any folder holding
.tmdl files, or a model.bim / .json file.

Output schema (as consumed by the viewer):
    {"name": str,
     "tables": [{"name","role","domain","source","colCount","measureCount","relCount",
                 "dax"?: calculated table / field parameter expression,
                 "calcItems"?: [{"name","dax","fmt"}]  (calculation groups),
                 "columns":[{"name","dataType","hidden","isCalc","isKey","rel","dax"?}],
                 "measures":[{"name","dax","folder","fmt","h"?}]}],
     "relationships": [{"from","fromCol","to","toCol","fromCard","toCard","inactive","both"}]}

`h: 1` is emitted only for measures carrying `isHidden` in TMDL — the viewer's
hidden-measure badge depends on it.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

# ---------------------------------------------------------------- helpers


def unq(s: str) -> str:
    s = str(s).strip()
    if len(s) >= 2 and s[0] == "'" and s[-1] == "'":
        return s[1:-1].replace("''", "'")
    return s


def cap(s: str) -> str:
    s = str(s or "")
    return s[0].upper() + s[1:] if s else s


def parse_ref(s: str):
    """'Table Name'.column  |  Table.column -> (table, column)"""
    s = s.strip()
    m = re.match(r"^'((?:[^']|'')+)'\.(.+)$", s)
    if m:
        return m.group(1).replace("''", "'"), unq(m.group(2))
    i = s.find(".")
    if i < 0:
        return None
    return s[:i].strip(), unq(s[i + 1:])


def dedent(lines):
    """DAX bodies come as raw lines: drop ``` fences, trim blank edges, remove the common indent."""
    ls = [l for l in lines if not re.match(r"^\s*```", l)]
    while ls and not ls[0].strip():
        ls.pop(0)
    while ls and not ls[-1].strip():
        ls.pop()
    indents = [len(re.match(r"^[ \t]*", l).group(0)) for l in ls if l.strip()]
    cut = min(indents) if indents else 0
    return "\n".join(l[cut:].rstrip() for l in ls)


# ---------------------------------------------------------------- relationships.tmdl


def parse_rel_text(text: str):
    out, cur = [], None
    for raw in text.splitlines():
        t = raw.strip()
        if not t:
            continue
        if re.match(r"^relationship\s", t) and not raw.startswith("\t"):
            cur = {"fromCard": "many", "toCard": "one", "inactive": False, "both": False}
            out.append(cur)
            continue
        if cur is None:
            continue
        m = re.match(r"^fromColumn:\s*(.+)$", t)
        if m:
            r = parse_ref(m.group(1))
            if r:
                cur["from"], cur["fromCol"] = r
            continue
        m = re.match(r"^toColumn:\s*(.+)$", t)
        if m:
            r = parse_ref(m.group(1))
            if r:
                cur["to"], cur["toCol"] = r
            continue
        m = re.match(r"^toCardinality:\s*(\w+)", t)
        if m:
            cur["toCard"] = m.group(1)
            continue
        m = re.match(r"^fromCardinality:\s*(\w+)", t)
        if m:
            cur["fromCard"] = m.group(1)
            continue
        if re.match(r"^isActive:\s*false", t):
            cur["inactive"] = True
        elif re.match(r"^crossFilteringBehavior:\s*bothDirections", t):
            cur["both"] = True
    return [r for r in out if r.get("from") and r.get("fromCol") and r.get("to") and r.get("toCol")]


# ---------------------------------------------------------------- tables/*.tmdl


def parse_table_text(text: str):
    lines = text.splitlines()
    table = None
    mode = cur_col = cur_meas = None
    part_kind, part_src = "", ""
    is_cg = is_fp = False
    col_buf = calc_buf = cur_item = item_buf = item_fmt = None
    item_phase, in_source = "", False

    def flush_col():
        nonlocal col_buf
        if cur_col is not None and col_buf is not None:
            d = dedent(col_buf)
            if d:
                cur_col["dax"] = d
        col_buf = None

    def flush_item():
        nonlocal cur_item, item_buf, item_fmt, item_phase
        if cur_item is not None:
            d = dedent(item_buf or [])
            if d:
                cur_item["dax"] = d
            if item_fmt:
                f = dedent(item_fmt)
                if f:
                    cur_item["fmt"] = f
        cur_item = item_buf = item_fmt = None
        item_phase = ""

    for raw in lines:
        t = raw.strip()
        ind = len(re.match(r"^\t*", raw).group(0))
        if not t:
            if mode == "measure" and cur_meas and cur_meas["dax"]:
                cur_meas["dax"] += "\n"
            elif col_buf is not None:
                col_buf.append("")
            elif mode == "cg" and item_phase == "expr" and item_buf is not None:
                item_buf.append("")
            elif mode == "cg" and item_phase == "fmt" and item_fmt is not None:
                item_fmt.append("")
            elif mode == "partition" and in_source and calc_buf is not None:
                calc_buf.append("")
            continue
        if ind == 0:
            if table is None:
                m = re.match(r"^table\s+(.+)$", t)
                if m:
                    table = {"name": unq(m.group(1)), "columns": [], "measures": []}
            continue
        if table is None:
            continue
        if ind == 1:
            flush_col()
            flush_item()
            in_source = False
            cur_col = cur_meas = None
            mode = None
            m = re.match(r"^column\s+('(?:[^']|'')+'|\"[^\"]+\"|[^\s=]+)(\s*=.*)?$", t)
            if m:
                cur_col = {"name": unq(m.group(1).replace('"', "")), "dataType": "", "hidden": False,
                           "isCalc": bool(m.group(2)), "isKey": False, "rel": False}
                table["columns"].append(cur_col)
                mode = "column"
                if m.group(2):
                    inline = re.sub(r"^\s*=\s*", "", m.group(2))
                    col_buf = [inline] if inline else []
                continue
            m = re.match(r"^measure\s+('(?:[^']|'')+'|\"[^\"]+\"|[^\s=]+)\s*=\s*(.*)$", t)
            if m:
                cur_meas = {"name": unq(m.group(1).replace('"', "")), "dax": (m.group(2) or "").strip(),
                            "folder": "", "fmt": ""}
                table["measures"].append(cur_meas)
                mode = "measure"
                continue
            if re.match(r"^calculationGroup\b", t):
                is_cg = True
                mode = "cg"
                continue
            m = re.match(r"^partition\s+.*?=\s*(\w+)\s*$", t)
            if m:
                part_kind = m.group(1)
                mode = "partition"
                continue
            # `annotation SMV_Role = fact|dim|helper|standalone` — explicit role, beats every heuristic
            m = re.match(r"^annotation\s+SMV_Role\s*=\s*(\w+)", t, re.I)
            if m:
                table["roleAnnotation"] = m.group(1).lower()
                continue
            continue
        if re.match(r"^extendedProperty\s+ParameterMetadata", t):
            is_fp = True
        if mode == "cg":
            if ind == 2:
                flush_item()
                m = re.match(r"^calculationItem\s+('(?:[^']|'')+'|\"[^\"]+\"|[^\s=]+)\s*(?:=\s*(.*))?$", t)
                if m:
                    cur_item = {"name": unq(m.group(1).replace('"', "")), "dax": "", "fmt": ""}
                    table.setdefault("calcItems", []).append(cur_item)
                    first = (m.group(2) or "").strip()
                    item_buf = [first] if first else []
                    item_phase = "expr"
            elif cur_item is not None:
                is_prop = ind == 3 and re.match(
                    r"^(formatStringDefinition|description|ordinal|lineageTag|annotation|isHidden|changedProperty)\b", t)
                if is_prop:
                    item_phase = ""
                    m = re.match(r"^formatStringDefinition\s*=\s*(.*)$", t)
                    if m:
                        item_phase = "fmt"
                        item_fmt = [m.group(1).strip()] if m.group(1).strip() else []
                elif item_phase == "expr":
                    item_buf.append(raw)
                elif item_phase == "fmt" and item_fmt is not None:
                    item_fmt.append(raw)
            continue
        if mode == "column" and cur_col is not None:
            if ind >= 3 and col_buf is not None:
                col_buf.append(raw)
                continue
            if ind == 2:
                flush_col()
            m = re.match(r"^dataType:\s*(\S+)", t)
            if m:
                cur_col["dataType"] = m.group(1)
            elif re.match(r"^isHidden\s*$", t):
                cur_col["hidden"] = True
            elif re.match(r"^isKey\s*$", t):
                cur_col["isKey"] = True
        elif mode == "measure" and cur_meas is not None:
            if ind >= 3:
                cur_meas["dax"] += ("\n" if cur_meas["dax"] else "") + re.sub(r"^\t{3}", "", raw)
            else:
                m = re.match(r"^formatString:\s*(.*)$", t)
                if m:
                    cur_meas["fmt"] = m.group(1)
                    continue
                m = re.match(r"^displayFolder:\s*(.*)$", t)
                if m:
                    cur_meas["folder"] = m.group(1)
                    continue
                if re.match(r"^isHidden\s*$", t):
                    cur_meas["h"] = 1          # REQUIRED for the hidden-measure badge
        elif mode == "partition":
            part_src += t + "\n"
            if ind == 2:
                in_source = False
                m = re.match(r"^source\s*=\s*(.*)$", t)
                if m:
                    in_source = True
                    calc_buf = [m.group(1).strip()] if m.group(1).strip() else []
            elif in_source and calc_buf is not None:
                calc_buf.append(raw)

    flush_col()
    flush_item()
    if table is not None and part_kind == "calculated" and calc_buf is not None:
        tdax = dedent(calc_buf)
        if tdax:
            table["dax"] = tdax
    if table is not None:
        table["_flags"] = {"isCG": is_cg, "isFP": is_fp, "partKind": part_kind,
                           "partSrc": part_src, "tableName": table["name"]}
    return table


# ---------------------------------------------------------------- connectors
# Mirrors CONNECTORS / resolve_src in js/tmdl-parser.js — keep the two in step.
# A partition rarely names its connector: it says `Source = VerticaPath` and the real
# Vertica.Database(...) call lives in a shared expression, so the source has to be
# resolved through the expressions (and the scalar parameters they reference).
CONNECTORS = [
    ("databricks", "Databricks",        r"\bDatabricks\.",                            True),
    ("vertica",    "Vertica",           r"\bVertica\.Database\s*\(",                  True),
    ("db",         "SQL Server",        r"\bSql\.Databases?\s*\(",                    True),
    ("oracle",     "Oracle",            r"\bOracle\.Database\s*\(",                   True),
    ("postgres",   "PostgreSQL",        r"\bPostgreSQL\.Database\s*\(",               True),
    ("mysql",      "MySQL",             r"\bMySQL\.Database\s*\(",                    True),
    ("snowflake",  "Snowflake",         r"\bSnowflake\.Databases?\s*\(",              True),
    ("synapse",    "Synapse",           r"\bSynapse\.|\bAzureSynapse\.",              True),
    ("lakehouse",  "Fabric",            r"\bLakehouse\.Contents|\bFabric\.",          True),
    ("ssas",       "Analysis Services", r"\bAnalysisServices\.Databases?\s*\(",       True),
    ("sap",        "SAP",               r"\bSap(Hana|BusinessWarehouse)\.",           True),
    ("odbc",       "ODBC",              r"\bOdbc\.(DataSource|Query)\s*\(",           True),
    ("dataflow",   "Dataflow",          r"\b(PowerBI|PowerPlatform)\.Dataflows\s*\(", False),
    ("sharepoint", "SharePoint",        r"\bSharePoint\.(Contents|Files|Tables)\s*\(", False),
    ("blob",       "Azure Storage",     r"\bAzureStorage\.(Blobs|DataLake|Tables)\s*\(", False),
    ("salesforce", "Salesforce",        r"\bSalesforce\.(Data|Reports)\s*\(",         False),
    ("folder",     "Folder",            r"\bFolder\.(Files|Contents)\s*\(",           False),
    ("excel",      "Excel",             r"\bExcel\.(Workbook|CurrentWorkbook)\s*\(",  False),
    ("csv",        "CSV / text",        r"\bCsv\.Document\s*\(",                     False),
    ("web",        "Web",               r"\bWeb\.(Contents|BrowserContents)\s*\(",    False),
    ("odata",      "OData",             r"\bOData\.Feed\s*\(",                       False),
]


def scan_conn(src: str):
    for kind, label, pat, is_db in CONNECTORS:
        if re.search(pat, src):
            return {"kind": kind, "label": label, "db": is_db}
    return None


def refs_in(src: str, ctx: dict, skip: set) -> list:
    """Referenced query names, earliest first: `Source = X` is the primary feed."""
    hits = []
    for n in ctx["names"]:
        if n in skip:
            continue
        m = re.search(r"(^|[^\w.'\"])" + re.escape(n) + r"($|[^\w])", src)
        if m:
            hits.append((m.start(), n))
    hits.sort()
    return [n for _, n in hits]


def resolve_src(src: str, ctx: dict, self_name: str = None) -> dict:
    """Follow the FIRST reference all the way down before trying later ones."""
    seen = {self_name} if self_name else set()
    texts = [src]

    def walk(text, depth):
        conn = scan_conn(text)
        if conn:
            return {"conn": conn, "hit": text}
        if depth > 8:
            return None
        refs = refs_in(text, ctx, seen)
        seen.update(refs)
        for n in refs:
            body = ctx["exprs"].get(n)
            if not body:
                continue
            texts.append(body)
            r = walk(body, depth + 1)
            if r:
                return {"conn": r["conn"], "hit": r["hit"], "via": n}
        return None

    res = walk(src, 0)
    return {"conn": res and res["conn"], "text": "\n".join(texts),
            "via": res and res.get("via"), "hit": res and res["hit"]}


def lit_or_param(tok, ctx):
    if tok is None:
        return None
    tok = str(tok).strip()
    q = re.match(r'^"(.*)"$', tok)
    if q:
        return q.group(1)
    return ctx["params"].get(tok)


def first_of(text, pat, grp=1):
    m = re.search(pat, text)
    return m.group(grp) if m else None


def last_name(text: str):
    """Deepest navigation step names the actual file or folder."""
    last, with_ext = None, None
    for m in re.finditer(r'\[Name\s*=\s*"([^"]+)"', text):
        last = m.group(1)
        if re.search(r"\.[A-Za-z0-9]{2,5}$", last):
            with_ext = last
    return with_ext or last


def source_of(fl: dict, ctx: dict = None) -> dict:
    ctx = ctx or {"exprs": {}, "names": [], "params": {}}
    part = fl.get("partSrc") or ""
    if fl.get("partKind") == "calculated":
        return {"kind": "calculated"}
    if not part:
        return {"kind": "calculated"}
    # a query parameter is not a data source, it is a knob feeding one
    if re.search(r"meta\s*\[[^\]]*IsParameterQuery\s*=\s*true", part, re.I):
        return {"kind": "parameter", "label": "Parameter",
                "detail": (first_of(part, r"^\s*([^\n]{0,40}?)\s*meta\b") or "")}
    # hard-coded rows beat everything: an inline table is not a data source
    if re.search(r"Table\.FromRows|#table\s*\(|Binary\.FromText", part):
        return {"kind": "manual"}

    r = resolve_src(part, ctx, fl.get("tableName"))
    if not r["conn"]:
        return {"kind": "other", "label": "Other", "via": r["via"]}
    c, all_txt = r["conn"], r["text"]
    out = {"kind": c["kind"], "label": c["label"]}
    if r["via"]:
        out["via"] = r["via"]

    tab = (first_of(part, r'\{\[Name\s*=\s*"([^"]+)"\s*,\s*Kind\s*=\s*"(?:Table|View)"\]\}')
           or first_of(part, r'\bItem\s*=\s*"([^"]+)"')
           or first_of(part, r'\bentity\s*=\s*"([^"]+)"')
           or first_of(all_txt, r'\{\[Name\s*=\s*"([^"]+)"\s*,\s*Kind\s*=\s*"(?:Table|View)"\]\}')
           or first_of(all_txt, r'\bentity\s*=\s*"([^"]+)"'))

    if c["db"]:
        sch = (lit_or_param(first_of(all_txt, r'\{\[Name\s*=\s*("[^"]+"|[A-Za-z_]\w*)\s*,\s*Kind\s*=\s*"Schema"\]\}'), ctx)
               or first_of(all_txt, r'\bSchema\s*=\s*"([^"]+)"'))
        out["schema"] = sch or "unknown"
        out["table"] = tab or "?"
        out["detail"] = (sch + "." if sch else "") + (tab or "?")
        srv = lit_or_param(first_of(all_txt, r'\b(?:Vertica|Sql|Oracle|PostgreSQL|MySQL|Snowflake|Odbc)\.\w+\s*\(\s*("[^"]+"|[A-Za-z_]\w*)'), ctx)
        if srv:
            out["server"] = srv
        return out
    if c["kind"] == "dataflow":
        out["detail"] = tab or first_of(all_txt, r'dataflowId\s*=\s*"([^"]+)"') or "dataflow"
        return out
    fil = last_name(part) or last_name(r["hit"] or "") or last_name(all_txt)
    url = first_of(all_txt, r'\b(?:SharePoint\.\w+|Web\.\w+|AzureStorage\.\w+|Folder\.\w+|Salesforce\.\w+|OData\.Feed)\s*\(\s*"([^"]+)"')
    host = first_of(url, r"^https?://([^/]+)") if url else None
    out["table"] = fil or tab
    out["detail"] = fil or tab or host or url or c["label"]
    if host:
        out["server"] = host
    return out


def parse_expr_text(text: str, ctx: dict) -> None:
    """Shared queries hold the connector calls and the parameter values."""
    cur, buf = None, []

    def flush():
        nonlocal cur, buf
        if cur:
            ctx["exprs"][cur] = "\n".join(buf)
        cur, buf = None, []

    for raw in text.split("\n"):
        t = raw.strip()
        if raw[:1] not in ("", "\t", " "):
            flush()
            m = re.match(r"^expression\s+('(?:[^']|'')+'|[^\s=]+)\s*=\s*(.*)$", t)
            if m:
                cur, buf = unq(m.group(1)), []
                inline = (m.group(2) or "").strip()
                if inline:
                    buf.append(inline)
                    q = re.match(r'^"([^"]*)"', inline)
                    num = re.match(r"^(-?\d+(?:\.\d+)?)\b", inline)
                    if q:
                        ctx["params"][cur] = q.group(1)
                    elif num:
                        ctx["params"][cur] = num.group(1)
            continue
        if not cur:
            continue
        if re.match(r"^(lineageTag|annotation|queryGroup|description|changedProperty)\b", t):
            continue
        buf.append(t)
    flush()


def sort_names(ctx: dict) -> None:
    # longest first so `OPRSchemaName` never matches inside `SchemaName`
    ctx["names"] = sorted(ctx["exprs"].keys(), key=len, reverse=True)


# ---------------------------------------------------------------- role rules
# Mirrors js/roles.js — keep DEFAULT_RULES and the matching logic identical. A rule is
# {role, name, sides, measures, kind}; every non-empty condition must hold; first match wins;
# a rule with no conditions is the fallback. The SMV_Role annotation always beats the rules.
ROLES = ("fact", "dim", "helper", "standalone")
DEFAULT_RULES = [
    {"role": "fact",       "name": "(^|[._])(fact|fct)_", "sides": "",           "measures": "", "kind": ""},
    {"role": "dim",        "name": "(^|[._])dim_",        "sides": "",           "measures": "", "kind": ""},
    {"role": "helper",     "name": "",                    "sides": "none",       "measures": "", "kind": "manual"},
    {"role": "helper",     "name": "",                    "sides": "none",       "measures": "", "kind": "calculated"},
    {"role": "standalone", "name": "",                    "sides": "none",       "measures": "", "kind": ""},
    {"role": "fact",       "name": "",                    "sides": "many",       "measures": "", "kind": ""},
    {"role": "dim",        "name": "",                    "sides": "one",        "measures": "", "kind": ""},
    {"role": "fact",       "name": "",                    "sides": "mostlyMany", "measures": "", "kind": ""},
    {"role": "dim",        "name": "",                    "sides": "mostlyOne",  "measures": "", "kind": ""},
    {"role": "dim",        "name": "",                    "sides": "",           "measures": "", "kind": ""},
]
SIDES = {
    "": lambda s: True,
    "none": lambda s: s["many"] + s["one"] == 0,
    "many": lambda s: s["many"] > 0 and s["one"] == 0,
    "one": lambda s: s["one"] > 0 and s["many"] == 0,
    "both": lambda s: s["many"] > 0 and s["one"] > 0,
    "mostlyMany": lambda s: s["many"] > s["one"],
    "mostlyOne": lambda s: s["one"] > s["many"],
}
MEASURES = {"": lambda n: True, "any": lambda n: n > 0, "none": lambda n: n == 0}
KINDS = {
    "": lambda k: True,
    "source": lambda k: k not in ("manual", "calculated"),
    "manual": lambda k: k == "manual",
    "calculated": lambda k: k == "calculated",
}


def sides_of(rels: list) -> dict:
    s = {}
    def tick(n, card):
        s.setdefault(n, {"many": 0, "one": 0})
        s[n]["one" if card == "one" else "many"] += 1
    for r in rels:
        tick(r["from"], r.get("fromCard") or "many")
        tick(r["to"], r.get("toCard") or "one")
    return s


def rule_matches(rule: dict, sig: dict) -> bool:
    name = rule.get("name") or ""
    if name:
        try:
            rx = re.compile(name, re.I)
        except re.error:
            return False
        if not (rx.search(sig["sourceTable"] or "") or rx.search(sig["name"] or "")):
            return False
    if not SIDES.get(rule.get("sides") or "", SIDES[""])(sig["sides"]):
        return False
    if not MEASURES.get(rule.get("measures") or "", MEASURES[""])(sig["measureCount"]):
        return False
    if not KINDS.get(rule.get("kind") or "", KINDS[""])(sig["kind"]):
        return False
    return True


def classify(sig: dict, rules: list, ann: str = "") -> str:
    a = (ann or "").lower()
    if a in ROLES:
        return a
    for r in rules or DEFAULT_RULES:
        if rule_matches(r, sig):
            return r["role"] if r.get("role") in ROLES else "dim"
    return "unknown"


def load_rules(path: str) -> list:
    with open(path, encoding="utf-8") as fh:
        rules = json.load(fh)
    if not isinstance(rules, list) or not rules:
        raise SystemExit("--rules must be a non-empty JSON list of {role, name, sides, measures, kind}")
    return rules


def finalize(name: str, tables: list, rels: list, ctx: dict = None, rules: list = None) -> dict:
    by_name = {t["name"]: t for t in tables}
    seen, kept = set(), []
    for r in rels:
        if r["from"] not in by_name or r["to"] not in by_name:
            continue
        k = (r["from"], r["fromCol"], r["to"], r["toCol"])
        if k in seen:
            continue
        seen.add(k)
        kept.append(r)
    rels = kept

    one_side, many_side, rc = {}, {}, {}
    for r in rels:
        rc[r["from"]] = rc.get(r["from"], 0) + 1
        rc[r["to"]] = rc.get(r["to"], 0) + 1
        many_side[r["from"]] = 1
        if r["toCard"] == "many":
            many_side[r["to"]] = 1
        else:
            one_side[r["to"]] = 1
        for tn, cn in ((r["from"], r["fromCol"]), (r["to"], r["toCol"])):
            for c in by_name[tn]["columns"]:
                if c["name"] == cn:
                    c["rel"] = True
                    break

    sides = sides_of(rels)
    dom_map = {"calcgroup": "Calc Groups", "fieldparam": "Field Params", "measures": "Measures"}
    for t in tables:
        fl = t.pop("_flags", {}) or {}
        t.setdefault("source", source_of(fl, ctx))
        st = str(t["source"].get("table") or "")
        ann = str(t.pop("roleAnnotation", None) or "").lower()
        # structural roles are fixed; everything else goes through the shared rule engine
        if fl.get("isCG"):
            role = "calcgroup"
        elif fl.get("isFP"):
            role = "fieldparam"
        elif len(t["measures"]) > 0 and len(t["columns"]) <= 1:
            role = "measures"
        else:
            sig = {"name": t["name"], "sourceTable": st, "kind": t["source"].get("kind") or "",
                   "sides": sides.get(t["name"], {"many": 0, "one": 0}), "measureCount": len(t["measures"])}
            role = classify(sig, rules, ann)
        if ann:
            t["ann"] = ann
        t["role"] = t.get("role") or role
        if not t.get("domain"):
            sch = t["source"].get("schema")
            t["domain"] = (dom_map.get(t["role"])
                           or (cap(sch) if sch and sch != "unknown"
                               else ("Manual" if t["source"]["kind"] == "manual"
                                     else ("Calculated" if t["source"]["kind"] == "calculated"
                                           else (t["source"].get("label") or "Other")))))
        t["colCount"] = len(t["columns"])
        t["measureCount"] = len(t["measures"])
        t["relCount"] = rc.get(t["name"], 0)

    return {"name": name, "tables": tables, "relationships": rels}


def parse_tmdl(files: list, rules: list = None) -> dict:
    tables, rels, name = [], [], ""
    ctx = {"exprs": {}, "names": [], "params": {}}
    for f in files:
        if re.search(r"^expression\s", f["text"], re.M):
            parse_expr_text(f["text"], ctx)
    sort_names(ctx)
    for f in files:
        txt = f["text"]
        # same-line whitespace only — \s also matches the newline after a bare
        # `database` line, so it would swallow the next line's own property
        # (e.g. `compatibilityLevel: 1606`) and misread it as the name
        m = re.search(r"^database[ \t]+(.+)$", txt, re.M)
        if m:
            name = unq(m.group(1))
        if re.search(r"^relationship\s", txt, re.M) and "fromColumn:" in txt:
            rels += parse_rel_text(txt)
        if re.search(r"^table\s", txt, re.M):
            t = parse_table_text(txt)
            if t:
                tables.append(t)
    # tables are queries too — `Source = MdGeoEntities` points at another table's partition
    for t in tables:
        fl = t.get("_flags") or {}
        if fl.get("partSrc") and t["name"] not in ctx["exprs"]:
            ctx["exprs"][t["name"]] = fl["partSrc"]
    sort_names(ctx)
    return finalize(name, tables, rels, ctx, rules)


def parse_bim(j: dict, rules: list = None) -> dict:
    mdl = j.get("model", j)
    name = j.get("name", "")
    skip = re.compile(r"^(LocalDateTable_|DateTableTemplate_)")

    def txt(x):
        return "\n".join(x) if isinstance(x, list) else (x or "")

    tables = []
    for t in mdl.get("tables", []):
        if skip.match(t.get("name", "")):
            continue
        columns = []
        for c in t.get("columns", []):
            o = {"name": c.get("name"), "dataType": c.get("dataType", ""), "hidden": bool(c.get("isHidden")),
                 "isCalc": c.get("type") == "calculated", "isKey": bool(c.get("isKey")), "rel": False}
            d = txt(c.get("expression")).strip() if c.get("type") == "calculated" else ""
            if d:
                o["dax"] = d
            columns.append(o)
        measures = []
        for mm in t.get("measures", []):
            o = {"name": mm.get("name"), "dax": txt(mm.get("expression")).strip(),
                 "folder": mm.get("displayFolder", ""), "fmt": mm.get("formatString", "")}
            if mm.get("isHidden"):
                o["h"] = 1
            measures.append(o)
        is_fp = any(any(p.get("name") == "ParameterMetadata" for p in (c.get("extendedProperties") or []))
                    for c in t.get("columns", []))
        part_kind, part_src = "", ""
        parts = t.get("partitions") or []
        if parts and parts[0].get("source"):
            src = parts[0]["source"]
            part_kind = "calculated" if src.get("type") == "calculated" else (src.get("type") or "m")
            part_src = txt(src.get("expression"))
        role_ann = next((a for a in (t.get("annotations") or []) if a.get("name") == "SMV_Role"), None)
        row = {"name": t.get("name"), "columns": columns, "measures": measures,
               "roleAnnotation": str(role_ann.get("value")) if role_ann else None,
               "_flags": {"isCG": bool(t.get("calculationGroup")), "isFP": is_fp,
                          "partKind": part_kind, "partSrc": part_src,
                          "tableName": t.get("name")}}
        if part_kind == "calculated" and part_src.strip():
            row["dax"] = part_src.strip()
        items = (t.get("calculationGroup") or {}).get("calculationItems")
        if isinstance(items, list):
            row["calcItems"] = []
            for ci in items:
                f = ci.get("formatStringDefinition")
                fmt = txt(f.get("expression") if isinstance(f, dict) else f).strip() if f else ""
                row["calcItems"].append({"name": ci.get("name"), "dax": txt(ci.get("expression")).strip(), "fmt": fmt})
        tables.append(row)
    rels = []
    for r in mdl.get("relationships", []):
        if skip.match(r.get("fromTable", "")) or skip.match(r.get("toTable", "")):
            continue
        rels.append({"from": r.get("fromTable"), "fromCol": r.get("fromColumn"),
                     "to": r.get("toTable"), "toCol": r.get("toColumn"),
                     "fromCard": str(r.get("fromCardinality", "many")).lower(),
                     "toCard": str(r.get("toCardinality", "one")).lower(),
                     "inactive": r.get("isActive") is False,
                     "both": r.get("crossFilteringBehavior") == "bothDirections"})
    ctx = {"exprs": {}, "names": [], "params": {}}
    for e in (mdl.get("expressions") or []):
        if not e.get("name"):
            continue
        body = txt(e.get("expression"))
        ctx["exprs"][e["name"]] = body
        q = re.match(r'^"([^"]*)"', body.strip())
        if q:
            ctx["params"][e["name"]] = q.group(1)
    for t in tables:
        fl = t.get("_flags") or {}
        if fl.get("partSrc") and t["name"] not in ctx["exprs"]:
            ctx["exprs"][t["name"]] = fl["partSrc"]
    sort_names(ctx)
    return finalize(name, tables, rels, ctx, rules)


# ---------------------------------------------------------------- io


def collect_files(root: str) -> list:
    files = []
    if os.path.isfile(root):
        with open(root, encoding="utf-8-sig") as fh:
            files.append({"name": os.path.basename(root), "path": root, "text": fh.read()})
        return files
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fn in filenames:
            if not re.search(r"\.(tmdl|bim|json)$", fn, re.I):
                continue
            p = os.path.join(dirpath, fn)
            try:
                with open(p, encoding="utf-8-sig") as fh:
                    files.append({"name": fn, "path": p, "text": fh.read()})
            except (OSError, UnicodeDecodeError) as e:
                print("skipped %s (%s)" % (p, e), file=sys.stderr)
    return files


def parse_any(files: list, rules: list = None) -> dict:
    for f in files:
        if re.search(r"\.(bim|json)$", f["name"], re.I):
            try:
                j = json.loads(f["text"])
            except ValueError:
                continue
            if isinstance(j, dict) and isinstance(j.get("model"), dict) and isinstance(j["model"].get("tables"), list):
                return parse_bim(j, rules)
            if isinstance(j, dict) and isinstance(j.get("tables"), list) and "compatibilityLevel" in j:
                return parse_bim(j, rules)
    m = parse_tmdl(files, rules)
    if not m["tables"]:
        raise SystemExit("No tables found under the given path.")
    return m


def main() -> int:
    ap = argparse.ArgumentParser(description="TMDL/BIM -> model-data.json for the Semantic Model Viewer")
    ap.add_argument("source", help="*.SemanticModel folder, its definition folder, a TMDL folder, or a model.bim file")
    ap.add_argument("-o", "--out", default="model-data.json", help="output JSON path (default: model-data.json)")
    ap.add_argument("--name", help="override the model display name")
    ap.add_argument("--indent", type=int, default=None, help="pretty-print with this indent (default: compact)")
    ap.add_argument("--rules", help="JSON rule set (from the viewer's Rules > Copy JSON); default: built-in rules")
    args = ap.parse_args()

    files = collect_files(args.source)
    if not files:
        raise SystemExit("No .tmdl / .bim / .json files under %s" % args.source)
    model = parse_any(files, load_rules(args.rules) if args.rules else None)
    if args.name:
        model["name"] = args.name
    if not model.get("name"):
        base = os.path.basename(os.path.normpath(args.source))
        model["name"] = re.sub(r"\.SemanticModel$", "", base, flags=re.I)

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(model, fh, ensure_ascii=False, separators=(",", ":") if args.indent is None else None,
                  indent=args.indent)
    hidden = sum(1 for t in model["tables"] for m in t["measures"] if m.get("h"))
    measures = sum(len(t["measures"]) for t in model["tables"])
    print("%s: %d tables, %d relationships, %d measures (%d hidden) -> %s"
          % (model["name"], len(model["tables"]), len(model["relationships"]), measures, hidden, args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
