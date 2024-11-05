import time
from src.time_lock_puzzle.time_lock_puzzle import TimeLockPuzzle
from src.database.entity.time_lock_puzzle_entity import TimeLockPuzzleEntity
from src.converters.time_lock_puzzle_converter import convert_time_lock_puzzle_to_entity
from src.protocol_constants import BIT_SIZE, TOTAL_SQUARINGS, NUM_SEGMENTS

def main():
    """
    Runs the Verifiable Delay Function (VDF) demonstration.

    Initializes a VDF with protocol constants. Generates a proof by performing sequential squarings in
    the RSA group, then verifies the proof with parallel verification. Finally, converts the VDF to a
    database entity and saves it.
    """
    # Initialize TimeLockPuzzle with protocol constants
    vdf = TimeLockPuzzle(bit_size=BIT_SIZE, T=TOTAL_SQUARINGS, num_segments=NUM_SEGMENTS)
    print("Generated RSA modulus N:", vdf.N)

    # Time the proof generation
    start_time = time.time()
    y, proof = vdf.generate_proof()
    generation_time = time.time() - start_time
    print("VDF output (y):", y)
    print(f"Proof generation time: {generation_time:.4f} seconds")

    # Time the parallel verification
    start_time = time.time()
    is_valid_parallel = vdf.parallel_verify(y, proof)
    parallel_verification_time = time.time() - start_time
    print("Parallel verification:", "Valid" if is_valid_parallel else "Invalid")
    print(f"Parallel verification time: {parallel_verification_time:.4f} seconds")

    if not is_valid_parallel:
        print("Verification failed. Aborting save.")
        return

    # Convert the puzzle instance to a TimeLockPuzzleEntity for database storage
    entity: TimeLockPuzzleEntity = convert_time_lock_puzzle_to_entity(vdf)

    # Save the entity to the database
    entity.save()

if __name__ == "__main__":
    main()
