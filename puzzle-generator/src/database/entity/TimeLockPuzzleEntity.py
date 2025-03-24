import uuid
from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship

from src.database.mixins.saveable import Saveable
from src.database.database import get_orm_base

# Define the Base class for ORM models
Base = get_orm_base()


class TimeLockPuzzleEntity(Base, Saveable):
    """Database entity for storing time lock puzzles."""

    __tablename__ = "time_lock_puzzles"

    id = Column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )  # Unique generated string ID
    x = Column(String, nullable=False)  # Store hex string of input value x
    y = Column(String, nullable=False)  # Store hex string of y value
    t = Column(String, nullable=False)  # Store base 10 string of time parameter t
    N = Column(String, nullable=False)  # Store hex string of modulus N
    request_id = Column(
        String, nullable=True
    )  # Optional associated randomness request id (will be filled within the provider node runtime)
    rsa_id = Column(
        String, ForeignKey("rsa_keys.id"), nullable=False, unique=True
    )  # One-to-one reference to RSA key
    rsa = relationship(
        "RSAEntity", back_populates="puzzle"
    )  # One-to-one relationship to RSA entity

    def __repr__(self):
        return f"<TimeLockPuzzle(id={self.id}, x={self.x}, t={self.t}, N={self.N})>"

    def __init__(self, x_hex: str, y_hex: str, t: str, N_hex: str, rsa_id: str):
        """Initialize a time lock puzzle entity.

        Args:
            x_hex (str): Hex string of input value x
            t (str): Base 10 string of time parameter t
            N_hex (str): Hex string of modulus N
        """
        self.x = x_hex
        self.y = y_hex
        self.t = t
        self.N = N_hex
        self.rsa_id = rsa_id
