# Project Setup
This guide will walk you through setting up and running the Verifiable Delay Function (VDF) project in Python.

## Prerequisites
 - Python 3.7+: Make sure you have Python installed on your system.
 - GMPY2: This library is required for high-performance modular arithmetic. It provides bindings to the GMP library for Python.

## Install Dependencies:
```bash
pip install -r requirements.txt
```
Ensure that gmpy2 is installed. If you encounter issues, you may need to install GMP and MPFR on your system (e.g., sudo apt-get install libgmp-dev libmpfr-dev on Ubuntu).
```bash
sudo apt-get install libgmp-dev libmpfr-dev
```
## Running the Project
To generate a VDF proof and verify it, run the main.py script:
```bash
python main.py
```

## Running the Tests
To run the unit tests, use the following command:
```bash
python -m unittest discover -s tests
```