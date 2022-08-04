import { Config, Env, parseConfig, unmatchedPatterns } from './utils';
import { env } from 'process';
import { context, getOctokit } from '@actions/github';
import { OctokitOptions } from '@octokit/core/dist-types/types';
import { debug, error, info, setOutput, warning } from '@actions/core';
import { Context } from '@actions/github/lib/context';
import { GitHub } from '@actions/github/lib/utils';
import Releaser, { Release } from './releaser';

export type Github = InstanceType<typeof GitHub>;

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

  const releaser = new Releaser(github, config, { owner, repo }, context);

  let release: Release;
  try {
     release = await releaser.getReleaseForTag(tag);

    if (release) {
      debug(`Found release: ${release.name} with id: ${release.id}`);

      if (config.recreate) {
        release = await releaser.recreate(release);
      }

      // We should update the the release
      else {
        await releaser.update(release);
      }
    } else {
      release = await releaser.create();
    }
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      console.error('Error? ', err, typeof err);
    }
  }

  // done one of all the actions
  setOutput('id', release.id);
  setOutput('url', release.html_url);
}

run();

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
          info(`Retrying after ${retryAfter} seconds!`);
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