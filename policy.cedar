// ==========================================
// VeritasAudit Cedar Access-Control Policies
// ==========================================
// Evaluates AI Agent tool calls against strict, risk-tiered development rules.

// ------------------------------------------
// TIER 1: Low Risk - Read-Only File Tools
// ------------------------------------------
// Auto-approved. No restrictions on reads to prevent yak-shaving loops.
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name in ["read_file", "list_directory", "grep_search", "view_file"]
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
  resource.tool_name in ["write_file", "replace_file_content", "multi_replace_file_content"]
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
  resource.tool_name in ["write_file", "replace_file_content", "multi_replace_file_content"]
  && resource has args
  && (
    resource.args.path == "policy.cedar"
    || resource.args.path == "protect-mcp.config.json"
    || resource.args.path like "scripts/*"
  )
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
    resource.args.commandLine like "bash scripts/sandbox-execute.sh *"
    || resource.args.commandLine like "bash scripts/ci-verify.sh*"
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
