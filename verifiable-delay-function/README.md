# Verifiable Delay Function (VDF) [🔙](../)
This repository section contains an implementation of the [Verifiable Delay Function](https://doi.org/10.4230/LIPIcs.ITCS.2019.60) as outlined by Krzysztof Pietrzak in the paper *Verifiable Delay Functions* (ITCS 2019).

This VDF implementation is part of **RandAO's Randomness Provider** project, designed to provide a reliable source of randomness based on cryptographic delay. RandAO's Randomness Provider leverages VDFs to ensure that randomness generation is sequential, non-parallelizable, and verifiable, establishing trust and security for applications requiring provably delayed randomness.

## Table of Contents
- [Overview](#overview)
- [Development](#development)
- [License](#license)

## Overview
The Verifiable Delay Function (VDF) implemented in this repository follows the specifications in [Pietrzak’s paper](https://doi.org/10.4230/LIPIcs.ITCS.2019.60), providing a cryptographically secure delay mechanism that requires significant serial compute time for generation, yet allows for efficient, parallelized verification. This feature is crucial for applications in decentralized randomness protocols, where it is essential to produce randomness that is both unbiased and verifiable by third parties.

Key features of this VDF implementation include:

Serial Computation for Generation: The VDF’s core design requires sequential calculations to produce the delayed output, ensuring that no shortcut can bypass the intended delay.
Parallelized Verification: The delayed output is verifiable in a parallelized manner, allowing for efficient proof checks even in distributed environments.
Secure Random State Initialization: Each VDF instance uses secure, unique seeding for generating the modulus and initial challenge, ensuring cryptographic security across executions.
This approach enables decentralized protocols to produce and verify randomness that is resistant to tampering or premature access, making it ideal for use cases such as secure lotteries, blockchain protocols, and other decentralized applications requiring provable delay-based randomness.

## Development
For detailed development guidelines, including contributing, testing, and documentation, please refer to the [Development Documentation](./docs/developing.md).

## License
This project is licensed under the MIT License. See the [LICENSE file](../LICENSE) for details.