from abc import ABC, abstractmethod
from ...mpc.types import RandomState


class IRandom(ABC):
    """Abstract base class defining the interface for random number generation."""

    @staticmethod
    @abstractmethod
    def get_random(bit_size: int) -> RandomState:
        """Get a random state initialized with a secure seed.

        Args:
            bit_size (int): Number of bits for the secure seed.

        Returns:
            RandomState: A random state initialized with a secure seed
        """
