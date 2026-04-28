#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

repo_slug="saoki0913/career_compass"
base_branch="main"
head_branch="develop"
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=1
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run]" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

require_real_binary git
require_real_binary gh

cd "$repo_root"
run_real git fetch origin "$base_branch" "$head_branch" --tags

version_date="$(date +%Y.%m.%d)"
existing_count="$(run_real git tag --list "v${version_date}.*" | wc -l | tr -d ' ')"
release_version="v${version_date}.$((existing_count + 1))"
title="Release career_compass ${release_version}"

existing_pr="$(run_real gh pr list --repo "$repo_slug" --base "$base_branch" --head "$head_branch" --json number,url --jq '.[0].url // empty')"
if [[ -n "$existing_pr" ]]; then
  release_log "Existing release PR: $existing_pr"
  print -r -- "$existing_pr"
  exit 0
fi

commits="$(run_real git log "origin/${base_branch}..origin/${head_branch}" --oneline --no-merges || true)"
if [[ -z "$commits" ]]; then
  release_die "No commits to release from ${head_branch} to ${base_branch}."
fi

body_file="$(mktemp)"
{
  print -r -- "## Release"
  print -r -- ""
  print -r -- "- Version: ${release_version}"
  print -r -- "- Source: ${head_branch}"
  print -r -- "- Target: ${base_branch}"
  print -r -- ""
  print -r -- "## Required Verification"
  print -r -- ""
  print -r -- "- Develop CI"
  print -r -- "- Main Release Gate"
  print -r -- "- Security scan"
  print -r -- "- Staging health / E2E"
  print -r -- "- Production post-deploy readonly smoke after merge"
  print -r -- ""
  print -r -- "## Commits"
  print -r -- ""
  print -r -- "$commits"
} > "$body_file"

if [[ "$dry_run" == "1" ]]; then
  release_log "Dry run: would create release PR ${title}"
  cat "$body_file"
  rm -f "$body_file"
  exit 0
fi

pr_url="$(run_real gh pr create --repo "$repo_slug" --base "$base_branch" --head "$head_branch" --title "$title" --body-file "$body_file")"
rm -f "$body_file"
print -r -- "$pr_url"
