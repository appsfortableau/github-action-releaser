# Releaser

This Github action created by Infotopics | Apps for tableau creates or updates releases and their tag if necessary.

## Inputs

#### `tag_name`

**Required** Gives a tag name.

#### `draft`

Creates a draft release. Defaults to `false`.

#### `prerelease`

Identify the release as a prerelease. Defaults to `false`.

#### `recreate`

Instead of updating, remove it and create a entire new release (forces to draft=`true`). Defaults to `false`.

#### `move_tag`

Move the tag from anywhere to the current commit. Should be true for nightly/alpha/dev builds. Defaults to `false`.

#### `files`

Newline-delimited list of path globs for asset files to upload.

#### `token`

Authorized secret GitHub Personal Access Token. Defaults to `github.token`.

#### `target_commitish`

Commitish value that determines where the Git tag is created from. Can be any branch or commit SHA.
> Other than SHA not supported while updating.

## Outputs

#### `id`

Release ID.

#### `url`

URL to the Release HTML Page.

#### `assets`

JSON array containing information about each uploaded asset, in the format given [here](https://docs.github.com/en/rest/reference/repos#upload-a-release-asset--code-samples).

## Example usage

uses: appsfortableau/github-action-releaser
with:
tag_name: '1.6-dev'

## Scenario's covert

There are some scenario's in case we want to update, createor upload files to a release.

### Stable releases

In case there is a `draft` for a version `1.6.2` and it is going to be released.
Sometime on release we update for example the `package.json` with the latest version and date. This change will be committed and we need to **move** the tag to current commit hash.

### Nightly/latest

When developing new version you want to test some features in a certain version scope.
