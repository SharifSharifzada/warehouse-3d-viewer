const fs = require('fs');
const path = require('path');

const glbPath = process.argv[2] || './sadarak-id.glb';

if (!fs.existsSync(glbPath)) {
  console.error(`❌ File not found: ${glbPath}`);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(glbPath);
const base64String = fileBuffer.toString('base64');

const outputPath = './sadarak-id.base64.txt';
fs.writeFileSync(outputPath, base64String);

console.log(`✅ Converted: ${glbPath}`);
console.log(`📝 Base64 file: ${outputPath}`);
console.log(`📊 Original size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`📦 Base64 size: ${(base64String.length / 1024 / 1024).toFixed(2)} MB`);
