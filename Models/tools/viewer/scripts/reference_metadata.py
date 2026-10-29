"""Allowlisted documentation metadata shared by Python TMDL/BIM imports.

Matches the reference metadata contract in js/tmdl-parser.js. Expressions remain
owned by the main parser; this module never evaluates model source.
"""
import re

FIELDS = ('description', 'lineageTag', 'formatString', 'displayFolder', 'sortByColumn',
          'summarizeBy', 'dataCategory', 'sourceColumn', 'mode', 'ordinal', 'precedence', 'column')


def unquote(value):
    return value[1:-1].replace("''", "'") if value.startswith("'") and value.endswith("'") else value


def dedent(lines):
    lines = [line for line in lines if not line.strip().startswith('```')]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    depth = min((len(line) - len(line.lstrip()) for line in lines if line.strip()), default=0)
    return '\n'.join(line[depth:].rstrip() for line in lines)


def from_tmdl(table, text):
    lines = text.splitlines()
    blocks, stack = [], []
    children = {'table': ('column', 'measure', 'calculationGroup', 'hierarchy', 'partition'),
                'calculationGroup': ('calculationItem',), 'hierarchy': ('level',)}
    for i, raw in enumerate(lines):
        depth, value = len(raw) - len(raw.lstrip('\t')), raw.strip()
        if not value or value.startswith('///'):
            continue
        while stack and depth <= stack[-1]['depth']:
            stack.pop()['end'] = i
        match = re.match(r"^(table|column|measure|calculationGroup|calculationItem|hierarchy|level|partition)\b(?:\s+('(?:[^']|'')*'|[^\s=]+))?", value)
        parent = stack[-1] if stack else None
        if not match or not (depth == 0 and match[1] == 'table' or parent and depth == parent['depth'] + 1 and match[1] in children.get(parent['kind'], ())):
            continue
        block = dict(kind=match[1], name=unquote(match[2] or ''), depth=depth, start=i, end=len(lines), parent=parent)
        blocks.append(block)
        stack.append(block)

    def fields(block):
        result, docs = {}, []
        for j in range(block['start'] - 1, -1, -1):
            prev = lines[j]
            if not prev.strip().startswith('///') or len(prev) - len(prev.lstrip('\t')) != block['depth']:
                break
            docs.insert(0, re.sub(r'^ ?', '', prev.strip()[3:]))
        if docs:
            result['description'] = '\n'.join(docs)
        for i in range(block['start'] + 1, block['end']):
            raw = lines[i]
            depth = len(raw) - len(raw.lstrip('\t'))
            if depth != block['depth'] + 1:
                continue
            value = raw.strip()
            match = re.match(r'^(%s)\s*:\s*(.*)$' % '|'.join(FIELDS), value)
            def continuation():
                buf = []
                for k in range(i + 1, block['end']):
                    if lines[k].strip() and not lines[k].startswith('\t' * (depth + 1)):
                        break
                    buf.append(lines[k])
                return buf
            if match:
                key, val = match.groups()
                if key == 'description' and not val:
                    val = dedent(continuation())
                if key in ('ordinal', 'precedence'):
                    try:
                        val = int(val)
                    except ValueError:
                        continue
                else:
                    val = unquote(val)
                result[key] = val
            if value in ('isHidden', 'isHidden: true'):
                result['hidden'] = True
            match = re.match(r'^formatStringDefinition\s*=\s*(.*)$', value)
            if match:
                result['formatExpression'] = dedent(([match[1]] if match[1] else []) + continuation())
        return result

    table['hierarchies'], table['partitions'] = [], []
    for block in blocks:
        kind, name, target = block['kind'], block['name'], None
        values = fields(block)
        if kind == 'table':
            target = table
        for object_kind, key in (('column', 'columns'), ('measure', 'measures'), ('calculationItem', 'calcItems')):
            if kind == object_kind:
                target = next((obj for obj in table.get(key, []) if obj['name'] == name), None)
        if kind == 'calculationGroup':
            table['calculationGroup'] = values
        if kind == 'hierarchy':
            target = dict(name=name, levels=[])
            table['hierarchies'].append(target)
            block['target'] = target
        if kind == 'level' and 'target' in block['parent']:
            target = dict(name=name)
            block['parent']['target']['levels'].append(target)
        if kind == 'partition':
            target = dict(name=name)
            match = re.search(r'=\s*(\w+)\s*$', lines[block['start']])
            if match:
                target['type'] = match[1]
            table['partitions'].append(target)
        if target is not None:
            target.update(values)
    table['referenceVersion'] = 1


def from_bim(table, source):
    def fields(obj):
        values = {k: obj[k] for k in FIELDS if k in obj and isinstance(obj[k], (str, int, float))}
        if obj.get('isHidden'):
            values['hidden'] = True
        if obj.get('formatStringDefinition'):
            expr = obj['formatStringDefinition'].get('expression', '')
            values['formatExpression'] = '\n'.join(expr) if isinstance(expr, list) else expr
        return values
    table.update(fields(source))
    for key in ('columns', 'measures'):
        for obj in table.get(key, []):
            src = next((v for v in source.get(key, []) if v['name'] == obj['name']), {})
            obj.update(fields(src))
    if 'calculationGroup' in source:
        table['calculationGroup'] = fields(source['calculationGroup'])
        for obj in table.get('calcItems', []):
            src = next((v for v in source['calculationGroup'].get('calculationItems', []) if v['name'] == obj['name']), {})
            obj.update(fields(src))
    table['hierarchies'] = [dict(name=h['name'], levels=[dict(name=l['name'], **fields(l)) for l in h.get('levels', [])], **fields(h)) for h in source.get('hierarchies', [])]
    table['partitions'] = [dict(name=p['name'], type=p.get('source', {}).get('type', 'unknown'), **fields(p)) for p in source.get('partitions', [])]
    table['referenceVersion'] = 1
