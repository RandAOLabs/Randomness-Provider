import time
from src.verifiable_delay_function.verifiable_delay_function import VerifiableDelayFunction
from src.database.entity.verifiable_delay_function_entity import VerifiableDelayFunctionEntity
from src.converters.verifiable_delay_function_converter import conver_verifiable_delay_function_to_entity
from src.protocol_constants import BIT_SIZE, TOTAL_SQUARINGS, NUM_SEGMENTS

def main():
    """
    Initializes a VDF with protocol constants. Generates a proof by performing sequential squarings in
    the RSA group, then verifies the proof with parallel verification. Finally, converts the VDF to a
    database entity and saves it.
    """
    # Initialize VerifiableDelayFunction with protocol constants
    vdf = VerifiableDelayFunction(bit_size=BIT_SIZE, T=TOTAL_SQUARINGS, num_segments=NUM_SEGMENTS)
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

    # Convert the puzzle instance to a VerifiableDelayFunctionEntity for database storage
    entity: VerifiableDelayFunctionEntity = conver_verifiable_delay_function_to_entity(vdf)

    # Save the entity to the database
    entity.save()

if __name__ == "__main__":
    main()
