"""Type definitions for multi-precision computing operations."""

from typing import TypeVar, NewType
from gmpy2 import mpz as _mpz, random_state as _random_state

# Define base types from gmpy2
MPZ = NewType("MPZ", _mpz)
RandomState = NewType("RandomState", _random_state)

# Generic type variable for numeric operations
T = TypeVar("T", MPZ, int)
