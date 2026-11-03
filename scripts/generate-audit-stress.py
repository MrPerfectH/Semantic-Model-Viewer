# Retained Fable audit fixture generator (2026-11-01). Seed7, 40 facts/120 dims.
# Usage: python3 scripts/generate-audit-stress.py OUTPUT.SemanticModel
import os, random, sys
random.seed(7)
root=os.path.join(sys.argv[1] if len(sys.argv)>1 else "Stress.SemanticModel", "definition"); os.makedirs(root+"/tables",exist_ok=True)
open(root+"/database.tmdl","w").write("database Stress\n\tcompatibilityLevel: 1601\n")
open(root+"/model.tmdl","w").write("model Model\n\tculture: en-US\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n")
open(root+"/expressions.tmdl","w").write('expression ServerName = "sql.example.com" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]\n\tlineageTag: p1\n\nexpression RawBase = let\n\t\tSource = Sql.Database(ServerName, "dw")\n\tin\n\t\tSource\n\tlineageTag: p2\n')
facts=[f"Fact {w} Transactions With A Very Long Descriptive Name {i}" if i%7==0 else f"Fact{w}{i}" for i,w in enumerate(["Sales","Returns","Inventory","Budget","Orders","Shipments","Web","Calls","Claims","Payments"]*4)]
facts=facts[:40]
dims=[f"Dim {d} {i}" if i%5 else f"Dimension {d} Extended Attributes {i}" for i,d in enumerate(["Date","Product","Customer","Store","Employee","Geography","Currency","Channel","Promotion","Carrier"]*12)]
dims=dims[:120]
rels=[]; measures={}
def tmdl_name(n): return f"'{n}'" if " " in n else n
for d in dims:
    cols=[f"{d} Key"]+[f"Attr {k}" for k in range(random.randint(3,12))]
    s=f"table {tmdl_name(d)}\n\tlineageTag: t-{abs(hash(d))}\n\n"
    for c in cols:
        s+=f"\tcolumn {tmdl_name(c)}\n\t\tdataType: string\n\t\tlineageTag: c-{abs(hash(d+c))}\n\t\tsummarizeBy: none\n\t\tsourceColumn: {c}\n\n"
    s+=f"\tpartition {tmdl_name(d)} = m\n\t\tmode: import\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t\tSource = RawBase,\n\t\t\t\t\tT = Source{{[Schema=\"dbo\",Item=\"{d}\"]}}[Data]\n\t\t\t\tin\n\t\t\t\t\tT\n\n"
    open(f"{root}/tables/{d}.tmdl","w").write(s)
allm=[]
for fi,f in enumerate(facts):
    mydims=random.sample(dims, random.randint(3,9))
    cols=[f"{d} Key" for d in mydims]+["Amount","Quantity","Cost"]
    s=f"table {tmdl_name(f)}\n\tlineageTag: t-{abs(hash(f))}\n\n"
    ms=[]
    for k in range(10):
        name=f"{f} Measure {k}" if k%4 else f"[{f}] Ratio Measure With Long Name {k}".replace("[","").replace("]","")
        if k==0: dax=f"SUM({tmdl_name(f)}[Amount])"
        elif k==1: dax=f"SUM({tmdl_name(f)}[Cost])"
        else:
            prev=random.sample(ms[:k], min(len(ms[:k]),2)); ext=random.sample(allm,1) if allm and k>5 else []
            refs=" + ".join(f"[{p}]" for p in prev+ext) or "1"
            dax=f"VAR x = {refs}\nRETURN DIVIDE(x, CALCULATE([{ms[0]}], ALL({tmdl_name(mydims[0])})))" if k%3 else f"CALCULATE({refs}, USERELATIONSHIP({tmdl_name(f)}[{mydims[0]} Key], {tmdl_name(mydims[0])}[{mydims[0]} Key]))"
        ms.append(name)
        s+=f"\tmeasure {tmdl_name(name)} = ```\n\t\t\t{dax.replace(chr(10),chr(10)+chr(9)*3)}\n\t\t\t```\n\t\tformatString: #,0.00\n\t\tdisplayFolder: Folder {k%3}\n\t\tlineageTag: m-{abs(hash(f+name))}\n\n"
    allm+=ms
    for c in cols:
        s+=f"\tcolumn {tmdl_name(c)}\n\t\tdataType: {'int64' if 'Key' in c else 'decimal'}\n\t\tlineageTag: c-{abs(hash(f+c))}\n\t\tsummarizeBy: sum\n\t\tsourceColumn: {c}\n\n"
    s+=f"\tcolumn 'Margin Calc' = {tmdl_name(f)}[Amount] - {tmdl_name(f)}[Cost]\n\t\tdataType: decimal\n\t\tlineageTag: cc-{fi}\n\t\tsummarizeBy: sum\n\n"
    s+=f"\tpartition {tmdl_name(f)} = m\n\t\tmode: import\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t\tSource = RawBase,\n\t\t\t\t\tT = Source{{[Schema=\"dbo\",Item=\"{f}\"]}}[Data]\n\t\t\t\tin\n\t\t\t\t\tT\n\n"
    open(f"{root}/tables/{f}.tmdl","w").write(s)
    for j,d in enumerate(mydims):
        r=f"relationship r-{fi}-{j}\n\tfromColumn: {tmdl_name(f)}.{tmdl_name(d+' Key')}\n\ttoColumn: {tmdl_name(d)}.{tmdl_name(d+' Key')}\n"
        if j==1: r+="\tisActive: false\n"
        if j==2: r+="\tcrossFilteringBehavior: bothDirections\n"
        if j==3: r+="\ttoCardinality: many\n"
        rels.append(r)
# a dim-to-dim snowflake chain and a 1:1
for i in range(0,30,3):
    rels.append(f"relationship snow-{i}\n\tfromColumn: {tmdl_name(dims[i])}.{tmdl_name('Attr 1')}\n\ttoColumn: {tmdl_name(dims[i+1])}.{tmdl_name(dims[i+1]+' Key')}\n")
open(root+"/relationships.tmdl","w").write("\n".join(rels))
print(len(facts),"facts",len(dims),"dims",len(rels),"rels",len(allm),"measures")
