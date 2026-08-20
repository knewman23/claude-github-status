# Privacy Policy — Dev PTO

_Last updated: 20 August 2026_

Dev PTO is a browser extension that displays the public service status of Claude and GitHub.
It is not affiliated with Anthropic or GitHub.

## What we collect

Nothing.

Dev PTO has no accounts, no sign-in, no analytics, no telemetry, and no error reporting. It
does not collect, transmit, sell, or share any personal information. No data about you or your
browsing ever leaves your machine.

## What the extension stores

One entry in `chrome.storage.local`, under the key `snapshot`, containing the most recent
status data fetched from the two public status pages:

- the overall status of each service,
- the name and state of each listed component,
- the title and latest update text of any active incident or scheduled maintenance,
- the timestamp of the fetch.

This is public information, published by Anthropic and GitHub on their status pages. It is
cached only so the popup can open instantly instead of waiting on the network, and it is
overwritten on every refresh. It is stored locally — `chrome.storage.local`, never
`chrome.storage.sync` — so it is not uploaded to any account or synced between devices.

Removing the extension deletes it.

## Network requests

The extension makes unauthenticated HTTP GET requests to exactly two URLs:

- `https://status.claude.com/api/v2/summary.json`
- `https://www.githubstatus.com/api/v2/summary.json`

These happen every two minutes and once when you open the popup. The requests contain no
identifying information beyond what any browser sends when fetching a public URL, and no
cookies or credentials are attached. The extension makes no other network requests and
contacts no other servers.

## Permissions

- **`alarms`** — schedules the two-minute refresh. Manifest V3 service workers are shut down
  when idle, so this is the only way to poll on a timer.
- **`storage`** — caches the single status snapshot described above.

The extension requests no host permissions and no access to the pages you visit. It cannot
read, modify, or see any website you browse.

## Remote code

None. All code ships inside the extension package. Nothing is downloaded or evaluated at
runtime.

## Changes

Any change to this policy will be committed to this file, and its history is public in this
repository.

## Contact

Open an issue at https://github.com/knewman23/claude-github-status/issues
