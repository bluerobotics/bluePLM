/**
 * Icon Generator Script for BluePLM
 * Generates .ico (Windows), .icns (Mac), and .png (Linux) icons from SVG
 * 
 * Prerequisites:
 *   npm install sharp png-to-ico --save-dev
 * 
 * Usage:
 *   node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  // Dynamic imports for ESM modules
  const sharp = (await import('sharp')).default;
  
  const assetsDir = path.join(__dirname, '..', 'assets');
  const svgPath = path.join(assetsDir, 'icon.svg');
  
  if (!fs.existsSync(svgPath)) {
    console.error('Error: icon.svg not found in assets folder');
    process.exit(1);
  }
  
  const svgBuffer = fs.readFileSync(svgPath);
  
  // Windows ICO needs multiple sizes embedded
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  // Mac ICNS needs these sizes
  const icnsSizes = [16, 32, 64, 128, 256, 512, 1024];
  // Linux AppImage uses 512
  const linuxSize = 512;
  
  console.log('Generating PNG files...');
  
  // Generate PNGs for ICO
  const pngBuffers = [];
  for (const size of icoSizes) {
    const pngBuffer = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push(pngBuffer);
    
    // Also save individual PNGs for debugging/other uses
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(assetsDir, `icon-${size}.png`));
    console.log(`  Created icon-${size}.png`);
  }
  
  // Generate 512px PNG for Linux
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('  Created icon.png (512x512 for Linux)');
  
  // Generate ICO for Windows
  console.log('\nGenerating Windows ICO...');
  try {
    const pngToIco = (await import('png-to-ico')).default;
    // Use the 256px PNG for the ICO
    const png256Path = path.join(assetsDir, 'icon-256.png');
    const icoBuffer = await pngToIco([png256Path]);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
    console.log('  Created icon.ico');
  } catch (err) {
    console.error('  Warning: Could not create ICO:', err.message);
    console.log('  You can manually convert icon-256.png to icon.ico using online tools');
  }
  
  // For ICNS (Mac), we need to create an iconset folder structure
  // This is typically done with Apple's iconutil command on macOS
  console.log('\nGenerating Mac ICNS preparation...');
  const iconsetDir = path.join(assetsDir, 'icon.iconset');
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir);
  }
  
  // Generate iconset PNGs with Apple naming convention
  const iconsetSizes = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' },
  ];
  
  for (const { size, name } of iconsetSizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetDir, name));
  }
  console.log('  Created icon.iconset/ folder');
  console.log('  On macOS, run: iconutil -c icns assets/icon.iconset -o assets/icon.icns');
  
  // Try to generate ICNS using png2icns if on mac or if we have the tool
  try {
    const { execSync } = require('child_process');
    // Check if we're on macOS
    if (process.platform === 'darwin') {
      execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(assetsDir, 'icon.icns')}"`, { stdio: 'inherit' });
      console.log('  Created icon.icns');
    } else {
      console.log('  Note: ICNS generation requires macOS. The iconset folder is ready for conversion.');
    }
  } catch (err) {
    console.log('  Note: Could not auto-generate ICNS. Iconset folder ready for manual conversion.');
  }
  
  console.log('\n✅ Icon generation complete!');
  console.log('\nGenerated files:');
  console.log('  - icon.svg (source)');
  console.log('  - icon.png (512px for Linux)');
  console.log('  - icon.ico (Windows)');
  console.log('  - icon.iconset/ (for macOS ICNS)');
  console.log('  - icon-{16,24,32,48,64,128,256}.png (various sizes)');
}

generateIcons().catch(console.error);

