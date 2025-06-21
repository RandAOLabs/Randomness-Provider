from multiprocessing import Pool
from typing import List, Tuple

from ..mpc import MPC
from ..utils.SystemSpecs import SystemSpecs
from ..mpc.types import MPZ
from ..rsa.RSA import RSA
from .abstract.IEfficientTimeLockPuzzleSolver import IEfficientTimeLockPuzzleSolver
from .abstract.ITimeLockPuzzle import ITimeLockPuzzle
from .constants import TWO


class EfficientTimeLockPuzzleSolver(IEfficientTimeLockPuzzleSolver):
    """Implementation of efficient time lock puzzle solver using RSA private parameters."""

    @staticmethod
    def solve(rsa: RSA, puzzle: ITimeLockPuzzle) -> MPZ:
        # Calculate y = x^(2^t) mod N efficiently using phi
        # Calculate 2^t
        exp = MPC.pow(TWO, puzzle.get_t())  # 2^t
        phi = rsa.get_phi()
        d = MPC.mod(exp, phi)  # Reduce exponent modulo phi
        return MPC.powmod(puzzle.get_x(), d, puzzle.get_N())

    @staticmethod
    def solve_many(puzzles: List[Tuple[RSA, ITimeLockPuzzle]]) -> List[MPZ]:
        """
        Solve multiple time lock puzzles in parallel using multiprocessing.

        Args:
            puzzles: List of tuples containing (RSA, puzzle) pairs to solve

        Returns:
            List of solutions in the same order as input puzzles
        """
        num_workers = SystemSpecs.get_num_parallel_processes()
        with Pool(num_workers) as pool:
            return pool.map(EfficientTimeLockPuzzleSolver._solve_single, puzzles)

    # Private Methods
    # --------------

    @staticmethod
    def _solve_single(args: Tuple[RSA, ITimeLockPuzzle]) -> MPZ:
        """Helper method to solve a single puzzle for multiprocessing."""
        rsa, puzzle = args
        return EfficientTimeLockPuzzleSolver.solve(rsa, puzzle)
