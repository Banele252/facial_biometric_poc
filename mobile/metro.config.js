// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Alias '@' to './src' for Metro resolution
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    '@': `${__dirname}/src`,
};

module.exports = config;