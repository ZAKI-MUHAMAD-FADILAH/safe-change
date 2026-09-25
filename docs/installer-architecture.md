# Installer Architecture and Lifecycle Specification

This document defines the architectural specification, safety model, lifecycle state machine, and path boundary policies for the proposed `safe-change` installer.

Verified Baseline Commit:
`a22b31b910c02fa9c0152554e5eb69160635da18`

Current Status:
Architecture design phase (Milestone C.2). No production installer code, CLI commands (`safe-change install`, `safe-change update`, `safe-change uninstall`), interactive prompts, or plugin manifests are implemented in this milestone. Production implementation remains blocked until this architecture undergoes formal review.

---

## Mandatory Safety Rules

The installer architecture enforces the following mandatory invariant rules across all platforms and execution contexts:

1. **No Silent Git Modification**: The installer must never silently modify `.gitignore`, `.git/info/exclude`, or any other Git tracking configuration. Any exclusion advice must be explicitly displayed to the user as actionable guidance.
2. **No Unapproved Overwrites**: The installer must never overwrite user-owned files, pre-existing configuration, or unknown skill files without explicit user approval.
3. **Strict Symlink and Junction Defense**: The installer must never create, traverse, or follow unexpected symbolic links, junction points, or hard links.
4. **Strict Scope Boundary**: The installer must never write outside the user-selected scope (workspace root or explicitly authorized global configuration directory).
5. **Instruction File Protection**: The installer must never modify `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or equivalent instruction files without a documented merge and collision policy.
6. **Fixture vs Runtime Distinction**: A filesystem fixture does not prove runtime agent discovery. Runtime discovery must be independently verified on live agent versions.
7. **Format vs Compatibility Distinction**: A matching file format (e.g. YAML frontmatter in Markdown) does not prove runtime plugin compatibility or runtime invocation capability.
8. **No Guessing of Unsupported Formats**: Unsupported or undocumented agent formats must not be guessed, assumed, or approximated.
9. **Single Source of Truth**: The canonical skill at `skills/safe-change/SKILL.md` is the only source of truth for skill content and instruction contracts.
10. **Separate Plugin Directories**: Agent plugin folders must remain strictly separate to avoid cross-contamination of vendor-specific manifests and configurations.
11. **Architecture Review Prerequisite**: Production code implementation begins only after this architecture specification is reviewed and approved.

---

## 1. Purpose and Boundaries of the Installer

The primary purpose of the `safe-change` installer is to place the canonical Agent Skill and necessary agent adapter configurations into target environments with zero unintentional side effects, guaranteed atomicity, and unambiguous ownership tracking.

### What the Installer Is
- A local-first utility to distribute the canonical skill instructions to supported AI coding agent configuration directories.
- A deterministic lifecycle manager providing installation, status checking, updating, uninstallation, and rollback.
- A safety barrier verifying path boundaries, filesystem types, and collision states before writing a single byte.

### What the Installer Is Not
- It is not an arbitrary package manager, system daemon, or auto-updater.
- It is not a cloud service, telemetry collector, or remote registry client.
- It does not modify system binaries, PATH environment variables, or global shell initialization scripts (`.bashrc`, `.zshrc`, PowerShell profiles).
- It does not automatically run Git commits, Git pushes, or staging operations on user repositories.

---

## 2. Project/Workspace Scope vs Global Scope

The installer supports two distinct installation scopes, each with strict isolation and different lifecycle implications:

| Dimension | Project / Workspace Scope | Global / User Scope |
| --- | --- | --- |
| **Target Location** | Inside project repository (e.g., `<projectRoot>/.agents/skills/safe-change/`) | Inside user profile configuration (e.g., `~/.gemini/config/skills/safe-change/`) |
| **Isolation** | Confined strictly within the boundaries of the workspace root | Confined strictly to allowlisted, vendor-specific configuration subdirectories |
| **Team Sharing** | Can be committed to version control to share safety baselines across team members | Applies only to the local machine and current user session |
| **Precedence** | Takes precedence over global installations in hierarchical discovery agents | Acts as fallback when project-level skill is absent |
| **Home-Dir Rule** | Must reside within project root; forbidden to target home root or untrusted subpaths | Targets dedicated user config; requires explicit `--global` flag and interactive confirmation |
| **Default Mode** | Default scope for all operations | Opt-in only; never selected implicitly |

---

## 3. Agent Compatibility Status

Compatibility across target coding agents is categorized using conservative, evidence-based classifications:

### Antigravity (Google DeepMind)
- **Status**: Candidate for first integration.
- **Evidence Level**: Filesystem fixture validated (`tests/integration/antigravity-fixture.test.ts`).
- **Limitation**: Runtime discovery has not been independently verified on public runtime releases.

### Claude Code (Anthropic)
- **Status**: Partially verified.
- **Evidence Level**: Official documentation verified for slash commands, prompt injection, and memory files (`CLAUDE.md`).
- **Limitation**: Skill precedence, directory shadowing, and multi-scope interaction require caution. Dedicated skill directory discovery is not officially stabilized.

### Cursor (Anysphere)
- **Status**: Partially verified.
- **Evidence Level**: `.cursor/rules/*.mdc` is the documented, official primary format.
- **Limitation**: `.cursor/skills/` remains unverified and unsupported unless officially documented by Cursor.

### Codex (OpenAI)
- **Status**: Partially verified.
- **Evidence Level**: `AGENTS.md` is the officially documented mechanism for repository instruction injection.
- **Limitation**: Dedicated `.codex/skills/` and `~/.codex/skills/` directories are unverified and undocumented.

### Other Agents (Cline, Kimi Code, Amp, OpenCode, Gemini CLI, etc.)
- **Status**: Not researched or not verified.
- **Policy**: No installation targets or adapters will be offered or inferred for these agents until official documentation and validation fixtures exist.

---

## 4. Separate Plugin Folder Structure per Agent

To prevent cross-agent configuration conflicts, vendor-specific plugin adapters will reside in isolated subdirectories under `plugins/`.

### Proposed Repository Layout

```
skills/
└── safe-change/
    └── SKILL.md

plugins/
├── antigravity/
├── claude-code/
├── cursor/
├── codex/
├── cline/
├── kimi-code/
├── amp/
├── opencode/
└── gemini-cli/
```

### Evaluation and Implementation Rule
- **Current State**: None of the subdirectories under `plugins/` will be created at this time. Creating empty or placeholder directories violates repository hygiene and misleads users regarding compatibility.
- **Condition for Directory Creation**: A plugin directory will only be created when a fully researched, documented, and verified adapter for that specific agent is implemented and accompanied by automated integration tests.
- **Separation Principle**: Every adapter must contain its own self-contained metadata and manifest. Shared logic must be limited to reading the canonical skill from `skills/safe-change/SKILL.md`.

---

## 5. Canonical Source: `skills/safe-change/SKILL.md`

The file `skills/safe-change/SKILL.md` is the single canonical source of truth for safe-change skill behavior:
- It defines the canonical name (`safe-change`), description, trigger conditions, core rules, CLI invocation contracts, and baseline format limitations.
- No plugin adapter or installer may fork, re-author, or modify the core instructional contract.
- Any agent-specific packaging must either copy the canonical file without alteration or embed it via an automated, verified build transformation step that preserves exact semantic identity.

---

## 6. Bundling Strategy and Content Drift Prevention

To prevent content drift between repository source files and distributed packages:
1. **Direct Packaging**: The canonical `skills/safe-change/SKILL.md` is included directly in the npm distribution package via the `files` array in `package.json`.
2. **Byte Identity Verification**: When the installer executes in the field, it copies the canonical skill from its packaged location and performs an SHA-256 integrity check against the embedded package hash.
3. **Drift Prevention in Monorepo/Multi-Agent**: If an adapter requires wrapping the canonical skill with vendor-specific metadata, the build step must validate that the inner instruction text matches the SHA-256 hash of `skills/safe-change/SKILL.md`. If hashes mismatch, the build fails immediately.

---

## 7. Proposed Installer Command Design

The proposed installer commands will follow an explicit, subcommand-based CLI structure under the `safe-change` executable:

- `safe-change install [target-agent]`
  Installs the skill/plugin for the designated agent. Defaults to interactive detection if `target-agent` is omitted.
- `safe-change update [target-agent]`
  Updates an existing installation to match the current canonical skill version.
- `safe-change uninstall [target-agent]`
  Removes safe-change files and metadata without touching sibling files or user data.
- `safe-change status [target-agent]`
  Inspects installation health, verifies file hashes, and reports drift or collisions without making modifications.

### Core Command Flags
- `--scope <workspace|global>`: Explicitly specifies target scope. Defaults to `workspace`.
- `--dry-run`: Simulates the operation and reports all intended actions without touching disk.
- `--force` / `--overwrite`: Authorizes overwriting safe-change managed files during update.
- `--non-interactive`: Disables interactive prompts; fails immediately if confirmation is required.
- `--json`: Outputs structured JSON results for programmatic consumption.

---

## 8. Interactive Mode

Interactive mode is the default when safe-change commands are run in a TTY environment:
1. **Target Discovery**: Scans the workspace for agent markers (e.g. `.agents/`, `.cursor/`, `AGENTS.md`) and presents a list of detected agents with clear status badges (`candidate`, `partially verified`).
2. **Scope Confirmation**: Clearly displays the resolved absolute path where files will be written.
3. **Change Preview**: Displays planned file additions, file updates, and estimated byte changes.
4. **Collision Prompt**: If a managed file with differences exists, prompts the user:
   - `[o] Overwrite with new version`
   - `[d] Show diff`
   - `[s] Skip this target`
   - `[a] Abort operation`
5. **No Blind Prompts**: Every prompt includes the exact target file path and explains the consequence of each option.

---

## 9. Non-Interactive Mode

Non-interactive mode is activated when `--non-interactive` is passed or when `stdin` is not a TTY (CI environments, automated pipelines):
1. **Strict Explicitness**: All required parameters (`target-agent`, `--scope`) must be provided on the command line. Missing parameters cause an immediate exit with code `2` (CLI usage error).
2. **Zero Prompts**: Never attempts to read `stdin`.
3. **Collision Halting**: If a collision is encountered and `--overwrite` was not explicitly provided, the operation halts immediately with exit code `4` (Collision / Safety Violation), leaving existing files untouched.
4. **Deterministic Output**: Formats machine-readable progress and error information to `stdout` and `stderr`.

---

## 10. `--dry-run`

The `--dry-run` flag provides complete simulation of any installer lifecycle command:
1. **Read-Only Guarantee**: No directory creation, file creation, file modification, or file deletion is performed.
2. **Full Validation**: Runs complete path resolution, boundary checks, home-directory validation, symlink inspection, and collision detection.
3. **Structured Reporting**: Outputs a planned execution manifest:
   - Target scope and resolved absolute paths.
   - Files to be created or overwritten.
   - SHA-256 hash comparison between existing target files and source canonical files.
   - Any warnings regarding `.gitignore` or unverified agent runtime behaviors.
4. **Exit Code**: Returns `0` if all pre-conditions are satisfied and installation would succeed; returns non-zero error codes if pre-conditions fail.

---

## 11. Explicit Overwrite Confirmation

To guarantee that user modifications are never destroyed:
1. If the target file exists and its content differs from the source:
   - In interactive mode: Prompts for explicit confirmation with options to view diff or abort.
   - In non-interactive mode: Fails immediately unless `--overwrite` is explicitly specified.
2. If the existing file is identical (matching SHA-256): Reports `already-up-to-date` without prompting and exits cleanly.
3. If an unrecognized file occupies the target directory: Refuses to overwrite even with `--overwrite` unless an additional `--force-unrecognized` flag is provided.

---

## 12. Collision Detection

Collision detection operates hierarchically before any write operation is scheduled:

1. **Path-Type Collisions**:
   - A regular file exists where a directory is required (e.g. `.agents/skills/safe-change` is a regular file).
   - A directory exists where a regular file is expected.
2. **Foreign-Ownership Collisions**:
   - The target skill directory exists but lacks the safe-change ownership manifest or marker.
3. **Content Divergence**:
   - A safe-change file exists, but its content has been customized by the user.
4. **Collision Action**:
   - All collisions are detected in a non-destructive read phase. If a collision is detected, the operation aborts with a descriptive diagnostic message detailing the conflicting path and reason.

---

## 13. Update Strategy

The update lifecycle safely brings an existing installation up to date:
1. **State Inspection**: Reads existing files and verifies safe-change ownership markers.
2. **Drift Detection**: Computes SHA-256 of installed files vs canonical source.
3. **Staging**: Writes updated files to an isolated temporary staging directory (`.tmp-safe-change-<uuid>`) within the same filesystem boundary.
4. **Atomic Swap**: Replaces installed files atomically using rename operations.
5. **Rollback on Failure**: If an error occurs during replacement, original files are restored from backup.

---

## 14. Uninstall Strategy

The uninstall lifecycle completely and cleanly removes safe-change artifacts:
1. **Target Verification**: Confirms that the target directory is indeed a safe-change installation (checks ownership markers).
2. **Safe Removal**: Deletes only safe-change specific files (`SKILL.md`, `.safe-change-manifest.json`).
3. **Parent Directory Pruning**: Removes the parent directory (`.agents/skills/safe-change/`) only if it is completely empty.
4. **Preservation of Sibling Data**: Never removes or alters sibling skills (`.agents/skills/other-skill/`) or shared parent directories (`.agents/`).
5. **No Git Mutation**: Does not attempt to alter Git history, unstage files, or touch `.gitignore`.

---

## 15. Rollback Strategy

The installer maintains transaction integrity across all multi-file operations:
1. **Backup Snapshot**: Before mutating any file during update or install, an in-memory or atomic temporary copy of pre-existing state is recorded.
2. **Failure Trapping**: All write operations are wrapped in `try ... catch` blocks.
3. **Restoration**: On unexpected failure, all partially created files are unlinked, and backed-up original files are restored to their original paths.
4. **Integrity Check**: Verifies that post-rollback state matches pre-operation state before terminating.

---

## 16. Cancellation Strategy

When a user cancels an operation (via interactive prompt abort, UI cancellation, or programmatic flag):
1. **Immediate Halt**: Halts execution before initiating any filesystem writes.
2. **Zero Modification**: No temporary directories or files remain behind.
3. **Status Reporting**: Returns exit code `0` or dedicated cancellation status with message `Operation cancelled by user; no files modified.`

---

## 17. Interrupted Process Handling

To handle abnormal process termination (`SIGINT`, `SIGTERM`, `SIGHUP`, `process.exit`):
1. **Signal Listeners**: Installs signal handlers during active file operations.
2. **Staging Cleanup**: Any temporary staging directory created during the transaction is immediately unlinked synchronously or via a registered exit handler.
3. **Atomic Operations**: Primary writes use atomic renames on POSIX and safe file swapping on Windows, ensuring that an interrupted process leaves either the complete old version or the complete new version, never a corrupted or truncated half-written file.

---

## 18. Exit Codes

The installer adheres strictly to the existing safe-change exit code convention:

| Exit Code | Meaning | Context in Installer |
| --- | --- | --- |
| `0` | Success | Operation completed successfully, or clean `--dry-run` passed. |
| `1` | Failure / Error | Internal error, unhandled exception, or unexpected failure. |
| `2` | CLI Usage Error | Invalid flags, missing required arguments, or unknown target agent. |
| `3` | Configuration Drift / Missing | Target configuration corrupt or invalid. |
| `4` | Collision / Safety Violation | Symlink detected, path boundary violation, or unapproved collision. |
| `5` | Unclean Baseline / Interrupted | Process interrupted or aborted mid-operation. |

---

## 19. Path Boundary Enforcement

The installer enforces zero-trust path boundary constraints:
1. **Strict Containment**: Target paths must resolve strictly within the designated root (`targetRoot`).
2. **Canonical Resolution**: Paths are resolved using `path.resolve` and normalized across operating system separators.
3. **Traversal Prevention**: Relative components such as `..` or `.` are resolved and checked to confirm that `path.relative(root, resolved)` does not start with `..` and is not absolute.
4. **Drive Letter Validation (Windows)**: On Windows, operations must be on the same volume drive letter as `targetRoot`.

---

## 20. Home-Directory Policy

Borrowing from the verified fixture safety model in [docs/antigravity-fixture.md](file:///c:/Users/zakim/OneDrive/Desktop/safe-change/docs/antigravity-fixture.md):

1. **Workspace Scope Policy**:
   - `targetRoot` equal to `os.homedir()` is strictly rejected.
   - Direct children of `os.homedir()` (e.g. `~/projects`, `C:\Users\<user>\code`) are strictly rejected as installation targets unless explicitly verified as a valid, initialized Git workspace root.
   - Any path traversal resolving into `os.homedir()` is rejected.
2. **Global Scope Policy**:
   - Global installation into the user home directory is strictly restricted to an explicit, pre-defined allowlist of vendor configuration paths (e.g., `<homedir>/.gemini/config/skills/safe-change/`).
   - Writing directly into `<homedir>/` root, arbitrary dotfiles (`~/.bashrc`), or arbitrary home subdirectories is permanently forbidden.
   - Requires explicit `--global` command flag plus interactive confirmation.

---

## 21. Symlink and Junction Policy

1. **Zero-Trust Symlink Handling**:
   - The installer must never create symbolic links or NTFS directory junctions.
   - The installer must inspect every target directory and file using `fs.lstat` before reading or writing.
2. **Rejection Rule**:
   - If any component of the target path is a symlink or junction, the installer immediately halts with a `Safety violation` error.
3. **No Following**:
   - Files are never opened with write flags through symlinks.

---

## 22. TOCTOU Mitigation

Time-Of-Check to Time-Of-Use (TOCTOU) race conditions are mitigated through:
1. **Pre-Write Verification**: Re-checking file descriptors and directory entries with `lstat` immediately prior to open/write calls.
2. **Atomic File Replacement**: Writing content to temporary files in the same directory and renaming via `fs.renameSync` (or transactional replacement on Windows).
3. **File Descriptor Operations**: Where supported, operating on open file descriptors (`fstat`, `fsync`) rather than path strings.

---

## 23. Windows, macOS, and Linux Considerations

| Consideration | Windows | macOS | Linux |
| --- | --- | --- | --- |
| **Filesystem Sensitivity** | Case-insensitive (NTFS default). Case-variant checks must normalize path casing. | Typically case-preserving, case-insensitive (APFS default). | Strictly case-sensitive (ext4/btrfs). Identical name with different case is a distinct file. |
| **Path Separators** | Backslash `\` and forward slash `/`. Path normalization must handle mixed separators. | Forward slash `/`. | Forward slash `/`. |
| **Atomic Renames** | `fs.rename` fails if destination file exists and is open. Requires retry or staging replacement. | POSIX atomic `rename` replaces destination atomically. | POSIX atomic `rename` replaces destination atomically. |
| **Temporary Dirs** | `os.tmpdir()` is inside `%USERPROFILE%\AppData\Local\Temp` (inside home). | `os.tmpdir()` is typically `/var/folders/...` (outside home). | `os.tmpdir()` is `/tmp` (outside home). |
| **Directory Links** | NTFS Junctions and Symlinks. Both detected via `lstat`. | POSIX Symlinks. Detected via `lstat`. | POSIX Symlinks. Detected via `lstat`. |

---

## 24. File Ownership Markers

To distinguish safe-change managed files from user-created or foreign files:
1. **Manifest File**: The installer writes a hidden metadata manifest:
   `.agents/skills/safe-change/.safe-change-manifest.json`
   Containing:
   - `schemaVersion`: Manifest format version.
   - `packageName`: `safe-change`.
   - `installedVersion`: Package version installed.
   - `installedAt`: ISO timestamp.
   - `managedFiles`: Array of managed file paths and their SHA-256 hashes.
2. **Header Comments**: In generated instruction files where comments are permitted, an explicit header comment indicates ownership:
   `<!-- Managed by safe-change. Do not edit manually; use safe-change update. -->`
3. **Safety Check**: Uninstallation and updates verify the manifest before removing or modifying files.

---

## 25. Protection for User-Owned Files

1. **Non-Destructive Guarantee**: Files without valid safe-change ownership markers are classified as user-owned and are completely read-only to the installer.
2. **No Truncation**: No open flag with `w` or `w+` is ever called on a user-owned file.
3. **Collision Preservation**: If a user creates a custom `SKILL.md` inside `.agents/skills/safe-change/` without safe-change markers, the installer refuses to modify it and advises the user to rename or back up their file.

---

## 26. Policy for `AGENTS.md`, `CLAUDE.md`, and Equivalent Instruction Files

Shared root instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`) present unique multi-tool collision risks because they are typically owned by the repository maintainer and contain project-wide instructions.

### The Conflict Problem
Appending or modifying instructions in a shared markdown file risks:
- Cluttering user prompts with duplicate or conflicting rules.
- Silently altering repository instructions without maintainer approval.
- Corrupting manual formatting, existing prompts, or custom headings.

### Architectural Policy
1. **No Silent Mutation**: The installer must never automatically edit, append to, or prepend to `AGENTS.md`, `CLAUDE.md`, or `.cursorrules`.
2. **Dedicated Skill Priority**: The installer exclusively targets dedicated, namespaced skill directories (e.g. `.agents/skills/safe-change/SKILL.md`).
3. **Merge Advisory**: If an agent relies exclusively on a shared instruction file (e.g., Codex using `AGENTS.md`), the installer will operate in advisory mode:
   - Generate a recommended snippet block with explicit delimiters:
     ```markdown
     <!-- BEGIN safe-change INSTRUCTIONS -->
     ...
     <!-- END safe-change INSTRUCTIONS -->
     ```
   - Print the snippet to terminal and provide clear instructions for manual insertion, rather than rewriting the file.
4. **Automated Merge Restriction**: Automated merging into shared files is postponed until a deterministic, tested merge engine with full collision detection and rollback is designed.

---

## 27. Security Threat Model

The installer operates in developer environments where untrusted repositories or adversarial inputs may be present:

| Threat | Attack Vector | Mitigation in Architecture |
| --- | --- | --- |
| **Arbitrary File Overwrite** | Path traversal in agent names (e.g., `../../etc/passwd`) | Strict path canonicalization, boundary validation, and rejection of traversal characters. |
| **Symlink Poisoning** | Pre-creating a symlink in `.agents/skills/safe-change` pointing to critical user files | `fs.lstat` inspection before every access; immediate rejection of symlinks and junctions. |
| **Privilege Escalation** | Running installer with elevated privileges (`sudo`, Administrator) | Installer explicitly warns or refuses to run under `sudo` / Administrator unless installing system-wide. |
| **Malicious Repository Drift** | An untrusted repository containing crafted config trying to hijack skill paths | Installer only writes to predefined, sandboxed directories within the active workspace root. |
| **Dependency Hijacking** | Malicious packages masquerading as safe-change skills | Skill source is bundled inside the verified npm package; no dynamic downloads from external URLs. |

---

## 28. Trust Boundaries

1. **Package Trust Boundary**:
   - The npm package contents signed/published under `safe-change` are trusted.
   - The canonical `skills/safe-change/SKILL.md` within the package is trusted.
2. **Filesystem Trust Boundary**:
   - The user workspace filesystem is considered potentially hostile or tainted (may contain symlinks, existing files, read-only permissions).
   - The user home directory is strictly protected and non-writable by default.
3. **Execution Trust Boundary**:
   - Child processes spawned by the installer are prohibited. The installer performs only direct Node.js filesystem API calls.

---

## 29. Test Strategy

Any future implementation of the installer must pass a rigorous multi-tier test suite:

1. **Unit Tests**:
   - Path resolution and boundary enforcement functions.
   - Ownership manifest serialization and deserialization.
   - SHA-256 hash comparison and drift detection.
   - Exit code consistency across all failure modes.
2. **Filesystem Fixture Tests**:
   - Clean installation into isolated temporary project directory.
   - Detection of pre-existing collisions (files, directories).
   - Rejection of symlinks, junctions, and relative traversals.
   - Idempotent update execution.
   - Complete cleanup during uninstallation.
3. **Cross-Platform Integration Tests**:
   - Execution on Windows, macOS, and Linux runners in CI.
   - Validation of case-sensitivity handling across filesystems.
   - Line ending preservation (`LF` vs `CRLF`).
4. **Process Interruption Tests**:
   - Simulation of `SIGINT` mid-transaction to verify zero orphaned files and proper rollback.

---

## 30. Package and npm Distribution Strategy

1. **Package Contents**:
   - The npm package will include:
     - `dist/` (compiled TypeScript CLI binaries).
     - `skills/safe-change/SKILL.md` (canonical skill).
     - `README.md`, `LICENSE`, `SECURITY.md`, `GUIDE.md`.
2. **Distribution Mechanism**:
   - Primary: `npx safe-change install [agent]` (runs the verified package directly without persistent global binary installation).
   - Secondary: `npm install -g safe-change` for developers desiring the global CLI.
3. **Publishing Safeguards**:
   - `npm pack --dry-run` validation in CI to confirm exact file counts (currently 53 files in baseline).
   - Automated git tag and release branch verification.

---

## 31. Release Gates

Before any production code for Milestone C is released, the following gates must be satisfied:

1. **Architecture Sign-Off**: Formal review of this specification (`docs/installer-architecture.md`) by project leadership.
2. **Fixture Validation**: All filesystem fixture tests pass with 100% success on Windows, macOS, and Linux runners.
3. **Zero Test Regressions**: Existing 95 tests across 7 test files continue to pass without modification or weakening.
4. **Zero Production Mutation**: Core CLI commands (`save`, `check`, `diff`) and baseline managers remain completely untouched.
5. **No Undocumented Assumptions**: All supported agent targets must have documentation-verified paths and reproducible validation evidence.

---

## 32. Unresolved Questions

The following architectural questions remain open and will require empirical research or runtime testing before implementation:

1. **Antigravity Public Specification**:
   - When will Antigravity release a public specification URL for external auditor verification?
   - Does Antigravity IDE require a workspace window reload to detect newly added `.agents/skills/` directories, or is file watching reactive?
2. **Shared Prompt Merging**:
   - What is the optimal, zero-risk strategy for agents like Codex that lack dedicated skill directories and rely solely on `AGENTS.md`?
   - Should safe-change completely decline automated writes to `AGENTS.md` and remain strictly manual/advisory?
3. **Windows UNC and Network Drives**:
   - How should the installer handle workspaces mounted over SMB/UNC paths (`\\server\share`) where NTFS junction checks and symlink resolution may behave differently?
4. **Multiple Agent Coexistence**:
   - If a developer uses both Cursor and Antigravity in the same workspace, should `safe-change install` install both adapters, or should it require explicit sequential commands?
