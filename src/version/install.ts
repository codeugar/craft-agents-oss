import { exists, mkdir, chmod, symlink, unlink, lstat } from "fs/promises";
import { PassThrough, pipeline } from "stream";
import { promisify } from "util";
import { getLatestVersion, getManifest } from "./manifest";
import { createHash } from "crypto";
import { homedir } from "os";
import { join } from "path";
import * as tar from "tar";

const pipelineAsync = promisify(pipeline);

export async function downloadArchive(params: { url: string, sha256: string }): Promise<ArrayBuffer | null> {
  const { url, sha256 } = params;
  const response = await fetch(url);
  console.log(`Fetching archive from: ${url}`);
  const data = await response.arrayBuffer();
  const buffer = Buffer.from(data);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hash !== sha256) {
    console.error(`Checksum mismatch: ${hash} !== ${sha256}`);
    console.error('Checksum mismatch');
    return null;
  }
  return data;
}

export async function ensureDirectory(path: string): Promise<void> {
  if (!await exists(path)) {
    await mkdir(path, { recursive: true });
  }
}

async function extractArchive(params: { archiveData: ArrayBuffer, destination: string }): Promise<void> {
  const { archiveData, destination } = params;
  const buffer = Buffer.from(archiveData);
  const stream = new PassThrough();
  stream.end(buffer);
  
  await pipelineAsync(
    stream,
    tar.x({ C: destination, gzip: true })
  );
}

export async function installArchive(params: { archiveData: ArrayBuffer, version: string }): Promise<void> {
  const { archiveData, version } = params;
  const versionDirectory = join(homedir(), '.local', 'share', 'craft', 'versions', version);
  const binaryPath = join(versionDirectory, 'craft');
  const symlinkDirectory = join(homedir(), '.local', 'bin');
  const symlinkPath = join(symlinkDirectory, 'craft');

  await ensureDirectory(versionDirectory);
  await ensureDirectory(symlinkDirectory);

  await extractArchive({ archiveData, destination: versionDirectory });
  await chmod(binaryPath, '755');
  // Use lstat to check if symlink exists (even if broken/pointing to nothing)
  try {
    await lstat(symlinkPath);
    await unlink(symlinkPath);
  } catch {
    // Symlink doesn't exist, that's fine
  }
  await symlink(binaryPath, symlinkPath);
}

export async function install(version: string | null): Promise<VersionInstallResult> {
  if (version === 'latest' || version == null) {
    version = await getLatestVersion();
  }
  if (version == null) {
    console.error('Failed to get the latest version');
    return { success: false, error: 'Failed to get the latest version' };
  }
  console.log(`Installing version: ${version}`);

  const manifest = await getManifest(version);
  if (manifest == null) {
    console.error('Failed to get the manifest');
    return { success: false, error: 'Failed to get the manifest' };
  }

  const platform = `${process.platform}-${process.arch}`;
  const binary = manifest.binaries[platform];
  if (binary == null) {
    console.error(`No binary found for platform: ${platform}`);
    return { success: false, error: `No binary found for platform: ${platform}` };
  }
  const binaryUrl = binary.url;
  const binarySha256 = binary.sha256;
  console.log(`Binary URL: ${binaryUrl}`);
  console.log(`Binary SHA256: ${binarySha256}`);
  console.log(`Binary size: ${binary.size}`);

  const archiveData = await downloadArchive({ url: binaryUrl, sha256: binarySha256 });
  if (archiveData == null) {
    console.error('Failed to download binary');
    return { success: false, error: 'Failed to download binary' };
  }
  await installArchive({ archiveData, version });

  return { success: true };
}

type VersionInstallResult = {
  success: true;
} | {
  success: false;
  error: string;
};