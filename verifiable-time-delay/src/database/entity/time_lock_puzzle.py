import uuid
from sqlalchemy import Column, String, LargeBinary, JSON, Integer
from sqlalchemy.ext.declarative import declarative_base

from database.mixins.saveable import Saveable
from database.database import get_orm_base

# Define the Base class for ORM models
Base = get_orm_base()

# Define the TimeLockPuzzle model
class TimeLockPuzzleEntity(Base, Saveable):
    __tablename__ = 'time_lock_puzzles'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))  # Unique generated string ID
    request_id = Column(String, nullable=True)      # Nullable request_id to be filled later
    num_segments = Column(Integer, nullable=False)  # Number of segments for parallel verification
    modulus = Column(LargeBinary, nullable=False)   # RSA modulus N (binary for large integer)
    input = Column(LargeBinary, nullable=False)     # Challenge integer input (binary for large integer)
    output = Column(LargeBinary, nullable=False)    # Final computed VDF result output (binary)
    proof = Column(JSON, nullable=False)            # Proof as a JSON list of intermediate values

    def __repr__(self):
        return (f"<TimeLockPuzzle(id={self.id}, request_id={self.request_id}, "
                f"num_segments={self.num_segments})>")
    
    def __init__(self, num_segments, modulus, input_value, output, proof):
        self.num_segments = num_segments
        self.modulus = modulus
        self.input = input_value
        self.output = output
        self.proof = proof
