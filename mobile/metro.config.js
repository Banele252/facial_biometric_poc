// mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add alias for '@' to point to './src'
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    '@': `${__dirname}/src`,
};

module.exports = config;