#!/usr/bin/env python3
"""
Background task to automatically sync PLC silo data to database
"""
import time
import threading
import requests
from datetime import datetime

class SiloSyncTask:
    def __init__(self, base_url="http://localhost:5000", sync_interval=30):
        self.base_url = base_url
        self.sync_interval = sync_interval
        self.running = False
        self.thread = None
        
    def start(self):
        """Start the background sync task"""
        if self.running:
            print("Silo sync task is already running")
            return
            
        self.running = True
        self.thread = threading.Thread(target=self._sync_loop, daemon=True)
        self.thread.start()
        print(f"[SYNC] Silo sync task started (interval: {self.sync_interval}s)")
        
    def stop(self):
        """Stop the background sync task"""
        self.running = False
        if self.thread:
            self.thread.join()
        print("⏹️ Silo sync task stopped")
        
    def _sync_loop(self):
        """Main sync loop"""
        while self.running:
            try:
                self._sync_once()
            except Exception as e:
                print(f"❌ Sync error: {e}")
            
            # Wait for next sync
            time.sleep(self.sync_interval)
            
    def _sync_once(self):
        """Perform one sync operation"""
        try:
            response = requests.post(f"{self.base_url}/api/plc/silos/sync", timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                total_upserts = data.get("total_upserts", 0)
                if total_upserts > 0:
                    print(f"✅ Silo sync completed: {total_upserts} silos updated at {datetime.now().strftime('%H:%M:%S')}")
                else:
                    print(f"ℹ️ Silo sync completed: No updates needed at {datetime.now().strftime('%H:%M:%S')}")
            else:
                print(f"❌ Sync failed with status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Sync request failed: {e}")
        except Exception as e:
            print(f"❌ Unexpected sync error: {e}")

# Global instance
silo_sync_task = SiloSyncTask()

def start_silo_sync():
    """Start the silo sync task"""
    silo_sync_task.start()

def stop_silo_sync():
    """Stop the silo sync task"""
    silo_sync_task.stop()

if __name__ == "__main__":
    # Test the sync task
    print("Testing silo sync...")
    task = SiloSyncTask()
    task._sync_once()
