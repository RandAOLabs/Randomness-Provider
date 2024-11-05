import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.database.database import get_orm_base
from src.database.entity.time_lock_puzzle_entity import TimeLockPuzzleEntity

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

def test_time_lock_puzzle_entity_save(test_database):
    """Test the saving functionality of TimeLockPuzzleEntity."""
    # Create a TimeLockPuzzleEntity instance
    entity = TimeLockPuzzleEntity(
        num_segments=5,
        modulus=b'\x01\x02\x03',  # Example modulus bytes
        input_value=b'\x04\x05',  # Example input bytes
        output=b'\x06\x07',       # Example output bytes
        proof=['proof_segment_1', 'proof_segment_2']
    )
    
    # Save the entity to the database
    test_database.add(entity)
    test_database.commit()

    # Verify that the entity was saved and assigned an ID
    saved_entity = test_database.query(TimeLockPuzzleEntity).filter_by(id=entity.id).first()
    assert saved_entity is not None, "Entity was not saved."
    assert saved_entity.id == entity.id
    assert saved_entity.num_segments == 5
    assert saved_entity.modulus == b'\x01\x02\x03'
    assert saved_entity.input == b'\x04\x05'
    assert saved_entity.output == b'\x06\x07'
    assert saved_entity.proof == ['proof_segment_1', 'proof_segment_2']

def test_time_lock_puzzle_entity_repr():
    """Test the __repr__ output of TimeLockPuzzleEntity."""
    entity = TimeLockPuzzleEntity(
        num_segments=5,
        modulus=b'\x01\x02\x03',  # Example modulus bytes
        input_value=b'\x04\x05',  # Example input bytes
        output=b'\x06\x07',       # Example output bytes
        proof=['proof_segment_1', 'proof_segment_2']
    )
    expected_repr = f"<TimeLockPuzzle(id={entity.id}, request_id={entity.request_id}, num_segments=5)>"
    assert repr(entity) == expected_repr
