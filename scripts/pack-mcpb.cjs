#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'skosmos-mcp.mcpb');
const mcpbDir = path.join(__dirname, '..', 'mcpb');

try {
  // Remove existing .mcpb file
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  // Use system zip command to create archive from within mcpb directory
  // This ensures files are at the root of the archive, not under mcpb/
  execSync(`cd "${mcpbDir}" && zip -r "${outputPath}" .`, { stdio: 'inherit' });
  
  const stats = fs.statSync(outputPath);
  console.log(`✓ Created ${outputPath} (${stats.size} bytes)`);
  process.exit(0);
} catch (err) {
  console.error('Error creating .mcpb archive:', err.message);
  process.exit(1);
}
