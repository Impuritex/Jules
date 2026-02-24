const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const FILES_TO_CHECK = [
  'main.js',
  'package.json'
];

function calculateHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

const integrityData = {};

try {
  FILES_TO_CHECK.forEach(file => {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
      integrityData[file] = calculateHash(fullPath);
      console.log(`Hash calculated for ${file}`);
    } else {
      console.warn(`Warning: File ${file} not found.`);
    }
  });

  const outputPath = path.join(__dirname, '..', 'integrity.json');
  fs.writeFileSync(outputPath, JSON.stringify(integrityData, null, 2));
  console.log(`Integrity file generated at ${outputPath}`);
} catch (err) {
  console.error('Error generating integrity file:', err);
  process.exit(1);
}
