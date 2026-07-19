// ==========================================
// FidusGate Cedar Access-Control Policies
// ==========================================
// Evaluates AI Agent tool calls against strict, risk-tiered development rules.

// ------------------------------------------
// TIER 0: Quarantined Principals
// ------------------------------------------
// Deny all write and execute actions for quarantined agents.
// Quarantine status is hydrated into context.quarantine by the gateway middleware.
// Read-only Tier 1 tools remain permitted so quarantined agents can still respond
// during a human-conducted interview.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  context has quarantine
  && context.quarantine.active == true
  && !(
    resource.tool_name == "read_file"
    || resource.tool_name == "list_directory"
    || resource.tool_name == "search_code"
  )
};

// ------------------------------------------
// TIER 1: Low Risk - Read-Only File Tools
// ------------------------------------------
// Auto-approved. No restrictions on reads to prevent yak-shaving loops.
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "read_file"
  || resource.tool_name == "list_directory"
  || resource.tool_name == "search_code"
};

// ------------------------------------------
// TIER 2: Medium Risk - File Modification
// ------------------------------------------
// Permit file modification only inside source directories. 
// Deny destructive modifications of configuration files or policy lists directly.
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path like "apps/*" 
    || resource.args.path like "packages/*"
    || resource.args.path like ".memory/*"
  )
};

// Strict check: Block writing directly to sensitive files or policy files unless authorized
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path == "policy.cedar"
    || resource.args.path == "protect-mcp.config.json"
    || resource.args.path like "scripts/*"
    || resource.args.path.contains(".env")
  )
  && !(principal == "sb:issuer:security-sme")
};

// ------------------------------------------
// TIER 3: High Risk - Command Execution & Parallel Workers
// ------------------------------------------
// Allow command execution ONLY within the Docker sandbox script or act pipeline helper.
// Forbid raw direct host shell command executions to prevent sandbox escapes.
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine like "bash scripts/sandbox-execute.sh *"
    || resource.args.commandLine like "bash scripts/ci-verify.sh*"
  )
};

// Permit memory retrieval and feedback assimilation commands for all agents.
// These are required for session bootstrapping per CLAUDE.md and must not be blocked
// by the Tier 3 forbid rule, even for non-developer principals.
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine like "npm run memory:context*"
    || resource.args.commandLine like "node scripts/assimilate-feedback.js*"
    || resource.args.commandLine like "npm run policy:dry-run*"
  )
};

forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && !resource.args.commandLine.contains("sandbox-execute.sh")
  && !resource.args.commandLine.contains("ci-verify.sh")
};

// ------------------------------------------
// TIER 4: Critical Risk - Severe Actions
// ------------------------------------------
// Deny any network downloading CLI commands like curl, wget, or direct pip/npm installs
// to avoid unverified package pollution at runtime.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("curl")
    || resource.args.commandLine.contains("wget")
    || resource.args.commandLine.contains("npm i ")
    || resource.args.commandLine.contains("pip install")
  )
};

// ==========================================
// TIER 5: DevOps Stateful Compliance Verification
// ==========================================

// Enforce pipeline verification (ci-verify.sh / npm run ci) after any code changes.
// Deny committing code via git or launching a production publish unless pipeline has passed.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("git commit")
    || resource.args.commandLine.contains("npm publish")
  )
  && !context.devops.pipeline_passed
};

// Enforce static security auditing (agentic-actions-auditor).
// Deny committing if security auditing has not passed (e.g. no scan run or scan failed with High vulnerabilities).
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("git commit")
    || resource.args.commandLine.contains("npm publish")
  )
  && !context.devops.security_audited
};

// Enforce context drift and pre-commit hook checks.
// Deny committing if the pre-commit HAM audit or drift checks haven't run successfully.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("git commit")
    || resource.args.commandLine.contains("npm publish")
  )
  && !context.devops.ham_drift_checked
};

// ==========================================
// TIER 6: Integrated Business Planning (IBP) Stateful Gates
// ==========================================

// Enforce cross-functional synthesis report before code is committed or published.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("git commit")
    || resource.args.commandLine.contains("npm publish")
  )
  && !context.ibp.cross_functional_synthesized
};

// Enforce session financial/token budget alignment.
// Forbid launching high-cost operations (Tiers 3/4) if the token consumption budget is critically low (exceeds 95%).
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("sandbox-execute.sh")
    || resource.args.commandLine.contains("ci-verify.sh")
  )
  && context.ibp.budget_exhaustion_percentage > 95
};

// Enforce subagent specific token budget alignment.
// Forbid any tool calls if the subagent budget has been exhausted (subagent_budget_aligned is false).
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  context.ibp has subagent_budget_aligned
  && !context.ibp.subagent_budget_aligned
};

// ==========================================
// TIER 7: Product Lifecycle Management (PLM) Gates
// ==========================================

// Enforce active Requirement ID prior to editing code files.
// Forbid write operations in source directories if plm active requirement ID is empty/null.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path like "apps/*" 
    || resource.args.path like "packages/*"
  )
  && (
    !context.plm has active_requirement_id
    || context.plm.active_requirement_id == ""
  )
};

// Enforce requirement-to-test traceability prior to git commit.
// Forbid committing if associated tests have not been written.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("git commit")
    || resource.args.commandLine.contains("npm publish")
  )
  && !context.plm.associated_tests_written
};

// Enforce API and Schema drift checks prior to git commit.
// Forbid committing if active API drift exists and has not been verified.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("git commit")
    || resource.args.commandLine.contains("npm publish")
  )
  && context.plm.has_api_drift
  && !context.plm.drift_verified
};

// Enforce Semantic Versioning and Changelog documentation prior to publish.
// Forbid publishing if package.json or CHANGELOG.md have not been updated.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && resource.args.commandLine.contains("npm publish")
  && (
    !context.plm.release_version_updated
    || !context.plm.changelog_updated
  )
};

// Enforce dynamic user/system feedback alignment prior to git commit or publish.
// Forbid committing if active feedback exists and has not been aligned.
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource has args
  && (
    resource.args.commandLine.contains("git commit")
    || resource.args.commandLine.contains("npm publish")
  )
  && context.plm.has_active_feedback
  && !context.plm.feedback_aligned
};

// ==========================================
// TIER 8: Cryptographic SME Role Gating
// ==========================================

// Enforce backend-sme role for database schema and migration updates
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path like "packages/database/*"
    || resource.args.path == "packages/database/prisma/schema.prisma"
  )
  && !(principal == "sb:issuer:backend-sme")
};

// Enforce frontend-sme role for screen and visual component updates
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && resource.args.path like "apps/admin-dashboard/*"
  && !(principal == "sb:issuer:frontend-sme")
};

// Enforce qa-sme role for test suites
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path.contains(".test.")
    || resource.args.path.contains(".spec.")
  )
  && !(principal == "sb:issuer:qa-sme")
};

// Enforce devops-sme role for workflows and docker configurations
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path like ".github/workflows/*"
    || resource.args.path.contains("Dockerfile")
  )
  && !(principal == "sb:issuer:devops-sme")
};

// Enforce security-sme role for policies and configuration
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path == "policy.cedar"
    || resource.args.path == "protect-mcp.config.json"
  )
  && !(principal == "sb:issuer:security-sme")
};

// Enforce security-sme role for secure-gateway source code
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && resource.args.path like "apps/secure-gateway/*"
  && !(principal == "sb:issuer:security-sme")
};


// Enforce pm-sme role for change log records
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && resource.args.path == "CHANGELOG.md"
  && !(principal == "sb:issuer:pm-sme")
};



// Permit devops-sme to modify workflows and docker configurations
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path like ".github/workflows/*"
    || resource.args.path.contains("Dockerfile")
  )
  && principal == "sb:issuer:devops-sme"
};

// Permit security-sme to modify policy files in the root
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && (
    resource.args.path == "policy.cedar"
    || resource.args.path == "protect-mcp.config.json"
  )
  && (principal == "sb:issuer:security-sme")
};

// Permit pm-sme to modify changelogs in the root
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  (
    resource.tool_name == "write_file"
    || resource.tool_name == "patch_file"
  )
  && resource has args
  && resource.args.path == "CHANGELOG.md"
  && (principal == "sb:issuer:pm-sme")
};

// ------------------------------------------
// LOCAL DEVELOPMENT BYPASS
// ------------------------------------------
// Allow local testing agent (mcp-agent) READ-ONLY access for shadow/enforce testing mode.
// Narrowed from a blanket permit to Tier 1 tools only to prevent privilege escalation
// via a spoofed principal name.
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  principal == "mcp-agent@fidusgate.internal"
  && (
    resource.tool_name == "read_file"
    || resource.tool_name == "list_directory"
    || resource.tool_name == "search_code"
  )
};

// ==========================================
// TIER 9: Strict Native Tool Interception & Block
// ==========================================
// Explicitly forbid native client tools to ensure agents only use FidusGate MCP tools
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "run_command"
  || resource.tool_name == "write_to_file"
  || resource.tool_name == "replace_file_content"
  || resource.tool_name == "multi_replace_file_content"
  || resource.tool_name == "view_file"
  || resource.tool_name == "list_dir"
  || resource.tool_name == "grep_search"
};
