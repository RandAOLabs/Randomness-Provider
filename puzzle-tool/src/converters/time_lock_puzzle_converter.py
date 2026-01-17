"""Converter for time lock puzzle objects."""

from src.time_lock_puzzle.TimeLockPuzzle import TimeLockPuzzle
from src.database.entity.TimeLockPuzzleEntity import TimeLockPuzzleEntity
from src.mpc.types import MPZ


class TimeLockPuzzleConverter:
    """Converter between TimeLockPuzzle and TimeLockPuzzleEntity."""

    @staticmethod
    def to_entity(puzzle: TimeLockPuzzle, rsa_id: str, y: MPZ) -> TimeLockPuzzleEntity:
        """Convert a TimeLockPuzzle to a TimeLockPuzzleEntity.

        Args:
            puzzle (TimeLockPuzzle): The puzzle to convert
            rsa_id (str): ID of the associated RSA entity
            y (MPZ): The y value from the puzzle tuple

        Returns:
            TimeLockPuzzleEntity: The database entity
        """
        return TimeLockPuzzleEntity(
            x_hex=hex(puzzle.get_x())[2:],  # remove 0x
            y_hex=hex(y)[2:],  # remove 0x
            t=str(puzzle.get_t()),  # remove 0x
            N_hex=hex(puzzle.get_N())[2:],  # remove 0x
            rsa_id=rsa_id,
        )
