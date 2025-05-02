// client/download.js
require('dotenv').config();
const { getSolidDataset, getContainedResourceUrlAll, getFile } = require('@inrupt/solid-client');
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_CONTAINER = process.env.CLIENT_DATASET_URL || '';

/**
 * Downloads all .csv files from your Pod dataset folder.
 * If CLIENT_DATASET_URL is set in .env, we use that; otherwise prompt.
 */
async function downloadTrainingData(session) {
  let containerUrl = DEFAULT_CONTAINER;
  if (containerUrl) {
    console.log(`🔽 Using dataset container from .env: ${containerUrl}`);
  } else {
    // fallback to prompting
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    containerUrl = await new Promise(res => rl.question('Enter Pod data container URL:\n> ', res));
    rl.close();
    if (!containerUrl) {
      console.log('No container URL provided.');
      return;
    }
  }

  console.log(`\n↓ Fetching container: ${containerUrl}`);
  let ds;
  try {
    ds = await getSolidDataset(containerUrl, { fetch: session.fetch });
  } catch (e) {
    console.error(`❌ Failed to fetch container: ${e.message}`);
    return;
  }

  const allUrls = getContainedResourceUrlAll(ds);
  const csvUrls = allUrls.filter(u => u.toLowerCase().endsWith('.csv'));
  if (csvUrls.length === 0) {
    console.log('⚠️  No .csv files found in that container.');
    return;
  }

  const localDir = path.join(process.cwd(), 'dataset');
  await fs.mkdir(localDir, { recursive: true });

  for (const fileUrl of csvUrls) {
    const fname = path.basename(fileUrl);
    const dest = path.join(localDir, fname);
    console.log(`↓ Downloading ${fname} → ${dest}`);
    const file = await getFile(fileUrl, { fetch: session.fetch });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buffer);
  }
  console.log(`✅ Downloaded ${csvUrls.length} file(s) into ${localDir}`);
}

/**
 * Downloads a single file from a Solid Pod URL to a local path
 */
async function downloadFile(session, fileUrl, localPath) {
  try {
    console.log(`↓ Downloading ${fileUrl} → ${localPath}`);
    const file = await getFile(fileUrl, { fetch: session.fetch });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(localPath, buffer);
    console.log(`✅ Downloaded ${path.basename(fileUrl)}`);
    return true;
  } catch (e) {
    console.error(`❌ Failed to download ${fileUrl}: ${e.message}`);
    return false;
  }
}

module.exports = { downloadTrainingData, downloadFile };