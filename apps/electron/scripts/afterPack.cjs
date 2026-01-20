/**
 * electron-builder afterPack hook
 *
 * Compiles the macOS 26+ Liquid Glass icon using actool and injects
 * Assets.car into the app bundle. This enables the new layered icon
 * format with glass effects on macOS Tahoe and later.
 *
 * For older macOS versions, the app falls back to icon.icns which is
 * included separately by electron-builder.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function afterPack(context) {
  // Only process macOS builds
  if (context.electronPlatformName !== 'darwin') {
    console.log('Skipping Liquid Glass icon compilation (not macOS)');
    return;
  }

  // Skip in CI - macOS 26 SDK not available on current GitHub Actions runners
  if (process.env.CI) {
    console.log('Skipping Liquid Glass icon compilation (CI environment - macOS 26 SDK not available)');
    return;
  }

  const appPath = context.appOutDir;
  const resourcesDir = path.join(appPath, 'Craft Agent.app', 'Contents', 'Resources');
  const iconSourceDir = path.join(context.packager.projectDir, 'resources', 'icon.icon');

  // Check if icon.icon bundle exists
  if (!fs.existsSync(iconSourceDir)) {
    console.log('Warning: icon.icon bundle not found, skipping Liquid Glass compilation');
    return;
  }

  console.log('Compiling Liquid Glass icon for macOS 26+...');

  // Create a temporary directory for actool output
  const tempDir = path.join(context.packager.projectDir, '.icon-build-temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Compile icon.icon to Assets.car using actool
    // The --app-icon flag specifies the icon name (matches CFBundleIconName in Info.plist)
    // --minimum-deployment-target 26.0 enables Liquid Glass features
    // --platform macosx targets macOS
    const actoolCmd = [
      'xcrun actool',
      `"${iconSourceDir}"`,
      `--compile "${tempDir}"`,
      '--app-icon AppIcon',
      '--minimum-deployment-target 26.0',
      '--platform macosx',
      '--output-partial-info-plist /dev/null'
    ].join(' ');

    console.log('Running actool...');
    execSync(actoolCmd, { stdio: 'inherit', timeout: 30000 }); // 30 second timeout

    // Check if Assets.car was created
    const assetsCar = path.join(tempDir, 'Assets.car');
    if (!fs.existsSync(assetsCar)) {
      console.log('Warning: actool did not produce Assets.car, Liquid Glass icon not available');
      return;
    }

    // Copy Assets.car to the app's Resources directory
    const destAssetsCar = path.join(resourcesDir, 'Assets.car');
    fs.copyFileSync(assetsCar, destAssetsCar);
    console.log(`Liquid Glass icon compiled: ${destAssetsCar}`);

  } catch (error) {
    // Don't fail the build if actool fails - the app will fall back to icon.icns
    console.log('Warning: Failed to compile Liquid Glass icon:', error.message);
    console.log('The app will use the fallback icon.icns on all macOS versions');
  } finally {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
};
