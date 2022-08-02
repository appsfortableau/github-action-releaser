# Releaser

This Github action created by Infotopics | Apps for tableau creates or updates releases and their tag if necessary.

## Usage

## Scenario's covert

There are some scenario's in case we want to update, createor upload files to a release.

### Stable releases

In case there is a `draft` for a version `1.6.2` and it is going to be released.
Sometime on release we update for example the `package.json` with the latest version and date. This change will be committed and we need to **move** the tag to current commit hash.

### Nightly/latest 

When developing new version you want to test some features in a certain version scope.
