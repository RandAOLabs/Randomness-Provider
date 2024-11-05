import uuid
from sqlalchemy import Column, String, LargeBinary, JSON, Integer
from sqlalchemy.ext.declarative import declarative_base

from src.database.mixins.saveable import Saveable
from src.database.database import get_orm_base

# Define the Base class for ORM models
Base = get_orm_base()

# Define the TimeLockPuzzle model
# Define the TimeLockPuzzle model
class TimeLockPuzzleEntity(Base, Saveable):
    __tablename__ = 'time_lock_puzzles'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))  # Unique generated string ID
    request_id = Column(String, nullable=True)      # Nullable request_id to be filled later
    modulus = Column(String, nullable=False)        # Store hex string of modulus
    input = Column(String, nullable=False)          # Store hex string of input
    output = Column(String, nullable=False)         # Store hex string of output
    proof = Column(JSON, nullable=False)            # Proof as a JSON list of hex strings

    def __repr__(self):
        return (f"<TimeLockPuzzle(id={self.id}, request_id={self.request_id}")
    
    def __init__(self, modulus, input_value, output, proof):
        self.modulus = modulus
        self.input = input_value
        self.output = output
        self.proof = proof
