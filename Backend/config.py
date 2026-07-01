# config.py
import os
from urllib.parse import quote_plus

# PLC broadcast / plant-orders HTTP cache (see routes.plc_routes, routes.websocket_routes)
PLC_POLL_INTERVAL = float(os.getenv("PLC_POLL_INTERVAL", "0.5"))
PLC_ORDERS_CACHE_TTL_SEC = float(os.getenv("PLC_ORDERS_CACHE_TTL_SEC", "1.25"))

DB_USERNAME = os.getenv("DB_USERNAME", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Hercules")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

# Default DB = fakieh
SQLALCHEMY_DATABASE_URI = (
    f"postgresql+psycopg2://{DB_USERNAME}:{quote_plus(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/Faikeh"
)

# SQL Server connection — same DSN for SQLAlchemy bind and ODBC routes
SQLSERVER_USER = os.getenv("SQLSERVER_USER", "fakieh_app_user")
SQLSERVER_PASSWORD = os.getenv("SQLSERVER_PASSWORD", "Hercules")
SQLSERVER_SERVER = os.getenv("SQLSERVER_SERVER", r"DESKTOP-N8PGI9S\FAKIEH_REPORTING")
SQLSERVER_DATABASE = os.getenv("SQLSERVER_DATABASE", "ASMBatchReports")
SQLSERVER_BATCH_MATERIALS_TABLE = os.getenv(
    "SQLSERVER_BATCH_MATERIALS_TABLE", "BatchMaterials_Shadow"
)

SQLSERVER_ODBC_CONNECT = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    f"SERVER={SQLSERVER_SERVER};"
    f"DATABASE={SQLSERVER_DATABASE};"
    f"UID={SQLSERVER_USER};"
    f"PWD={SQLSERVER_PASSWORD};"
    "TrustServerCertificate=yes;"
)

sqlserver_conn = quote_plus(SQLSERVER_ODBC_CONNECT)

# Additional binds
SQLALCHEMY_BINDS = {
    "plc": f"postgresql+psycopg2://{DB_USERNAME}:{quote_plus(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/plc",
    "sqlserver": f"mssql+pyodbc:///?odbc_connect={sqlserver_conn}",
}

SQLALCHEMY_TRACK_MODIFICATIONS = False

# Connection pool (all engines inherit unless overridden per-bind in app factory)
_pool_pre_ping = os.getenv("SQLALCHEMY_POOL_PRE_PING", "true").lower() in ("1", "true", "yes")
_pool_recycle = int(os.getenv("SQLALCHEMY_POOL_RECYCLE", "280"))
_pool_size = int(os.getenv("SQLALCHEMY_POOL_SIZE", "5"))
_max_overflow = int(os.getenv("SQLALCHEMY_MAX_OVERFLOW", "10"))

SQLALCHEMY_ENGINE_OPTIONS = {
    "pool_pre_ping": _pool_pre_ping,
    "pool_recycle": _pool_recycle,
    "pool_size": _pool_size,
    "max_overflow": _max_overflow,
}

# Set True at runtime when /api/websocket/start-broadcast runs (not a static deploy default).
PLC_BROADCAST_ACTIVE = False
