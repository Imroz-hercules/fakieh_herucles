#!/usr/bin/env python3
"""
CSV -> SQL Server loader for ASMBatchReports.dbo.BatchMaterials (Windows Authentication)

Usage:
  python csv_to_sqlserver.py --csv "C:\\path\\to\\fakieh_sql.csv"

Install requirements:
  pip install pandas pyodbc
"""

import argparse
import os
import sys
import pandas as pd
import pyodbc

# Connection details
SERVER = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
DATABASE = "ASMBatchReports"
TABLE = "[ASMBatchReports].[dbo].[BatchMaterials]"

# Expected columns in order
COLUMNS = [
    "Source Server",
    "Batch GUID",
    "ROOTGUID",
    "OrderId",
    "Batch Name",
    "Product Name",
    "Batch Act Start",
    "Batch Act End",
    "Batch Transfer Time",
    "Quantity",
    "Material Name",
    "Material Code",
    "sp_prot",
    "SetPoint Float",
    "Actual Value Float",
    "FormulaCategoryName",
]

# Date and numeric columns
DATE_COLS = ["Batch Act Start", "Batch Act End", "Batch Transfer Time"]
NUM_COLS = ["Quantity", "SetPoint Float", "Actual Value Float"]

def connect():
    driver = None
    for d in pyodbc.drivers():
        if "ODBC Driver 17 for SQL Server" in d:
            driver = "ODBC Driver 17 for SQL Server"
            break
        if "ODBC Driver 18 for SQL Server" in d:
            driver = "ODBC Driver 18 for SQL Server"
            break
    if not driver:
        raise RuntimeError("No ODBC Driver for SQL Server found. Install ODBC Driver 17 or 18.")
    
    extra = ";TrustServerCertificate=yes" if "18" in driver else ""
    conn_str = f"DRIVER={{{driver}}};SERVER={SERVER};DATABASE={DATABASE};Trusted_Connection=yes{extra}"
    print(f"Connecting with driver: {driver}")
    return pyodbc.connect(conn_str)

def chunks(df, size):
    for start in range(0, len(df), size):
        yield df.iloc[start:start+size]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="fakieh_sql.csv")
    parser.add_argument("--batch-size", type=int, default=5000, help="Rows per batch insert")
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f"CSV not found: {args.csv}", file=sys.stderr)
        sys.exit(1)

    print(f"Reading CSV: {args.csv}")
    df = pd.read_csv(args.csv, dtype=str, keep_default_na=True, na_values=["", "NA", "NaN"])

    # Check required columns
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        print("ERROR: Missing columns:", missing)
        sys.exit(1)

    # Parse types
    for col in DATE_COLS:
        df[col] = pd.to_datetime(df[col], errors="coerce")
    for col in NUM_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    
    df = df[COLUMNS].where(pd.notnull(df), None)

    placeholders = ", ".join(["?"] * len(COLUMNS))
    col_list = ", ".join(f"[{c}]" for c in COLUMNS)
    insert_sql = f"INSERT INTO {TABLE} ({col_list}) VALUES ({placeholders})"

    conn = connect()
    cursor = conn.cursor()
    cursor.fast_executemany = True

    total = len(df)
    print(f"Inserting {total} rows into {TABLE} ...")

    for i, batch_df in enumerate(chunks(df, args.batch_size), start=1):
        rows = []
        for row in batch_df.itertuples(index=False, name=None):
            row = list(row)
            for idx, col in enumerate(COLUMNS):
                if col in DATE_COLS and isinstance(row[idx], pd.Timestamp):
                    row[idx] = None if pd.isna(row[idx]) else row[idx].to_pydatetime()
            rows.append(tuple(row))
        cursor.executemany(insert_sql, rows)
        conn.commit()
        print(f"Committed batch {i} ({len(batch_df)} rows)")

    cursor.close()
    conn.close()
    print("Done!")

if __name__ == "__main__":
    main()
