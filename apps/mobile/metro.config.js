const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Deliberately NOT widening watchFolders to workspaceRoot: getDefaultConfig
// already watches every workspace package plus the root pnpm store, while the
// root additionally contains .claude/worktrees — whole checkouts that are ~74%
// of the directories here. Metro has no watchman and no native watcher on
// Windows, so it registers one watch per directory and gives up after 240s.

// Resolve modules from workspace root first (needed for pnpm)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
