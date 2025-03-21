const fs = require('fs');

// Read the existing package.json file
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Remove preinstall script
if (packageJson.scripts && packageJson.scripts.preinstall) {
  delete packageJson.scripts.preinstall;
  console.log('✅ Removed preinstall script from package.json');
}

// Write the updated package.json back to disk
fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2));