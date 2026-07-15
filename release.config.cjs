const overrideReleaseType = () => ({
    analyzeCommits(_, { type }) {
        const override = process.env.RELEASE_TYPE;
        if (override && override !== 'auto' && ['major', 'minor', 'patch'].includes(override)) {
            return override;
        }
        return type;
    },
});

module.exports = {
    branches: ['main'],
    tagFormat: '${version}',
    plugins: [
        overrideReleaseType,
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
        ['@semantic-release/npm', { npmPublish: true }],
        [
            '@semantic-release/github',
            {
                assets: [{ path: 'dist/**', label: 'Build output' }],
            },
        ],
        [
            '@semantic-release/git',
            {
                assets: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
                message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
        ],
    ],
};
