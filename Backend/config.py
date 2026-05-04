# config.py
from urllib.parse import quote_plus

DB_USERNAME = "postgres"
DB_PASSWORD = "Hercules"
DB_HOST = "localhost"
DB_PORT = "5432"

# Default DB = fakieh
SQLALCHEMY_DATABASE_URI = (
    f"postgresql+psycopg2://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/Faikeh"
)

# ✅ SQL Server connection (FIXED) — same DSN for SQLAlchemy bind and pyodbc routes
SQLSERVER_USER = "fakieh_app_user"
SQLSERVER_PASSWORD = "Hercules"

SQLSERVER_ODBC_CONNECT = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=DESKTOP-N8PGI9S\\FAKIEH_REPORTING;"
    "DATABASE=ASMBatchReports;"
    f"UID={SQLSERVER_USER};"
    f"PWD={SQLSERVER_PASSWORD};"
    "TrustServerCertificate=yes;"
)

sqlserver_conn = quote_plus(SQLSERVER_ODBC_CONNECT)

# Additional binds
SQLALCHEMY_BINDS = {
    "plc": f"postgresql+psycopg2://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/plc",
    "sqlserver": f"mssql+pyodbc:///?odbc_connect={sqlserver_conn}",
}

SQLALCHEMY_TRACK_MODIFICATIONS = False