# Code Signing Certificates

This directory should contain the code signing certificate for Windows builds.

## Required Files

- `code-signing.p12` - PKCS#12 certificate file (.p12 or .pfx)
- `certificate-password.txt` - Plain text file containing the certificate password (for CI/CD)

## Certificate Requirements

### For Production Signing:
1. **EV Code Signing Certificate** (recommended for best SmartScreen reputation)
   - Extended Validation certificate
   - Issued by trusted CA (DigiCert, GlobalSign, etc.)
   - Hardware token required (USB token)

2. **Standard Code Signing Certificate** (alternative)
   - Organization Validation certificate
   - Cheaper than EV but less trusted by SmartScreen

### Certificate Setup:

1. **Obtain Certificate:**
   - Purchase from certificate authority
   - Complete organization validation
   - Export as .p12 file with private key

2. **Environment Variables:**
   - Set `CSC_LINK` to certificate file path
   - Set `CSC_KEY_PASSWORD` to certificate password

3. **Build Process:**
   - Certificate automatically applied during electron-builder
   - Signed executable will show as "Trusted" in SmartScreen

## Security Notes

- Never commit certificate files to version control
- Store certificate password securely (environment variables, CI secrets)
- Use hardware tokens for EV certificates
- Rotate certificates annually

## Testing

After signing, test on clean Windows VM to verify SmartScreen acceptance.