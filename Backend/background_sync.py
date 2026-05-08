#!/usr/bin/env python3
"""
Background task to automatically sync PLC silo data to database.
Uses in-process PLC persistence when a Flask app is configured (no HTTP loopback).
"""
import time
import threading
import requests


class SiloSyncTask:
    def __init__(self, base_url="http://localhost:5000", sync_interval=30, flask_app=None):
        self.base_url = base_url
        self.sync_interval = sync_interval
        self.running = False
        self.thread = None
        self.flask_app = flask_app

    def start(self):
        if self.running:
            print("Silo sync task is already running")
            return

        self.running = True
        self.thread = threading.Thread(target=self._sync_loop, daemon=True)
        self.thread.start()
        print(f"[SYNC] Silo sync task started (interval: {self.sync_interval}s)")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()
        print("Silo sync task stopped")

    def _sync_loop(self):
        while self.running:
            try:
                self._sync_once()
            except Exception as e:
                print(f"Sync error: {e}")

            time.sleep(self.sync_interval)

    def _sync_once(self):
        if self.flask_app is not None:
            with self.flask_app.app_context():
                from routes.plc_routes import persist_silos_from_plc

                total_upserts = 0
                errors = []
                for db_no in (1, 2, 3):
                    try:
                        res = persist_silos_from_plc(db_no=db_no)
                        if res.get("error"):
                            errors.append(f"db{db_no}: {res.get('error')}")
                        else:
                            total_upserts += int(res.get("upserts", 0) or 0)
                    except Exception as e:
                        errors.append(f"db{db_no}: {e}")
                if total_upserts > 0:
                    from datetime import datetime

                    print(
                        f"[SYNC] Silo sync completed: {total_upserts} silos updated at {datetime.now().strftime('%H:%M:%S')}"
                    )
                elif errors:
                    print(f"[SYNC] Silo sync issues: {'; '.join(errors)}")
                else:
                    from datetime import datetime

                    print(
                        f"[SYNC] Silo sync completed: No updates needed at {datetime.now().strftime('%H:%M:%S')}"
                    )
            return

        try:
            response = requests.post(f"{self.base_url}/api/plc/silos/sync", timeout=30)

            if response.status_code == 200:
                data = response.json()
                total_upserts = data.get("total_upserts", 0)
                from datetime import datetime

                if total_upserts > 0:
                    print(
                        f"[SYNC] Silo sync completed: {total_upserts} silos updated at {datetime.now().strftime('%H:%M:%S')}"
                    )
                else:
                    print(
                        f"[SYNC] Silo sync completed: No updates needed at {datetime.now().strftime('%H:%M:%S')}"
                    )
            else:
                print(f"[SYNC] Sync failed with status {response.status_code}: {response.text}")

        except requests.exceptions.RequestException as e:
            print(f"[SYNC] Sync request failed: {e}")
        except Exception as e:
            print(f"[SYNC] Unexpected sync error: {e}")


silo_sync_task = SiloSyncTask()


def start_silo_sync(flask_app=None):
    """Start the silo sync task. Pass flask_app for in-process sync (recommended)."""
    if flask_app is not None:
        silo_sync_task.flask_app = flask_app
    silo_sync_task.start()


def stop_silo_sync():
    silo_sync_task.stop()


if __name__ == "__main__":
    print("Testing silo sync...")
    task = SiloSyncTask()
    task._sync_once()
