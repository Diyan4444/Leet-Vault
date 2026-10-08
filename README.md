# Leet-Vault

A production-ready Chrome Extension (Manifest V3) that automatically syncs accepted LeetCode solutions to your chosen GitHub repository while enabling **unlimited named solutions for the exact same problem**.

---

## 🌟 Key Architecture & Principles

> **One LeetCode Problem → Unlimited Named Solutions → Clean GitHub Organization**

```text
0912-sort-an-array/
├── README.md
├── heap-sort.cpp
├── merge-sort.cpp
├── quick-sort.cpp
├── bubble-sort.cpp
└── solution-5.cpp
```

### Highlights:
1. **User-Controlled Solution Naming:** Submit `Heap Sort` $\rightarrow$ creates `heap-sort.cpp`.
2. **Deterministic Fallback Numbering:** Leave empty $\rightarrow$ creates `solution-N.cpp` calculated safely from existing files in GitHub.
3. **Strict Submission State Machine:** Triggered exclusively on the user clicking **Submit**. Captures a full code snapshot immediately and ignores pre-existing DOM elements, SPA navigation, and previous solution runs. No false positives.
4. **Production GitHub OAuth Flow:** Zero Personal Access Token hassle. Authorizes via Chrome Identity API (`chrome.identity.launchWebAuthFlow`) and an open serverless OAuth broker. Zero client secrets embedded in the extension bundle.
5. **Authoritative Access Verification:** Authoritatively checks authenticated repository write permissions (`permissions.push` / `permissions.admin`) via the GitHub REST API. Rejects unauthorized or nonexistent repositories. Optional **Owner-only mode** prevents pushing to shared/organization repositories.
6. **Multi-Language Architecture:** Maps 18+ languages to official extensions (`.cpp`, `.py`, `.java`, `.ts`, `.rs`, `.go`, etc.). Handles different languages for the same problem without overwriting.
7. **Duplicate Code Detection:** Normalizes code and compares deterministic fingerprints against existing GitHub files to prevent redundant duplicate commits.
8. **Collision Protection:** If a file with the same name exists, provides clear choices: **Replace Existing** (with SHA matching) or **Save as New File** (`heap-sort-2.cpp`).
9. **Offline / Temporary Error Queue:** Network disruptions, temporary 5xx errors, and rate limits are placed in a persistent retry queue with manual and automated retry capabilities.
10. **Dual README Maintenance:** Automatically maintains a problem-level `README.md` table as well as an aggregated overview table in the repository root `README.md`.

---

## 🚀 Installation & Development

### 1. Prerequisites
- Node.js (v18+ or v20+)
- npm (v9+)
- Google Chrome browser (MV3 support)

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Tests
Runs the comprehensive test suite (50+ unit and integration tests covering submission state machine, OAuth token exchange, write permission verification, duplicate detection, automated alarm-based queue retries, path traversal sanitization, and README generation):
```bash
npm run test
```

### 4. Build for Production
Compiles TypeScript, bundles extension modules with Vite, and copies assets to `dist/`:
```bash
npm run build
```

---

## 🧩 Loading the Extension in Google Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the `dist/` directory inside this repository (e.g. `Leet-Vault/dist`).
5. Pin **Leet-Vault** to your Chrome toolbar.

---

## 🔐 GitHub Authentication & Repository Connection

The extension uses modern GitHub OAuth authorization with zero secret exposure:

### Connecting Your Account
1. Click the extension toolbar icon or right-click $\rightarrow$ **Options**.
2. Click **Connect GitHub**.
3. Chrome opens the GitHub authorization window via `chrome.identity.launchWebAuthFlow`. Authorize the requested `repo` scope.
4. Once completed, your authenticated username and avatar appear across the popup and options pages.

### Linking Your Repository
1. Paste your target repository URL (e.g., `https://github.com/USERNAME/LeetCode`).
2. Click **Verify & Link Repository**.
3. The extension verifies that your authenticated account has write permissions (`permissions.push` or `permissions.admin`).
4. Select your preferred branch (e.g., `main`).
5. Click **Save Settings**.

---

## ☁️ Deploying the OAuth Broker (Optional / Self-Hosted)

The included broker (`broker/index.js`) is an edge/serverless handler for exchanging OAuth codes:

1. Create a GitHub OAuth App at [GitHub Developer Settings](https://github.com/settings/developers).
2. Set Authorization callback URL to:
   ```text
   https://<YOUR-BROKER-DOMAIN>/callback
   ```
3. Deploy `broker/index.js` to Vercel, Cloudflare Workers, or AWS Lambda with environment variables:
   - `GITHUB_CLIENT_ID`: Your GitHub OAuth App Client ID
   - `GITHUB_CLIENT_SECRET`: Your GitHub OAuth App Client Secret
4. Set the broker URL in the extension Options page under **Advanced Settings**.

---

## 🧪 Testing the 5-Solution Scenario

Follow this workflow to verify the core product guarantee:

### Problem: LeetCode #912 (Sort an Array)
1. Navigate to `https://leetcode.com/problems/sort-an-array/`.
2. **Submission 1 (Heap Sort):**
   - Submit C++ heap sort solution.
   - Upon "Accepted", the popup appears automatically.
   - Type `Heap Sort` and press Enter.
   - **Result on GitHub:** `0912-sort-an-array/heap-sort.cpp`
3. **Submission 2 (Merge Sort):**
   - Submit C++ merge sort solution.
   - Enter `Merge Sort` and press Enter.
   - **Result on GitHub:** `0912-sort-an-array/merge-sort.cpp`
4. **Submission 3 (Quick Sort):**
   - Submit C++ quick sort solution.
   - Enter `Quick Sort` and press Enter.
   - **Result on GitHub:** `0912-sort-an-array/quick-sort.cpp`
5. **Submission 4 (Bubble Sort):**
   - Submit C++ bubble sort solution.
   - Enter `Bubble Sort` and press Enter.
   - **Result on GitHub:** `0912-sort-an-array/bubble-sort.cpp`
6. **Submission 5 (Default Numbered):**
   - Submit solution and leave the solution name empty.
   - Press Enter.
   - **Result on GitHub:** `0912-sort-an-array/solution-5.cpp`

All 5 solutions exist cleanly side-by-side with an auto-generated `README.md` tracking all implementations, runtimes, and memory statistics!

---

## 🛡️ Security Guarantees

- **No Embedded Client Secrets:** Client secrets are never packaged in the extension distribution.
- **Strict Boundary:** GitHub access tokens are stored in `chrome.storage.local` and accessed only by the background service worker. Tokens are never passed to the LeetCode content script.
- **Write Permission Pre-flight:** Write access is re-verified before any file or directory commits are executed.
- **No Path Traversal:** All file and directory paths are strictly sanitized against `..`, leading/trailing slashes, and illegal filesystem characters.
- **XSS Sanitization:** All dynamic DOM insertions utilize `escapeHtml` against untrusted problem titles, filenames, and error messages.
