# GitHub issues, pull requests, and workspaces

Bring GitHub issue context and your branch’s pull request into mxwl. Pick an issue, open a sibling worktree with its own browser sandbox, and give the coding agent the issue title, URL, and description.

## Connect a repository

In **Projects → Project settings → Integrations**, select **GitHub Issues** as the task provider and **GitHub** as the source-control provider. You can choose either independently, including GitHub pull requests with Jira tickets.

Set **Repository workspace / owner** and **Repository slug** to the organization or user and repository name. For `https://github.com/acme/checkout`, enter `acme` and `checkout`.

When both repository fields are blank, mxwl first tries the project’s repository URL, then the checkout’s `origin` remote. HTTPS, SSH URLs, and Git’s `git@github.com:owner/repo.git` format work. Explicit fields select the target repository when your checkout is a fork. Pull-request lookup uses the origin’s owner for the source branch when available.

## Choose account access

Open **Settings → Accounts → GitHub**. Set the host to `github.com`, or the hostname of your GitHub Enterprise Server. All GitHub API requests run on the computer running mxwl, including for remote workspaces.

| Authentication | Use it for | Setup |
| --- | --- | --- |
| Public repositories | Public issues and pull requests | No token needed |
| GitHub CLI login | Your existing GitHub account, including private repositories | Install `gh`, then run `gh auth login` on the computer running mxwl |
| Personal access token | Repository-scoped access, including private repositories | Paste the token into Settings; a blank field keeps the saved token |

For Enterprise CLI authentication, use your actual hostname:

```sh
gh auth login --hostname github.example.com
```

The CLI option reads the active account’s token through `gh auth token --hostname ...` when needed. It does not copy that token into mxwl’s settings. See the [GitHub CLI authentication reference](https://cli.github.com/manual/gh_auth_token).

For a fine-grained personal token, select the repositories you use and grant **Issues: read** and **Pull requests: read**. Organization approval or SSO authorization may also be required. These are the permissions documented for [reading an issue](https://docs.github.com/en/rest/issues/issues#get-an-issue) and [listing pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests).

Click **Test GitHub connection**, then **Save**. The connection test confirms account authentication; individual repository access is checked when you load its issues and pull requests. Tokens use mxwl’s existing secret storage. CLI authentication avoids storing another copy of your GitHub token in mxwl.

Changing the GitHub host or authentication method clears the saved token rather than reusing it for a different server. Public access has GitHub’s unauthenticated API rate limits; choose CLI or token authentication when you need authenticated access.

## Read the issue and pull request

Open a workspace and click **Ticket & PR** in its header. The GitHub issue card shows its number, title, open/closed state, labels, assignee, and description. The pull-request card finds the most recently updated open PR for the current branch, including draft status and author.

Use **Open in GitHub** to open either item in the workspace browser. The existing **Changes** view lets you inspect split or unified diffs, ask the agent about selected lines, stage a file or hunk, commit, push, and open GitHub’s pull-request creation page.

To associate existing folders with GitHub issues, configure a named capture such as `(?<issue>GH-\d+)` in the project’s folder pattern and set the issue-key template to `${issue}`. A folder such as `checkout-GH-42` then resolves issue `#42` in the project’s GitHub repository. Derivation remains configurable for your naming convention.

## Launch an issue workspace

1. Open the source checkout and choose **Launch ticket worktree** in the app header.
2. Select a recently updated open GitHub issue, or enter its number or URL.
3. Review the branch and agent mission.
4. Click **Launch everything**.

The launcher accepts `42`, `#42`, `GH-42`, `owner/repo#42`, and a GitHub issue URL from the project’s repository. References to another repository are rejected, so the issue and worktree stay aligned.

mxwl uses `GH-42` as the worktree ticket key and proposes `gh-42` as the branch. Your project’s workspace-folder template still controls the destination folder. The browser gets a fresh cookie sandbox, and the agent receives the issue title, URL, and description alongside your mission. Longer descriptions are capped at 12,000 characters in the agent prompt.

The issue picker shows recent open issues, rather than an exhaustive task board. Enter a number to load an issue outside that list. Closed issues can also be loaded by number. PR numbers are not treated as issues by the launcher.

## Local and SSH workspaces

GitHub API authentication belongs to the desktop running mxwl. Repository inspection and worktree creation run on the workspace’s host. Git commits and pushes still use Git and its credentials on that host; connecting a GitHub account in Settings does not configure a remote machine’s Git authentication.

Read [Projects, hosts & workspaces](./presets.md) for repository locations and templates, and [Tailscale & phone access](./tailscale.md) for remote connections.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No GitHub issue or PR card | Select the corresponding GitHub provider in the project integrations. |
| Repository cannot be resolved | Set both owner and repository name, or configure a matching project URL / `origin`. |
| CLI authentication fails | Install `gh`, sign in on the computer running mxwl, and check the selected GitHub hostname. |
| Private repository is unavailable | Choose CLI or token authentication; check repository selection, organization approval, and SSO. |
| Connection test passes but issues fail | Account authentication and permission to a specific repository are separate checks. |
| No open PR for this branch | Check the branch and target repository. Closed and merged PRs are not returned. |
| API rate limit reached | Authenticate for public repositories, or wait for the current rate limit to reset. |
| Git push fails on a remote host | Configure that host’s Git credentials separately. |
