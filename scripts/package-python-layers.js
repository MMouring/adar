const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const {
  DEFAULT_REGION,
  DEFAULT_ACCOUNT,
} = process.env;

// Configure AWS SDK v3
const s3Client = new S3Client({ 
  region: DEFAULT_REGION
});

const bucketName = 'hotel-planner-deploy-' + DEFAULT_ACCOUNT + '-' + DEFAULT_REGION;

async function uploadToS3(filePath, s3Key) {
  console.log(`Uploading ${filePath} to S3 as ${s3Key}...`);
  const fileContent = await fs.readFile(filePath);
  
  const uploadParams = {
    Bucket: bucketName,
    Key: s3Key,
    Body: fileContent
  };

  try {
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    console.log(`Successfully uploaded ${s3Key} to S3`);
  } catch (err) {
    console.error(`Error uploading to S3: ${err}`);
    throw err;
  }
}

async function packagePythonLayers() {
  const requirementsDir = 'requirements';
  const files = await fs.readdir(requirementsDir);
  const requirementsFiles = files.filter(file => file.endsWith('.txt'));

  for (const reqFile of requirementsFiles) {
    const layerName = path.basename(reqFile, '.txt');
    const workDir = `python-layers/${layerName}`;
    const pythonPath = `${workDir}/python/lib/python3.12/site-packages`;

    await exec(`rm -rf ${workDir}`);
    await exec(`mkdir -p ${pythonPath}`);

    console.log(`Installing requirements for ${layerName}...`);
    await exec(
      `pip3 install -r ${requirementsDir}/${reqFile} -t ${pythonPath}`
    );

    console.log(`Creating zip for ${layerName}...`);
    const zipFile = `${layerName}-layer.zip`;
    await exec(
      `cd ${workDir} && zip -r ../../${zipFile} python/`,
      { maxBuffer: 1024 * 1024 * 10 }
    );
    
    console.log(`Successfully packaged ${layerName} layer`);
    
    const s3Key = `${zipFile}`;
    await uploadToS3(zipFile, s3Key);
  }
}

module.exports = { packagePythonLayers };
