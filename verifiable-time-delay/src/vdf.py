import gmpy2
from gmpy2 import mpz, powmod, random_state, mpz_urandomb
from typing import Tuple, List
import random
from multiprocessing import Pool
import time


class VerifiableDelayFunction:
    def __init__(self, bit_size: int = 2048, T: int = 1000, num_segments: int = 10):
        self.bit_size = bit_size
        self.T = T
        self.num_segments = num_segments
        self.segment_length = T // num_segments
        self.rand = random_state()
        self.N, self.p, self.q = self.generate_rsa_modulus()
        self.x = self.generate_random_challenge()
        self.proof = []

    def generate_rsa_modulus(self) -> Tuple[mpz, mpz, mpz]:
        p = gmpy2.next_prime(mpz_urandomb(self.rand, self.bit_size // 2))
        q = gmpy2.next_prime(mpz_urandomb(self.rand, self.bit_size // 2))
        N = p * q
        return N, p, q

    def generate_random_challenge(self) -> mpz:
        return mpz_urandomb(self.rand, self.bit_size // 2)

    def evaluate(self) -> mpz:
        result = mpz(self.x)
        self.proof = []
        for segment in range(self.num_segments):
            for _ in range(self.segment_length):
                result = powmod(result, 2, self.N)
            self.proof.append(mpz(result))
        return result

    def generate_proof(self) -> Tuple[mpz, List[mpz]]:
        y = self.evaluate()
        return y, self.proof

    def verify(self, y: mpz) -> bool:
        expected_y = self.evaluate()
        return expected_y == y

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
        print("Starting task preparation...")
        start_time = time.time()
        tasks = [
            (proof[i - 1] if i > 0 else self.x, proof[i], self.segment_length, self.N)
            for i in range(len(proof))
        ]
        
        task_preparation_time = time.time() - start_time
        print(f"Task preparation completed in {task_preparation_time:.4f} seconds.")

        # Step 2: Use multiprocessing Pool to verify each segment in parallel
        print("Starting parallel verification...")
        start_time = time.time()
        with Pool() as pool:
            results = pool.map(self.verify_segment, tasks)
        
        parallel_verification_time = time.time() - start_time
        print(f"Parallel verification completed in {parallel_verification_time:.4f} seconds.")

        # Step 3: Check if all segments verified successfully
        print("Starting final result check...")
        start_time = time.time()
        if not all(results):
            print("Parallel verification failed.")
            return False

        # Final check: Verify that the last computed segment result matches y
        final_check_time = time.time() - start_time
        print(f"Final check completed in {final_check_time:.4f} seconds.")
        
        total_verification_time = task_preparation_time + parallel_verification_time + final_check_time
        print(f"Total verification time: {total_verification_time:.4f} seconds.")
        
        return proof[-1] == y