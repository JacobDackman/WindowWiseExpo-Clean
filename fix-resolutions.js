const fs = require('fs');

// Read the existing package.json file
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Update resolutions without carets
packageJson.resolutions = {
  "glob": "10.0.0",
  "rimraf": "4.0.0",
  "@xmldom/xmldom": "0.8.10",
  "inflight": "2.0.0",
  "sudo-prompt": "9.2.0"
};

// Write the updated package.json back to disk
fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2));

console.log('✅ Updated resolution overrides in package.json (removed carets)');