"""
Main script to run the Verifiable Delay Function (VDF).

This script initializes a Verifiable Delay Function (VDF) with a specified RSA modulus
bit size and delay parameter (T). It then generates a proof for the VDF and verifies it
both sequentially and with parallelized verification using segments.

Functions:
    main(): Runs the VDF demonstration, generating and verifying a proof.
"""

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
    """
    # Initialize VDF with 2048-bit modulus and delay T = 1000
    vdf = VerifiableDelayFunction(bit_size=2048, T=1000, num_segments=10)
    print("Generated RSA modulus N:", vdf.N)

    # Generate proof (i.e., the delayed output)
    y, proof = vdf.generate_proof()
    print("VDF output (y):", y)

    # Sequential verification
    is_valid_seq = vdf.verify(y)
    print("Sequential verification:", "Valid" if is_valid_seq else "Invalid")

    # Parallel verification using the proof
    is_valid_parallel = vdf.parallel_verify(y, proof)
    print("Parallel verification:", "Valid" if is_valid_parallel else "Invalid")


if __name__ == "__main__":
    main()
