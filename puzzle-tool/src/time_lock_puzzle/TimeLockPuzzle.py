from ..mpc.types import MPZ


class TimeLockPuzzle:
    """A time lock puzzle."""

    def __init__(self, x: MPZ, t: MPZ, N: MPZ) -> None:
        """Initialize a time lock puzzle.

        Args:
            x (MPZ): The input value
            t (MPZ): The time parameter
            N (MPZ): The modulus
        """
        self._x = x
        self._t = t
        self._N = N

    def get_x(self) -> MPZ:
        return self._x

    def get_t(self) -> MPZ:
        return self._t

    def get_N(self) -> MPZ:
        return self._N
