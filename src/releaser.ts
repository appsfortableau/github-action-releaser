import { debug, setOutput, warning } from '@actions/core';
import { Context } from '@actions/github/lib/context';
import type { Github } from './main';
import { Config, paths as utilsPaths, asset as utilsAsset } from './utils';
import { RequestError } from './handlers';

// inspiration: https://github.com/softprops/action-gh-release/blob/cd28b0f5ee8571b76cfdaa62a30d51d752317477/src/github.ts

export interface Release {
  id: number;
  upload_url: string;
  html_url: string;
  tag_name: string;
  name: string | null;
  body?: string | null | undefined;
  target_commitish: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ id: number; name: string }>;
}

export interface ReleaserOptions {
  owner: string;
  repo: string;
}

export interface Ref {
  ref: string;
  node_id: string;
  url: string;
  object: { type: string; sha: string; url: string };
}

class Releaser {
  owner: string;
  repo: string;
  github: Github;
  config: Config;
  context: Context;

  constructor(
    github: Github,
    config: Config,
    options: ReleaserOptions,
    context: Context
  ) {
    this.github = github;
    this.owner = options.owner;
    this.repo = options.repo;
    this.config = config;
    this.context = context;
  }

  async getReleaseForTag(tag: string): Promise<Release | null> {
    try {
      const { data: release } = await this.github.rest.repos.getReleaseByTag({
        owner: this.owner,
        repo: this.repo,
        tag,
      });

      return release as Release;
    } catch (err) {
      warning(
        'Release was not published or tag does not exists yet: ' +
          JSON.stringify(err)
      );
    }

    const releases = await this.github.rest.repos.listReleases({
      owner: this.owner,
      repo: this.repo,
    });

    const release = releases.data.find(
      (release: Release) => release.tag_name === tag
    );

    return release ? (release as Release) : null;
  }

  async recreate(release: Release): Promise<Release> {
    await this.github.rest.repos.deleteRelease({
      owner: this.owner,
      repo: this.repo,
      release_id: release.id,
    });

    await this.github.rest.git.deleteRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/tags/${this.config.tag_name}`,
    });

    // TODO: Should create a new one with assets
    this.config.draft = true;

    return this.create();
  }

  async create(): Promise<Release> {
    let target_commitish: string | undefined;
    if (this.config.target_commitish) {
      target_commitish = this.config.target_commitish;
    }

    const res = await this.github.rest.repos.createRelease({
      owner: this.owner,
      repo: this.repo,
      target_commitish: target_commitish,
      draft: this.config.draft,
      prerelease: this.config.prerelease,
      tag_name: this.config.tag_name,
      name: this.config.tag_name,
      generate_release_notes: true,
    });

    const release = res.data as Release;
    const assets = (await this.uploadAssets(release, this.config.files)) ?? [];

    console.log('NEW RELEASE', release, assets, this.config.files);

    setOutput(
      'assets',
      assets.map((asset) => ({ ...asset, uploader: null }))
    );

    return release;
  }

  async update(release: Release) {
    // remove previous assets to clean the upload assets
    for (let i = 0; i < release.assets.length; i++) {
      const asset = release.assets[i];

      await this.github.rest.repos.deleteReleaseAsset({
        repo: this.repo,
        owner: this.owner,
        asset_id: asset.id,
      });
    }

    // even if its a draft we can move the tag
    if (this.config.move_tag) {
      debug('MOVING TAG');
      const tagRef = await this.getRef();

      // do not update the ref if it does not exists yet and there isnt a tag set yet
      let updateRef = true;
      if (tagRef === null && release.draft) {
        // unreleased tag
        updateRef = false;
      }

      await this.updateRef(updateRef);
    }

    let target_commitish: string;
    if (this.config.target_commitish) {
      target_commitish = this.config.target_commitish;
    } else {
      target_commitish = release.target_commitish;
    }

    await this.github.rest.repos.updateRelease({
      release_id: release.id,
      owner: this.owner,
      repo: this.repo,
      target_commitish,
      draft: this.config.draft,
      prerelease: this.config.prerelease,
      tag_name: this.config.tag_name,
    });

    const assets = (await this.uploadAssets(release, this.config.files)) ?? [];
    setOutput(
      'assets',
      assets.map((asset) => ({ ...asset, uploader: null }))
    );
  }

  async uploadAssets(release: Release, paths: string[]) {
    if (paths.length === 0) {
      return [];
    }

    const files = utilsPaths(paths);
    if (files.length == 0) {
      warning(`🤔 ${files} not include valid file.`);
      return;
    }

    return await Promise.all(
      files.map(async (file: string) => {
        const asset = utilsAsset(file);

        debug(`⬆️  Uploading  "${asset.name}" to Github`);

        const upload = await this.github.rest.repos.uploadReleaseAsset({
          release_id: release.id,
          owner: this.owner,
          repo: this.repo,
          name: asset.name,
          data: asset.data.toString(),
        });

        return upload.data;
      })
    );
  }

  async getRef(): Promise<null | Ref> {
    try {
      const { data: ref } = await this.github.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `tags/${this.config.tag_name}`,
      });

      return ref;
    } catch (_) {
      return null;
    }
  }

  async updateRef(create = true) {
    let isRefAlreadyOnSha: boolean = false;
    try {
      const ref = await this.getRef();
      isRefAlreadyOnSha = ref !== null && ref.object.sha === this.context.sha;

      debug(`🔄 MOVE REF: ${isRefAlreadyOnSha ? 'no' : 'yes'}`);
      debug(`🏷  TAG SHA: ${ref !== null ? ref.object.sha : 'no commit'}`);
      debug(`🎯 TARGET COMMIT: ${this.context.sha}`);
      debug(`SHOULD CREATE ARG: ${create ? 'yes' : 'no'}`);
      debug('')

      // remove old ref and create a new tag for this context?
      if (!isRefAlreadyOnSha) {
        debug('🗑 DELETE current tag from commit: '+ (ref !== null ? ref.object.sha : 'missing commit'))
        await this.github.rest.git.deleteRef({
          owner: this.owner,
          repo: this.repo,
          ref: `refs/tags/${this.config.tag_name}`,
        });
      }
    } catch (err) {
      err = RequestError(err);
      debug('Something went wrong in API request: ' + JSON.stringify(err));
    }

    // do not create when we dont need to create it or if its already on the correct commit sha
    if (!create || isRefAlreadyOnSha) {
      debug('⏭  We do not have to create the tag, yet.');
      debug(`because arg create was: ${create ? 'true' : 'false'} or was "isRefAlreadyOnSha" already done: ${isRefAlreadyOnSha ? 'true' : 'false'}`)
      return;
    }

    debug(
      `TAG ${this.config.tag_name} will be placed on commit: ${this.context.sha}`
    );

    return await this.github.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      sha: this.context.sha,
      ref: `refs/tags/${this.config.tag_name}`,
    });
  }
}

export default Releaser;
