"""Script for solving time lock puzzles without the private key."""

import argparse
import time

from src.mpc import MPC
from src.mpc.types import MPZ
from src.time_lock_puzzle.TimeLockPuzzle import TimeLockPuzzle
from src.time_lock_puzzle.SequentialTimeLockPuzzleSolver import SequentialTimeLockPuzzleSolver


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Solve a time lock puzzle using sequential squaring (no private key)."
    )
    parser.add_argument(
        "x",
        type=str,
        help="The input value x (hex string)",
    )
    parser.add_argument(
        "t",
        type=int,
        help="The time parameter t (number of squarings)",
    )
    parser.add_argument(
        "N",
        type=str,
        help="The modulus N (hex string)",
    )
    return parser.parse_args()


def main() -> None:
    """Solve a time lock puzzle and output the solution."""
    args = parse_args()

    # Parse inputs
    print("Parsing puzzle parameters...")
    x = MPC.mpz(int(args.x, 16))
    t = MPC.mpz(args.t)
    N = MPC.mpz(int(args.N, 16))

    print(f"x = {hex(x)}")
    print(f"t = {t}")
    print(f"N = {hex(N)}")

    # Create puzzle
    puzzle = TimeLockPuzzle(x, t, N)

    # Solve using sequential method (slow - no private key)
    print("\nSolving puzzle using sequential squaring (no private key)...")
    print("This may take a while...")
    start_time = time.time()

    solution = SequentialTimeLockPuzzleSolver.solve(puzzle)

    total_time = time.time() - start_time

    # Output solution
    print(f"\nSolution found in {total_time:.2f} seconds")
    print(f"y = {hex(solution)}")


if __name__ == "__main__":
    main()
