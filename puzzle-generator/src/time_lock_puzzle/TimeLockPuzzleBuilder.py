from typing import Self
from ..mpc.types import MPZ
from .TimeLockPuzzle import TimeLockPuzzle
from .abstract.ITimeLockPuzzleBuilder import ITimeLockPuzzleBuilder


class TimeLockPuzzleBuilder(ITimeLockPuzzleBuilder):
    """Implementation of time lock puzzle builder."""

    def __init__(self) -> None:
        self._x = None
        self._t = None
        self._N = None

    def set_x(self, x: MPZ) -> Self:
        self._x = x
        return self

    def set_t(self, t: MPZ) -> Self:
        self._t = t
        return self

    def set_N(self, N: MPZ) -> Self:
        self._N = N
        return self

    def build(self) -> TimeLockPuzzle:
        if self._x is None or self._t is None or self._N is None:
            raise ValueError("All parameters (x, t, N) must be set before building")
        return TimeLockPuzzle(self._x, self._t, self._N)
