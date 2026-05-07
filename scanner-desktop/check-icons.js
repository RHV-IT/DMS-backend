const path = require('path');

// Create icon placeholders for development
const fs = require('fs');

// Check if icon exists, if not create placeholder message
const iconPath = path.join(__dirname, 'assets', 'icon.ico');
const pngPath = path.join(__dirname, 'assets', 'icon.png');

if (!fs.existsSync(iconPath)) {
  console.log('⚠️  Icon files missing!');
  console.log('Please create the following icon files in assets/ directory:');
  console.log('- icon.ico (multiple sizes: 256x256, 48x48, 32x32, 16x16)');
  console.log('- icon.png (512x512 recommended)');
  console.log('- tray-icon.png (16x16 or 32x32)');
  console.log('');
  console.log('You can use online tools like:');
  console.log('- https://favicon.io/favicon-converter/');
  console.log('- https://www.icoconverter.com/');
  console.log('- Or create with GIMP/Photoshop');
}

// For development, we'll use Electron's default icon
console.log('🚀 Starting RHV DMS Scanner Desktop...');