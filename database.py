import sqlite3
import time
import os

DB_FILE = os.path.join(os.path.dirname(__file__), "optiflow.db")

def init_db():
    """Initializes the database and creates the metrics table if it doesn't exist."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL,
            step INTEGER,
            active_vehicles INTEGER,
            stopped_vehicles INTEGER,
            avg_speed REAL,
            total_waiting_time REAL
        )
    ''')
    
    # Run a safe migration schema update for Phase 13
    try:
        cursor.execute("ALTER TABLE metrics ADD COLUMN co2_emissions REAL DEFAULT 0.0")
    except sqlite3.OperationalError:
        # Ignore if the column already exists
        pass
        
    conn.commit()
    conn.close()

def insert_metric(step, active_vehicles, stopped_vehicles, avg_speed, total_waiting_time, co2_emissions=0.0):
    """Inserts a new telemetry record into the database."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO metrics (timestamp, step, active_vehicles, stopped_vehicles, avg_speed, total_waiting_time, co2_emissions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (time.time(), step, active_vehicles, stopped_vehicles, avg_speed, total_waiting_time, co2_emissions))
    conn.commit()
    conn.close()

def get_historical_metrics(limit=100):
    """Retrieves the latest 'limit' number of metrics, ordered chronologically."""
    conn = sqlite3.connect(DB_FILE)
    # Return as dicts for FastAPI
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # We fetch descending to get the latest, then reverse so it's chronological for graphing
    cursor.execute('''
        SELECT step, avg_speed, total_waiting_time as wait, co2_emissions
        FROM metrics
        ORDER BY id DESC
        LIMIT ?
    ''', (limit,))
    
    rows = cursor.fetchall()
    conn.close()
    
    # Convert sqlite3.Row to dict and reverse the order
    data = [dict(row) for row in rows]
    data.reverse()
    
    # Map 'step' to 'time' and 'avg_speed' to 'speed' as expected by the frontend Recharts
    # but I'll return them mapped so the frontend doesn't need to change much.
    mapped_data = [
        {
            "time": row["step"],
            "speed": row["avg_speed"],
            "wait": row["wait"],
            "co2": row["co2_emissions"] if "co2_emissions" in row.keys() else 0.0
        }
        for row in data
    ]
    return mapped_data

