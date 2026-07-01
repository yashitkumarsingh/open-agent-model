# Release Process

OpenAgentModel currently uses a manual release process. Automated package publishing is intentionally not enabled yet.

## Manual Checklist

1. Confirm the working tree is clean.
2. Run `nvm use`.
3. Run `npm install`.
4. Run `npm run precommit`.
5. Update `CHANGELOG.md`.
6. Bump `package.json` and `package-lock.json` together.
7. Commit with a release-oriented message.
8. Tag the release:

```bash
git tag vX.Y.Z
git push origin main --tags
```

9. Publish only after confirming the package contents:

```bash
npm pack --dry-run
npm publish
```

## Future Automation

A future GitHub Actions workflow should build, test, validate examples, produce release notes from `CHANGELOG.md`, and publish only from signed version tags.
