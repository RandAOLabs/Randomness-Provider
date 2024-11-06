import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.database.database import get_orm_base
from src.database.entity.verifiable_delay_function_entity import VerifiableDelayFunctionEntity

# Setup in-memory SQLite database for testing
@pytest.fixture(scope="module")
def test_database():
    # Create an in-memory SQLite database engine
    engine = create_engine("sqlite:///:memory:")
    # Bind the base to this engine
    Base = get_orm_base()
    Base.metadata.create_all(engine)  # Create tables

    # Create a sessionmaker bound to this engine
    Session = sessionmaker(bind=engine)
    session = Session()

    yield session  # Provide the session to tests

    # Teardown: close session and drop tables
    session.close()
    Base.metadata.drop_all(engine)

def test_verifiable_delay_function_entity_save(test_database):
    """Test the saving functionality of VerifiableDelayFunctionEntity with hex strings."""
    # Create a VerifiableDelayFunctioneEntity instance with hex strings
    entity = VerifiableDelayFunctionEntity(
        modulus_hex='010203',      # Example modulus hex string
        input_hex='0405',          # Example input hex string
        output_hex='0607',         # Example output hex string
        proof=['proof_segment_1', 'proof_segment_2']
    )
    
    # Save the entity to the database
    test_database.add(entity)
    test_database.commit()

    # Verify that the entity was saved and assigned an ID
    saved_entity = test_database.query(VerifiableDelayFunctionEntity).filter_by(id=entity.id).first()
    assert saved_entity is not None, "Entity was not saved."
    assert saved_entity.id == entity.id
    assert saved_entity.modulus == '010203'
    assert saved_entity.input == '0405'
    assert saved_entity.output == '0607'
    assert saved_entity.proof == ['proof_segment_1', 'proof_segment_2']

def test_verifiable_delay_function_entity_repr():
    """Test that the __repr__ output of VerifiableDelayFunctionEntity is not empty."""
    entity = VerifiableDelayFunctionEntity(
        modulus_hex='010203',      # Example modulus hex string
        input_hex='0405',          # Example input hex string
        output_hex='0607',         # Example output hex string
        proof=['proof_segment_1', 'proof_segment_2']
    )
    repr_output = repr(entity)
    assert repr_output, "The __repr__ output is empty."