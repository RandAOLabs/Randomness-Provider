from abc import ABC, abstractmethod
from typing import Self
from ...mpc.types import MPZ
from ..TimeLockPuzzle import TimeLockPuzzle


class ITimeLockPuzzleBuilder(ABC):
    """Abstract base class defining the interface for a time lock puzzle builder."""

    @abstractmethod
    def set_x(self, x: MPZ) -> Self:
        """Set the input value x.

        Args:
            x (MPZ): The input value

        Returns:
            ITimeLockPuzzleBuilder: The builder instance for chaining
        """

    @abstractmethod
    def set_t(self, t: MPZ) -> Self:
        """Set the time parameter t.

        Args:
            t (MPZ): The time parameter

        Returns:
            ITimeLockPuzzleBuilder: The builder instance for chaining
        """

    @abstractmethod
    def set_N(self, N: MPZ) -> Self:
        """Set the modulus N.

        Args:
            N (MPZ): The modulus

        Returns:
            ITimeLockPuzzleBuilder: The builder instance for chaining
        """

    @abstractmethod
    def build(self) -> TimeLockPuzzle:
        """Build the time lock puzzle.

        Returns:
            TimeLockPuzzle: The constructed puzzle
        """
