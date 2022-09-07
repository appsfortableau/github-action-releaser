import { Config, Env, parseConfig, unmatchedPatterns } from './utils';
import { env, exit } from 'process';
import { context, getOctokit } from '@actions/github';
import { OctokitOptions } from '@octokit/core/dist-types/types';
import { debug, error, setOutput, warning } from '@actions/core';
import { Context } from '@actions/github/lib/context';
import { GitHub } from '@actions/github/lib/utils';
import Releaser, { Release } from './releaser';
import { resolve } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { exec } from '@actions/exec';
import * as io from '@actions/io';

dayjs.extend(timezone);
dayjs.tz.setDefault('Europe/Amsterdam');

export type Github = InstanceType<typeof GitHub>;

function doInit(env: Env): {
  config: Config;
  github: Github;
  context: Context;
} {
  const config = parseConfig(env);
  const github = getOctokit(config.token, {
    throttle: {
      onRateLimit: (retryAfter: number, options: OctokitOptions) => {
        warning(
          `Request quota exhausted for request ${options.method} ${options.url}`
        );

        if (options.request?.retryCount === 0) {
          // only retries once
          debug(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onAbuseLimit: (_: number, options: OctokitOptions) => {
        // does not retry, only logs a warning
        warning(`Abuse detected for request ${options.method} ${options.url}`);
      },
    },
  });

  return {
    config,
    github,
    context,
  };
}

async function run() {
  const { context, github, config } = doInit(env);

  if (!context.payload?.repository?.full_name) {
    error('Action repository information not found');
    return;
  }

  // verify if there are files
  if (config.files) {
    const patterns = unmatchedPatterns(config.files);
    patterns.forEach((pattern: string) =>
      warning(`🤔 Pattern '${pattern}' does not match any files.`)
    );
  }

  const tag = config.tag_name;
  const repository = context.payload.repository;
  const [owner, repo] = repository?.full_name?.split('/') ?? ['', ''];

  debug(`OWNER: ${owner}`);
  debug(`REPO: ${repo}`);

  debug(`SET VERSION PACKAGE.jSON: ${config.pkg_version ? 'true' : 'false'}`);
  debug(`SET DATE IN PACKAGE.jSON: ${config.pkg_date ? 'true' : 'false'}`);

  runPackageJsonUpdater(config);

  const releaser = new Releaser(github, config, { owner, repo }, context);

  try {
    let release: Release | null = await releaser.getReleaseForTag(tag);

    if (release) {
      debug(`Found release: ${release.name} with id: ${release.id}`);

      if (config.recreate) {
        debug('RECREATING release, Adding assets');
        release = await releaser.recreate(release);
      } // We should update the the release
      else {
        debug('UPDATING release, update assets');
        await releaser.update(release);
      }
    } else {
      debug('CREATE release, add assets');
      release = await releaser.create();
    }

    // done one of all the actions
    setOutput('id', release.id);
    setOutput('url', release.html_url);
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      console.error('Error? ', err, typeof err);
    }
    console.log(err);
  }
}

async function runPackageJsonUpdater(config: Config) {
  const pkgPath = resolve(__dirname, '..', 'package.json');

  // do not add the date and version number to the package.json
  if (!config.pkg_version && !config.pkg_date) {
    return;
  }

  // make sure the package.json exists
  if (!existsSync(pkgPath)) {
    warning(
      'Skipped version and/or date addition to package.json, because package.json does not exists in working directory.'
    );
    return;
  }

  const content = JSON.parse(readFileSync(pkgPath).toString());

  if (config.pkg_version && config.tag_name !== content.version) {
    // the version in the package.json is already the same
    content.version = config.tag_name;
  }

  if (config.pkg_date) {
    let date = dayjs();
    content.version_date = date.format('DD-MM-YYYY');
  }

  writeFileSync(pkgPath, JSON.stringify(content, null, 2));

  const gitPath = await io.which('git', true);

  let gitOutput = '';
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        gitOutput += data.toString();
      },
    },
  };
  await exec(gitPath, ['status', pkgPath, '-s'], options);

  if (gitOutput.trim() === 'M package.json') {
    // changes detected

    if (!env.NODE_ENV || env.NODE_ENV !== 'development') {
      debug('Start committing the package.json');
      await exec(gitPath, ['config', 'user.name', 'github-actions']);
      await exec(gitPath, [
        'config',
        'user.email',
        'github-actions@github.com',
      ]);

      // stage changes
      await exec(gitPath, ['add', pkgPath]);

      // commit the change
      await exec(gitPath, [
        'commit',
        '-m',
        `"Release new version: ${config.tag_name}"`,
      ]);

      // push the code to the repo
      await exec(gitPath, ['push']);
    } else {
      debug('We have changes for Package.json and commit it.');
    }
  }

  exit(0);
}

run();
