import gmpy2
from .abstract.IMPC import IMPC
from .types import MPZ, RandomState


class MPC(IMPC):
    """Implementation of multi-precision computing operations."""

    @staticmethod
    def mpz(value: int) -> MPZ:
        return gmpy2.mpz(value)

    @staticmethod
    def random_state(seed: int) -> RandomState:
        return gmpy2.random_state(seed)

    @staticmethod
    def mpz_urandomb(state: RandomState, bit_count: int) -> MPZ:
        return gmpy2.mpz_urandomb(state, bit_count)

    @staticmethod
    def next_prime(value: MPZ) -> MPZ:
        return gmpy2.next_prime(value)

    @staticmethod
    def powmod(base: MPZ, exp: MPZ, mod: MPZ) -> MPZ:
        return gmpy2.powmod(base, exp, mod)

    @staticmethod
    def pow(base: MPZ, exp: MPZ) -> MPZ:
        return base**exp

    @staticmethod
    def mod(value: MPZ, modulus: MPZ) -> MPZ:
        return value % modulus  # gmpy2 supports % operator for mpz values
