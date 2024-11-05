import gmpy2
from gmpy2 import mpz, powmod, random_state, mpz_urandomb
from typing import Tuple, List
from multiprocessing import Pool

class TimeLockPuzzle:
    def __init__(self, bit_size: int = 2048, T: int = 1000, num_segments: int = 10):
        # Check if T is divisible by num_segments
        if T % num_segments != 0:
            raise ValueError(f"The total number of squarings (T={T}) must be divisible by the number of segments (num_segments={num_segments}).")
        
        self.bit_size = bit_size
        self.T = T
        self.num_segments = num_segments
        self.segment_length = T // num_segments
        self.rand = random_state()
        self.N, self.p, self.q = self._generate_rsa_modulus()
        self.x = self._generate_random_challenge()
        self.proof = []

    def evaluate(self) -> mpz:
        """Optimized evaluation using batched exponentiation to reduce calls to powmod."""
        result = mpz(self.x)
        self.proof = []

        # Instead of squaring `segment_length` times, use exponentiation
        segment_exp = 2 ** self.segment_length

        # Iterate over each segment and apply the batched exponentiation
        for segment in range(self.num_segments):
            result = powmod(result, segment_exp, self.N)  # Exponentiate by 2^segment_length in a single step
            self.proof.append(mpz(result))  # Store the intermediate result as part of the proof

        self.y = result
        return result

    def generate_proof(self) -> Tuple[mpz, List[mpz]]:
        y = self.evaluate()
        return y, self.proof

    @staticmethod
    def verify_segment(args: Tuple[mpz, mpz, int, mpz]) -> bool:
        """
        Verify a segment by performing segment_length squarings.

        Args:
            args (Tuple): A tuple containing the start_value, expected end_value,
                          segment_length, and modulus N.

        Returns:
            bool: True if the computed end_value matches the expected end_value, False otherwise.
        """
        start_value, end_value, segment_length, N = args
        result = mpz(start_value)
        for _ in range(segment_length):
            result = powmod(result, 2, N)
        return result == end_value
    
    def parallel_verify(self, y: mpz, proof: List[mpz]) -> bool:
        """
        Performs parallel verification by checking each proof segment concurrently
        using multiprocessing for true parallelism.

        Args:
            y (mpz): The final VDF result to verify.
            proof (List[mpz]): A list of intermediate values for parallel verification.

        Returns:
            bool: True if verification succeeds, False otherwise.
        """
        # Step 1: Prepare arguments for each segment verification
        tasks = [
            (proof[i - 1] if i > 0 else self.x, proof[i], self.segment_length, self.N)
            for i in range(len(proof))
        ]
        
        # Step 2: Use multiprocessing Pool to verify each segment in parallel
        with Pool() as pool:
            results = pool.map(self.verify_segment, tasks)
        
        # Step 3: Check if all segments verified successfully
        if not all(results):
            print("Parallel verification failed.")
            return False

        # Final check: Verify that the last computed segment result matches y
        return proof[-1] == y
    ##Private##
    def _generate_rsa_modulus(self) -> Tuple[mpz, mpz, mpz]:
        p = gmpy2.next_prime(mpz_urandomb(self.rand, self.bit_size // 2))
        q = gmpy2.next_prime(mpz_urandomb(self.rand, self.bit_size // 2))
        N = p * q
        return N, p, q

    def _generate_random_challenge(self) -> mpz:
        return mpz_urandomb(self.rand, self.bit_size // 2)
