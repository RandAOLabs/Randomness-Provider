"""
Main script to run the Verifiable Delay Function (VDF).

This script initializes a Verifiable Delay Function (VDF) with a specified RSA modulus
bit size and delay parameter (T). It then generates a proof for the VDF and verifies it
both sequentially and with parallelized verification using segments.

Functions:
    main(): Runs the VDF demonstration, generating and verifying a proof.
"""

import time
from src.vdf import VerifiableDelayFunction


def main():
    """
    Runs the Verifiable Delay Function (VDF) demonstration.

    Initializes a VDF with a 2048-bit RSA modulus and delay parameter T=1000.
    It generates a proof by performing T sequential squarings in the RSA group,
    then verifies the proof both sequentially and with parallel verification.

    Prints:
        The generated RSA modulus N.
        The computed VDF output (y).
        The result of sequential and parallel verification (valid or invalid).
        Execution times for proof generation and each verification approach.
    """
    # Initialize VDF with 2048-bit modulus and delay T = 1000
    vdf = VerifiableDelayFunction(bit_size=2048, T=10000000, num_segments=32)
    print("Generated RSA modulus N:", vdf.N)

    # Time the proof generation
    start_time = time.time()
    y, proof = vdf.generate_proof()
    generation_time = time.time() - start_time
    print("VDF output (y):", y)
    print(f"Proof generation time: {generation_time:.4f} seconds")

    # Time the sequential verification
    # start_time = time.time()
    # is_valid_seq = vdf.verify(y)
    # sequential_verification_time = time.time() - start_time
    # print("Sequential verification:", "Valid" if is_valid_seq else "Invalid")
    # print(f"Sequential verification time: {sequential_verification_time:.4f} seconds")

    # Time the parallel verification
    start_time = time.time()
    is_valid_parallel = vdf.parallel_verify(y, proof)
    parallel_verification_time = time.time() - start_time
    print("Parallel verification:", "Valid" if is_valid_parallel else "Invalid")
    print(f"Parallel verification time: {parallel_verification_time:.4f} seconds")


if __name__ == "__main__":
    main()
