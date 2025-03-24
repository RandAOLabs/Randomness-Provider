from abc import ABC, abstractmethod
from ...mpc.types import MPZ
from .ITimeLockPuzzle import ITimeLockPuzzle


class ISequentialTimeLockPuzzleSolver(ABC):
    """Abstract base class defining the interface for a sequential time lock puzzle solver."""

    @staticmethod
    @abstractmethod
    def solve(puzzle: ITimeLockPuzzle) -> MPZ:
        """Solve the time lock puzzle sequentially without RSA private parameters.

        Args:
            puzzle (ITimeLockPuzzle): The puzzle to solve

        Returns:
            MPZ: The solution y
        """
