import pytest
from unittest.mock import patch
from gmpy2 import mpz
from typing import List
from src.time_lock_puzzle.time_lock_puzzle import TimeLockPuzzle
from src.database.entity.time_lock_puzzle_entity import TimeLockPuzzleEntity
from src.converters.time_lock_puzzle_converter import convert_time_lock_puzzle_to_entity  # Adjust the import path if needed

@pytest.fixture
def mocked_time_lock_puzzle():
    """Fixture to create a TimeLockPuzzle instance with predefined values for testing."""
    with patch.object(TimeLockPuzzle, '_generate_rsa_modulus') as mock_modulus, \
         patch.object(TimeLockPuzzle, '_generate_random_challenge') as mock_challenge:

        # Set known values for N, p, q, and x
        mock_modulus.return_value = (mpz(21), mpz(7), mpz(3))  # Small modulus for test
        mock_challenge.return_value = mpz(5)  # Known value for x
        
        # Instantiate TimeLockPuzzle with smaller parameters for quicker tests
        puzzle = TimeLockPuzzle(bit_size=16, T=2, num_segments=1)
        puzzle.evaluate()  # Generate y and proof based on mocked values
        return puzzle

def test_convert_time_lock_puzzle_to_entity(mocked_time_lock_puzzle):
    """Test conversion of a TimeLockPuzzle instance to TimeLockPuzzleEntity with hex string storage."""
    # Perform the conversion
    entity = convert_time_lock_puzzle_to_entity(mocked_time_lock_puzzle)
    
    # Expected values based on the mocked puzzle's modulus, x, y, and proof
    expected_modulus = mocked_time_lock_puzzle.N.digits(16)
    expected_input = mocked_time_lock_puzzle.x.digits(16)
    expected_output = mocked_time_lock_puzzle.y.digits(16)
    expected_proof = [p.digits(16) for p in mocked_time_lock_puzzle.proof]

    # Assertions
    assert isinstance(entity, TimeLockPuzzleEntity)
    assert entity.num_segments == mocked_time_lock_puzzle.num_segments
    assert entity.modulus == expected_modulus
    assert entity.input == expected_input
    assert entity.output == expected_output
    assert entity.proof == expected_proof

def test_convert_time_lock_puzzle_to_entity_missing_proof():
    """Test that convert_time_lock_puzzle_to_entity raises an error if y or proof is missing."""
    # Create a TimeLockPuzzle instance
    vdf_instance = TimeLockPuzzle(bit_size=16, T=2, num_segments=1)
    
    # Do not run evaluate() to keep y and proof unset
    # Attempt conversion, expecting a ValueError
    with pytest.raises(ValueError, match="The VDF instance must be evaluated and proofed before conversion."):
        convert_time_lock_puzzle_to_entity(vdf_instance)