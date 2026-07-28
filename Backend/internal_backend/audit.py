import json
import os

import psycopg2
from dotenv import load_dotenv

load_dotenv(override=True)


class AuditDB:
    # A mutable default is shared across every instance; None-then-default keeps
    # each AuditDB with its own payload.
    def __init__(self, input_data: dict | None = None):
        self.host = os.getenv("postgres_host")
        self.user = os.getenv("postgres_username")
        self.password = os.getenv("postgres_password")
        self.database = os.getenv("database")
        self.port = os.getenv("postgres_port")
        self.environment=os.getenv("environment")
        self.conn = None
        self.input_data = input_data if input_data is not None else {}



    def connect(self):
        self.conn = psycopg2.connect(
            host=self.host,
            dbname=self.database,
            user=self.user,
            password=self.password,
            port=self.port,
            sslmode="require",
        )
        return self.conn

    def insert_record(self):
        if self.conn is None:
            self.connect()
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO public.process_log (
                    environment,
                    process,
                    payload
                ) VALUES (%s, %s, %s);
                """,
                (
                    self.environment,
                    self.input_data.get('process'),
                    json.dumps(self.input_data),
                ),
            )
            self.conn.commit()



    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None

    # Support "with AuditDB() as db:" usage
    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
    def return_data(self):
        return {"done":"done"}
