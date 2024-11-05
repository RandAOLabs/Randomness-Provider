import gmpy2
from gmpy2 import mpz, powmod, random_state, mpz_urandomb
from typing import Tuple, List
from concurrent.futures import ThreadPoolExecutor, as_completed


class VerifiableDelayFunction:
    def __init__(self, bit_size: int = 2048, T: int = 1000, num_segments: int = 10):
        self.bit_size = bit_size  # Bit size for RSA modulus N
        self.T = T  # Delay parameter (number of squarings)
        self.num_segments = num_segments  # Number of segments for parallel verification
        self.segment_length = T // num_segments  # Length of each segment
        self.rand = random_state()  # Random state for GMP
        self.N, self.p, self.q = self.generate_rsa_modulus()
        self.x = self.generate_random_challenge()
        self.proof = []

    def generate_rsa_modulus(self) -> Tuple[mpz, mpz, mpz]:
        """Generates a secure RSA modulus N = p * q with two large primes."""
        p = gmpy2.next_prime(mpz_urandomb(self.rand, self.bit_size // 2))
        q = gmpy2.next_prime(mpz_urandomb(self.rand, self.bit_size // 2))
        N = p * q
        return N, p, q

    def generate_random_challenge(self) -> mpz:
        """Generates a random challenge integer x for the VDF."""
        return mpz_urandomb(self.rand, self.bit_size // 2)

    def evaluate(self) -> mpz:
        """Evaluates the VDF by computing x^(2^T) mod N using T squarings and generating the proof."""
        result = mpz(self.x)
        self.proof = []  # Clear existing proof

        # Compute each segment and save intermediate results for proof
        for segment in range(self.num_segments):
            for _ in range(self.segment_length):
                result = powmod(result, 2, self.N)
            self.proof.append(
                mpz(result)
            )  # Store the intermediate result as part of the proof

        return result

    def generate_proof(self) -> Tuple[mpz, List[mpz]]:
        """
        Generates the solution and a proof for the VDF.

        Returns:
            A tuple containing the final result (y) and the proof (list of intermediate results).
        """
        y = self.evaluate()
        return y, self.proof

    def verify(self, y: mpz) -> bool:
        """Verifies the VDF by recomputing x^(2^T) mod N and comparing with y (full sequential verification)."""
        expected_y = self.evaluate()
        return expected_y == y

    def parallel_verify(self, y: mpz, proof: List[mpz]) -> bool:
        """
        Performs a faster verification by checking each segment concurrently.

        Args:
            y (mpz): The final VDF result to verify.
            proof (List[mpz]): A list of intermediate values for parallel verification.

        Returns:
            bool: True if verification succeeds, False otherwise.
        """

        def verify_segment(start_value: mpz, expected_value: mpz) -> bool:
            # Calculate the result after segment_length squarings
            result = mpz(start_value)
            for _ in range(self.segment_length):
                result = powmod(result, 2, self.N)
            return result == expected_value

        # Initial value for the first segment
        current_value = mpz(self.x)

        # Use ThreadPoolExecutor to verify each segment concurrently
        with ThreadPoolExecutor() as executor:
            futures = []
            for segment_result in proof:
                futures.append(
                    executor.submit(verify_segment, current_value, segment_result)
                )
                # Update current_value to the next segment start
                for _ in range(self.segment_length):
                    current_value = powmod(current_value, 2, self.N)

            # Check that all segments verified correctly
            for future in as_completed(futures):
                if not future.result():
                    return False  # A segment failed verification

        # Verify that the last segment result matches y
        return current_value == y
