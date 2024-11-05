"""
Main script to run the Verifiable Delay Function (VDF).

This script initializes a Verifiable Delay Function (VDF) with a specified RSA modulus
bit size and delay parameter (T). It then generates a proof for the VDF and verifies it.

The VDF relies on sequential squaring in an RSA group to impose a time delay that cannot
be bypassed by parallel computation. This example demonstrates VDF setup, proof generation,
and verification.

Functions:
    main(): Runs the VDF demonstration, generating and verifying a proof.
"""

from src.vdf import VerifiableDelayFunction


def main():
    """
    Runs the Verifiable Delay Function (VDF) demonstration.

    Initializes a VDF with a 2048-bit RSA modulus and delay parameter T=1000.
    It generates a proof by performing T sequential squarings in the RSA group,
    then verifies the proof to demonstrate the VDF functionality.

    Prints:
        The generated RSA modulus N.
        The computed VDF output (y).
        The result of the VDF verification (valid or invalid).
    """
    # Initialize VDF with 2048-bit modulus and delay T = 1000
    vdf = VerifiableDelayFunction(bit_size=2048, T=1000)
    print("Generated RSA modulus N:", vdf.N)

    # Generate proof (i.e., the delayed output)
    y = vdf.generate_proof()
    print("VDF output (y):", y)

    # Verify the proof
    is_valid = vdf.verify(y)
    print("VDF verification result:", "Valid" if is_valid else "Invalid")


if __name__ == "__main__":
    main()
