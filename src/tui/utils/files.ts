import { existsSync, readFileSync, statSync, writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { extname, basename, resolve, join } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

export interface FileAttachment {
  type: 'image' | 'text' | 'pdf' | 'unknown';
  path: string;
  name: string;
  mimeType: string;
  base64?: string;
  text?: string;
  size: number;
}

// Supported image types for Claude API
const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// Text file extensions
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.css', '.scss', '.html', '.xml', '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh', '.fish', '.sql', '.graphql',
  '.env', '.gitignore', '.dockerfile', '.makefile',
  '.csv', '.log', '.conf', '.ini', '.cfg',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB limit
const MAX_TEXT_SIZE = 100 * 1024; // 100KB for text files

/**
 * Extract file paths from input text
 * Handles:
 * - Absolute paths (/path/to/file)
 * - Home-relative paths (~/path/to/file)
 * - Quoted paths ("path with spaces")
 * - Multiple paths on the same line
 */
export function extractFilePaths(input: string): string[] {
  const paths: string[] = [];

  // Match quoted paths first
  const quotedRegex = /["']([^"']+)["']/g;
  let match;
  while ((match = quotedRegex.exec(input)) !== null) {
    const path = match[1];
    if (path && looksLikeFilePath(path)) {
      paths.push(path);
    }
  }

  // Match unquoted paths (starting with / or ~)
  const unquotedRegex = /(?:^|\s)((?:\/|~\/)[^\s"']+)/g;
  while ((match = unquotedRegex.exec(input)) !== null) {
    const path = match[1];
    if (path && !paths.includes(path)) {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Check if a string looks like a file path
 */
function looksLikeFilePath(str: string): boolean {
  // Must start with / or ~/
  if (!str.startsWith('/') && !str.startsWith('~/')) {
    return false;
  }
  // Must have some content after the prefix
  if (str.length < 2) {
    return false;
  }
  // Should have a file extension or be a directory
  return true;
}

/**
 * Resolve a path (handle ~ expansion)
 */
export function resolvePath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return resolve(home, filePath.slice(2));
  }
  return resolve(filePath);
}

/**
 * Determine the type of a file based on extension
 */
export function getFileType(filePath: string): 'image' | 'text' | 'pdf' | 'unknown' {
  const ext = extname(filePath).toLowerCase();

  if (ext in IMAGE_EXTENSIONS) {
    return 'image';
  }
  if (ext === '.pdf') {
    return 'pdf';
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return 'text';
  }

  return 'unknown';
}

/**
 * Get MIME type for a file
 */
export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();

  const imageMime = IMAGE_EXTENSIONS[ext];
  if (imageMime) {
    return imageMime;
  }
  if (ext === '.pdf') {
    return 'application/pdf';
  }

  // Default to text for known text extensions
  if (TEXT_EXTENSIONS.has(ext)) {
    return 'text/plain';
  }

  return 'application/octet-stream';
}

/**
 * Read a file and return attachment info
 */
export function readFileAttachment(filePath: string): FileAttachment | null {
  try {
    const resolved = resolvePath(filePath);

    if (!existsSync(resolved)) {
      return null;
    }

    const stats = statSync(resolved);

    if (!stats.isFile()) {
      return null;
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${basename(resolved)} (${Math.round(stats.size / 1024 / 1024)}MB > 20MB limit)`);
    }

    const type = getFileType(resolved);
    const mimeType = getMimeType(resolved);
    const name = basename(resolved);

    const attachment: FileAttachment = {
      type,
      path: resolved,
      name,
      mimeType,
      size: stats.size,
    };

    if (type === 'image') {
      // Read as base64 for images
      const buffer = readFileSync(resolved);
      attachment.base64 = buffer.toString('base64');
    } else if (type === 'text') {
      // Read as text for text files (with size limit)
      if (stats.size > MAX_TEXT_SIZE) {
        // Read only first part of large text files
        const buffer = readFileSync(resolved);
        attachment.text = buffer.toString('utf-8').slice(0, MAX_TEXT_SIZE) +
          `\n\n[File truncated - showing first ${MAX_TEXT_SIZE / 1024}KB of ${Math.round(stats.size / 1024)}KB]`;
      } else {
        attachment.text = readFileSync(resolved, 'utf-8');
      }
    } else if (type === 'pdf') {
      // Read PDF as base64
      const buffer = readFileSync(resolved);
      attachment.base64 = buffer.toString('base64');
    }

    return attachment;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('File too large')) {
      throw error;
    }
    return null;
  }
}

/**
 * Process input text and extract any file attachments
 * Returns the cleaned text and any file attachments
 */
export function processInputWithFiles(input: string): {
  text: string;
  attachments: FileAttachment[];
  errors: string[];
} {
  const paths = extractFilePaths(input);
  const attachments: FileAttachment[] = [];
  const errors: string[] = [];

  // Process each path
  for (const path of paths) {
    try {
      const attachment = readFileAttachment(path);
      if (attachment) {
        attachments.push(attachment);
      } else {
        // File doesn't exist - might just be text that looks like a path
      }
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error.message);
      }
    }
  }

  // Remove successfully attached file paths from the text
  let cleanedText = input;
  for (const attachment of attachments) {
    // Remove the path from the text (both quoted and unquoted forms)
    cleanedText = cleanedText.replace(`"${attachment.path}"`, '');
    cleanedText = cleanedText.replace(`'${attachment.path}'`, '');
    cleanedText = cleanedText.replace(attachment.path, '');

    // Also try with original path (before resolution)
    const originalPath = paths.find(p => resolvePath(p) === attachment.path);
    if (originalPath && originalPath !== attachment.path) {
      cleanedText = cleanedText.replace(`"${originalPath}"`, '');
      cleanedText = cleanedText.replace(`'${originalPath}'`, '');
      cleanedText = cleanedText.replace(originalPath, '');
    }
  }

  // Clean up extra whitespace
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

  return { text: cleanedText, attachments, errors };
}

/**
 * Format attachment info for display
 */
export function formatAttachmentDisplay(attachment: FileAttachment): string {
  const sizeStr = attachment.size < 1024
    ? `${attachment.size}B`
    : attachment.size < 1024 * 1024
    ? `${Math.round(attachment.size / 1024)}KB`
    : `${(attachment.size / 1024 / 1024).toFixed(1)}MB`;

  const icon = attachment.type === 'image' ? '🖼'
    : attachment.type === 'pdf' ? '📄'
    : attachment.type === 'text' ? '📝'
    : '📎';

  return `${icon} ${attachment.name} (${sizeStr})`;
}

/**
 * Check if clipboard contains an image (macOS only)
 */
export function hasClipboardImage(): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    // Check clipboard for image data using osascript
    const script = `
      tell application "System Events"
        try
          set theClipboard to the clipboard as «class PNGf»
          return "image"
        on error
          try
            set theClipboard to the clipboard as JPEG picture
            return "image"
          on error
            return "none"
          end try
        end try
      end tell
    `;
    const result = execSync(`osascript -e '${script}'`, { encoding: 'utf-8' }).trim();
    return result === 'image';
  } catch {
    return false;
  }
}

/**
 * Read image from clipboard (macOS only)
 * Returns a FileAttachment or null if no image in clipboard
 */
export function readClipboardImage(): FileAttachment | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    // Create temp file for the image
    const tempDir = mkdtempSync(join(tmpdir(), 'craft-clipboard-'));
    const tempFile = join(tempDir, 'clipboard.png');

    // Use osascript to save clipboard image to file
    const script = `
      use framework "AppKit"
      use scripting additions

      set thePasteboard to current application's NSPasteboard's generalPasteboard()
      set theTypes to thePasteboard's types() as list

      if "public.png" is in theTypes or "public.tiff" is in theTypes then
        set imageData to thePasteboard's dataForType:"public.png"
        if imageData is missing value then
          set imageData to thePasteboard's dataForType:"public.tiff"
        end if
        if imageData is not missing value then
          set filePath to POSIX file "${tempFile}"
          imageData's writeToFile:filePath atomically:true
          return "success"
        end if
      end if
      return "no_image"
    `;

    const result = execSync(`osascript -e '${script}'`, { encoding: 'utf-8' }).trim();

    if (result !== 'success' || !existsSync(tempFile)) {
      // Try alternative method with pngpaste if available
      try {
        execSync(`which pngpaste`, { encoding: 'utf-8' });
        execSync(`pngpaste "${tempFile}"`, { encoding: 'utf-8' });
      } catch {
        // pngpaste not available or failed
        return null;
      }
    }

    if (!existsSync(tempFile)) {
      return null;
    }

    const stats = statSync(tempFile);
    const buffer = readFileSync(tempFile);
    const base64 = buffer.toString('base64');

    // Clean up temp file
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }

    return {
      type: 'image',
      path: 'clipboard',
      name: `clipboard-${Date.now()}.png`,
      mimeType: 'image/png',
      base64,
      size: stats.size,
    };
  } catch {
    return null;
  }
}

/**
 * Get clipboard content type
 */
export function getClipboardType(): 'image' | 'text' | 'file' | 'none' {
  if (process.platform !== 'darwin') {
    return 'none';
  }

  try {
    // Check for image first
    if (hasClipboardImage()) {
      return 'image';
    }

    // Check for file paths
    const script = `
      tell application "System Events"
        try
          set theFiles to the clipboard as «class furl»
          return "file"
        on error
          try
            set theText to the clipboard as text
            return "text"
          on error
            return "none"
          end try
        end try
      end tell
    `;
    const result = execSync(`osascript -e '${script}'`, { encoding: 'utf-8' }).trim();
    return result as 'file' | 'text' | 'none';
  } catch {
    return 'none';
  }
}
