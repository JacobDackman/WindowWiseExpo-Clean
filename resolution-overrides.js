// resolution-overrides.js
const fs = require('fs');

// Read the existing package.json file
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Initialize resolutions object if it doesn't exist
if (!packageJson.resolutions) {
  packageJson.resolutions = {};
}

// Add resolution overrides for the deprecated dependencies
Object.assign(packageJson.resolutions, {
  "glob": "^10.0.0",
  "rimraf": "^4.0.0",
  "@xmldom/xmldom": "^0.8.10",
  "inflight": "^2.0.0",
  "sudo-prompt": "^9.2.0"
});

// Add preinstall script if it doesn't exist
if (!packageJson.scripts) {
  packageJson.scripts = {};
}

if (!packageJson.scripts.preinstall) {
  packageJson.scripts.preinstall = "npx npm-force-resolutions";
}

// Write the updated package.json back to disk
fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2));

console.log('✅ Added resolution overrides to package.json');
console.log('📋 The following dependencies will be forced to newer versions:');
console.log('   - glob: ^10.0.0');
console.log('   - rimraf: ^4.0.0');
console.log('   - @xmldom/xmldom: ^0.8.10');
console.log('   - inflight: ^2.0.0');
console.log('   - sudo-prompt: ^9.2.0');