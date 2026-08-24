"""
READ-ONLY: section 6 (HA overlap), section 7 (Server1 stall root-cause),
section 9 (uncapped golden oracle + dashboard-exact aggregates).
SELECT / OPENQUERY(SELECT) only. No writes.
Outputs: _ro_final_ha_out.txt, _ro_golden_full.csv
"""
import struct, csv, pyodbc
from datetime import datetime

SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
BASE = r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend"
OUT = open(BASE + r"\_ro_final_ha_out.txt", "w", encoding="utf-8")
DASH = "BatchMaterials_Shadow"
WIN_S = "2026-07-22 04:00:00"   # 07:00 AST 2026-07-22
WIN_E = "2026-07-23 04:00:00"   # 07:00 AST 2026-07-23


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d.%03d%+03d:%02d" % (
        t[0], t[1], t[2], t[3], t[4], t[5], t[6] // 10000, t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def oqf(ls, inner):
    return "OPENQUERY([%s], '%s')" % (ls, inner.replace("'", "''"))


def run(cur, label, sql, cap=1000, cw=300):
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        while True:
            if cur.description:
                cols = [d[0] for d in cur.description]
                w(" | ".join(cols))
                for r in cur.fetchall()[:cap]:
                    w(" | ".join("" if v is None else str(v)[:cw] for v in r))
            else:
                w("(no resultset)")
            if not cur.nextset():
                break
    except Exception as e:
        w(f"ERROR: {str(e)[:500]}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 240
    cn.add_output_converter(-155, dto)
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"FINAL HA/GOLDEN @ local {datetime.now().isoformat()} (READ-ONLY)")

    # ===== 7) SERVER1 STALL DIAGNOSIS (vendor vs staging) =====
    for ls in ("FAKIEH_SERVER1", "FAKIEH_SERVER2"):
        run(cur, f"7.{ls}.vendor_Batch_max", "SELECT * FROM " + oqf(ls,
            "SELECT COUNT_BIG(*) rows_, CONVERT(varchar(40),MAX(BatchTransferTime),121) max_btt, "
            "CONVERT(varchar(40),MAX(CreationDateTime),121) max_creation, CONVERT(varchar(40),MAX(Created),121) max_created "
            "FROM SimaticBatch.SIMATIC_BATCH.Batch"))
        run(cur, f"7.{ls}.vendor_ParValueOnline_max", "SELECT * FROM " + oqf(ls,
            "SELECT COUNT_BIG(*) rows_, CONVERT(varchar(40),MAX([TimeStamp]),121) max_ts FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline"))
        run(cur, f"7.{ls}.vendor_BatchChanges_max", "SELECT * FROM " + oqf(ls,
            "SELECT COUNT_BIG(*) rows_, CONVERT(varchar(40),MAX(ActEnd),121) max_actend, CONVERT(varchar(40),MAX(ModificationDateTime),121) max_mod "
            "FROM SimaticBatch.SIMATIC_BATCH.BatchChanges"))
        run(cur, f"7.{ls}.staging_BatchCopy_max", "SELECT * FROM " + oqf(ls,
            "SELECT COUNT_BIG(*) rows_, CONVERT(varchar(40),MAX(BatchTransferTime),121) max_btt, CONVERT(varchar(40),MAX(ActStart),121) max_actstart, "
            "CONVERT(varchar(40),MAX(ActEnd),121) max_actend FROM ASMBatchReports.dbo.BatchCopy"))

    # ===== 6) HA TOPOLOGY EVIDENCE (OGUID overlap across the two sources' BatchCopy) =====
    all_inner = "SELECT DISTINCT CAST(OGUID AS char(36)) g FROM ASMBatchReports.dbo.BatchCopy"
    since_inner = all_inner + " WHERE BatchTransferTime >= '2026-06-22'"
    for tag, inner in (("ALL_TIME", all_inner), ("SINCE_2026-06-22", since_inner)):
        run(cur, f"6.overlap_{tag}",
            f"WITH s1 AS (SELECT g FROM {oqf('FAKIEH_SERVER1', inner)}), "
            f"s2 AS (SELECT g FROM {oqf('FAKIEH_SERVER2', inner)}) "
            "SELECT (SELECT COUNT(*) FROM s1 WHERE g NOT IN (SELECT g FROM s2)) AS server1_only, "
            "(SELECT COUNT(*) FROM s2 WHERE g NOT IN (SELECT g FROM s1)) AS server2_only, "
            "(SELECT COUNT(*) FROM s1 WHERE g IN (SELECT g FROM s2)) AS in_both")
    samp = ("SELECT CAST(OGUID AS char(36)) g, CONVERT(varchar(40),MAX(BatchTransferTime),121) btt "
            "FROM ASMBatchReports.dbo.BatchCopy GROUP BY CAST(OGUID AS char(36))")
    run(cur, "6.sample_5_in_both",
        f"SELECT TOP 5 a.g AS OGUID, a.btt AS server1_btt, b.btt AS server2_btt "
        f"FROM {oqf('FAKIEH_SERVER1', samp)} a JOIN {oqf('FAKIEH_SERVER2', samp)} b ON a.g=b.g ORDER BY a.g")

    # ===== 9) GOLDEN ORACLE (uncapped) =====
    golden_sql = f"""
        SELECT [Source Server],[Batch GUID],[ROOTGUID],[OrderId],[Batch Name],[Product Name],
               CONVERT(varchar(23),[Batch Act Start],121) [Batch Act Start],
               CONVERT(varchar(23),[Batch Act End],121) [Batch Act End],
               CONVERT(varchar(23),[Batch Transfer Time],121) [Batch Transfer Time],
               [Quantity],[Material Name],[Material Code],[sp_prot],[SetPoint Float],[Actual Value Float],
               [FormulaCategoryName],[POBJID],[EventID]
        FROM dbo.{DASH} WITH (NOLOCK)
        WHERE [Batch Act Start] >= '{WIN_S}' AND [Batch Act Start] < '{WIN_E}'
        ORDER BY [Batch Act Start],[Batch GUID],[Material Name],[POBJID]"""
    cur.execute(golden_sql)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    with open(BASE + r"\_ro_golden_full.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(cols)
        for r in rows:
            wr.writerow(["" if v is None else v for v in r])
    w(f"\n===== 9.golden_full -> _ro_golden_full.csv : {len(rows)} rows x {len(cols)} cols =====")

    # dashboard-exact filter (matches /reports/product-summary)
    pfilter = ("[Batch Act Start] >= '%s' AND [Batch Act Start] < '%s' "
               "AND LOWER(LTRIM(RTRIM([Product Name]))) <> 'not selected' "
               "AND [Product Name] IS NOT NULL AND LTRIM(RTRIM([Product Name])) <> ''") % (WIN_S, WIN_E)

    run(cur, "9.total_distinct_batches_RAW (no product filter)",
        f"SELECT COUNT(DISTINCT [Batch GUID]) total_batches, COUNT(*) total_rows "
        f"FROM dbo.{DASH} WITH (NOLOCK) WHERE [Batch Act Start] >= '{WIN_S}' AND [Batch Act Start] < '{WIN_E}'")
    run(cur, "9.totals_FILTERED (dashboard math)",
        f"SELECT COUNT(DISTINCT [Batch GUID]) batch_count, "
        f"SUM([SetPoint Float]) sum_sp, SUM([Actual Value Float]) sum_act, "
        f"ROUND(SUM([SetPoint Float]),2) sum_sp_2dp, ROUND(SUM([Actual Value Float]),2) sum_act_2dp "
        f"FROM dbo.{DASH} WITH (NOLOCK) WHERE {pfilter}")
    run(cur, "9.per_product (dashboard math)",
        f"SELECT [Product Name] product, COUNT(DISTINCT [Batch GUID]) batches, "
        f"SUM([SetPoint Float]) sum_sp, SUM([Actual Value Float]) sum_act "
        f"FROM dbo.{DASH} WITH (NOLOCK) WHERE {pfilter} GROUP BY [Product Name] ORDER BY [Product Name]", cap=100)
    run(cur, "9.per_material (dashboard filter)",
        f"SELECT [Material Name] material, COUNT(DISTINCT [Batch GUID]) batches, "
        f"SUM([SetPoint Float]) sum_sp, SUM([Actual Value Float]) sum_act "
        f"FROM dbo.{DASH} WITH (NOLOCK) WHERE {pfilter} GROUP BY [Material Name] ORDER BY [Material Name]", cap=100)

    cn.close()
    w("\nDONE FINAL HA/GOLDEN")
    OUT.close()


if __name__ == "__main__":
    main()
