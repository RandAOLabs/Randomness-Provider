# src/database/initialize_db.py

import os
import sys
from sqlalchemy.exc import OperationalError

# Dynamically add the `src` directory to `sys.path`
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from src.database.database import get_engine, Base
from src.database.entity.time_lock_puzzle_entity import TimeLockPuzzleEntity

def initialize_database():
    """
    Initializes the SQLite database by creating all tables defined in the ORM models.
    """
    engine = get_engine()
    try:
        print("Initializing the database...")
        Base.metadata.create_all(engine)
        print("Database initialized successfully.")
    except OperationalError as e:
        print("Failed to initialize the database:", e)
    finally:
        engine.dispose()  # Close the engine when done

if __name__ == "__main__":
    
    initialize_database()
