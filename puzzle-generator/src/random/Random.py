import secrets
from ..mpc import MPC
from ..mpc.types import RandomState
from .abstract.IRandom import IRandom


class Random(IRandom):
    """Implementation of secure random number generation."""

    @staticmethod
    def get_random(bit_size: int) -> RandomState:
        secure_seed = secrets.randbits(bit_size)
        return MPC.random_state(secure_seed)
