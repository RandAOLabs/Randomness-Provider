
import pytest
from gmpy2 import mpz


from src.verifiable_delay_function.verifiable_delay_function import VerifiableDelayFunction


@pytest.fixture
def verifiable_delay_function_instance():
    """Fixture to create a VerifiableDelayFunction instance."""
    return VerifiableDelayFunction(bit_size=512, T=100, num_segments=5)  # Smaller size for quicker testing

def test_initialization(verifiable_delay_function_instance):
    """Test that VerifiableDelayFunction initializes properly."""
    assert verifiable_delay_function_instance.bit_size == 512
    assert verifiable_delay_function_instance.T == 100
    assert verifiable_delay_function_instance.num_segments == 5
    assert verifiable_delay_function_instance.segment_length == 20  # T // num_segments

def test_evaluate(verifiable_delay_function_instance):
    """Test that the evaluate method runs and produces an expected type and proof segments."""
    y = verifiable_delay_function_instance.evaluate()
    assert isinstance(y, mpz)
    assert len(verifiable_delay_function_instance.proof) == verifiable_delay_function_instance.num_segments

def test_generate_proof(verifiable_delay_function_instance):
    """Test that generate_proof produces the correct output."""
    y, proof = verifiable_delay_function_instance.generate_proof()
    assert isinstance(y, mpz)
    assert isinstance(proof, list)
    assert len(proof) == verifiable_delay_function_instance.num_segments

def test_parallel_verify(verifiable_delay_function_instance):
    """Test that parallel_verify correctly verifies the generated proof."""
    y, proof = verifiable_delay_function_instance.generate_proof()
    assert verifiable_delay_function_instance.parallel_verify(y, proof)

def test_non_divisible_segments_error():
    """Test that VerifiableDelayFunction raises an error when T is not divisible by num_segments."""
    T = 7
    num_segments = 3
    
    with pytest.raises(ValueError):
        VerifiableDelayFunction(T=T, num_segments=num_segments)