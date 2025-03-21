"""Main script for generating and persisting time lock puzzles."""

import argparse
import time
from typing import List, Tuple

from src.converters.rsa_converter import RSAConverter
from src.converters.time_lock_puzzle_converter import TimeLockPuzzleConverter
from src.database.DatabaseService import DatabaseService
from src.database.entity.RSAEntity import RSAEntity
from src.database.entity.TimeLockPuzzleEntity import TimeLockPuzzleEntity
from src.mpc import MPC
from src.mpc.types import MPZ
from src.rsa.RSA import RSA
from src.time_lock_puzzle.TimeLockPuzzle import TimeLockPuzzle
from src.time_lock_puzzle.TimeLockPuzzleFactory import TimeLockPuzzleFactory

# Constants
BIT_SIZE = 2048  # Size for RSA parameters
TIMING_PARAMETER = MPC.mpz(3_000_000)  # Number of squarings required


class TimeLockPuzzleService:
    """Service class for managing time lock puzzle operations."""

    def __init__(self, bit_size: int, timing_parameter: MPC.mpz):
        """
        Initialize the service.

        Args:
            bit_size: Size for RSA parameters
            timing_parameter: Number of squarings required
        """
        self.factory = TimeLockPuzzleFactory(bit_size, timing_parameter)
        self.rsa_converter = RSAConverter()
        self.puzzle_converter = TimeLockPuzzleConverter()

    def generate_puzzles(self, amount: int) -> List[Tuple[TimeLockPuzzle, RSA, MPZ]]:
        """
        Generate multiple time lock puzzles.

        Args:
            amount: Number of puzzles to generate

        Returns:
            List of (puzzle, rsa) tuples
        """
        print(f"Generating {amount} puzzles...")
        start_time = time.time()
        puzzles = self.factory.create_puzzles(amount)

        total_time = time.time() - start_time
        print(f"Puzzle generation took {total_time:.2f} seconds")
        return puzzles

    def convert_to_entities(
        self, puzzles: List[Tuple[TimeLockPuzzle, RSA, MPZ]]
    ) -> List[TimeLockPuzzleEntity | RSAEntity]:
        """
        Convert puzzles and RSAs to database entities.

        Args:
            puzzles: List of (puzzle, rsa) tuples

        Returns:
            List of entities to save
        """
        print("\nConverting to entities...")
        start_time = time.time()
        entities = []
        for puzzle, rsa, _ in puzzles:
            rsa_entity = self.rsa_converter.to_entity(rsa)
            puzzle_entity = self.puzzle_converter.to_entity(puzzle)
            entities.extend([rsa_entity, puzzle_entity])
        total_time = time.time() - start_time
        print(f"Entity conversion took {total_time:.2f} seconds")
        return entities

    def save_entities(self, entities: List[TimeLockPuzzleEntity | RSAEntity]) -> None:
        """
        Save entities to database.

        Args:
            entities: List of entities to save
        """
        print("\nSaving to database...")
        start_time = time.time()
        DatabaseService.save_many(entities)
        total_time = time.time() - start_time
        print(f"Database save took {total_time:.2f} seconds")


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Generate and save time lock puzzles.")
    parser.add_argument(
        "count",
        type=int,
        help="Number of time lock puzzles to generate",
    )
    return parser.parse_args()


def main() -> None:
    """Generate time lock puzzles and save them to the database."""
    args = parse_args()

    # Initialize service
    service = TimeLockPuzzleService(BIT_SIZE, TIMING_PARAMETER)

    # Generate puzzles
    puzzles = service.generate_puzzles(args.count)

    # Convert to entities
    entities = service.convert_to_entities(puzzles)

    # Save to database
    service.save_entities(entities)

    print("\nDone!")


if __name__ == "__main__":
    main()
