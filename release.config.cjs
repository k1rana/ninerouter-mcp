module.exports = {
    branches: ['main', { name: '+([0-9]).x-dev', channel: 'beta', prerelease: 'beta' }],
    tagFormat: '${version}',
    plugins: [
        {
            analyzeCommits(_, { type }) {
                const override = process.env.RELEASE_TYPE;
                if (
                    override &&
                    override !== 'auto' &&
                    ['major', 'minor', 'patch'].includes(override)
                ) {
                    return override;
                }
                return type;
            },
        },
        '@semantic-release/commit-analyzer',
        [
            '@semantic-release/release-notes-generator',
            {
                preset: 'conventionalcommits',
                writerOpts: {
                    groupBy: 'type',
                    commitGroupsSort: ['feat', 'fix', 'perf', 'docs', 'revert'],
                    groups: [
                        { type: 'feat', title: 'Features' },
                        { type: 'fix', title: 'Fixes' },
                        { type: 'perf', title: 'Improvements' },
                        { type: 'docs', title: 'Docs' },
                        { type: 'revert', title: 'Reverts' },
                    ],
                },
            },
        ],
        {
            verifyRelease(_, { branch }) {
                if (branch.channel && branch.channel !== 'latest' && branch.type === 'major') {
                    throw new Error(
                        `Branch ${branch.name} (channel ${branch.channel}) cannot publish a major release. Cut majors from main.`,
                    );
                }
            },
        },
        [
            '@semantic-release/exec',
            {
                prepareCmd:
                    'npm run build && tar --exclude=node_modules --exclude=.git -czf ninerouter-mcp-${nextRelease.version}.tar.gz dist package.json package-lock.json README.md LICENSE',
            },
        ],
        [
            '@semantic-release/npm',
            {
                npmPublish: true,
                npmDistTag: ({ branch }) =>
                    branch.channel && branch.channel !== 'latest' ? branch.channel : 'latest',
            },
        ],
        [
            '@semantic-release/github',
            {
                assets: ['ninerouter-mcp-*.tar.gz'],
            },
        ],
        [
            '@semantic-release/git',
            {
                assets: ['package.json', 'package-lock.json'],
                message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
        ],
    ],
};
