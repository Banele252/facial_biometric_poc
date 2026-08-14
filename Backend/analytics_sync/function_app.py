"""
Azure Function entry point - timer-triggered, runs `sync.run_sync()` on a
schedule to copy `api_call_log` and `process_log` into the analytics
Postgres for the management console.

Run locally with (from this directory, Azure Functions Core Tools installed):
    func start
"""

import logging

import azure.functions as func
from sync import run_sync

app = func.FunctionApp()

# NCRONTAB: {second} {minute} {hour} {day} {month} {day-of-week}. Every 15
# minutes - frequent enough for the console to feel current, infrequent
# enough that a sync failure isn't urgent. Adjust here if that's wrong.
_SCHEDULE = "0 */15 * * * *"


@app.timer_trigger(schedule=_SCHEDULE, arg_name="timer", run_on_startup=False, use_monitor=True)
def sync_analytics_logs(timer: func.TimerRequest) -> None:
    if timer.past_due:
        logging.warning("analytics_sync timer trigger is running late")

    try:
        counts = run_sync()
        logging.info("analytics_sync run succeeded: %s", counts)
    except Exception:
        # Let the platform record the failure (App Insights / run history) -
        # the watermark is untouched, so the next scheduled run retries the
        # same window rather than skipping it.
        logging.exception("analytics_sync run failed")
        raise
