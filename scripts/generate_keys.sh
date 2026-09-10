#!/bin/bash
# Generate secp256k1 key pair and output as JWK format
# Dependencies: python3 with ecdsa package, or openssl

echo "Generating secp256k1 key pair..."

# Method 1: Using OpenSSL (usually available)
if command -v openssl &> /dev/null; then
    echo "Using OpenSSL..."
    
    # Generate private key
    openssl ecparam -genkey -name secp256k1 -noout -out private_key.pem 2>/dev/null
    
    if [ $? -eq 0 ]; then
        # Extract public key in JWK format (approximate - we'll use Python for proper encoding)
        python3 << 'PYTHON'
import json
import base64

try:
    from ecdsa import SigningKey, SECP256k1
    import hashlib
    
    # Generate key
    sk = SigningKey.generate(curve=SECP256k1)
    vk = sk.verifying_key
    
    # Get raw public key coordinates
    x = vk.to_string().hex()
    y = vk.to_string(compressed=False)[32:].hex()  # Extract X and Y from uncompressed format
    
    # Base64url encode
    def b64url(data):
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')
    
    x_bytes = vk.to_point().x().__bytes__()
    y_bytes = vk.to_point().y().__bytes__()
    
    jwk = {
        "kty": "EC",
        "crv": "secp256k1",
        "kid": "key-1",
        "use": "sig",
        "x": b64url(x_bytes),
        "y": b64url(y_bytes),
        "d": b64url(sk.to_string())
    }
    
    print(json.dumps(jwk, indent=2))
    
    # Also output as individual values for easy copy-paste
    print("\n--- Copy these values into did.json and jwks.json ---")
    print(f"x: '{b64url(x_bytes)}'")
    print(f"y: '{b64url(y_bytes)}'")
    print(f"\nPrivate key (keep secure!): {sk.to_string().hex()}")
    
except ImportError:
    print("Error: ecdsa package not installed. Install with:")
    print("  pip install ecdsa")
PYTHON
    
else
    echo "OpenSSL not found or failed"
    exit 1
fi

echo ""
echo "Done! Update .well-known/did.json and .well-known/jwks.json with the values above."
echo "Then deploy these files to https://verifiable.sg/.well-known/"
