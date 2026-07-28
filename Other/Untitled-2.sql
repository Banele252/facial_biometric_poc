/*CREATE TABLE public.process_log (
    record_id     BIGSERIAL PRIMARY KEY,
    created_date  TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Etc/GMT-2'),
    process       TEXT NOT NULL,
    payload       JSONB NOT NULL
);
*/
/*
select *
from public.process_log
*/

--alter table public.process_log DROP COLUMN environment payload JSONB NOT NULL;