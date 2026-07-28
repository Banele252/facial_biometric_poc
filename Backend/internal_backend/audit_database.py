import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(override=True)


class AuditDB:
    def __init__(self,input_data:dict={}):
        self.host = os.getenv("postgres_host")
        self.user = os.getenv("postgres_username")
        self.password = os.getenv("postgres_password")
        self.database = os.getenv("database")
        self.port = os.getenv("postgres_port")
        self.environment=os.getenv("environment")
        self.conn = None
        self.input_data=input_data



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
                INSERT INTO public.audit (
                    environment,
                    ID_length_valid,
                    ID_numeric_valid,
                    ID_birth_date_numeric,
                    eleventh_digit_zero_or_one,
                    twelfth_digit_zero_or_one,
                    ID_valid_luhn,
                    final_outcome,
                    process,
                    identity_number
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s,%s);
                """,
                (
                    self.environment,
                    self.input_data.get('ID_length_valid'),
                    self.input_data.get('ID_numeric_valid'),
                    self.input_data.get('ID_birth_date_numeric'),
                    self.input_data.get('11th_digit_zero_or_one'),
                    self.input_data.get('12th_digit_8_or_9'),
                    self.input_data.get('ID_valid_luhn'),
                    self.input_data.get('final_outcome'),
                    self.input_data.get('process'),
                    self.input_data.get('identity_number'),
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