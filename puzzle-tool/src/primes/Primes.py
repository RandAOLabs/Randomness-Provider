from ..mpc import MPC
from ..mpc.types import MPZ
from ..random import Random
from .abstract.IPrimes import IPrimes


class Primes(IPrimes):
    """Implementation of prime number generation."""

    @staticmethod
    def get_prime(bit_size: int) -> MPZ:
        # Get random state for generating random numbers
        rand = Random.get_random(bit_size)

        random_num = MPC.mpz_urandomb(rand, bit_size)

        # Get next prime after the random number
        return MPC.next_prime(random_num)
