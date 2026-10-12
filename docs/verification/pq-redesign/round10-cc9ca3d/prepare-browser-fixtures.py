# Prepare independent synthetic importer inputs for the authorized Mac browser.
# Does not execute analyzer tests, M, hashing or package oracles.
import json,pathlib,copy
out=pathlib.Path('tests/acceptance-fixtures/pq-redesign/round10-cc9ca3d');model=json.loads(pathlib.Path('tests/acceptance-fixtures/pq-redesign/flow-0d964fc/model.bim').read_text());model['name']='Independent r10 lock and provider boundaries'
model['model']['tables'][0]['columns'] += [{'name':x,'dataType':'int64','sourceColumn':x}for x in ['Quantity','CustomerKey','ProductKey','DateKey','Cost','Discount']]
catalog={'PowerPlatform.Dataflows':'Dataflow','PowerBI.Dataflows':'Dataflow','Databricks.Catalogs':'Databricks','Databricks.Contents':'Databricks','Sql.Database':'SQL Server','Sql.Databases':'SQL Server','Snowflake.Databases':'Snowflake','OData.Feed':'OData','AzureStorage.DataLake':'Azure Data Lake','Excel.Workbook':'Excel','Web.Contents':'Web','File.Contents':'File','Table.FromRows':'Inline table','#table':'Inline table'}
cases=[]
def add(name,code,providers,dependencies=None,incomplete=False):
 cases.append({'name':name,'code':code,'providers':providers,'dependencies':dependencies or [],'incomplete':incomplete});model['model']['expressions'].append({'name':name,'kind':'m','expression':code})
for i,(call,provider)in enumerate(catalog.items()):
 code=call+'("R10_PROVIDER_PRIVATE_ARGUMENT", {})'
 if call=='#table':code='#table({"A"}, {{1}})'
 if call=='Table.FromRows':code='Table.FromRows({{1}}, {"A"})'
 add('Direct'+str(i),code,[provider])
 add('Local'+str(i),'let #"'+call+'"=(x)=>x in #"'+call+'"("R10_PROVIDER_PRIVATE_LOCAL")',[])
 add('Function'+str(i),'(#"'+call+'") => #"'+call+'"("R10_PROVIDER_PRIVATE_FUNCTION")',[])
add('RepeatedQuoted','let emoji="😀", a=#"Sql.Database"("R10_PROVIDER_PRIVATE_A","d"), b=#"Sql.Database"("R10_PROVIDER_PRIVATE_B","d") in {a,b}\r\n',['SQL Server','SQL Server'])
add('Mixed','{Sql.Database("R10_PROVIDER_PRIVATE_SQL","d"), Databricks.Catalogs("R10_PROVIDER_PRIVATE_DBX","w")}', ['SQL Server','Databricks'])
add('TransitiveOnly','Direct4',[],['Direct4'])
add('Uncalled','Sql.Database',[])
add('AliasCall','let f=Sql.Database in f("s","d")',[])
add('FieldCall','let r=[#"Sql.Database"=(x)=>x] in r[Sql.Database]("x")',[])
add('ItemCall','Sql.Database{0}("x")',[])
add('StringComment','let txt="Sql.Database()", x=1 /* Databricks.Catalogs() */ in x',[])
add('UnknownCall','Unknown.Provider("R10_PROVIDER_PRIVATE_UNKNOWN")',[])
add('DynamicCall','Expression.Evaluate("Sql.Database(1,2)", #shared)',[])
add('Incomplete','let x=Sql.Database("s","d") in (',[],incomplete=True)
add('UnsupportedGeneratedEnterData','Table.FromRows(Json.Document(Binary.Decompress(Binary.FromText("AAAA", BinaryEncoding.Base64), Compression.Deflate)), let _t=((type nullable text) meta [Serialized.Text=true]) in type table [A=_t])',[],incomplete=True)
add('BuiltinTwelve','{Table.TransformColumnTypes, Int64.Type, Byte.Type, Int8.Type, Int16.Type, Int32.Type, Single.Type, Double.Type, Decimal.Type, Currency.Type, Percentage.Type, Guid.Type}',[])
add('ConditionalCall','if false then Sql.Database("R10_PROVIDER_PRIVATE_UNUSED","d") else 1',['SQL Server'])
(out/'model.bim').write_text(json.dumps(model,ensure_ascii=False,indent=2)+'\n')
collision=copy.deepcopy(model);collision['name']='Independent r10 model name collisions';collision['model']['expressions']=[{'name':n,'kind':'m','expression':'42'}for n in catalog]+[{'name':'Int64.Type','kind':'m','expression':'42'},{'name':'Table.TransformColumnTypes','kind':'m','expression':'42'}]+[{'name':'Probe'+str(i),'kind':'m','expression':'#"'+n+'"(1)'}for i,n in enumerate(catalog)]+[{'name':'BuiltinProbe','kind':'m','expression':'{Int64.Type, Table.TransformColumnTypes}'}]
collision['model']['tables']=[];collision['model']['relationships']=[];(out/'collisions.bim').write_text(json.dumps(collision,indent=2)+'\n')
dup={'name':'Independent r10 ambiguous source name','model':{'tables':[{'name':'Sql.Database','columns':[],'partitions':[{'name':'P1','source':{'type':'m','expression':'1'}},{'name':'P2','source':{'type':'m','expression':'2'}}]}],'expressions':[{'name':'Probe','kind':'m','expression':'Sql.Database("R10_PROVIDER_PRIVATE_AMBIGUOUS","db")'}]}};(out/'ambiguous.bim').write_text(json.dumps(dup,indent=2)+'\n')
(out/'oracle.json').write_text(json.dumps({'catalog':catalog,'cases':cases,'casesExecution':'Generic Node pending Linux/Windows; registered browser observes actual imported worker results separately','noArgumentEvidenceKeys':['name','provider','at','end']},ensure_ascii=False,indent=2)+'\n')
