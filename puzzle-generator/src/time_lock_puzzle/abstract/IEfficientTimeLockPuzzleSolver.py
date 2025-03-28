from abc import ABC, abstractmethod
from typing import List, Tuple
from ...mpc.types import MPZ
from ...rsa import RSA
from .ITimeLockPuzzle import ITimeLockPuzzle


class IEfficientTimeLockPuzzleSolver(ABC):
    """Abstract base class defining the interface for an efficient time lock puzzle solver."""

    @staticmethod
    @abstractmethod
    def solve(rsa: RSA, puzzle: ITimeLockPuzzle) -> MPZ:
        """Solve the time lock puzzle efficiently using RSA private parameters.

        Args:
            rsa (RSA): The RSA instance with private parameters
            puzzle (ITimeLockPuzzle): The puzzle to solve

        Returns:
            MPZ: The solution y
        """
        pass

    @staticmethod
    @abstractmethod
    def solve_many(puzzles: List[Tuple[RSA, ITimeLockPuzzle]]) -> List[MPZ]:
        """Solve multiple time lock puzzles in parallel using multiprocessing.

        Args:
            puzzles: List of tuples containing (RSA, puzzle) pairs to solve

        Returns:
            List[MPZ]: List of solutions in the same order as input puzzles
        """
        pass
