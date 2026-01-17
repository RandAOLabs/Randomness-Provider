from abc import ABC, abstractmethod
from ..types import MPZ, RandomState


class IMPC(ABC):
    """Abstract base class defining the interface for multi-precision computing operations."""

    @staticmethod
    @abstractmethod
    def mpz(value: int) -> MPZ:
        """Convert a Python integer to an mpz.

        Args:
            value (int): Integer value to convert

        Returns:
            mpz: Multi-precision integer
        """

    @staticmethod
    @abstractmethod
    def random_state(seed: int) -> RandomState:
        """Create a random state from a seed.

        Args:
            seed (int): Seed value for random state

        Returns:
            mpz: Random state object
        """

    @staticmethod
    @abstractmethod
    def mpz_urandomb(state: RandomState, bit_count: int) -> MPZ:
        """Generate a random integer with specified number of bits.

        Args:
            state (mpz): Random state to use
            bit_count (int): Number of bits in result

        Returns:
            mpz: Random integer
        """

    @staticmethod
    @abstractmethod
    def next_prime(value: MPZ) -> MPZ:
        """Find the next prime number after the given value.

        Args:
            value (mpz): Starting value

        Returns:
            mpz: Next prime number
        """

    @staticmethod
    @abstractmethod
    def powmod(base: MPZ, exp: MPZ, mod: MPZ) -> MPZ:
        """Compute (base ** exp) % mod efficiently.

        Args:
            base (mpz): Base value
            exp (mpz): Exponent value
            mod (mpz): Modulus value

        Returns:
            mpz: Result of modular exponentiation
        """

    @staticmethod
    @abstractmethod
    def pow(base: MPZ, exp: MPZ) -> MPZ:
        """Compute base ** exp.

        Args:
            base (mpz): Base value
            exp (mpz): Exponent value

        Returns:
            mpz: Result of exponentiation
        """

    @staticmethod
    @abstractmethod
    def mod(value: MPZ, modulus: MPZ) -> MPZ:
        """Compute value % modulus.

        Args:
            value (mpz): Value to reduce
            modulus (mpz): Modulus to reduce by

        Returns:
            mpz: Result of modular reduction
        """
