const fs = require('fs');

// Read the existing package.json file
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Add postinstall script
if (!packageJson.scripts) {
  packageJson.scripts = {};
}

packageJson.scripts.postinstall = "patch-package";

// Write the updated package.json back to disk
fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2));

console.log('✅ Added postinstall script to package.json');