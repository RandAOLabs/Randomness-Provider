from ..mpc import MPC
from ..mpc.types import MPZ
from .TimeLockPuzzle import TimeLockPuzzle


TWO = MPC.mpz(2)


class SequentialTimeLockPuzzleSolver:
    """Sequential time lock puzzle solver (slow - does actual sequential squaring)."""

    @staticmethod
    def solve(puzzle: TimeLockPuzzle) -> MPZ:
        """Solve puzzle by sequential squaring (no private key - the real cracking).

        This computes x^(2^t) mod N by calculating 2^t then doing the exponentiation.
        This is the slow method that doesn't require the RSA private key.

        Args:
            puzzle: The puzzle to solve

        Returns:
            The solution y = x^(2^t) mod N
        """
        x = puzzle.get_x()
        N = puzzle.get_N()
        t = puzzle.get_t()

        # Calculate 2^t first
        exp = MPC.pow(TWO, t)

        # Then calculate x^(2^t) mod N in one step
        return MPC.powmod(x, exp, N)
