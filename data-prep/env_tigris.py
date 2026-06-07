"""Shared Tigris/DuckDB connection helper.

Loads .env from the project root with python-dotenv and maps the Tigris
client credentials to the AWS_* names DuckDB's httpfs secret expects.

SECURITY: credentials are read from the environment only. They are NEVER
written into any payload, the web/ app, or the client bundle. The browser
only ever sees the public PMTiles URL and the generated JSON.
"""
from __future__ import annotations

import os
import pathlib

import duckdb
from dotenv import load_dotenv

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"

# Public sources (range-request hosted). S3 paths used when credentials present.
PARQUET_HTTPS = "https://ontopic-public-data.t3.tigrisfiles.io/sample-data/health_zip.parquet"
PARQUET_S3 = "s3://ontopic-public-data/sample-data/health_zip.parquet"
PMTILES_URL = "https://ontopic-public-data.t3.tigrisfiles.io/pmtiles/Health_Zip_converted.pmtiles"


def load_env() -> bool:
    """Load .env and map Tigris creds -> AWS_* vars. Returns True if creds present."""
    load_dotenv(ENV_PATH)
    cid = os.environ.get("TIGRIS_CLIENT_ID")
    csecret = os.environ.get("TIGRIS_CLIENT_SECRET")
    if cid and csecret:
        os.environ.setdefault("AWS_ACCESS_KEY_ID", cid)
        os.environ.setdefault("AWS_SECRET_ACCESS_KEY", csecret)
        return True
    return False


def connect() -> tuple[duckdb.DuckDBPyConnection, str]:
    """Return (connection, parquet_path). Uses S3 + secret if creds exist, else HTTPS."""
    have_creds = load_env()
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    parquet = PARQUET_HTTPS
    if have_creds:
        endpoint = (
            os.environ.get("TIGRIS_ENDPOINT", "t3.storage.dev")
            .replace("https://", "")
            .replace("http://", "")
            .strip("/")
        )
        # DuckDB's Python API has no getenv() scalar; inject literals from os.environ.
        # These never leave this process; nothing is printed or written to disk.
        con.execute(
            """
            CREATE OR REPLACE SECRET tigris (
              TYPE s3, PROVIDER config,
              KEY_ID    $key, SECRET $secret,
              REGION 'auto', ENDPOINT $endpoint, URL_STYLE 'vhost'
            );
            """,
            {
                "key": os.environ["AWS_ACCESS_KEY_ID"],
                "secret": os.environ["AWS_SECRET_ACCESS_KEY"],
                "endpoint": endpoint,
            },
        )
        parquet = PARQUET_S3
    return con, parquet


if __name__ == "__main__":
    con, parquet = connect()
    print("creds_loaded:", load_env())
    print("parquet_path:", parquet)
    n = con.execute(f"SELECT count(*) FROM read_parquet('{parquet}')").fetchone()[0]
    print("row_count:", n)
