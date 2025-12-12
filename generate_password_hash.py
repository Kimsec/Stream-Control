#!/usr/bin/env python3
"""
Simple utility to generate password hash for LOGIN_PASSWORD_HASH environment variable.
Usage: python generate_password_hash.py [password]
       python generate_password_hash.py  (prompts for password)
"""
import sys
from werkzeug.security import generate_password_hash
from getpass import getpass

def main():
    if len(sys.argv) > 1:
        password = sys.argv[1]
    else:
        password = getpass("Enter password: ")
        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("❌ Passwords do not match!", file=sys.stderr)
            sys.exit(1)

    if not password:
        print("❌ Password cannot be empty!", file=sys.stderr)
        sys.exit(1)

    # Generate hash using scrypt (default in Werkzeug 2.3+)
    password_hash = generate_password_hash(password)

    print("\n✅ Password hash generated successfully!")
    print("\nAdd this to your .env file:")
    print(f"LOGIN_PASSWORD_HASH={password_hash}")
    print("\n⚠️  Remove any old LOGIN_PASSWORD variable from .env")

if __name__ == '__main__':
    main()
