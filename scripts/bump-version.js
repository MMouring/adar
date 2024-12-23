const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function bumpVersion(bumpType) {
    // Read package.json
    const packagePath = path.join(process.cwd(), 'package.json');
    const pkg = require(packagePath);
    const [major, minor, patch] = pkg.version.split('.').map(Number);

    // Calculate new version
    let newVersion;
    switch(bumpType) {
        case 'major':
            newVersion = `${major + 1}.0.0`;
            break;
        case 'minor':
            newVersion = `${major}.${minor + 1}.0`;
            break;
        case 'patch':
            newVersion = `${major}.${minor}.${patch + 1}`;
            break;
        default:
            throw new Error(`Invalid bump type: ${bumpType}`);
    }

    // Update package.json
    pkg.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

    // Create git commit and tag
    execSync(`git add package.json`);
    execSync(`git commit -m "chore(release): ${newVersion} [skip ci]"`);
    execSync(`git tag -a v${newVersion} -m "Release ${newVersion}"`);
    
    // Update release.txt with new version
    const releaseNotesPath = path.join(process.cwd(), 'release.txt');
    let releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8');
    releaseNotes = releaseNotes.replace(/v\{version\}/, `v${newVersion}`);
    fs.writeFileSync(releaseNotesPath, releaseNotes);

    // Add all changes to git
    execSync('git add package.json release.txt');
    
    // Push changes and tags to remote
    execSync('git push');
    execSync('git push --tags');

    return newVersion;
}

const bumpType = process.argv[2];
if (!bumpType) {
    console.error('Please specify bump type: major, minor, or patch');
    process.exit(1);
}

try {
    const newVersion = bumpVersion(bumpType);
    console.log(`Version bumped to ${newVersion}`);
} catch (error) {
    console.error('Error bumping version:', error);
    process.exit(1);
}
