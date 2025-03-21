from ..mpc import MPC
from ..mpc.types import MPZ
from .abstract.ISequentialTimeLockPuzzleSolver import ISequentialTimeLockPuzzleSolver
from .abstract.ITimeLockPuzzle import ITimeLockPuzzle
from .constants import TWO


class SequentialTimeLockPuzzleSolver(ISequentialTimeLockPuzzleSolver):
    """Implementation of sequential time lock puzzle solver."""

    @staticmethod
    def solve(puzzle: ITimeLockPuzzle) -> MPZ:
        """Solve the time lock puzzle sequentially without RSA private parameters.

        This implementation:
        1. Calculates 2^t directly
        2. Then computes x^(2^t) mod N in one step using powmod

        Args:
            puzzle (ITimeLockPuzzle): The puzzle to solve

        Returns:
            MPZ: The solution y
        """
        x = puzzle.get_x()
        N = puzzle.get_N()
        t = puzzle.get_t()

        # Calculate 2^t first
        exp = MPC.pow(TWO, t)

        # Then calculate x^(2^t) mod N in one step
        return MPC.powmod(x, exp, N)
