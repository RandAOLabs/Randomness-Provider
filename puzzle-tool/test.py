"""Test harness for puzzle generation and solving."""

import time
from src.mpc import MPC
from src.protocol_constants import BIT_SIZE, TIMING_PARAMETER
from src.time_lock_puzzle.TimeLockPuzzleFactory import TimeLockPuzzleFactory
from src.time_lock_puzzle.EfficientTimeLockPuzzleSolver import EfficientTimeLockPuzzleSolver
from src.time_lock_puzzle.SequentialTimeLockPuzzleSolver import SequentialTimeLockPuzzleSolver


def main():
    """Run the test harness."""
    print("=" * 80)
    print("PUZZLE TOOL TEST HARNESS")
    print("=" * 80)

    # Initialize factory
    print(f"\nInitializing factory with:")
    print(f"  Bit size: {BIT_SIZE}")
    print(f"  Timing parameter: {TIMING_PARAMETER}")
    factory = TimeLockPuzzleFactory(BIT_SIZE, TIMING_PARAMETER)

    # Generate 1 puzzle
    print("\n" + "=" * 80)
    print("STEP 1: GENERATE PUZZLE")
    print("=" * 80)
    start_time = time.time()
    puzzles = factory.create_puzzles(1)
    gen_time = time.time() - start_time

    puzzle, rsa, expected_y = puzzles[0]

    print(f"\nPuzzle generated in {gen_time:.2f} seconds")
    print(f"\nPuzzle parameters:")
    print(f"  x = {hex(puzzle.get_x())[:50]}...")
    print(f"  t = {puzzle.get_t()}")
    print(f"  N = {hex(puzzle.get_N())[:50]}...")

    # Solve WITH key (efficient)
    print("\n" + "=" * 80)
    print("STEP 2: SOLVE WITH PRIVATE KEY (Fast)")
    print("=" * 80)
    start_time = time.time()
    y_with_key = EfficientTimeLockPuzzleSolver.solve(rsa, puzzle)
    with_key_time = time.time() - start_time

    print(f"\nSolved with private key in {with_key_time:.4f} seconds")
    print(f"  y = {hex(y_with_key)[:50]}...")

    # Solve WITHOUT key (sequential)
    print("\n" + "=" * 80)
    print("STEP 3: SOLVE WITHOUT PRIVATE KEY (Slow - Sequential Squaring)")
    print("=" * 80)
    print("\nThis is the real 'cracking' - no private key used!")
    print("Starting sequential squaring...")
    start_time = time.time()
    y_without_key = SequentialTimeLockPuzzleSolver.solve(puzzle)
    without_key_time = time.time() - start_time

    print(f"\nSolved without private key in {without_key_time:.4f} seconds")
    print(f"  y = {hex(y_without_key)[:50]}...")

    # Verify solutions match
    print("\n" + "=" * 80)
    print("STEP 4: VERIFY SOLUTIONS")
    print("=" * 80)

    with_key_match = y_with_key == expected_y
    without_key_match = y_without_key == expected_y
    both_match = y_with_key == y_without_key

    print(f"\nExpected y:      {hex(expected_y)[:50]}...")
    print(f"With key y:      {hex(y_with_key)[:50]}...")
    print(f"Without key y:   {hex(y_without_key)[:50]}...")
    print(f"\nWith key matches expected:    {with_key_match} ✓" if with_key_match else f"\nWith key matches expected:    {with_key_match} ✗")
    print(f"Without key matches expected: {without_key_match} ✓" if without_key_match else f"Without key matches expected: {without_key_match} ✗")
    print(f"Both methods match:           {both_match} ✓" if both_match else f"Both methods match:           {both_match} ✗")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Generation time:         {gen_time:.4f} seconds")
    print(f"With key solving time:   {with_key_time:.4f} seconds")
    print(f"Without key solving time: {without_key_time:.4f} seconds")
    print(f"Speedup factor:          {without_key_time/with_key_time:.2f}x")

    if with_key_match and without_key_match and both_match:
        print("\n✓ ALL TESTS PASSED! ✓")
        return 0
    else:
        print("\n✗ TESTS FAILED! ✗")
        return 1


if __name__ == "__main__":
    exit(main())
