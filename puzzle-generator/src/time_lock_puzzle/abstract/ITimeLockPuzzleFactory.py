from abc import ABC, abstractmethod
from typing import List, Tuple
from ...mpc.types import MPZ
from ...rsa import RSA
from ..TimeLockPuzzle import TimeLockPuzzle


class ITimeLockPuzzleFactory(ABC):
    """Abstract base class defining the interface for a time lock puzzle factory."""

    @abstractmethod
    def create_puzzle(self) -> Tuple[TimeLockPuzzle, RSA, MPZ]:
        """Create a new time lock puzzle with solution.

        Returns:
            Tuple[TimeLockPuzzle, RSA, MPZ]: A tuple containing:
                - The time lock puzzle
                - The RSA instance used to create the puzzle
                - The solution y
        """

    @abstractmethod
    def create_puzzles(self, amount: int) -> List[Tuple[TimeLockPuzzle, RSA, MPZ]]:
        """Create multiple time lock puzzles with solutions in parallel.

        Args:
            amount (int): Number of puzzles to create

        Returns:
            List[Tuple[TimeLockPuzzle, RSA, MPZ]]: A list of tuples, each containing:
                - The time lock puzzle
                - The RSA instance used to create the puzzle
                - The solution y
        """
