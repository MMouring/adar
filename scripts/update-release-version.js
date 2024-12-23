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
    
    // Create a version bump branch
    const branchName = `version-bump-${newVersion}`;
    
    try {
        // Try to create new branch
        execSync(`git checkout -b ${branchName}`);
    } catch (branchError) {
        // If branch exists, sync with remote
        console.log(`Branch ${branchName} already exists, syncing with remote...`);
        execSync(`git fetch origin ${branchName}`);
        execSync(`git checkout ${branchName}`);
        execSync(`git reset --hard origin/${branchName}`);
    }
    
    // Force push branch (since we're sure about our changes)
    execSync(`git push -f --set-upstream origin ${branchName}`);
    
    // Create pull request and wait for it to be available
    try {
        // Verify GitHub CLI auth status
        try {
            execSync('gh auth status', { stdio: 'inherit' });
        } catch (authError) {
            console.error('GitHub CLI authentication failed:', authError);
            throw new Error('GitHub CLI is not properly authenticated');
        }

        // Create the PR with explicit auth and debug output
        const prCommand = `gh pr create --title "chore: Bump version to ${newVersion}" --body "Automated version bump to ${newVersion}" --base stage`;
        try {
            execSync(prCommand, { 
                env: { ...process.env },
                stdio: 'inherit'
            });
            console.log(`Pull request created for version ${newVersion}`);
        } catch (prError) {
            console.error('Failed to create PR:', prError);
            // Try to get more detailed error information
            execSync('gh pr list --state open', { stdio: 'inherit' });
            throw prError;
        }

        // Poll for PR and merge it
        console.log('Waiting for PR to be available...');
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            try {
                // Wait a bit before checking
                execSync('sleep 3');
                
                // Get the PR number
                const prOutput = execSync('gh pr list --state open --base stage --json number --jq ".[0].number"').toString().trim();
                
                if (prOutput) {
                    console.log(`Found PR #${prOutput}, merging...`);
                    execSync(`gh pr merge ${prOutput} --merge --delete-branch`);
                    console.log('PR merged successfully');
                    break;
                }
            } catch (pollError) {
                attempts++;
                if (attempts === maxAttempts) {
                    console.log('Failed to find and merge PR after maximum attempts');
                    throw pollError;
                }
            }
        }
    } catch (error) {
        console.log(`Branch pushed to origin/${branchName}. Error: ${error.message}`);
        throw error;
    }

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
