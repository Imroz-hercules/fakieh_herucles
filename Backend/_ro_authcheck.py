"""READ-ONLY identity probe across auth methods + datetimeoffset converter test. SELECT only."""
import struct, pyodbc

def dto_handler(raw):
    # decode SQL_SS_TIMESTAMPOFFSET (-155): y,m,d,h,mi,s,frac(7), tzh, tzm
    tup = struct.unpack("<6hI2h", raw)
    return ("%04d-%02d-%02d %02d:%02d:%02d.%07d %+03d:%02d" %
            (tup[0],tup[1],tup[2],tup[3],tup[4],tup[5],tup[6],tup[7],tup[8]))

DRIVER = "{ODBC Driver 17 for SQL Server}"
SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
attempts = [
    ("WindowsAuth/Trusted",
     f"DRIVER={DRIVER};SERVER={SRV};DATABASE=master;Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=8;"),
    ("sa? skip", None),
]
for label, cs in attempts:
    if cs is None:
        continue
    print(f"\n===== {label} =====")
    try:
        cn = pyodbc.connect(cs, autocommit=True)
        cn.add_output_converter(-155, dto_handler)
        cur = cn.cursor()
        cur.execute("""SELECT SUSER_SNAME() login_name, IS_SRVROLEMEMBER('sysadmin') is_sa,
                       HAS_PERMS_BY_NAME(NULL,NULL,'VIEW ANY DEFINITION') vad,
                       HAS_PERMS_BY_NAME(NULL,NULL,'VIEW SERVER STATE') vss,
                       CONVERT(varchar(40),SYSDATETIMEOFFSET()) now_dto""")
        for r in cur.fetchall():
            print("login=%s sysadmin=%s view_any_def=%s view_server_state=%s now=%s" % tuple(r))
        # can we see msdb jobs?
        try:
            cur.execute("SELECT COUNT(*) FROM msdb.dbo.sysjobs")
            print("msdb.sysjobs count =", cur.fetchone()[0])
        except Exception as e:
            print("msdb.sysjobs ERROR:", str(e)[:120])
        # can we see proc def?
        try:
            cur.execute("SELECT OBJECT_DEFINITION(OBJECT_ID('ASMBatchReports.dbo.usp_Merge_BatchMaterials_FromLocal'))")
            d = cur.fetchone()[0]
            print("usp_Merge def visible:", "YES len=%d" % len(d) if d else "NULL")
        except Exception as e:
            print("proc def ERROR:", str(e)[:120])
        cn.close()
    except Exception as e:
        print("CONNECT FAILED:", str(e)[:200])
