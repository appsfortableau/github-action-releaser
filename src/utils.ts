import { getBooleanInput, getInput, getMultilineInput } from '@actions/core';
import { readFileSync, statSync } from 'fs';
import { getType } from 'mime';
import { basename } from 'path';
import * as glob from 'glob';

export type Env = { [key: string]: string | undefined };

export interface Config {
  tag_name: string;
  target_commitish: string;
  token: string;
  files: string[];
  draft: boolean;
  recreate: boolean;
  prerelease: boolean;
  move_tag: boolean;
  pkg_version: boolean;
  pkg_date: boolean;
}

export interface ReleaseAsset {
  name: string;
  mime: string;
  size: number;
  data: Buffer;
}

export function parseConfig(env: Env): Config {
  return {
    tag_name:
      getInput('tag_name', { required: true, trimWhitespace: true }) || '',
    target_commitish: getInput('target_commitish') || '',
    token: getInput('token') || env.GITHUB_TOKEN || '',
    files: parseInputFiles(getMultilineInput('files') || ''),
    recreate: getBooleanInput('recreate'),
    draft: getBooleanInput('draft'),
    prerelease: getBooleanInput('prerelease'),
    move_tag: getBooleanInput('move_tag'),
    pkg_version: getBooleanInput('pkg_version'),
    pkg_date: getBooleanInput('pkg_date'),
  };
}

export function parseInputFiles(files: string | string[]): string[] {
  const fileList = typeof files === 'string' ? files.split(/\r?\n/) : files;

  return fileList.reduce<string[]>(
    (acc, line) =>
      acc
        .concat(line.split(','))
        .filter((pat) => pat)
        .map((pat) => pat.trim()),
    []
  );
}

export const asset = (path: string): ReleaseAsset => {
  return {
    name: basename(path),
    mime: mimeOrDefault(path),
    size: statSync(path).size,
    data: readFileSync(path),
  };
};

export const uploadUrl = (url: string): string => {
  const templateMarkerPos = url.indexOf('{');
  if (templateMarkerPos > -1) {
    return url.substring(0, templateMarkerPos);
  }
  return url;
};

export const mimeOrDefault = (path: string): string => {
  return getType(path) || 'application/octet-stream';
};

export const paths = (patterns: string[]): string[] => {
  return patterns.reduce((acc: string[], pattern: string): string[] => {
    return acc.concat(
      glob.sync(pattern).filter((path: string) => statSync(path).isFile())
    );
  }, []);
};

export const unmatchedPatterns = (patterns: string[]): string[] => {
  return patterns.reduce((acc: string[], pattern: string): string[] => {
    return acc.concat(
      glob.sync(pattern).filter((path: string) => statSync(path).isFile())
        .length == 0
        ? [pattern]
        : []
    );
  }, []);
};
