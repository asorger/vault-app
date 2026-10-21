const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Error: Version argument is required. Usage: node update-version.cjs <version>');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');

// 1. Update package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`Updated package.json -> ${version}`);

// 2. Update src-tauri/tauri.conf.json
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = version;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
console.log(`Updated src-tauri/tauri.conf.json -> ${version}`);

// 3. Update src-tauri/Cargo.toml [package] version
const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');
const versionRegex = /^version\s*=\s*"[^"]+"/m;
if (!versionRegex.test(cargo)) {
  console.error('Error: Could not find version in Cargo.toml');
  process.exit(1);
}
cargo = cargo.replace(versionRegex, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo, 'utf8');
console.log(`Updated src-tauri/Cargo.toml -> ${version}`);

