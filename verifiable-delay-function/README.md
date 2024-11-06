# Verifiable Delay Function (VDF) [🔙](../)
This repository section contains an implementation of the [Verifiable Delay Function](https://doi.org/10.4230/LIPIcs.ITCS.2019.60) as outlined by Krzysztof Pietrzak in the paper *Verifiable Delay Functions* (ITCS 2019).

This VDF implementation is part of **RandAO's Randomness Provider** project, designed to provide a reliable source of randomness based on cryptographic delay. RandAO's Randomness Provider leverages VDFs to ensure that randomness generation is sequential, non-parallelizable, and verifiable, establishing trust and security for applications requiring provably delayed randomness.

## Table of Contents
- [Overview](#overview)
- [Development](#development)
- [License](#license)

## Overview

The Verifiable Delay Function (VDF) implemented in this repository follows the specifications in [Pietrzak’s paper](https://doi.org/10.4230/LIPIcs.ITCS.2019.60), offering cryptographically secure, non-parallelizable delay functions that are verifiable by third parties. VDFs have applications in decentralized systems, lotteries, and other systems where reliable and unbiased delay-based randomness is critical.

The VDF consists of:
- **Time Lock Puzzle Implementation**: The core class used to generate and verify a delayed output.
- **Parallelized Verification**: Efficient verification using segmented proof calculations to ensure that the time-bound nature of the function holds.
- **Random State Security**: Secure seeding of the random state for generating unique modulus and challenges, ensuring reliable and cryptographically secure results.

## Development
For detailed development guidelines, including contributing, testing, and documentation, please refer to the [Development Documentation](./docs/developing.md).

## License
This project is licensed under the MIT License. See the [LICENSE file](../LICENSE) for details.