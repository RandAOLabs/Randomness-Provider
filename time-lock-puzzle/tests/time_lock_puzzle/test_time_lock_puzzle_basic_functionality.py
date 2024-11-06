
import pytest
from gmpy2 import mpz


from src.time_lock_puzzle.time_lock_puzzle import TimeLockPuzzle


@pytest.fixture
def time_lock_puzzle_instance():
    """Fixture to create a TimeLockPuzzle instance."""
    return TimeLockPuzzle(bit_size=512, T=100, num_segments=5)  # Smaller size for quicker testing

def test_initialization(time_lock_puzzle_instance):
    """Test that TimeLockPuzzle initializes properly."""
    assert time_lock_puzzle_instance.bit_size == 512
    assert time_lock_puzzle_instance.T == 100
    assert time_lock_puzzle_instance.num_segments == 5
    assert time_lock_puzzle_instance.segment_length == 20  # T // num_segments

def test_evaluate(time_lock_puzzle_instance):
    """Test that the evaluate method runs and produces an expected type and proof segments."""
    y = time_lock_puzzle_instance.evaluate()
    assert isinstance(y, mpz)
    assert len(time_lock_puzzle_instance.proof) == time_lock_puzzle_instance.num_segments

def test_generate_proof(time_lock_puzzle_instance):
    """Test that generate_proof produces the correct output."""
    y, proof = time_lock_puzzle_instance.generate_proof()
    assert isinstance(y, mpz)
    assert isinstance(proof, list)
    assert len(proof) == time_lock_puzzle_instance.num_segments

def test_parallel_verify(time_lock_puzzle_instance):
    """Test that parallel_verify correctly verifies the generated proof."""
    y, proof = time_lock_puzzle_instance.generate_proof()
    assert time_lock_puzzle_instance.parallel_verify(y, proof)

def test_non_divisible_segments_error():
    """Test that TimeLockPuzzle raises an error when T is not divisible by num_segments."""
    T = 7
    num_segments = 3
    
    with pytest.raises(ValueError):
        TimeLockPuzzle(T=T, num_segments=num_segments)