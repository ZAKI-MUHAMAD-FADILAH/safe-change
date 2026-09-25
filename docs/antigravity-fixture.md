# Antigravity Installation Fixture and Validation Plan

This document details the test fixture, validation methodology, and behavioral boundaries implemented to evaluate safe-change skill installation for Antigravity.

Classification:
"Filesystem fixture validated; runtime discovery not independently verified."

---

## 1. Overview and Status

Antigravity remains a candidate target for the first runtime integration, not a verified installer target.

Prior research established that the canonical skill at `skills/safe-change/SKILL.md` matches the documented directory structure and YAML frontmatter requirements of Antigravity (`.agents/skills/<name>/SKILL.md`). However, before designing or writing a production installer, filesystem operations, collision safety, and lifecycle behaviors must be tested in an isolated fixture.

This fixture verifies file-system mechanics within isolated temporary directories without modifying user data or running production installation commands.

---

## 2. What Was Actually Tested

The automated fixture tests (`tests/integration/antigravity-fixture.test.ts` and `tests/fixtures/antigravity-fixture.ts`) validated the following behaviors:

1. **Byte-for-Byte Identity**:
   - The canonical skill file at `skills/safe-change/SKILL.md` is copied into the target directory.
   - The copied file is verified to be 100% byte-for-byte identical to the source canonical file using buffer comparison (`bufA.equals(bufB)`).
2. **Frontmatter Integrity**:
   - The YAML frontmatter remains intact after copying.
   - Validated that `name: safe-change` and a non-empty `description` string exist and are parseable.
3. **Directory Structure and Naming**:
   - The target skill directory is created exactly as `.agents/skills/safe-change/`.
   - The directory name is strictly `safe-change` (kebab-case).
4. **Side-Effect Isolation**:
   - Unrelated files in the project workspace (e.g., `package.json`, existing `.agents/rules/*.md`, sibling skills like `.agents/skills/other-tool/`) remain completely unmodified.
5. **Collision Detection**:
   - If `.agents/skills/safe-change/` already exists with pre-existing or custom content, the fixture detects the existing directory and refuses to overwrite by default, returning a `collision_detected` status with zero bytes written.
6. **Explicit Update Behavior**:
   - When explicit authorization (`overwrite: true`) is provided, existing files are updated, and the resulting file is verified to match the canonical skill.
7. **Explicit Uninstall Behavior**:
   - Uninstalling cleanly removes `.agents/skills/safe-change/`.
   - The parent `.agents/skills/` directory and sibling skills remain intact.
8. **Cancellation Safety**:
   - If an installation or update operation is cancelled (`cancel: true`), no files are written or modified, leaving any existing state intact.
9. **Scope Isolation**:
   - Operations targeting project scope (`.agents/skills/`) never touch the global configuration scope (`.gemini/config/skills/`), and vice versa.
10. **Real Home Directory Protection**:
    - The fixture explicitly blocks any target path pointing to `os.homedir()`, throwing a safety violation error to protect the user's actual environment.
11. **No Symlinks or Junctions**:
    - The fixture uses regular file copies. Verifications assert that neither the directory nor the installed file is a symbolic link.

---

## 3. What Was Only Simulated

1. **Simulated Project Workspace**:
   - Tests execute within disposable temporary directories created via `fs.mkdtempSync(path.join(os.tmpdir(), "safe-change-fixture-proj-"))` and cleaned up in `afterEach`.
2. **Simulated Global Environment**:
   - Global configuration paths are tested against a disposable fake home directory (`safe-change-fixture-home-`), not the actual user home directory.
3. **User Interaction**:
   - Prompts for overwrite confirmation and cancellation are simulated via structured options flags rather than an interactive terminal prompt.
4. **Agent Runtime Discovery**:
   - The Antigravity IDE agent runtime was not launched to evaluate live prompt activation. Only the underlying filesystem contract was tested.

---

## 4. Target Paths

### Project-Level Target Path
- **Canonical Relative Path**: `.agents/skills/safe-change/SKILL.md`
- **Full Path in Project**: `<project-root>/.agents/skills/safe-change/SKILL.md`
- **Aliases Recognized by Antigravity Specification**: `.agent/`, `_agents/`, `_agent/` (the fixture and candidate installer standardize on `.agents/`).

### Future Global Target Path
- **Linux / macOS**: `$HOME/.gemini/config/skills/safe-change/SKILL.md`
- **Windows**: `%USERPROFILE%\.gemini\config\skills\safe-change\SKILL.md`
- **Precedence**: Workspace `.agents/skills/safe-change/` has Priority 1 and strictly overrides global `~/.gemini/config/skills/safe-change/` (Priority 3).

---

## 5. Overwrite and Collision Behavior

The fixture implements conservative collision rules:

1. **Pre-check**: Before creating or copying files, the fixture checks whether `.agents/skills/safe-change/` exists using `fs.existsSync`.
2. **Collision Policy**:
   - If the directory exists and `overwrite` is not `true`, the operation halts immediately.
   - Status returned: `collision_detected`.
   - No files are written, modified, or truncated.
3. **Update Policy**:
   - If the user explicitly selects update/overwrite, the canonical `SKILL.md` overwrites the destination.
   - Status returned: `updated`.
4. **Cancellation Policy**:
   - If the user aborts when prompted, the operation terminates with status `cancelled`.
   - The existing directory remains untouched.

---

## 6. Why Runtime Discovery Remains Unverified

The fixture validates that the filesystem state conforms to the Antigravity Customization System specification. However, live runtime discovery remains unverified for the following reasons:

1. **No Automated Agent Harness**:
   - There is currently no headless CLI harness available within the safe-change test suite to launch the Antigravity IDE, submit a prompt, and observe whether Antigravity's progressive disclosure system injects `safe-change` into context.
2. **Context Window Ingestion**:
   - Antigravity specification states that skill names and descriptions are injected into system context during startup or turn boundaries, and the body is loaded on-demand. Whether Antigravity's model correctly activates `safe-change` on relevant prompts requires live end-to-end interaction testing.
3. **Cache Invalidation Latency**:
   - Whether mid-session installation is detected on the next turn or requires an IDE reload has not been tested against a running instance.

Therefore, the fixture is classified as:
"Filesystem fixture validated; runtime discovery not independently verified."

---

## 7. Exact Commands Used

The following validation commands were used during testing:

```bash
# Build the TypeScript codebase
npm run build

# Run TypeScript type check across the codebase
npm run lint

# Run the complete test suite (all unit and integration tests)
npm test

# Run only the Antigravity installation fixture tests
npx vitest run tests/integration/antigravity-fixture.test.ts
```

---

## 8. Operating System Limitations

1. **Path Separators**:
   - Windows uses backslashes (`\`) while POSIX environments use forward slashes (`/`). The fixture uses `path.join` and `path.resolve` to ensure cross-platform path normalization.
2. **Case Sensitivity**:
   - Windows NTFS is case-preserving but case-insensitive by default. POSIX filesystems (e.g., ext4) are case-sensitive. The skill directory name must be strictly lowercase (`safe-change`) to prevent mismatch across operating systems.
3. **Symlink and Junction Privileges**:
   - Creating symbolic links on Windows often requires elevated administrator privileges or Windows Developer Mode. To guarantee universal compatibility, the initial fixture strictly avoids symlinks and junctions, using standard file copies.
4. **File Locking**:
   - On Windows, files opened by running processes cannot be deleted or overwritten until closed. Clean uninstall and update implementations must handle potential `EBUSY` or `EPERM` conditions gracefully.

---

## 9. Next Steps and Blockers Before Production Installer

The following items must be resolved before proceeding to production installer implementation:

1. **Interactive Prompt Design**:
   - Designing an interactive CLI prompt for scope selection (`project` vs `global`), collision resolution (`overwrite` vs `abort`), and dry-run reporting.
2. **Live Runtime Validation**:
   - Testing an actual safe-change skill installation inside an active Antigravity IDE session to confirm that the model discovers and invokes `safe-change` when prompted.
3. **No Production Installer Yet**:
   - No production installer command is exposed or documented as available in this milestone.
