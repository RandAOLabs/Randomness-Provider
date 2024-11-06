import pytest
from unittest.mock import patch
from gmpy2 import mpz
import pytest
from unittest.mock import patch
from gmpy2 import mpz
from src.verifiable_delay_function.verifiable_delay_function import VerifiableDelayFunction

@pytest.fixture
def verifiable_delay_function_instance():
    """Fixture to create a VerifiableDelayFunction instance with mocked values."""
    with patch.object(VerifiableDelayFunction, '_generate_rsa_modulus') as mock_modulus, \
         patch.object(VerifiableDelayFunction, '_generate_random_challenge') as mock_challenge:

        # Set known values for N, p, q, and x
        mock_modulus.return_value = (mpz(21), mpz(7), mpz(3))  # Small modulus for test
        mock_challenge.return_value = mpz(5)  # Known value for x
        
        # Instantiate VerifiableDelayFunction with smaller parameters for quicker tests
        puzzle = VerifiableDelayFunction(bit_size=16, T=2, num_segments=1)
        return puzzle

def test_evaluate(verifiable_delay_function_instance):
    """Test the evaluate method with fixed values for N and x."""
    y = verifiable_delay_function_instance.evaluate()
    
    # Expected proof for this known N, x, T, and num_segments
    # Calculation: x^2^T mod N
    # First squaring: 5^2 = 25, then 25 mod 21 = 4
    # Second squaring: 4^2 = 16, then 16 mod 21 = 16
    expected_proof = [mpz(16)]
    expected_y = mpz(16)

    assert y == expected_y  # Final y should match last proof segment
    assert verifiable_delay_function_instance.proof == expected_proof

def test_generate_proof(verifiable_delay_function_instance):
    """Test generate_proof to ensure it matches the expected output."""
    y, proof = verifiable_delay_function_instance.generate_proof()
    
    # Expected proof for this known N, x, T, and num_segments
    expected_proof = [mpz(16)]
    expected_y = mpz(16)

    assert y == expected_y
    assert proof == expected_proof

def test_parallel_verify(verifiable_delay_function_instance):
    """Test parallel_verify with the mocked values to ensure verification passes."""
    y, proof = verifiable_delay_function_instance.generate_proof()
    assert verifiable_delay_function_instance.parallel_verify(y, proof)  # Verification should succeed

@pytest.fixture
def create_verifiable_delay_function_instance():
    """Factory fixture to create VerifiableDelayFunction instances with varied parameters."""
    def _create_instance(T, num_segments):
        with patch.object(VerifiableDelayFunction, '_generate_rsa_modulus') as mock_modulus, \
             patch.object(VerifiableDelayFunction, '_generate_random_challenge') as mock_challenge:

            # Set known values for N, p, q, and x
            mock_modulus.return_value = (mpz(21), mpz(7), mpz(3))  # Small modulus for test
            mock_challenge.return_value = mpz(5)  # Known value for x
            
            # Instantiate VerifiableDelayFunction with specified T and num_segments
            puzzle = VerifiableDelayFunction(bit_size=16, T=T, num_segments=num_segments)
            return puzzle
    return _create_instance

def test_evaluate_single_segment(create_verifiable_delay_function_instance):
    """Test the evaluate method with a single segment (num_segments=1)."""
    puzzle = create_verifiable_delay_function_instance(T=4, num_segments=1)
    y = puzzle.evaluate()

    # Calculation for T=4, single segment
    # First squaring: 5^2 = 25, then 25 mod 21 = 4
    # Second squaring: 4^2 = 16, then 16 mod 21 = 16
    # Third squaring: 16^2 = 256, then 256 mod 21 = 4
    # Fourth squaring: 4^2 = 16, then 16 mod 21 = 16
    expected_proof = [mpz(16)]
    expected_y = mpz(16)

    assert y == expected_y
    assert puzzle.proof == expected_proof

def test_evaluate_multiple_segments(create_verifiable_delay_function_instance):
    """Test the evaluate method with multiple segments (num_segments=2)."""
    puzzle = create_verifiable_delay_function_instance(T=4, num_segments=2)
    y = puzzle.evaluate()

    # Expected proof for T=4, num_segments=2, segment_length=2
    expected_proof = [mpz(16), mpz(16)]
    expected_y = mpz(16)

    assert y == expected_y
    assert puzzle.proof == expected_proof

def test_generate_proof_varying_segments(create_verifiable_delay_function_instance):
    """Test generate_proof with varying segments."""
    # Test with T=6 and num_segments=3 (segment_length=2)
    puzzle = create_verifiable_delay_function_instance(T=6, num_segments=3)
    y, proof = puzzle.generate_proof()

    # Expected proof segments based on calculations
    expected_proof = [mpz(16), mpz(16), mpz(16)]
    expected_y = mpz(16)

    assert y == expected_y
    assert proof == expected_proof

def test_parallel_verify_varying_segments(create_verifiable_delay_function_instance):
    """Test parallel_verify with varying segments to ensure verification passes."""
    # Test with T=6 and num_segments=3
    puzzle = create_verifiable_delay_function_instance(T=6, num_segments=3)
    y, proof = puzzle.generate_proof()
    assert puzzle.parallel_verify(y, proof)  # Verification should succeed

    # Test with T=4 and num_segments=2
    puzzle = create_verifiable_delay_function_instance(T=4, num_segments=2)
    y, proof = puzzle.generate_proof()
    assert puzzle.parallel_verify(y, proof)  # Verification should succeed
