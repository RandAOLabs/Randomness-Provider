from abc import ABC, abstractmethod
from ...mpc.types import MPZ


class IRSA(ABC):
    """Abstract base class defining the interface for RSA cryptosystem implementation."""

    @abstractmethod
    def get_p(self) -> MPZ:
        """Get the first prime factor p.

        Returns:
            MPZ: The prime number p
        """

    @abstractmethod
    def get_q(self) -> MPZ:
        """Get the second prime factor q.

        Returns:
            MPZ: The prime number q
        """

    @abstractmethod
    def get_N(self) -> MPZ:
        """Get the modulus N = p * q.

        Returns:
            MPZ: The modulus N
        """

    @abstractmethod
    def get_phi(self) -> MPZ:
        """Get Euler's totient φ(N) = (p-1)(q-1).

        Returns:
            MPZ: The value of Euler's totient function
        """

    @abstractmethod
    def get_eulers_totient(self) -> MPZ:
        """Alias for get_phi().

        Returns:
            MPZ: The value of Euler's totient function
        """
