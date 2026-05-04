# config.py
DB_USERNAME = "postgres"
DB_PASSWORD = "Hercules"
DB_HOST = "localhost"
DB_PORT = "5432"

# Default DB = fakieh
SQLALCHEMY_DATABASE_URI = (
    f"postgresql+psycopg2://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/Faikeh"
)

# Additional binds
SQLALCHEMY_BINDS = {
    "plc": f"postgresql+psycopg2://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/plc",
    "sqlserver": "mssql+pyodbc:///?odbc_connect=DRIVER={ODBC Driver 17 for SQL Server};SERVER=DESKTOP-N8PGI9S\\FAKIEH_REPORTING;DATABASE=ASMBatchReports;Trusted_Connection=yes",
}

SQLALCHEMY_TRACK_MODIFICATIONS = False