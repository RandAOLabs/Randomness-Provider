from typing import List
from gmpy2 import mpz
from src.database.entity.time_lock_puzzle_entity import TimeLockPuzzleEntity
from src.time_lock_puzzle.time_lock_puzzle import TimeLockPuzzle

def convert_time_lock_puzzle_to_entity(vdf_instance: TimeLockPuzzle) -> TimeLockPuzzleEntity:
    """
    Converts a completed VerifiableDelayFunction instance into a TimeLockPuzzleEntity instance for database storage.

    Args:
        vdf_instance (TimeLockPuzzle): The completed VDF instance to convert.

    Returns:
        TimeLockPuzzleEntity: A new TimeLockPuzzleEntity instance populated with data from the VDF.
    """
    # Ensure that `y` and `proof` are available
    if not hasattr(vdf_instance, 'y') or not vdf_instance.proof:
        raise ValueError("The VDF instance must be evaluated and proofed before conversion.")
    
    # Convert the modulus, input, and output to hex strings
    modulus_hex: str = vdf_instance.N.digits(16)
    input_hex: str = vdf_instance.x.digits(16)
    output_hex: str = vdf_instance.y.digits(16)
    
    # Convert proof list to JSON-serializable format by encoding each segment as hex
    proof_json: List[str] = [p.digits(16) for p in vdf_instance.proof]

    # Create and return a new TimeLockPuzzleEntity instance
    return TimeLockPuzzleEntity(
        modulus=modulus_hex,
        input_value=input_hex,
        output=output_hex,
        proof=proof_json
    )
