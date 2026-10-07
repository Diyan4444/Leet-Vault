# LeetCode → GitHub Multi-Solution Sync

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
1. **User Controls Solution Names:** Submit `Heap Sort` $\rightarrow$ creates `heap-sort.cpp`.
2. **Deterministic Fallback Numbering:** Leave empty $\rightarrow$ creates `solution-N.cpp` determined safely by existing files in GitHub.
3. **Duplicate Code Detection:** Normalizes code and compares deterministic fingerprints against existing GitHub files to prevent redundant duplicate commits.
4. **Collision Protection:** If `heap-sort.cpp` already exists, shows an explicit choice between **Replace Existing** and **Save as Heap Sort 2**.
5. **Multi-Language Architecture:** Maps 18+ languages to official extensions (`.cpp`, `.py`, `.java`, `.ts`, `.rs`, `.go`, etc.). Handles different languages for the same problem without overwriting.
6. **Zero Backend Required:** Communicates directly from browser to GitHub via standard REST API.
7. **Security First:** No tokens exposed in content scripts; all API interactions handled by Manifest V3 service worker; tokens kept strictly in `chrome.storage.local`.

---

## 🚀 Installation & Development

### 1. Prerequisites
- Node.js (v18+ or v20+)
- npm (v9+)
- Google Chrome browser

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Tests
Runs unit test suite covering filename sanitization, solution numbering, language mapping, duplicate code hashing, and README generation:
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
4. Select the `dist/` directory inside this repository (`c:\Users\Diyan\Desktop\Leet=Github\dist`).
5. Pin **LeetCode → GitHub Multi-Solution Sync** to your Chrome toolbar.

---

## 🔐 GitHub Authentication & Setup Instructions

The extension supports standard **GitHub Personal Access Tokens (PAT)** (Fine-Grained or Classic) directly without requiring any third-party OAuth backend or credentials in source code.

### Step-by-Step GitHub Setup:
1. Go to your GitHub account: **Settings** $\rightarrow$ **Developer Settings** $\rightarrow$ **Personal access tokens** $\rightarrow$ **Tokens (classic)** (or fine-grained tokens).
2. Click **Generate new token**.
3. Select the `repo` scope (Allows read and write access to your repository contents).
4. Click **Generate token** and copy the token (`ghp_...`).
5. Click the extension icon in Chrome or right-click $\rightarrow$ **Options**.
6. Paste your token into the **GitHub Token** field and click **Verify Token**.
7. Select your target **Repository** from the dropdown (or create a dedicated repository such as `LeetCode` on GitHub first).
8. Select your target **Branch** (e.g., `main`).
9. Click **Save Changes**.

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

## 🛡️ Environment Variables Notice

As specified in security guidelines:
- `.env.example` is provided with variable placeholders only.
- No real credentials are kept in the codebase.
- No `.env` is committed.
- When configuring GitHub Apps or OAuth proxies, consult `.env.example`.
