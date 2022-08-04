# Releaser

This Github action created by Infotopics | Apps for tableau creates or updates releases and their tag if necessary.

## Inputs

**`tag_name`**  
**Required** Gives a tag name.

**`draft`**  
Creates a draft release. Defaults to `false`.

**`prerelease`**  
Identify the release as a prerelease. Defaults to `false`.

**`recreate`**  
Instead of updating, remove it and create a entire new release (forces to draft=`true`). Defaults to `false`.

**`move_tag`**  
Move the tag from anywhere to the current commit. Should be true for nightly/alpha/dev builds. Defaults to `false`.

**`files`**  
Newline-delimited list of path globs for asset files to upload.

**`token`**  
Authorized secret GitHub Personal Access Token. Defaults to `github.token`.

**`target_commitish`**  
Commitish value that determines where the Git tag is created from. Can be any branch or commit SHA.

> Other than SHA not supported while updating.

## Outputs

**`id`**  
Release ID.

**`url`**  
URL to the Release HTML Page.

**`assets`**  
JSON array containing information about each uploaded asset, in the format given [here](https://docs.github.com/en/rest/reference/repos#upload-a-release-asset--code-samples).

## Example usage

There are some scenario's we want to cover. See down below.  
**minimal config stable releases**

```yml
uses: appsfortableau/github-action-releaser
with:
  tag_name: '1.6.4'
  files: dist/*.zip
```

> Will upload all zip files from the `dist` folder to Github and automatically attaches to the release.

**minimal config nightly/alpha/dev releases**

```yml
uses: appsfortableau/github-action-releaser
with:
  tag_name: '1.6-dev'
  prerelease: true
  move_tag: true
  files: |
    dist/*.zip
    dist/LICENSE
```

## Scenario's covert

There are some scenario's in case we want to update, createor upload files to a release.

### Stable releases

In case there is a `draft` for a version `1.6.2` and it is going to be released.
Sometime on release we update for example the `package.json` with the latest version and date. This change will be committed and we need to **move** the tag to current commit hash.

### Nightly/latest

When developing new version you want to test some features in a certain version scope.

## Helper

Within the pipeline we can simply set some outputs to "generate" the new/current alpha/dev release tag:

```yml
- name: Set version number
  id: env
  run: |
    # Get short commit hash to use for the version number.
    SIMPLE_SHA=$(git rev-parse --short 3ada9ffc1eefda08f16f817a9b7b7334afb762e9)
    # Grabs the latest stable version
    LATEST_TAG=$(git describe --tags --match "[0-9]*.[0-9]*.[0-9]*" --abbrev=0 | awk -F \. 'BEGIN {OFS="."} {print $1,$2}' FS=".")

    echo "::set-output name=VERSION::$LATEST_TAG-alpha-$SIMPLE_SHA" # e.g. 1.6-alpha-as34fD2
    echo "::set-output name=VERSION_TAG::$LATEST_TAG-alpha" # e.g. 1.6-alpha
```

Now we can use this in all steps following:

```yml
- name: Create a version number to show in the management console
  run: echo "${{ steps.env.outputs.VERSION }}" > dist/VERSION
```

> `steps.env.outputs.VERSION` or `steps.env.outputs.VERSION_TAG`.

## Usefull links

- [creating a javscript action](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action)
- [using release management for actions](https://docs.github.com/en/actions/creating-actions/about-custom-actions#using-release-management-for-actions)
- [inspirate and copied code from: `softprops/action-gh-release`](https://github.com/softprops/action-gh-release)
- [more inspiration: `action/github-script`](https://github.com/actions/github-script)
