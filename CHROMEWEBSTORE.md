# Chrome Web Store Listing & Metadata

Single source of truth for Chrome Web Store publishing, permissions justifications, and privacy disclosures.

## 1. Store Listing Metadata

- **Extension Name:** Leet-Vault
- **Summary (Short Description, max 132 chars):** Sync accepted LeetCode solutions to GitHub automatically with unlimited named solutions per problem.
- **Category:** Productivity / Developer Tools
- **Default Language:** English

### Detailed Description

```text
Streamline your DSA practice with Leet-Vault.

Unlike traditional sync extensions that overwrite your previous solution or force generic names, this extension empowers you to save unlimited distinct solutions for the exact same problem under clear, custom names.

KEY FEATURES:
• Unlimited Named Solutions: Save "Heap Sort", "Merge Sort", "Quick Sort", and "Bubble Sort" for the same problem without overwriting.
• Smart Automatic Numbering: If left unnamed, solutions automatically become "Solution N" based on existing GitHub files.
• Duplicate Code Detection: Automatically alerts you if identical code was previously committed, preventing redundant files.
• Duplicate Filename Protection: Offers explicit Replace Existing or Alternative Name choices.
• Multi-Language Support: Full support for C++, Python, Java, JavaScript, TypeScript, Go, Rust, C#, and more with distinct file extensions.
• Automated README Generation: Generates structured solution tables in problem directories and maintains repository overview indexes.
• Safe & Secure: All tokens stay in your browser's local storage. Zero external server dependencies or third-party database tracking.

WORKFLOW:
1. Solve any problem on LeetCode and submit.
2. When your solution is Accepted, a sleek developer popup prompts you for a solution name.
3. Enter a custom name (e.g., "Heap Sort") or press Enter for default numbering.
4. Your clean, organized solution is committed directly to your GitHub repository!
```

---

## 2. Permissions Justifications

| Permission / Host | Plain-English Reason for Chrome Reviewers |
|---|---|
| `storage` | Required to save the user's selected repository, branch, preferences, and GitHub authentication state locally on their machine. |
| `identity` | Required to launch the GitHub OAuth consent flow securely via `chrome.identity.launchWebAuthFlow`. |
| `alarms` | Required for the background service worker to periodically retry syncing pending solutions that experienced temporary network failures. |
| `https://leetcode.com/*` | Required to detect accepted submissions on LeetCode problem pages and display the solution-saving modal. |
| `https://api.github.com/*` | Required to communicate with the GitHub REST API to list user repositories, check existing files, and commit solution files. |

---

## 3. Privacy & Data Use Disclosure

- **Account Authentication:** Stored only in local browser storage (`chrome.storage.local`). Never sent to any third-party server.
- **Personally Identifiable Information:** Only the user's GitHub username and repository names are queried directly from `api.github.com`. No analytics, telemetry, or third-party tracking scripts are included.
- **Website Content:** Only parses code and submission status on `leetcode.com` when explicitly initiated by user submissions.

---

## 4. Pre-Publish Review Checklist

- [x] Manifest V3 compliant.
- [x] No `eval()` or un-sandboxed code execution.
- [x] Ephemeral service worker with all states persisted in `chrome.storage`.
- [x] No broad `<all_urls>` permission requested; strictly scoped to `leetcode.com` and `api.github.com`.
- [x] All assets and bundle files exist and are verified.
- [x] Sensitive files (`.env`, `.git/`, `node_modules/`) excluded from ZIP distribution.
