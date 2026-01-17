# protocol_constants.py

from src.mpc import MPC


BIT_SIZE = 2048  # RSA modulus bit size
TIMING_PARAMETER = MPC.mpz(3_000_000)  # T - Total squarings for delay
