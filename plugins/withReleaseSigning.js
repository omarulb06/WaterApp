const { withAppBuildGradle } = require('expo/config-plugins');

const PROPERTIES_LOADER = `def keystorePropertiesFile = rootProject.file("../credentials/keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

`;

const RELEASE_SIGNING_CONFIG = `        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
`;

/**
 * Keeps release signing in android/app/build.gradle across `expo prebuild`.
 * The keystore itself lives in /credentials and is not committed.
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('Release signing plugin expects android/app/build.gradle to be Groovy.');
    }

    let contents = config.modResults.contents;
    if (contents.includes('keystorePropertiesFile')) {
      return config;
    }

    if (!contents.includes('\nandroid {')) {
      throw new Error('Could not find the android block in app/build.gradle.');
    }
    contents = contents.replace('\nandroid {', `\n${PROPERTIES_LOADER}android {`);

    const debugConfig = '    signingConfigs {\n        debug {';
    if (!contents.includes(debugConfig)) {
      throw new Error('Could not find signingConfigs.debug in app/build.gradle.');
    }
    contents = contents.replace(debugConfig, `    signingConfigs {\n${RELEASE_SIGNING_CONFIG}        debug {`);

    const releaseDebugSigning = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;
    const releaseOwnSigning = `        release {
            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug`;
    if (!contents.includes(releaseDebugSigning)) {
      throw new Error('Could not find the release signingConfig in app/build.gradle.');
    }
    contents = contents.replace(releaseDebugSigning, releaseOwnSigning);

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withReleaseSigning;
