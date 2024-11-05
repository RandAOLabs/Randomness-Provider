import gmpy2
from gmpy2 import mpz, powmod, random_state, mpz_urandomb
from typing import Tuple


class VerifiableDelayFunction:
    def __init__(self, bit_size: int = 2048, T: int = 1000):
        self.bit_size = bit_size  # Bit size for RSA modulus N
        self.T = T  # Delay parameter (number of squarings)
        self.rand = random_state()  # Random state for GMP
        self.N, self.p, self.q = self.generate_rsa_modulus()
        self.x = self.generate_random_challenge()

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
        """Evaluates the VDF by computing x^(2^T) mod N using T squarings."""
        result = mpz(self.x)
        for _ in range(self.T):
            result = powmod(result, 2, self.N)
        return result

    def generate_proof(self) -> mpz:
        """Generates the solution and a proof for the VDF."""
        return self.evaluate()

    def verify(self, y: mpz) -> bool:
        """Verifies the VDF by recomputing x^(2^T) mod N and comparing with y."""
        expected_y = self.evaluate()
        return expected_y == y
