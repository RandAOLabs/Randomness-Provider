from ..mpc import MPC
from ..mpc.types import MPZ
from .abstract.IRSA import IRSA
from ..primes import Primes


class RSA(IRSA):
    """Implementation of RSA cryptosystem."""

    def __init__(self, bit_size: int) -> None:
        """Initialize RSA by generating two random prime numbers.

        Args:
            bit_size (int): Number of bits for RSA modulus.
                          Each prime will be bit_size/2 bits.
        """
        # Generate two random prime numbers
        prime_size = (
            bit_size // 2 - 1
        )  # Each prime is half the size TODO is this needed anymore with gmpc on chain?
        self._p = Primes.get_prime(prime_size)
        self._q = Primes.get_prime(prime_size)

        # Calculate modulus N and Euler's totient
        self._N = self._calculate_N()
        self._phi = self._calculate_phi()

    def get_p(self) -> MPZ:
        return self._p

    def get_q(self) -> MPZ:
        return self._q

    def get_N(self) -> MPZ:
        return self._N

    def get_phi(self) -> MPZ:
        return self._phi

    def get_eulers_totient(self) -> MPZ:
        return self.get_phi()

    # Private methods
    # --------------

    def _calculate_N(self) -> MPZ:
        """Calculate the RSA modulus N = p * q."""
        return MPC.mpz(self._p * self._q)

    def _calculate_phi(self) -> MPZ:
        """Calculate Euler's totient φ(N) = (p-1)(q-1)."""
        return MPC.mpz((self._p - 1) * (self._q - 1))
