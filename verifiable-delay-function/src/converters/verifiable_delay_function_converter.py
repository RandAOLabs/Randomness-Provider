from typing import List
from gmpy2 import mpz
from src.database.entity.verifiable_delay_function_entity import VerifiableDelayFunctionEntity
from src.verifiable_delay_function.verifiable_delay_function import VerifiableDelayFunction

def conver_verifiable_delay_function_to_entity(verifiable_delay_function: VerifiableDelayFunction) -> VerifiableDelayFunctionEntity:
    """
    Converts a completed VerifiableDelayFunction instance into a VerifiableDelayFunctionEntity instance for database storage.

    Args:
        vdf_instance (VerifiableDelayFunction): The completed VDF instance to convert.

    Returns:
        VerifiableDelayFunctionEntity: A new VerifiableDelayFunctionEntity instance populated with data from the VDF.
    """
    # Ensure that `y` and `proof` are available
    if not hasattr(verifiable_delay_function, 'y') or not verifiable_delay_function.proof:
        raise ValueError("The VDF instance must be evaluated and proofed before conversion.")
    
    # Convert the modulus, input, and output to hex strings
    modulus_hex: str = verifiable_delay_function.N.digits(16)
    input_hex: str = verifiable_delay_function.x.digits(16)
    output_hex: str = verifiable_delay_function.y.digits(16)
    
    # Convert proof list to JSON-serializable format by encoding each segment as hex
    proof_json: List[str] = [checkpoint.digits(16) for checkpoint in verifiable_delay_function.proof]

    # Create and return a new VerifiableDelayFunctionEntity instance
    return VerifiableDelayFunctionEntity(
        modulus_hex=modulus_hex,
        input_hex=input_hex,
        output_hex=output_hex,
        proof=proof_json
    )
