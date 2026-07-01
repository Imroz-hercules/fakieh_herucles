"""READ-ONLY probe 4: header completeness, Unknown/server split, backfill gap, PV schema. NO WRITES."""
import pyodbc
SERVER = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
USER, PWD = "fakieh_app_user", "Hercules"
CONN = ("DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SERVER};DATABASE=ASMBatchReports;UID={USER};PWD={PWD};"
        "TrustServerCertificate=yes;Connection Timeout=8;")


def run(cur, label, sql, cap=300):
    print(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        if cols:
            print(" | ".join(cols))
            rows = cur.fetchall()
            for r in rows[:cap]:
                print(" | ".join("" if v is None else str(v) for v in r))
            print(f"({len(rows)} rows)")
        else:
            print("(no resultset)")
    except Exception as e:
        print(f"ERROR: {e}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cur = cn.cursor()
    print("CONNECT OK")

    run(cur, "PV copy columns", """
        SELECT c.name col, ty.name dtype, c.max_length, c.is_nullable
        FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id
        WHERE c.object_id=OBJECT_ID('dbo.ParValueOnline_copy') ORDER BY c.column_id""", cap=80)

    run(cur, "PV copy summary (converted)", """
        SELECT COUNT(*) rows_, COUNT(DISTINCT ROOTGUID) distinct_root,
               CONVERT(varchar(33),MIN([TimeStamp]),126) min_ts,
               CONVERT(varchar(33),MAX([TimeStamp]),126) max_ts
        FROM dbo.ParValueOnline_copy""")

    run(cur, "BatchCopy header completeness by SourceServer", """
        SELECT SourceServer, COUNT(*) rows_,
               SUM(CASE WHEN ProductName IS NULL THEN 1 ELSE 0 END) null_product,
               SUM(CASE WHEN FormulaCategoryName IS NULL THEN 1 ELSE 0 END) null_fcat,
               SUM(CASE WHEN Name IS NULL THEN 1 ELSE 0 END) null_name,
               SUM(CASE WHEN OrderId IS NULL THEN 1 ELSE 0 END) null_order,
               SUM(CASE WHEN Quantity IS NULL THEN 1 ELSE 0 END) null_qty,
               CONVERT(varchar(33),MIN(ActStart),126) min_start,
               CONVERT(varchar(33),MAX(ActStart),126) max_start
        FROM dbo.BatchCopy GROUP BY SourceServer""")

    run(cur, "BatchCopy distinct OGUID/ROOTGUID counts", """
        SELECT COUNT(*) rows_, COUNT(DISTINCT OGUID) d_oguid, COUNT(DISTINCT ROOTGUID) d_root,
               SUM(CASE WHEN OGUID=ROOTGUID THEN 1 ELSE 0 END) oguid_eq_root
        FROM dbo.BatchCopy""")

    run(cur, "BM Source Server temporal split (by month)", """
        SELECT [Source Server], FORMAT([Batch Transfer Time],'yyyy-MM') ym,
               COUNT(DISTINCT [Batch GUID]) batches, COUNT(*) rows_
        FROM dbo.BatchMaterials
        GROUP BY [Source Server], FORMAT([Batch Transfer Time],'yyyy-MM')
        ORDER BY ym, [Source Server]""", cap=200)

    run(cur, "BM batches appearing under MULTIPLE source servers (examples)", """
        SELECT TOP (20) [Batch GUID],
               COUNT(DISTINCT [Source Server]) n_servers,
               MAX(CASE WHEN [Source Server]='Server1' THEN 1 ELSE 0 END) on_s1,
               MAX(CASE WHEN [Source Server]='Server2' THEN 1 ELSE 0 END) on_s2,
               MAX(CASE WHEN [Source Server]='Unknown' THEN 1 ELSE 0 END) on_unk,
               COUNT(*) rows_
        FROM dbo.BatchMaterials
        GROUP BY [Batch GUID] HAVING COUNT(DISTINCT [Source Server])>1
        ORDER BY rows_ DESC""")
    run(cur, "BM count of batches under multiple servers", """
        SELECT COUNT(*) multi_server_batches FROM (
          SELECT [Batch GUID] FROM dbo.BatchMaterials
          GROUP BY [Batch GUID] HAVING COUNT(DISTINCT [Source Server])>1) z""")

    # Backfill gap: BatchCopy headers not represented in BatchMaterials
    run(cur, "BatchCopy OGUIDs missing from BatchMaterials (by Batch GUID)", """
        SELECT bc.SourceServer, COUNT(*) missing_batches
        FROM dbo.BatchCopy bc
        WHERE NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WHERE bm.[Batch GUID]=bc.OGUID)
          AND NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WHERE bm.[Batch GUID]=bc.ROOTGUID)
        GROUP BY bc.SourceServer""")

    # PV roots not in BatchMaterials and not in BatchCopy (headerless candidates)
    run(cur, "PV ROOTGUIDs not in BatchMaterials (potential missing)", """
        SELECT COUNT(*) pv_roots_missing_from_BM FROM (
          SELECT DISTINCT ROOTGUID FROM dbo.ParValueOnline_copy) p
        WHERE NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WHERE bm.ROOTGUID=p.ROOTGUID)
          AND NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WHERE bm.[Batch GUID]=p.ROOTGUID)""")
    run(cur, "PV ROOTGUIDs not in BatchCopy (headerless)", """
        SELECT COUNT(*) pv_roots_no_header FROM (
          SELECT DISTINCT ROOTGUID FROM dbo.ParValueOnline_copy) p
        WHERE NOT EXISTS (SELECT 1 FROM dbo.BatchCopy bc WHERE bc.OGUID=p.ROOTGUID OR bc.ROOTGUID=p.ROOTGUID)""")

    cn.close()
    print("\nDONE")


if __name__ == "__main__":
    main()
