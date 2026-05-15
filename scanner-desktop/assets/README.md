# Document Scanner Desktop - Assets

This directory contains the visual assets for the Document Scanner desktop application.

## Required Files

### Icons
- `icon.ico` - Main application icon (256x256, 128x128, 64x64, 32x32, 16x16)
- `icon.png` - PNG version for tray icon (512x512 recommended)

### Creating Icons

1. **Design Requirements:**
   - Document scanner theme (documents, scanner, cloud upload)
   - Clean, professional appearance
   - Compatible with both light and dark themes
   - Blue color scheme (#667eea) to match the application

2. **Technical Specifications:**
   - ICO file: Multiple sizes (16x16, 32x32, 48x48, 64x64, 128x128, 256x256)
   - PNG file: High resolution (512x512 or higher)
   - Transparent background preferred

3. **Tools:**
   - Adobe Illustrator/Photoshop
   - GIMP (free)
   - Online icon generators
   - ConvertICO.com for ICO conversion

4. **Quick Creation Steps:**
   - Create a simple document icon with scanner/cloud elements
   - Use blue color palette
   - Export as PNG first, then convert to ICO
   - Test on different backgrounds

### Installation

Place the icon files in this `assets/` directory before building the application.

The build process will automatically include these icons in the installer and executable.

## Placeholder Files

Until proper icons are created, placeholder files have been added to prevent build errors. Replace these with professional icons before production release.

### Online Tools for Icon Creation:
- https://favicon.io/favicon-converter/
- https://www.icoconverter.com/
- https://icon-icons.com/icon/document-scanner/123456