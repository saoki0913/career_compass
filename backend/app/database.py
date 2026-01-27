import libsql_experimental as libsql
from app.config import settings


def get_db_connection():
    """Get a connection to the Turso database."""
    conn = libsql.connect(
        settings.turso_database_url,
        auth_token=settings.turso_auth_token,
    )
    return conn


def execute_query(query: str, params: tuple = ()):
    """Execute a query and return results."""
    conn = get_db_connection()
    try:
        cursor = conn.execute(query, params)
        results = cursor.fetchall()
        conn.commit()
        return results
    finally:
        conn.close()
