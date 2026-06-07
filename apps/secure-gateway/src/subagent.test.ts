import test from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { CedarEvaluator } from './cedar-evaluator';
import { routeModel } from './model-router';
import { IBPComplianceTracker } from './compliance-trackers';
import { FidusGateDatabase } from '@fidusgate/database';

test('FidusGate Subagent Orchestration & Isolation Tests', async (t) => {
  const rootPolicyPath = path.resolve(__dirname, '..', '..', '..', 'policy.cedar');
  const evaluator = new CedarEvaluator(rootPolicyPath);

  // Helper for mock WebSocket broadcast
  const mockBroadcast = () => {};

  // Clean up any memory files from previous test suites to prevent state leakage
  const pathsToClean = [
    path.resolve(process.cwd(), '.memory'),
    path.resolve(__dirname, '..', '..', '..', '.memory'),
    path.resolve(__dirname, '..', '.memory')
  ];
  const filesToClean = [
    'ibp-compliance-state.json',
    'devops-compliance-state.json',
    'plm-compliance-state.json',
    'drift-status.json'
  ];
  for (const memoryDir of pathsToClean) {
    for (const file of filesToClean) {
      const filePath = path.join(memoryDir, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {}
      }
    }
  }

  await t.test('1. Subagent Token Budget Isolation', () => {
    const tracker = new IBPComplianceTracker(mockBroadcast);
    tracker.clearTasks();

    const subagentA = 'subagent-A';
    const subagentB = 'subagent-B';

    // Set budget for subagent A to 1000 tokens, subagent B to 5000 tokens
    tracker.recordSubagentTokenUsage(subagentA, 200, 1000);
    tracker.recordSubagentTokenUsage(subagentB, 500, 5000);

    // Initial check
    assert.ok(tracker.isSubagentBudgetAligned(subagentA), 'Subagent A should be aligned');
    assert.ok(tracker.isSubagentBudgetAligned(subagentB), 'Subagent B should be aligned');

    // Consume beyond A's budget
    tracker.recordSubagentTokenUsage(subagentA, 900); // consumed = 1100, budget = 1000
    assert.strictEqual(tracker.isSubagentBudgetAligned(subagentA), false, 'Subagent A budget should be exceeded');
    assert.ok(tracker.isSubagentBudgetAligned(subagentB), 'Subagent B should remain aligned');

    // Evaluate policy on subagent A (should forbid due to budget)
    const contextA = {
      subagentId: subagentA,
      subagentMaxBudget: 1000,
      path: 'apps/secure-gateway/src/index.ts',
      commandLine: '',
      devops: { pipeline_passed: true, security_audited: true, ham_drift_checked: true },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: tracker.isBudgetAligned(),
        budget_exhaustion_percentage: tracker.getBudgetExhaustionPercentage(),
        subagent_budget_aligned: tracker.isSubagentBudgetAligned(subagentA),
        subagent_budget_exhaustion_percentage: tracker.getSubagentBudgetExhaustionPercentage(subagentA),
        subagent_id: subagentA
      },
      plm: { active_requirement_id: 'REQ-101', associated_tests_written: true, has_api_drift: false, drift_verified: true, release_version_updated: true, changelog_updated: true }
    };

    const decisionA = evaluator.isAuthorized(
      'sb:issuer:test',
      'write_file',
      { path: 'apps/secure-gateway/src/index.ts' },
      contextA
    );
    assert.strictEqual(decisionA, 'deny', 'Policy should deny tool calls for subagent with exceeded budget');

    // Evaluate policy on subagent B (should allow)
    const contextB = {
      subagentId: subagentB,
      subagentMaxBudget: 5000,
      path: 'apps/secure-gateway/src/index.ts',
      commandLine: '',
      devops: { pipeline_passed: true, security_audited: true, ham_drift_checked: true },
      ibp: {
        cross_functional_synthesized: true,
        budget_aligned: tracker.isBudgetAligned(),
        budget_exhaustion_percentage: tracker.getBudgetExhaustionPercentage(),
        subagent_budget_aligned: tracker.isSubagentBudgetAligned(subagentB),
        subagent_budget_exhaustion_percentage: tracker.getSubagentBudgetExhaustionPercentage(subagentB),
        subagent_id: subagentB
      },
      plm: { active_requirement_id: 'REQ-101', associated_tests_written: true, has_api_drift: false, drift_verified: true, release_version_updated: true, changelog_updated: true }
    };

    const decisionB = evaluator.isAuthorized(
      'sb:issuer:test',
      'write_file',
      { path: 'apps/secure-gateway/src/index.ts' },
      contextB
    );
    assert.strictEqual(decisionB, 'allow', 'Policy should permit tool calls for subagent within budget');
  });

  await t.test('2. Dynamic Model Routing Recommendations', () => {
    const tracker = new IBPComplianceTracker(mockBroadcast);
    tracker.clearTasks();

    // Standard high-complexity task
    const req1 = {
      taskDescription: 'Compile TypeScript source and execute tests',
      toolName: 'execute_command'
    };
    const res1 = routeModel(req1, tracker);
    assert.strictEqual(res1.recommendedModel, 'gemini-3.5-pro', 'Should route high complexity task to Pro');

    // Standard low-complexity task
    const req2 = {
      taskDescription: 'Read the contents of policy.cedar',
      toolName: 'read_file'
    };
    const res2 = routeModel(req2, tracker);
    assert.strictEqual(res2.recommendedModel, 'gemini-3.5-flash', 'Should route low complexity task to Flash');

    // Low subagent budget condition (remaining budget < 5000)
    tracker.recordSubagentTokenUsage('sub-low', 16000, 20000); // 4000 left
    const req3 = {
      taskDescription: 'Compile TypeScript source and execute tests',
      toolName: 'execute_command',
      subagentId: 'sub-low'
    };
    const res3 = routeModel(req3, tracker);
    assert.strictEqual(res3.recommendedModel, 'gemini-3.5-flash', 'Should downgrade to Flash due to low subagent budget');
    assert.ok(res3.reason.includes('Downgraded'), 'Reason should explain the downgrade');

    // Low global budget condition (remaining budget < 15000)
    const trackerLowGlobal = new IBPComplianceTracker(mockBroadcast);
    trackerLowGlobal.clearTasks();
    trackerLowGlobal.recordTokenUsage(70000); // remaining: 10000 (budget is 80000)
    
    const req4 = {
      taskDescription: 'Compile TypeScript source and execute tests',
      toolName: 'execute_command'
    };
    const res4 = routeModel(req4, trackerLowGlobal);
    assert.strictEqual(res4.recommendedModel, 'gemini-3.5-flash', 'Should downgrade to Flash due to low global budget');
  });

  await t.test('3. Database Write Concurrency Locking', async () => {
    const db = new FidusGateDatabase();
    await db.clearDatabase();

    // Spawn 20 parallel writes to the command logs file in the mock database
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        db.addCommandLog({
          id: `cmd_concur_${i}`,
          timestamp: new Date().toISOString(),
          command: `echo test_${i}`,
          user: 'test-concurrency',
          role: 'developer',
          status: 'success',
          exitCode: 0,
          cedarDecision: 'allow'
        })
      );
    }

    await Promise.all(promises);

    // Read back and assert no elements were dropped due to write conflicts
    const logs = await db.getCommandLogs();
    const concurrencyLogs = logs.filter(l => l.user === 'test-concurrency');
    assert.strictEqual(concurrencyLogs.length, 20, 'All 20 concurrent logs should be persisted without data loss');
  });

  await t.test('4. Isolated Copy-on-Write Sandbox Workspaces', () => {
    const workspacePath = path.resolve(__dirname, '..', '..', '..');
    const subagentId = 'test-sandbox-subagent';
    const subagentMemoryDir = path.join(workspacePath, '.memory', 'subagents', subagentId);

    // Clean up if exists
    if (fs.existsSync(subagentMemoryDir)) {
      try {
        execSync(`rm -rf "${subagentMemoryDir}"`);
      } catch (e) {}
    }

    // Run simple echo in sandbox under the subagent ID
    const sandboxCmd = `bash scripts/sandbox-execute.sh "echo 'hello'" "${workspacePath}" "${subagentId}"`;
    const logs = execSync(sandboxCmd, { cwd: workspacePath, encoding: 'utf8', env: { ...process.env, FIDUSGATE_ALLOW_HOST_FALLBACK: 'true' } });

    assert.ok(logs.includes('hello'), 'Sandbox execution should succeed and print output');
    assert.ok(fs.existsSync(subagentMemoryDir), 'Isolated subagent memory directory should be created');

    // Clean up after verification
    try {
      execSync(`rm -rf "${subagentMemoryDir}"`);
    } catch (e) {}
  });

  await t.test('5. New MCP Tools Policy Validation', () => {
    const plmCompliantContext = {
      plm: {
        active_requirement_id: 'REQ-123',
        associated_tests_written: true,
        has_api_drift: false,
        drift_verified: true,
        release_version_updated: true,
        changelog_updated: true,
        has_active_feedback: false,
        feedback_aligned: true
      }
    };

    // 1. read_file permit verification
    const readDecision = evaluator.isAuthorized(
      'mcp-agent@fidusgate.internal',
      'read_file',
      { path: 'apps/secure-gateway/src/index.ts' },
      {}
    );
    assert.strictEqual(readDecision, 'allow', 'mcp-agent should be allowed to call read_file');

    // 2. patch_file permit verification (Tier 2 source dirs)
    const patchAllowedDecision = evaluator.isAuthorized(
      'mcp-agent@fidusgate.internal',
      'patch_file',
      { path: 'apps/secure-gateway/src/mcp-server.ts' },
      plmCompliantContext
    );
    assert.strictEqual(patchAllowedDecision, 'allow', 'mcp-agent should be allowed to patch source files');

    // 3. patch_file forbid verification (sensitive config/policy files)
    const patchDeniedDecision = evaluator.isAuthorized(
      'mcp-agent@fidusgate.internal',
      'patch_file',
      { path: 'policy.cedar' },
      plmCompliantContext
    );
    assert.strictEqual(patchDeniedDecision, 'deny', 'mcp-agent should be forbidden from patching policy.cedar');

    // 4. patch_file authorized role exception (security-sme should be allowed to modify policy.cedar)
    const patchSecSMEDecision = evaluator.isAuthorized(
      'sb:issuer:security-sme',
      'patch_file',
      { path: 'policy.cedar' },
      plmCompliantContext
    );
    assert.strictEqual(patchSecSMEDecision, 'allow', 'security-sme should be allowed to patch policy.cedar');

    // 5. search_code permit verification
    const searchDecision = evaluator.isAuthorized(
      'mcp-agent@fidusgate.internal',
      'search_code',
      { query: 'test' },
      {}
    );
    assert.strictEqual(searchDecision, 'allow', 'mcp-agent should be allowed to search code');

    // 6. list_directory permit verification
    const listDecision = evaluator.isAuthorized(
      'mcp-agent@fidusgate.internal',
      'list_directory',
      { path: 'apps' },
      {}
    );
    assert.strictEqual(listDecision, 'allow', 'mcp-agent should be allowed to list directory');
  });
});

