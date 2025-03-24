# [🔙](../) Time-Lock Puzzles
This repository section contains an implementation of [Time-Lock Puzzles](https://en.wikipedia.org/wiki/Time-lock_puzzle) as outlined in the seminal paper [Time-lock puzzles and timed-release Crypto](https://people.csail.mit.edu/rivest/pubs/RSW96.pdf) by Ronald L. Rivest, Adi Shamir, and David A. Wagner.

This Time-Lock Puzzle implementation is part of **RandAO's Randomness Provider** project, designed to provide a reliable source of randomness based on cryptographic time delays. RandAO's Randomness Provider leverages Time-Lock Puzzles to ensure that randomness generation requires a precise amount of sequential computation time, establishing trust and security for applications requiring provably delayed randomness.

## Table of Contents
- [Overview](#overview)
- [Development](#development)
- [License](#license)

## Overview
The Time-Lock Puzzle implementation in this repository follows the specifications in the [RSW96 paper](https://people.csail.mit.edu/rivest/pubs/RSW96.pdf), providing a cryptographically secure mechanism for creating puzzles that require a predetermined amount of sequential computation to solve. This feature is crucial for applications in time-released cryptography and decentralized randomness protocols, where it is essential to produce randomness that cannot be accessed before a specific time has elapsed.

Key features of this Time-Lock Puzzle implementation include:

 - Sequential Computation: The puzzle's design requires a specific number of sequential squaring operations modulo a composite number, ensuring that parallel computing offers no advantage in solving the puzzle.
 - Precise Time Calibration: The difficulty of each puzzle can be precisely calibrated based on the computing power available to the solver.
 - Efficient Creation: Puzzles can be created efficiently by anyone who knows the factorization of the modulus.
 - Secure Message Encryption: The puzzle can securely encrypt a message that remains hidden until the sequential computation is completed.
 
This approach enables decentralized protocols to produce randomness that is guaranteed to remain secret for a specific time period, making it ideal for use cases such as secure time-released cryptography, fair contract signing, sealed-bid auctions, and other applications requiring temporal security guarantees.

## Development
For detailed development guidelines, including contributing, testing, and documentation, please refer to the [Development Documentation](./docs/developing.md).

## License
This project is licensed under the MIT License. See the [LICENSE file](../LICENSE) for details.
