const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

async function packagePythonLayers() {
  const requirementsDir = 'requirements';
  
  // Get all .txt files from requirements directory
  const files = await fs.readdir(requirementsDir);
  const requirementsFiles = files.filter(file => file.endsWith('.txt'));
  
  for (const reqFile of requirementsFiles) {
    const layerName = path.basename(reqFile, '.txt');
    const workDir = `python-layers/${layerName}`;
    
    // Create working directory structure
    await exec(`rm -rf ${workDir}`);
    await exec(`mkdir -p ${workDir}/python`);
    
    // Install requirements to python directory
    console.log(`Installing requirements for ${layerName}...`);
    await exec(
      `pip install -r ${requirementsDir}/${reqFile} -t ${workDir}/python`
    );
    
    // Create zip file
    console.log(`Creating zip for ${layerName}...`);
    await exec(
      `cd ${workDir} && zip -r ../../${layerName}-layer.zip python/`,
      { maxBuffer: 1024 * 1024 * 10 } // Increase buffer to 10MB
    );
    
    console.log(`Successfully packaged ${layerName} layer`);
  }
}

module.exports = { packagePythonLayers };
