from abc import ABC, abstractmethod
from ...mpc.types import MPZ


class IPrimes(ABC):
    """Abstract base class defining the interface for prime number generation."""

    @staticmethod
    @abstractmethod
    def get_prime(bit_size: int) -> MPZ:
        """Get a random prime number.

        Args:
            bit_size (int): Number of bits for the prime number.

        Returns:
            MPZ: A random prime number
        """
