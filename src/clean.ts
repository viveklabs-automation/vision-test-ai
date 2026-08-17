import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.join(__dirname, '..');
const pathsToClean = [
  path.join(ROOT_DIR, 'data'),
  path.join(ROOT_DIR, 'output'),
  path.join(ROOT_DIR, 'test-results')
];

export function cleanWorkspace() {
  console.log('🧹 Cleaning up generated test session assets...');

  for (const dir of pathsToClean) {
    if (fs.existsSync(dir)) {
      try {
        const children = fs.readdirSync(dir);
        for (const child of children) {
          const childPath = path.join(dir, child);
          fs.rmSync(childPath, { recursive: true, force: true });
        }
        console.log(`✅ Cleaned: ${dir}`);
      } catch (error) {
        console.warn(`⚠️ Warning: Failed to clean ${dir}:`, error);
      }
    }
  }
  console.log('✨ Workspace cleaned successfully!');
}

if (require.main === module) {
  cleanWorkspace();
}

