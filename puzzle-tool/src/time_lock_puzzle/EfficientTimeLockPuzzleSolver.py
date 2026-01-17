from ..mpc import MPC
from ..mpc.types import MPZ
from ..rsa.RSA import RSA
from .TimeLockPuzzle import TimeLockPuzzle


TWO = MPC.mpz(2)


class EfficientTimeLockPuzzleSolver:
    """Efficient time lock puzzle solver using RSA private parameters."""

    @staticmethod
    def solve(rsa: RSA, puzzle: TimeLockPuzzle) -> MPZ:
        """Solve puzzle quickly using RSA private key.

        Args:
            rsa: RSA instance with private parameters
            puzzle: The puzzle to solve

        Returns:
            The solution y = x^(2^t) mod N
        """
        # Calculate y = x^(2^t) mod N efficiently using phi
        exp = MPC.pow(TWO, puzzle.get_t())  # 2^t
        phi = rsa.get_phi()
        d = MPC.mod(exp, phi)  # Reduce exponent modulo phi
        return MPC.powmod(puzzle.get_x(), d, puzzle.get_N())
