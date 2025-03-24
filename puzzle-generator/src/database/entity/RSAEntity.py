import uuid
from sqlalchemy import Column, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

from src.database.mixins.saveable import Saveable
from src.database.database import get_orm_base

# Define the Base class for ORM models
Base = get_orm_base()


class RSAEntity(Base, Saveable):
    """Database entity for storing RSA parameters."""

    __tablename__ = "rsa_keys"

    id = Column(String, primary_key=True)  # Unique generated string ID
    p = Column(String, nullable=False)  # Store hex string of prime p
    q = Column(String, nullable=False)  # Store hex string of prime q
    N = Column(String, nullable=False)  # Store hex string of modulus N
    phi = Column(String, nullable=False)  # Store hex string of Euler's totient
    puzzle = relationship(
        "TimeLockPuzzleEntity", back_populates="rsa", uselist=False
    )  # One-to-one back reference to puzzle

    def __repr__(self):
        return f"<RSA(id={self.id}, N={self.N})>"

    def __init__(self, p_hex: str, q_hex: str, N_hex: str, phi_hex: str):
        """Initialize an RSA entity.

        Args:
            p_hex (str): Hex string of prime p
            q_hex (str): Hex string of prime q
            N_hex (str): Hex string of modulus N
            phi_hex (str): Hex string of Euler's totient
        """
        self.id = str(uuid.uuid4())  # Generate ID on creation
        self.p = p_hex
        self.q = q_hex
        self.N = N_hex
        self.phi = phi_hex
