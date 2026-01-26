import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

const BUCKET = 'agents-craft-do';

if (!process.env.S3_VERSIONS_BUCKET_ENDPOINT || !process.env.S3_VERSIONS_BUCKET_ACCESS_KEY_ID || !process.env.S3_VERSIONS_BUCKET_SECRET_ACCESS_KEY) {
  console.error('Missing R2 credentials. Set S3_VERSIONS_BUCKET_ENDPOINT, S3_VERSIONS_BUCKET_ACCESS_KEY_ID, S3_VERSIONS_BUCKET_SECRET_ACCESS_KEY');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_VERSIONS_BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_VERSIONS_BUCKET_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_VERSIONS_BUCKET_SECRET_ACCESS_KEY,
  },
});

const manifestContent = readFileSync('/tmp/craft-0.2.26/manifest.json', 'utf-8');

async function upload() {
  // Upload to versioned path
  console.log('Uploading electron/0.2.26/manifest.json...');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: 'electron/0.2.26/manifest.json',
    Body: manifestContent,
    ContentType: 'application/json',
    CacheControl: 'no-cache, no-store, must-revalidate',
  }));
  console.log('  ✓ electron/0.2.26/manifest.json');

  // Upload to latest
  console.log('Uploading electron/latest/manifest.json...');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: 'electron/latest/manifest.json',
    Body: manifestContent,
    ContentType: 'application/json',
    CacheControl: 'no-cache, no-store, must-revalidate',
  }));
  console.log('  ✓ electron/latest/manifest.json');

  console.log('Done!');
}

upload().catch(err => {
  console.error('Upload failed:', err);
  process.exit(1);
});
