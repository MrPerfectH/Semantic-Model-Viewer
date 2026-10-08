/* TMDL / BIM -> viewer model JSON. Exposes global TMDLParser. */
(function(g){
  function unq(s){ s=String(s).trim(); return (s[0]==="'"&&s[s.length-1]==="'")?s.slice(1,-1).replace(/''/g,"'"):s; }
  function scalar(s){ s=String(s); return s[0]==='"' && s[s.length-1]==='"' ? s.slice(1,-1).replace(/""/g,'"') : s; }
  function cap(s){ s=String(s||''); return s? s[0].toUpperCase()+s.slice(1):s; }
  function parseRef(s){ s=s.trim(); var m=s.match(/^'((?:[^']|'')+)'\.(.+)$/); if(m) return {table:m[1].replace(/''/g,"'"), column:unq(m[2])};
    var i=s.indexOf('.'); if(i<0) return null; return {table:s.slice(0,i).trim(), column:unq(s.slice(i+1))}; }

  function parseRelText(text){
    var out=[], cur=null;
    text.split(/\r?\n/).forEach(function(raw){
      var t=raw.trim(); if(!t) return;
      if(/^relationship\s/.test(t) && !/^\t/.test(raw)){ cur={fromCard:'many',toCard:'one',inactive:false,both:false}; out.push(cur); return; }
      if(!cur) return; var m;
      if((m=t.match(/^fromColumn:\s*(.+)$/))){ var r=parseRef(m[1]); if(r){cur.from=r.table;cur.fromCol=r.column;} }
      else if((m=t.match(/^toColumn:\s*(.+)$/))){ var r2=parseRef(m[1]); if(r2){cur.to=r2.table;cur.toCol=r2.column;} }
      else if((m=t.match(/^toCardinality:\s*(\w+)/))) cur.toCard=m[1];
      else if((m=t.match(/^fromCardinality:\s*(\w+)/))) cur.fromCard=m[1];
      else if(/^isActive:\s*false/.test(t)) cur.inactive=true;
      else if(/^crossFilteringBehavior:\s*bothDirections/.test(t)) cur.both=true;
    });
    return out.filter(function(r){ return r.from&&r.fromCol&&r.to&&r.toCol; });
  }

  function parseTableText(text){
    var lines=text.split(/\r?\n/);
    var table=null, mode=null, curCol=null, curMeas=null, partKind='', partSrc='', isCG=false, isFP=false;
    for(var i=0;i<lines.length;i++){
      var raw=lines[i], t=raw.trim();
      var ind=raw.match(/^\t*/)[0].length;
      var m;
      if(!t){ if(mode==='measure'&&curMeas&&curMeas.dax) curMeas.dax+='\n'; continue; }
      if(ind===0){ if(!table && (m=t.match(/^table\s+(.+)$/))){ table={name:unq(m[1]), columns:[], measures:[]}; } continue; }
      if(!table) continue;
      if(ind===1){
        curCol=null; curMeas=null; mode=null;
        if((m=t.match(/^column\s+('(?:[^']|'')+'|"[^"]+"|[^\s=]+)(\s*=.*)?$/))){ curCol={name:unq(m[1].replace(/"/g,'')), dataType:'', hidden:false, isCalc:!!m[2], isKey:false, rel:false}; table.columns.push(curCol); mode='column'; continue; }
        if((m=t.match(/^measure\s+('(?:[^']|'')+'|"[^"]+"|[^\s=]+)\s*=\s*(.*)$/))){ curMeas={name:unq(m[1].replace(/"/g,'')), dax:(m[2]||'').trim(), folder:'', fmt:'', description:''}; var descriptions=[], di=i-1; while(di>=0 && /^\t\/\/\//.test(lines[di])) { descriptions.unshift(lines[di].replace(/^\t\/\/\/ ?/,'')); di--; } curMeas.description=descriptions.join('\n'); table.measures.push(curMeas); mode='measure'; continue; }
        if(/^calculationGroup\b/.test(t)){ isCG=true; continue; }
        if((m=t.match(/^partition\s+.*?=\s*(\w+)\s*$/))){ partKind=m[1]; mode='partition'; continue; }
        if((m=t.match(/^annotation\s+SMV_Role\s*=\s*(\w+)/i))){ table.roleAnnotation=m[1].toLowerCase(); continue; }
        continue;
      }
      if(/^extendedProperty\s+ParameterMetadata/.test(t)) isFP=true;
      if(mode==='column'&&curCol){
        if((m=t.match(/^dataType:\s*(\S+)/))) curCol.dataType=m[1];
        else if(/^isHidden\s*$/.test(t)) curCol.hidden=true;
        else if(/^isKey\s*$/.test(t)) curCol.isKey=true;
      } else if(mode==='measure'&&curMeas){
        if(ind>=3){ curMeas.dax += (curMeas.dax?'\n':'') + raw.replace(/^\t{3}/,''); }
        else {
          if((m=t.match(/^formatString:\s*(.*)$/))) curMeas.fmt=scalar(m[1]);
          else if((m=t.match(/^displayFolder:\s*(.*)$/))) curMeas.folder=scalar(m[1]);
          /* h:1 drives the hidden-measure badge — see handoff schema (build step 1). */
          else if(/^isHidden\s*$/.test(t)) curMeas.h=1;
        }
      } else if(mode==='partition'){ partSrc+=t+'\n'; }
    }
    if(table) table._flags={isCG:isCG,isFP:isFP,partKind:partKind,partSrc:partSrc,tableName:table.name};
    return table;
  }

  /* ---------- connector detection ----------
     A partition rarely names its connector: it says `Source = VerticaPath` and the real
     Vertica.Database(...) call lives in a shared expression. So we resolve the partition
     M through the shared expressions (and scalar parameters) until a connector shows up. */
  var CONNECTORS = [
    {kind:'databricks', label:'Databricks',  re:/\bDatabricks\./,                         db:1},
    {kind:'vertica',    label:'Vertica',     re:/\bVertica\.Database\s*\(/,               db:1},
    {kind:'db',         label:'SQL Server',  re:/\bSql\.Databases?\s*\(/,                 db:1},
    {kind:'oracle',     label:'Oracle',      re:/\bOracle\.Database\s*\(/,                db:1},
    {kind:'postgres',   label:'PostgreSQL',  re:/\bPostgreSQL\.Database\s*\(/,            db:1},
    {kind:'mysql',      label:'MySQL',       re:/\bMySQL\.Database\s*\(/,                 db:1},
    {kind:'snowflake',  label:'Snowflake',   re:/\bSnowflake\.Databases?\s*\(/,           db:1},
    {kind:'synapse',    label:'Synapse',     re:/\bSynapse\.|\bAzureSynapse\./,           db:1},
    {kind:'lakehouse',  label:'Fabric',      re:/\bLakehouse\.Contents|\bFabric\./,       db:1},
    {kind:'ssas',       label:'Analysis Services', re:/\bAnalysisServices\.Databases?\s*\(/, db:1},
    {kind:'sap',        label:'SAP',         re:/\bSap(Hana|BusinessWarehouse)\./,        db:1},
    {kind:'odbc',       label:'ODBC',        re:/\bOdbc\.(DataSource|Query)\s*\(/,        db:1},
    {kind:'dataflow',   label:'Dataflow',    re:/\b(PowerBI|PowerPlatform)\.Dataflows\s*\(/},
    {kind:'sharepoint', label:'SharePoint',  re:/\bSharePoint\.(Contents|Files|Tables)\s*\(/},
    {kind:'blob',       label:'Azure Storage', re:/\bAzureStorage\.(Blobs|DataLake|Tables)\s*\(/},
    {kind:'salesforce', label:'Salesforce',  re:/\bSalesforce\.(Data|Reports)\s*\(/},
    {kind:'folder',     label:'Folder',      re:/\bFolder\.(Files|Contents)\s*\(/},
    {kind:'excel',      label:'Excel',       re:/\bExcel\.(Workbook|CurrentWorkbook)\s*\(/},
    {kind:'csv',        label:'CSV / text',  re:/\bCsv\.Document\s*\(/},
    {kind:'web',        label:'Web',         re:/\bWeb\.(Contents|BrowserContents)\s*\(/},
    {kind:'odata',      label:'OData',       re:/\bOData\.Feed\s*\(/}
  ];
  var KIND = {}; CONNECTORS.forEach(function(c){ KIND[c.kind]=c; });

  function scanConn(src){
    for(var i=0;i<CONNECTORS.length;i++) if(CONNECTORS[i].re.test(src)) return CONNECTORS[i];
    return null;
  }
  function refsIn(src, ctx, skip){
    var out=[], names=ctx.exprNames||[];
    for(var i=0;i<names.length;i++){
      var n=names[i];
      if(skip && skip[n]) continue;
      var m=new RegExp('(^|[^\\w.\'"])'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^\\w])').exec(src);
      if(m) out.push({n:n, at:m.index});
    }
    /* `Source = X` comes first in the query, so the earliest reference is the primary
       feed; a table merged in later must not decide the table's source. */
    out.sort(function(a,b){ return a.at-b.at; });
    return out.map(function(o){ return o.n; });
  }
  /* A partition usually says `Source = SomeOtherQuery`; that query is a shared expression
     or another table's partition. Follow the FIRST reference all the way down before
     trying the later ones: a query's source is what its `Source =` step points at, not
     whatever table gets merged in three steps later. */
  function resolveSrc(src, ctx, self){
    var seen={}; if(self) seen[self]=1;
    var texts=[src];
    var walk=function(text, depth){
      var conn=scanConn(text);
      if(conn) return {conn:conn, hit:text};
      if(depth>8) return null;
      var refs=refsIn(text, ctx, seen);
      refs.forEach(function(n){ seen[n]=1; });
      for(var i=0;i<refs.length;i++){
        var body=ctx.exprs[refs[i]]; if(!body) continue;
        texts.push(body);
        var r=walk(body, depth+1);
        if(r) return {conn:r.conn, hit:r.hit, via:refs[i]};
      }
      return null;
    };
    var res=walk(src, 0);
    return {conn:res&&res.conn, text:texts.join('\n'), via:res&&res.via, hit:res&&res.hit};
  }

  function litOrParam(tok, ctx){
    if(tok==null) return null;
    tok=String(tok).trim();
    var q=tok.match(/^"(.*)"$/); if(q) return q[1];
    return ctx.params[tok]!=null ? ctx.params[tok] : null;
  }
  function firstOf(res, re, grp){ var m=re.exec(res); return m? m[grp==null?1:grp] : null; }

  function sourceOf(fl, ctx){
    ctx = ctx || {exprs:{}, exprNames:[], params:{}};
    var part = fl.partSrc || '';
    if(fl.partKind==='calculated') return {kind:'calculated'};
    if(!part) return {kind:'calculated'};
    /* a query parameter is not a data source, it is a knob feeding one */
    if(/meta\s*\[[^\]]*IsParameterQuery\s*=\s*true/i.test(part)) return {kind:'parameter', label:'Parameter', detail:(part.match(/^\s*([^\n]{0,40}?)\s*meta\b/)||[])[1]||''};
    /* hard-coded rows beat everything: an inline table is not a data source */
    if(/Table\.FromRows|#table\s*\(|Binary\.FromText/.test(part)) return {kind:'manual'};

    var r = resolveSrc(part, ctx, fl.tableName);
    if(!r.conn) return {kind:'other', label:'Other', via:r.via||null};
    var c = r.conn, all = r.text, out = {kind:c.kind, label:c.label};
    if(r.via) out.via = r.via;

    /* the object name almost always sits in the partition itself, the server/schema upstream */
    var tab = firstOf(part, /\{\[Name\s*=\s*"([^"]+)"\s*,\s*Kind\s*=\s*"(?:Table|View)"\]\}/)
           || firstOf(part, /\bItem\s*=\s*"([^"]+)"/)
           || firstOf(part, /\bentity\s*=\s*"([^"]+)"/)
           || firstOf(all,  /\{\[Name\s*=\s*"([^"]+)"\s*,\s*Kind\s*=\s*"(?:Table|View)"\]\}/)
           || firstOf(all,  /\bentity\s*=\s*"([^"]+)"/);

    if(c.db){
      var sch = litOrParam(firstOf(all, /\{\[Name\s*=\s*("[^"]+"|[A-Za-z_]\w*)\s*,\s*Kind\s*=\s*"Schema"\]\}/), ctx)
             || firstOf(all, /\bSchema\s*=\s*"([^"]+)"/);
      out.schema = sch || 'unknown';
      out.table = tab || '?';
      out.detail = (sch? sch+'.' : '') + (tab || '?');
      var srv = litOrParam(firstOf(all, /\b(?:Vertica|Sql|Oracle|PostgreSQL|MySQL|Snowflake|Odbc)\.\w+\s*\(\s*("[^"]+"|[A-Za-z_]\w*)/), ctx);
      if(srv) out.server = srv;
      return out;
    }
    if(c.kind==='dataflow'){
      out.detail = tab || firstOf(all, /dataflowId\s*=\s*"([^"]+)"/) || 'dataflow';
      return out;
    }
    /* file / web sources: the deepest navigation step names the actual file or folder */
    var lastName = function(txt){
      var re=/\[Name\s*=\s*"([^"]+)"/g, m, last=null, withExt=null;
      while((m=re.exec(txt))){ last=m[1]; if(/\.[A-Za-z0-9]{2,5}$/.test(m[1])) withExt=m[1]; }
      return withExt || last;
    };
    var file = lastName(part) || lastName(r.hit||'') || lastName(all);
    var url  = firstOf(all, /\b(?:SharePoint\.\w+|Web\.\w+|AzureStorage\.\w+|Folder\.\w+|Salesforce\.\w+|OData\.Feed)\s*\(\s*"([^"]+)"/);
    var host = url ? (url.match(/^https?:\/\/([^\/]+)/)||[])[1] : null;
    out.table = file || tab || null;
    out.detail = file || tab || host || url || c.label;
    if(host) out.server = host;
    return out;
  }

  function finalize(name, tables, rels, ctx){
    var byName={}; tables.forEach(function(t){ byName[t.name]=t; });
    var seen={};
    rels=rels.filter(function(r){ return byName[r.from]&&byName[r.to]; })
      .filter(function(r){ var k=r.from+'|'+r.fromCol+'|'+r.to+'|'+r.toCol; if(seen[k])return false; seen[k]=1; return true; });
    var oneSide={}, manySide={}, rc={};
    rels.forEach(function(r){
      rc[r.from]=(rc[r.from]||0)+1; rc[r.to]=(rc[r.to]||0)+1;
      manySide[r.from]=1; if(r.toCard==='many') manySide[r.to]=1; else oneSide[r.to]=1;
      var fc=byName[r.from].columns.find(function(c){return c.name===r.fromCol;}); if(fc) fc.rel=true;
      var tc=byName[r.to].columns.find(function(c){return c.name===r.toCol;}); if(tc) tc.rel=true;
    });
    var sides=g.Roles.sidesOf(rels);
    tables.forEach(function(t){
      var fl=t._flags||{}; delete t._flags;
      t.source = t.source || sourceOf(fl, ctx);
      var ann=String(t.roleAnnotation||''); delete t.roleAnnotation;
      /* structural roles are fixed; everything else goes through the shared rule engine (js/roles.js)
         with the default rule set — the app re-runs it with the user's rules on load */
      var role;
      if(fl.isCG) role='calcgroup';
      else if(fl.isFP) role='fieldparam';
      else if(t.measures.length>0 && t.columns.length<=1) role='measures';
      else role=g.Roles.classify(g.Roles.sigOf(t, sides), null, ann).role;
      if(ann) t.ann=ann.toLowerCase();
      t.role=t.role||role;
      var domMap={calcgroup:'Calc Groups', fieldparam:'Field Params', measures:'Measures'};
      t.domain = t.domain || domMap[t.role] || (t.source.schema && t.source.schema!=='unknown' ? cap(t.source.schema)
        : (t.source.kind==='manual'?'Manual':(t.source.kind==='calculated'?'Calculated':(t.source.label||'Other'))));
      t.colCount=t.columns.length; t.measureCount=t.measures.length; t.relCount=rc[t.name]||0;
    });
    return {name:name, tables:tables, relationships:rels};
  }

  /* Shared queries (expressions.tmdl) hold the real connector calls and the
     parameter values (server, database, schema) the partitions only reference by name. */
  function parseExprText(text, ctx){
    var lines=text.split(/\r?\n/), cur=null, buf=[];
    var flush=function(){ if(cur) ctx.exprs[cur]=buf.join('\n'); cur=null; buf=[]; };
    for(var i=0;i<lines.length;i++){
      var raw=lines[i], t=raw.trim(), m;
      if(/^\S/.test(raw)){
        flush();
        if((m=t.match(/^expression\s+('(?:[^']|'')+'|[^\s=]+)\s*=\s*(.*)$/))){
          cur=unq(m[1]); buf=[];
          var inline=(m[2]||'').trim();
          if(inline){
            buf.push(inline);
            var q=inline.match(/^"([^"]*)"/);            /* scalar parameter: keep the value */
            if(q) ctx.params[cur]=q[1];
            else { var num=inline.match(/^(-?\d+(?:\.\d+)?)\b/); if(num) ctx.params[cur]=num[1]; }
          }
        }
        continue;
      }
      if(!cur) continue;
      if(/^(lineageTag|annotation|queryGroup|description|changedProperty)\b/.test(t)) continue;
      buf.push(t);
    }
    flush();
  }

  function parseTMDL(files){
    var tables=[], rels=[], name='';
    var ctx={exprs:{}, exprNames:[], params:{}};
    files.forEach(function(f){
      var txt=f.text; if(typeof txt!=='string') return;
      if(/^expression\s/m.test(txt)) parseExprText(txt, ctx);
    });
    /* longest name first so `OPRSchemaName` never matches inside `SchemaName` */
    ctx.exprNames=Object.keys(ctx.exprs).sort(function(a,b){ return b.length-a.length; });
    files.forEach(function(f){
      var txt=f.text; if(typeof txt!=='string') return;
      /* same-line whitespace only — `\s` also matches the newline after a bare
         `database` line, so it would greedily swallow the next line's own
         property (e.g. `compatibilityLevel: 1606`) and misread it as the name */
      var m=txt.match(/^database[ \t]+(.+)$/m); if(m) name=unq(m[1]);
      if(/^relationship\s/m.test(txt) && /fromColumn:/.test(txt)) rels=rels.concat(parseRelText(txt));
      if(/^table\s/m.test(txt)){ var t=parseTableText(txt); if(t) tables.push(t); }
    });
    /* tables are queries too — `Source = MdGeoEntities` points at another table's partition */
    tables.forEach(function(t){ var fl=t._flags||{}; if(fl.partSrc && !ctx.exprs[t.name]) ctx.exprs[t.name]=fl.partSrc; });
    ctx.exprNames=Object.keys(ctx.exprs).sort(function(a,b){ return b.length-a.length; });
    return finalize(name, tables, rels, ctx);
  }

  function parseBIM(j){
    var mdl=j.model||j, name=j.name||'';
    var skip=/^(LocalDateTable_|DateTableTemplate_)/;
    var txt=function(x){ return Array.isArray(x)?x.join('\n'):(x||''); };
    var tables=(mdl.tables||[]).filter(function(t){return !skip.test(t.name);}).map(function(t){
      var columns=(t.columns||[]).map(function(c){ return {name:c.name, dataType:c.dataType||'', hidden:!!c.isHidden, isCalc:c.type==='calculated', isKey:!!c.isKey, rel:false}; });
      var measures=(t.measures||[]).map(function(mm){ var o={name:mm.name, dax:txt(mm.expression).trim(), folder:mm.displayFolder||'', fmt:mm.formatString||'', description:mm.description||''}; if(mm.isHidden) o.h=1; return o; });
      var isCG=!!t.calculationGroup;
      var isFP=(t.columns||[]).some(function(c){ return (c.extendedProperties||[]).some(function(p){return p.name==='ParameterMetadata';}); });
      var partKind='', partSrc='';
      var p=(t.partitions||[])[0];
      if(p&&p.source){ partKind=(p.source.type==='calculated')?'calculated':(p.source.type||'m'); partSrc=txt(p.source.expression); }
      var roleAnn=(t.annotations||[]).find(function(a){return a.name==='SMV_Role';});
      return {name:t.name, columns:columns, measures:measures, roleAnnotation: roleAnn?String(roleAnn.value):undefined, _flags:{isCG:isCG,isFP:isFP,partKind:partKind,partSrc:partSrc}};
    });
    var rels=(mdl.relationships||[]).filter(function(r){return !skip.test(r.fromTable)&&!skip.test(r.toTable);}).map(function(r){
      return {from:r.fromTable, fromCol:r.fromColumn, to:r.toTable, toCol:r.toColumn,
        fromCard:String(r.fromCardinality||'many').toLowerCase(), toCard:String(r.toCardinality||'one').toLowerCase(),
        inactive:r.isActive===false, both:r.crossFilteringBehavior==='bothDirections'};
    });
    var ctx={exprs:{}, exprNames:[], params:{}};
    (mdl.expressions||[]).forEach(function(e){
      if(!e || !e.name) return;
      var body=txt(e.expression); ctx.exprs[e.name]=body;
      var q=body.trim().match(/^"([^"]*)"/); if(q) ctx.params[e.name]=q[1];
    });
    tables.forEach(function(t){ var fl=t._flags||{}; fl.tableName=t.name; if(fl.partSrc && !ctx.exprs[t.name]) ctx.exprs[t.name]=fl.partSrc; });
    ctx.exprNames=Object.keys(ctx.exprs).sort(function(a,b){ return b.length-a.length; });
    return finalize(name, tables, rels, ctx);
  }

  function parseAny(files){
    for(var i=0;i<files.length;i++){
      var f=files[i];
      if(/\.(bim|json)$/i.test(f.name)){
        try{
          var j=JSON.parse(f.text);
          if(j && Array.isArray(j.tables) && Array.isArray(j.relationships) && j.tables.length && j.tables[0].columns && j.tables[0].domain!==undefined)
            return {name:j.name||'', tables:j.tables, relationships:j.relationships};
          if(j && j.model && Array.isArray(j.model.tables)) return parseBIM(j);
          if(j && Array.isArray(j.tables) && j.compatibilityLevel!==undefined) return parseBIM(j);
        }catch(e){}
      }
    }
    var m=parseTMDL(files);
    if(!m.tables.length) throw new Error('No tables found in the provided files.');
    return m;
  }

  g.TMDLParser={parseAny:parseAny, parseTMDL:parseTMDL, parseBIM:parseBIM, CONNECTORS:CONNECTORS};
})(typeof window!=='undefined'?window:globalThis);
