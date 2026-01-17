from typing import List, Tuple
import multiprocessing

from ..utils.SystemSpecs import SystemSpecs
from ..mpc import MPC
from ..mpc.types import MPZ
from ..random import Random
from ..rsa.RSA import RSA
from .TimeLockPuzzle import TimeLockPuzzle
from .EfficientTimeLockPuzzleSolver import EfficientTimeLockPuzzleSolver


class TimeLockPuzzleFactory:
    """Factory for creating time lock puzzles."""

    def __init__(self, bit_size: int, timing_parameter: MPZ) -> None:
        """Initialize the factory.

        Args:
            bit_size (int): Number of bits for RSA parameters
            timing_parameter (MPZ): Time parameter t for puzzles
        """
        self._bit_size = bit_size
        self._t = timing_parameter

    def create_puzzle(self) -> Tuple[TimeLockPuzzle, RSA, MPZ]:
        # Create RSA instance
        rsa_instance = RSA(self._bit_size)

        # Generate random x
        rand = Random.get_random(self._bit_size)
        x = MPC.mpz_urandomb(rand, self._bit_size)

        # Create puzzle directly
        puzzle = TimeLockPuzzle(x, self._t, rsa_instance.get_N())

        # Get solution using efficient solver
        y = EfficientTimeLockPuzzleSolver.solve(rsa_instance, puzzle)

        return puzzle, rsa_instance, y

    def create_puzzles(self, amount: int) -> List[Tuple[TimeLockPuzzle, RSA, MPZ]]:
        # Create parameters for each puzzle
        puzzle_params = [(self._bit_size, self._t) for _ in range(amount)]

        num_workers = SystemSpecs.get_num_parallel_processes()

        # Create puzzles in parallel using process pool
        with multiprocessing.Pool(num_workers) as pool:
            puzzles = pool.map(
                TimeLockPuzzleFactory._create_puzzle_parallel, puzzle_params
            )

        return puzzles

    # Private Methods
    # ------------------------------------------------------------------------------

    @staticmethod
    def _create_puzzle_parallel(
        puzzle_params: Tuple[int, MPZ],
    ) -> Tuple[TimeLockPuzzle, RSA, MPZ]:
        """Helper method to create a single puzzle tuple for multiprocessing.

        Args:
            puzzle_params (Tuple[int, MPZ]): Tuple containing (bit_size, timing_parameter)

        Returns:
            Tuple[TimeLockPuzzle, RSA, MPZ]: A tuple containing the puzzle, RSA instance, and solution
        """
        bit_size, t = puzzle_params
        factory = TimeLockPuzzleFactory(bit_size, t)
        return factory.create_puzzle()
