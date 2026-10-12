"""Generate synthetic acceptance metadata; never evaluate M or contact endpoints."""
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).parent / 'acceptance-fixtures' / 'pq38'
root.mkdir(parents=True, exist_ok=True)
(root / '.gitattributes').write_text('*.tmdl -text\nPQ38.SemanticModel/definition/tables/Sales.tmdl -diff\n')
main = 'let\r\n  Source = #"Base Query",\r\n  Text = "PQ_RAW_ONLY_38 ""quoted"" λ"  \r\nin Source\r\n'
shared = [
    ('Base Query', 'let Source = CycleA in Source'),
    ('CycleA', 'CycleB'), ('CycleB', 'CycleA'),
    ('pRegion', '"PQ_CREDENTIAL_ONLY_38" meta [IsParameterQuery=true]'),
    ('Scalar', '42'), ('Function', '(SharedValue as number) => SharedValue + 1'),
    ('SharedValue', '7'), ('Shadow', 'let SharedValue = 1 in SharedValue'),
    ('Lexical', 'let x = #"Base Query", s = "SharedValue" /* CycleA */ in x'),
    ('Dynamic', 'Expression.Evaluate("Base Query", #shared)'),
    ('Missing', 'AbsentQuery'), ('UnsafeText', '"</script> PQ_SHARED_ONLY_38 https://pq-private-38.invalid/"'),
]
def model(expressions, code=main):
    return {'name': 'PQ38 Synthetic', 'model': {'tables': [
        {'name': 'Acceptance Sales', 'columns': [{'name': 'Amount', 'dataType': 'int64'}],
         'measures': [{'name': 'Acceptance Total', 'expression': 'SUM(\'Acceptance Sales\'[Amount])'}],
         'partitions': [
             {'name': "Main 'quoted'", 'source': {'type': 'm', 'expression': code}},
             {'name': 'Other', 'source': {'type': 'm', 'expression': ['let', '  x = Scalar', 'in x']}},
             {'name': 'Calculated', 'source': {'type': 'calculated', 'expression': 'ROW("Amount", 1)'}},
             {'name': 'Missing'}]},
        {'name': 'No Partitions', 'columns': [], 'partitions': []}],
        'expressions': [{'name': n, 'kind': 'm', 'expression': c} for n,c in expressions],
        'relationships': []}}
def write(folder, name, value):
    d=root/folder; d.mkdir(exist_ok=True)
    (d/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
write('bim', 'model.bim', model(shared))
write('reset', 'model.bim', model([('Replacement', '999')], 'Replacement'))
td=root/'PQ38.SemanticModel'/'definition'; (td/'tables').mkdir(parents=True, exist_ok=True)
(td/'database.tmdl').write_text('database PQ38\n\tcompatibilityLevel: 1604\n')
(td/'model.tmdl').write_text('model Model\n\tculture: en-US\n')
text="table 'Acceptance Sales'\r\n\tcolumn Amount\r\n\t\tdataType: int64\r\n\tpartition 'Main ''quoted''' = m\r\n\t\tsource = ```\r\n"
text += '\r\n'.join('\t\t\t'+s for s in main.split('\r\n'))+'\r\n\t\t\t```\r\n'
text += '\tpartition Other = m\r\n\t\tsource =\r\n\t\t\tlet\r\n\t\t\t  x = Scalar\r\n\t\t\tin x\r\n\tpartition Calculated = calculated\r\n\t\tsource = 1\r\n\tpartition Missing = m\r\n'
(td/'tables'/'Sales.tmdl').write_bytes(text.encode())
expr=''.join("expression '"+n.replace("'","''")+"' = "+c+'\n' for n,c in shared)
(td/'expressions.tmdl').write_text(expr)
write('oracle', 'expected.json', {'main': main, 'other': 'let\n  x = Scalar\nin x', 'shared': dict(shared),
    'edges': {'Base Query': ['CycleA'], 'CycleA': ['CycleB'], 'CycleB': ['CycleA'],
              'Function': [], 'Shadow': [], 'Lexical': ['Base Query'], 'Missing': [], 'Dynamic': []}})
for count in (300,301,350,1000):
    # Wide and shallow: cost cannot be inferred from visible lineage caps.
    entries=[('Q'+str(i), ('{'+','.join('Q'+str(j) for j in range(max(0,i-3),i))+'}') if i else '1') for i in range(count)]
    write('large-'+str(count), 'model.bim', model(entries, '{'+','.join('Q'+str(i) for i in range(min(count,100)))+'}'))
print(root)
