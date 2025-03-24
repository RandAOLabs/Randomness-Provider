from abc import ABC, abstractmethod
from ...mpc.types import MPZ


class ITimeLockPuzzle(ABC):
    """Abstract base class defining the interface for a time lock puzzle implementation."""

    @abstractmethod
    def get_x(self) -> MPZ:
        """Get the input value x.

        Returns:
            MPZ: The input value x
        """

    @abstractmethod
    def get_t(self) -> MPZ:
        """Get the time parameter t.

        Returns:
            MPZ: The time parameter t
        """

    @abstractmethod
    def get_N(self) -> MPZ:
        """Get the modulus N.

        Returns:
            MPZ: The modulus N
        """
