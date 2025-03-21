"""Converter for time lock puzzle objects."""

from src.time_lock_puzzle import TimeLockPuzzle
from src.database.entity.TimeLockPuzzleEntity import TimeLockPuzzleEntity


class TimeLockPuzzleConverter:
    """Converter between TimeLockPuzzle and TimeLockPuzzleEntity."""

    @staticmethod
    def to_entity(puzzle: TimeLockPuzzle) -> TimeLockPuzzleEntity:
        """Convert a TimeLockPuzzle to a TimeLockPuzzleEntity.

        Args:
            puzzle (TimeLockPuzzle): The puzzle to convert

        Returns:
            TimeLockPuzzleEntity: The database entity
        """
        return TimeLockPuzzleEntity(
            x_hex=hex(puzzle.get_x()),
            t=str(puzzle.get_t()),
            N_hex=hex(puzzle.get_N()),
        )
