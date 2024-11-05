from typing import List
from gmpy2 import mpz
from database.entity.time_lock_puzzle import TimeLockPuzzleEntity
from time_lock_puzzle.time_lock_puzzle import TimeLockPuzzle

def convert_time_lock_puzzle_to_entity(vdf_instance: TimeLockPuzzle) -> TimeLockPuzzleEntity:
    """
    Converts a completed VerifiableDelayFunction instance into a TimeLockPuzzle instance for database storage.

    Args:
        vdf_instance (VerifiableDelayFunction): The completed VDF instance to convert.

    Returns:
        TimeLockPuzzle: A new TimeLockPuzzle instance populated with data from the VDF.
    """
    # Ensure that `y` and `proof` are available
    if not hasattr(vdf_instance, 'y') or not vdf_instance.proof:
        raise ValueError("The VDF instance must be evaluated and proofed before conversion.")
    
    # Convert the modulus, input, and output to byte format
    modulus_bytes: bytes = vdf_instance.N.to_bytes((vdf_instance.N.bit_length() + 7) // 8, byteorder='big')
    input_bytes: bytes = vdf_instance.x.to_bytes((vdf_instance.x.bit_length() + 7) // 8, byteorder='big')
    output_bytes: bytes = vdf_instance.y.to_bytes((vdf_instance.y.bit_length() + 7) // 8, byteorder='big')
    
    # Convert proof list to JSON-serializable format by encoding each segment in bytes
    proof_json: List[bytes] = [p.to_bytes((p.bit_length() + 7) // 8, byteorder='big') for p in vdf_instance.proof]

    # Create and return a new TimeLockPuzzle instance
    return TimeLockPuzzleEntity(
        num_segments=vdf_instance.num_segments,
        modulus=modulus_bytes,
        input_value=input_bytes,
        output=output_bytes,
        proof=proof_json
    )
