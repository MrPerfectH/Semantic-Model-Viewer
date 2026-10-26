#!/usr/bin/env python3
"""Build step 2 — PBIR *.Report folders -> report-usage.json for the Semantic Model Viewer.

Scans every `*.Report` folder whose `definition.pbir` points at the given semantic model and
records, per measure and per page, how many visual projections and filter references exist.

Usage:
    python3 scan_report_usage.py Reports \
        --model-data Models/tools/viewer/model-data.json \
        -o Models/tools/viewer/report-usage.json

Output schema (as consumed by the viewer):
    {"report": str, "model": str, "pageCount": int, "scanned": "YYYY-MM-DD",
     "measures": {"<measure name>": [{"p": "<page>", "v": <visuals>, "f": <filters>}]}}

With more than one matching report each entry also carries `"r": "<report name>"`, the
multi-report extension the viewer's tooltip builder already funnels through one place.

Measure names found in visuals but absent from the model are broken references; they are
written to a sibling `report-health.json` and printed.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
from collections import OrderedDict

# ---------------------------------------------------------------- io helpers


def read_json(path: str):
    try:
        with open(path, encoding="utf-8-sig") as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        print("could not read %s (%s)" % (path, e), file=sys.stderr)
        return None


def find_reports(root: str) -> list:
    if re.search(r"\.Report$", root, re.I):
        return [root]
    out = []
    for dirpath, dirnames, _ in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "node_modules"]
        for d in list(dirnames):
            if re.search(r"\.Report$", d, re.I):
                out.append(os.path.join(dirpath, d))
                dirnames.remove(d)
    return sorted(out)


def model_of_report(report_dir: str) -> str:
    """Model name a .Report is bound to: `initial catalog=` in the connection string,
    or the *.SemanticModel folder name for a byPath reference."""
    pbir = read_json(os.path.join(report_dir, "definition.pbir")) or {}
    ref = pbir.get("datasetReference") or {}
    conn = (ref.get("byConnection") or {})
    cs = conn.get("connectionString") or ""
    m = re.search(r"initial\s+catalog\s*=\s*([^;]+)", cs, re.I)
    if m:
        return m.group(1).strip().strip('"')
    path = (ref.get("byPath") or {}).get("path") or ""
    m = re.search(r"([^/\\]+)\.SemanticModel", path, re.I)
    if m:
        return m.group(1)
    return ""


# ---------------------------------------------------------------- measure reference walkers


def walk_query_refs(node, out: list):
    """Every `queryRef` string anywhere in a visual — these are the projections."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "queryRef" and isinstance(v, str):
                out.append(v)
            else:
                walk_query_refs(v, out)
    elif isinstance(node, list):
        for v in node:
            walk_query_refs(v, out)


def walk_measure_refs(node, out: list):
    """Every `{"Measure": {"Property": ..., "Expression": {"SourceRef": {...}}}}` — filters
    and conditional-formatting expressions use this shape."""
    if isinstance(node, dict):
        meas = node.get("Measure")
        if isinstance(meas, dict) and isinstance(meas.get("Property"), str):
            src = ((meas.get("Expression") or {}).get("SourceRef") or {})
            out.append((src.get("Entity") or src.get("Source") or "", meas["Property"]))
        for v in node.values():
            walk_measure_refs(v, out)
    elif isinstance(node, list):
        for v in node:
            walk_measure_refs(v, out)


def split_query_ref(qr: str):
    """`_Measures.Net Revenue (Region) - USD` -> ('_Measures', 'Actuals …')."""
    i = qr.find(".")
    if i < 0:
        return "", qr
    return qr[:i], qr[i + 1:]


# ---------------------------------------------------------------- scan


def scan_report(report_dir: str, measure_homes: dict, table_names: set, tally, broken: set):
    """tally(measure, page, kind) where kind is 'v' or 'f'. Returns the ordered page list."""
    measure_tables = set(measure_homes.values())
    defn = os.path.join(report_dir, "definition")
    pages_dir = os.path.join(defn, "pages")
    pages_meta = read_json(os.path.join(pages_dir, "pages.json")) or {}
    order = pages_meta.get("pageOrder") or []

    page_ids = [d for d in sorted(os.listdir(pages_dir)) if os.path.isdir(os.path.join(pages_dir, d))] \
        if os.path.isdir(pages_dir) else []
    if order:
        page_ids = [p for p in order if p in page_ids] + [p for p in page_ids if p not in order]

    def note(entity, name, page, kind, strict):
        """strict=True for `Measure`-shaped references (filters, conditional formatting):
        an unknown name there is a broken report reference. Projections also carry columns,
        so an unknown name is only broken when it sits on a measure home table."""
        home = measure_homes.get(name)
        if home is not None:
            # verify the entity really is the measure's home table when one is given
            if entity and entity in table_names and entity != home:
                return
            tally(name, page, kind)
            return
        if name and (strict or (entity and entity in measure_tables)):
            broken.add(name)

    # report-level filters apply to every page, so they are counted once per page
    report_json = read_json(os.path.join(defn, "report.json")) or {}
    report_filter_refs = []
    walk_measure_refs(report_json.get("filterConfig") or {}, report_filter_refs)

    page_names = []
    for pid in page_ids:
        pdir = os.path.join(pages_dir, pid)
        pmeta = read_json(os.path.join(pdir, "page.json")) or {}
        pname = pmeta.get("displayName") or pid
        page_names.append(pname)

        refs = []
        walk_measure_refs(pmeta.get("filterConfig") or {}, refs)
        refs += report_filter_refs
        for entity, name in refs:
            note(entity, name, pname, "f", True)

        vdir = os.path.join(pdir, "visuals")
        if not os.path.isdir(vdir):
            continue
        for vid in sorted(os.listdir(vdir)):
            vpath = os.path.join(vdir, vid, "visual.json")
            if not os.path.isfile(vpath):
                continue
            vj = read_json(vpath)
            if vj is None:
                continue
            qrefs = []
            walk_query_refs(vj, qrefs)
            for qr in qrefs:
                entity, name = split_query_ref(qr)
                note(entity, name, pname, "v", False)
            frefs = []
            walk_measure_refs(vj.get("filterConfig") or {}, frefs)
            walk_measure_refs(vj.get("objects") or {}, frefs)          # conditional formatting
            visual = vj.get("visual")
            if isinstance(visual, dict):
                walk_measure_refs(visual.get("objects") or {}, frefs)
            for entity, name in frefs:
                note(entity, name, pname, "f", True)

    return page_names


def main() -> int:
    ap = argparse.ArgumentParser(description="PBIR reports -> report-usage.json")
    ap.add_argument("root", help="folder containing *.Report folders (or one *.Report folder)")
    ap.add_argument("--model-data", default="model-data.json", help="model-data.json produced by build step 1")
    ap.add_argument("--model", help="model name to match against each report's connection (default: model-data name)")
    ap.add_argument("-o", "--out", default="report-usage.json")
    ap.add_argument("--health-out", default=None, help="broken-reference report (default: report-health.json next to --out)")
    ap.add_argument("--indent", type=int, default=None)
    args = ap.parse_args()

    model = read_json(args.model_data)
    if not model:
        raise SystemExit("could not read %s — run tmdl_to_model_data.py first" % args.model_data)
    model_name = args.model or model.get("name") or ""
    measure_homes = {}
    table_names = set()
    for t in model.get("tables", []):
        table_names.add(t["name"])
        for m in t.get("measures", []):
            measure_homes.setdefault(m["name"], t["name"])

    reports = find_reports(args.root)
    matching = [r for r in reports if not model_name or model_of_report(r).lower() == model_name.lower()]
    if not matching:
        raise SystemExit("no *.Report folder under %s is bound to %r (found %d reports)"
                         % (args.root, model_name, len(reports)))

    per_report = OrderedDict()
    broken = set()
    total_pages = 0
    for rdir in matching:
        rname = re.sub(r"\.Report$", "", os.path.basename(rdir), flags=re.I)
        counts = {}

        def tally(measure, page, kind, _c=counts):
            entry = _c.setdefault(measure, OrderedDict()).setdefault(page, {"v": 0, "f": 0})
            entry[kind] += 1

        pages = scan_report(rdir, measure_homes, table_names, tally, broken)
        total_pages += len(pages)
        per_report[rname] = (counts, pages)

    multi = len(per_report) > 1
    measures = {}
    for rname, (counts, pages) in per_report.items():
        order = {p: i for i, p in enumerate(pages)}
        for mname, bypage in counts.items():
            rows = measures.setdefault(mname, [])
            for page in sorted(bypage, key=lambda p: order.get(p, 1e9)):
                c = bypage[page]
                row = {"p": page, "v": c["v"], "f": c["f"]}
                if multi:
                    row["r"] = rname
                rows.append(row)

    out = {
        "report": " · ".join(per_report.keys()) if multi else next(iter(per_report)),
        "model": model_name,
        "pageCount": total_pages,
        "scanned": datetime.date.today().isoformat(),
        "measures": {k: measures[k] for k in sorted(measures)}
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":") if args.indent is None else None,
                  indent=args.indent)

    health_path = args.health_out or os.path.join(os.path.dirname(os.path.abspath(args.out)), "report-health.json")
    health = {"model": model_name, "reports": list(per_report.keys()), "scanned": out["scanned"],
              "brokenReferences": sorted(broken)}
    with open(health_path, "w", encoding="utf-8") as fh:
        json.dump(health, fh, ensure_ascii=False, indent=1)

    print("%s: %d pages, %d used measures -> %s" % (out["report"], total_pages, len(measures), args.out))
    if broken:
        print("%d name(s) referenced in visuals but missing from the model -> %s"
              % (len(broken), health_path), file=sys.stderr)
        for b in sorted(broken):
            print("  - %s" % b, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
