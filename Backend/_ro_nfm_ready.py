"""READ-ONLY NFM-clone readiness discovery from the central box. OPENQUERY SELECTs only."""
import struct, pyodbc
SRV=r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN=(f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
      "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT=open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_nfm_ready_out.txt","w",encoding="utf-8")
def dto(raw):
    t=struct.unpack("<6hI2h",raw); return "%04d-%02d-%02d %02d:%02d:%02d%+03d:%02d"%(t[0],t[1],t[2],t[3],t[4],t[5],t[7],t[8])
def w(s=""): OUT.write(str(s)+"\n"); print(s)
def loc(cur,label,sql,cw=60):
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql); cols=[d[0] for d in cur.description]; w(" | ".join(cols))
        rows=cur.fetchall()
        for r in rows: w(" | ".join("" if v is None else str(v)[:cw] for v in r))
        w(f"({len(rows)} rows)")
    except Exception as e: w(f"ERROR: {str(e)[:300]}")
def oq(cur,label,ls,inner,cw=60,cap=400):
    esc=inner.replace("'","''"); sql=f"SELECT * FROM OPENQUERY([{ls}],'{esc}')"
    w(f"\n===== [{ls}] {label} =====")
    try:
        cur.execute(sql); cols=[d[0] for d in cur.description]; w(" | ".join(cols))
        rows=cur.fetchall()
        for r in rows[:cap]: w(" | ".join("" if v is None else str(v)[:cw] for v in r))
        w(f"({len(rows)} rows)")
        return rows
    except Exception as e:
        w(f"UNREACHABLE/ERROR: {str(e)[:300]}"); return None

IDENT="SELECT @@SERVERNAME s, SUSER_SNAME() login_, CAST(SERVERPROPERTY('Edition') AS varchar(50)) edition, CAST(SERVERPROPERTY('ProductVersion') AS varchar(30)) ver, CAST(SERVERPROPERTY('Collation') AS varchar(60)) collation_"
SRCSCHEMA=("SELECT s.name sch,t.name tbl,c.column_id,c.name col,ty.name type,c.max_length,c.is_nullable "
  "FROM SimaticBatch.sys.tables t JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id "
  "JOIN SimaticBatch.sys.columns c ON c.object_id=t.object_id JOIN SimaticBatch.sys.types ty ON ty.user_type_id=c.user_type_id "
  "WHERE t.name IN ('Batch','BatchChanges','ParValueOnline','Order','OrderCategory','Action') ORDER BY t.name,c.column_id")
SRCKEYS=("SELECT t.name tbl,i.name idx,i.is_primary_key pk,i.is_unique uq,c.name col,ic.key_ordinal ko "
  "FROM SimaticBatch.sys.indexes i JOIN SimaticBatch.sys.tables t ON t.object_id=i.object_id "
  "JOIN SimaticBatch.sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id "
  "JOIN SimaticBatch.sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id "
  "WHERE t.name IN ('Batch','ParValueOnline','Order','Action') AND (i.is_primary_key=1 OR i.is_unique=1) "
  "ORDER BY t.name,i.is_primary_key DESC,i.name,ic.key_ordinal")
TRIGS=("SELECT s.name parent_sch,t.name parent_tbl,tr.name trig,tr.is_disabled,tr.is_instead_of_trigger "
  "FROM SimaticBatch.sys.triggers tr JOIN SimaticBatch.sys.tables t ON t.object_id=tr.parent_id "
  "JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id "
  "WHERE t.name IN ('Batch','BatchChanges','ParValueOnline','Order','OrderCategory','Action') ORDER BY t.name,tr.name")
TRIGASM=("SELECT t.name parent_tbl,tr.name trig,CASE WHEN m.definition LIKE '%ASM%' THEN 1 ELSE 0 END mentions_asm,"
  "CASE WHEN m.definition IS NULL THEN 1 ELSE 0 END def_hidden FROM SimaticBatch.sys.triggers tr "
  "JOIN SimaticBatch.sys.objects t ON t.object_id=tr.parent_id LEFT JOIN SimaticBatch.sys.sql_modules m ON m.object_id=tr.object_id "
  "ORDER BY mentions_asm DESC,t.name")
TGTROWS=("SELECT t.name tbl,SUM(p.rows) rows_ FROM ASMBatchReports.sys.tables t "
  "JOIN ASMBatchReports.sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) "
  "WHERE t.name IN ('BatchCopy','ParValueOnline_copy','OrderDetails') GROUP BY t.name")
TGTCOLS=("SELECT t.name tbl,c.column_id,c.name col,ty.name type,c.max_length,c.is_nullable "
  "FROM ASMBatchReports.sys.tables t JOIN ASMBatchReports.sys.columns c ON c.object_id=t.object_id "
  "JOIN ASMBatchReports.sys.types ty ON ty.user_type_id=c.user_type_id "
  "WHERE t.name IN ('BatchCopy','ParValueOnline_copy','OrderDetails') ORDER BY t.name,c.column_id")

def blocks(cur,ls):
    oq(cur,"1a identity",ls,IDENT,cw=70)
    oq(cur,"1b SOURCE table schemas (SimaticBatch)",ls,SRCSCHEMA)
    oq(cur,"1b2 SOURCE PK/unique keys",ls,SRCKEYS)
    oq(cur,"1c triggers on source tables",ls,TRIGS)
    oq(cur,"1d triggers mentioning ASM (def may be hidden)",ls,TRIGASM)
    oq(cur,"1e TARGET tables rowcounts (ASMBatchReports)",ls,TGTROWS)
    oq(cur,"1e2 TARGET table columns",ls,TGTCOLS)

def main():
    cn=pyodbc.connect(CONN,autocommit=True); cn.timeout=120; cn.add_output_converter(-155,dto)
    cur=cn.cursor(); cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    loc(cur,"0 central identity",IDENT.replace("SUSER_SNAME() login_,","SUSER_SNAME() login_,").replace("@@SERVERNAME s,","@@SERVERNAME s, CONVERT(varchar(33),SYSDATETIMEOFFSET()) captured_at,"))
    loc(cur,"0 linked servers","SELECT s.name linked_server,s.data_source,s.is_data_access_enabled,s.is_rpc_out_enabled FROM sys.servers s WHERE s.is_linked=1 ORDER BY s.name",cw=80)
    loc(cur,"0 linked logins","SELECT s.name linked_server,ll.remote_name,ll.uses_self_credential FROM sys.linked_logins ll JOIN sys.servers s ON s.server_id=ll.server_id WHERE s.is_linked=1 ORDER BY s.name")
    for ls in ("FAKIEH_SERVER1","FAKIEH_SERVER2"):
        w(f"\n############################## {ls} ##############################")
        blocks(cur,ls)
    # OS1_SQL — identity + DB presence, then full blocks (it is OS1, hosts both DBs)
    w("\n############################## OS1_SQL ##############################")
    r=oq(cur,"OS1_SQL identity + DB presence","OS1_SQL",
        "SELECT @@SERVERNAME s, CAST(SERVERPROPERTY('Edition') AS varchar(50)) edition, "
        "(SELECT COUNT(*) FROM sys.databases WHERE name='SimaticBatch') has_simaticbatch, "
        "(SELECT COUNT(*) FROM sys.databases WHERE name='ASMBatchReports') has_asmreports",cw=70)
    if r and len(r)>0 and r[0][2]==1:
        blocks(cur,"OS1_SQL")
    cn.close(); w("\nDONE")
    OUT.close()

if __name__=="__main__": main()
