import fs from 'fs';
import path from 'path';

// This is a placeholder script. In a real environment with image processing libraries
// like 'sharp', we would resize the logo.
// Here we are just copying the file to the target names to satisfy the PWA manifest.

const logoPath = './pioneer-logo.png';
const targets = ['./icon-192.png', './icon-512.png'];

if (fs.existsSync(logoPath)) {
  targets.forEach(target => {
    fs.copyFileSync(logoPath, target);
    console.log(`Created ${target} from ${logoPath}`);
  });
} else {
  console.error('Logo file pioneer-logo.png not found');
}
