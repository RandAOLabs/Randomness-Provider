import pytest
from unittest.mock import patch
from gmpy2 import mpz
from typing import List
from src.verifiable_delay_function.verifiable_delay_function import VerifiableDelayFunction
from src.database.entity.verifiable_delay_function_entity import VerifiableDelayFunctionEntity
from src.converters.verifiable_delay_function_converter import conver_verifiable_delay_function_to_entity  # Adjust the import path if needed

@pytest.fixture
def mocked_verifiable_delay_function():
    """Fixture to create a VerifiableDelayFunction instance with predefined values for testing."""
    with patch.object(VerifiableDelayFunction, '_generate_rsa_modulus') as mock_modulus, \
         patch.object(VerifiableDelayFunction, '_generate_random_challenge') as mock_challenge:

        # Set known values for N, p, q, and x
        mock_modulus.return_value = (mpz(21), mpz(7), mpz(3))  # Small modulus for test
        mock_challenge.return_value = mpz(5)  # Known value for x
        
        # Instantiate VerifiableDelayFunction with smaller parameters for quicker tests
        puzzle = VerifiableDelayFunction(bit_size=16, T=2, num_segments=1)
        puzzle.evaluate()  # Generate y and proof based on mocked values
        return puzzle

def test_convert_verifiable_delay_function_to_entity(mocked_verifiable_delay_function):
    """Test conversion of a VerifiableDelayFunction instance to VerifiableDelayFunctionEntity with hex string storage."""
    # Perform the conversion
    entity: VerifiableDelayFunctionEntity = conver_verifiable_delay_function_to_entity(mocked_verifiable_delay_function)
    
    # Expected values based on the mocked puzzle's modulus, x, y, and proof
    expected_modulus = mocked_verifiable_delay_function.N.digits(16)
    expected_input = mocked_verifiable_delay_function.x.digits(16)
    expected_output = mocked_verifiable_delay_function.y.digits(16)
    expected_proof = [p.digits(16) for p in mocked_verifiable_delay_function.proof]

    # Assertions
    assert isinstance(entity, VerifiableDelayFunctionEntity)
    assert entity.modulus == expected_modulus
    assert entity.input == expected_input
    assert entity.output == expected_output
    assert entity.proof == expected_proof

def test_convert_verifiable_delay_function_to_entity_missing_proof():
    """Test that conver_verifiable_delay_function_to_entity raises an error if y or proof is missing."""
    # Create a VerifiableDelayFunction instance
    vdf_instance = VerifiableDelayFunction(bit_size=16, T=2, num_segments=1)
    
    # Do not run evaluate() to keep y and proof unset
    # Attempt conversion, expecting a ValueError
    with pytest.raises(ValueError, match="The VDF instance must be evaluated and proofed before conversion."):
        conver_verifiable_delay_function_to_entity(vdf_instance)