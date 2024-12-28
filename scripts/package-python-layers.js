const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageLayer = async (layerName, requirementsFile) => {
  const tempDir = `./temp/${layerName}`;
  const pythonPath = `${tempDir}/python`;
  
  console.log(`Packaging ${layerName}...`);
  
  // Create directories
  execSync(`rm -rf ${tempDir}`);
  fs.mkdirSync(pythonPath, { recursive: true });
  
  // Install requirements
  execSync(`pip install -r ${requirementsFile} -t ${pythonPath}`);
  
  // Create zip file
  execSync(`cd ${tempDir} && zip -r ../${layerName}.zip python/`);
  
  // Upload to S3
  const { DEFAULT_ACCOUNT, DEFAULT_REGION } = process.env;
  execSync(
    `aws s3 cp ./temp/${layerName}.zip \
    s3://hotel-planner-deploy-${DEFAULT_ACCOUNT}-${DEFAULT_REGION}/${layerName}.zip`
  );
};

const packagePythonLayers = async () => {
  // Ensure temp directory exists
  fs.mkdirSync('./temp', { recursive: true });
  
  // Package each layer
  await packageLayer('google-ads-layer', './requirements/google-ads.txt');
  await packageLayer('bing-ads-layer', './requirements/bing-ads.txt');
  await packageLayer('pytz-layer', './requirements/pytz.txt');
  
  // Cleanup
  execSync('rm -rf ./temp');
};

if (require.main === module) {
  packagePythonLayers().catch(console.error);
}

module.exports = { packagePythonLayers };
