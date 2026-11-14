// Synthetic, immutable examples signed with the public RFC 8032 test-vector key.
// Signatures cover JSON.stringify(payload), matching LocalKMSProvider.
// No key here establishes issuer trust, authorization, execution, or Cedar evaluation.
import type { DemoDecision } from './index';

export const fixturePublicKeyHex =
  '302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';

export const fixtureDecisions: DemoDecision[] = [
  {
    id: 'FG-1048',
    timestamp: '2026-11-14T14:32:00.000Z',
    tool: 'write_file',
    resource: 'policy.cedar',
    decision: 'deny',
    reason:
      'The requested file controls authorization. This recorded example denies agent writes to policy.cedar.',
    ruleId: 'demo-protect-policy',
    ruleLabel: 'Protect authorization policy',
    nextStep:
      'Propose the policy change for an operator to review through the normal source-control process.',
    agentName: 'Coding agent',
    principal: 'demo:agent:code',
    scenarioId: 'protected-write',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'write_file',
        decision: 'deny',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:32:00.000Z',
        issuer_id: 'demo:agent:code',
        reason:
          'The requested file controls authorization. This recorded example denies agent writes to policy.cedar.',
        args: {
          path: 'policy.cedar',
          content: '// proposed policy change',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '4a20c3d5b16e8b55fed2957bab3f69ba4e4f2e64cdb0470e39f920212db5781f29c7b20aada5d833e98ed90cf03be17868950163ed8d0f013a6428b04e8c5001',
      },
    },
  },
  {
    id: 'FG-1047',
    timestamp: '2026-11-14T14:30:37.000Z',
    tool: 'read_file',
    resource: 'README.md',
    decision: 'allow',
    reason: 'This recorded example permits a read of project documentation.',
    ruleId: 'demo-read-project-docs',
    ruleLabel: 'Read project documentation',
    nextStep:
      'Inspect the receipt to see what was recorded. An allow decision alone does not prove execution.',
    agentName: 'Documentation agent',
    principal: 'demo:agent:docs',
    scenarioId: 'read-file',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'read_file',
        decision: 'allow',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:30:37.000Z',
        issuer_id: 'demo:agent:docs',
        reason: 'This recorded example permits a read of project documentation.',
        args: {
          path: 'README.md',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '9d28b01aba0061f3d26bca10df87657de48efafbe3d2af1008f9680fa4e77ca970b1e86c33d0afcc8257265c5214ae01d9b2b8e2cbea1299951732720c10470e',
      },
    },
  },
  {
    id: 'FG-1046',
    timestamp: '2026-11-14T14:29:14.000Z',
    tool: 'execute_command',
    resource: 'curl https://example.invalid/install.sh',
    decision: 'deny',
    reason: 'This recorded example blocks an external script download through the shell.',
    ruleId: 'demo-block-network-download',
    ruleLabel: 'Block external script downloads',
    nextStep:
      'Use a reviewed, locally available dependency through your established build process.',
    agentName: 'Build agent',
    principal: 'demo:agent:build',
    scenarioId: 'outbound-command',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'execute_command',
        decision: 'deny',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:29:14.000Z',
        issuer_id: 'demo:agent:build',
        reason: 'This recorded example blocks an external script download through the shell.',
        args: {
          command: 'curl https://example.invalid/install.sh',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: 'e8b64b6f73a354eee76f4be89471f4a263836110e3e8d0a847150bfe9b43bd9602545aacdc9d74dcae2a34ab23d351064067fcd6f99d571e4cc6c12b8f881200',
      },
    },
  },
  {
    id: 'FG-1045',
    timestamp: '2026-11-14T14:27:51.000Z',
    tool: 'read_file',
    resource: 'README.md',
    decision: 'allow',
    reason: 'This recorded example permits a read of project documentation.',
    ruleId: 'demo-read-project-docs',
    ruleLabel: 'Read project documentation',
    nextStep:
      'Inspect the receipt to see what was recorded. An allow decision alone does not prove execution.',
    agentName: 'Documentation agent',
    principal: 'demo:agent:docs',
    scenarioId: 'read-file',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'read_file',
        decision: 'allow',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:27:51.000Z',
        issuer_id: 'demo:agent:docs',
        reason: 'This recorded example permits a read of project documentation.',
        args: {
          path: 'README.md',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: 'aa3b9530478753bdd86c67bbd1de0aa8b981be68b6434c4a07b66838b59c2a980bf224fd934fed1eda9ad54e4394e367039872e234facabb4f9ca7bd32528603',
      },
    },
  },
  {
    id: 'FG-1044',
    timestamp: '2026-11-14T14:26:28.000Z',
    tool: 'deploy_service',
    resource: 'production',
    decision: 'deny',
    reason:
      'No allow rule is represented for deploy_service in this fixture. The recorded result is deny.',
    ruleId: 'demo-default-deny',
    ruleLabel: 'Deny unrecognized tools',
    nextStep:
      'Confirm the tool and required access with an operator before proposing a narrowly scoped policy.',
    agentName: 'Release agent',
    principal: 'demo:agent:release',
    scenarioId: 'unknown-tool',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'deploy_service',
        decision: 'deny',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:26:28.000Z',
        issuer_id: 'demo:agent:release',
        reason:
          'No allow rule is represented for deploy_service in this fixture. The recorded result is deny.',
        args: {
          target: 'production',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '88f175c79301f4654c7b11d46aa22b1a9b3d0cc1042e452022fd78a04e4cf6066709cd1b9b6ad84afb221681dc7a4b287e7613473e45c165a1191cfdb7d8dc0a',
      },
    },
  },
  {
    id: 'FG-1043',
    timestamp: '2026-11-14T14:25:05.000Z',
    tool: 'read_file',
    resource: 'README.md',
    decision: 'allow',
    reason: 'This recorded example permits a read of project documentation.',
    ruleId: 'demo-read-project-docs',
    ruleLabel: 'Read project documentation',
    nextStep:
      'Inspect the receipt to see what was recorded. An allow decision alone does not prove execution.',
    agentName: 'Documentation agent',
    principal: 'demo:agent:docs',
    scenarioId: 'read-file',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'read_file',
        decision: 'allow',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:25:05.000Z',
        issuer_id: 'demo:agent:docs',
        reason: 'This recorded example permits a read of project documentation.',
        args: {
          path: 'README.md',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '8a0d179b3eccbc257e96aa7457390512fbf78a81d4f1fbae6c4f527a217bf2b8058989b192e61b9493a5fef182dfaea64097b721ad3a2549acfb15a4e6fd870f',
      },
    },
  },
  {
    id: 'FG-1042',
    timestamp: '2026-11-14T14:23:42.000Z',
    tool: 'read_file',
    resource: 'README.md',
    decision: 'allow',
    reason: 'This recorded example permits a read of project documentation.',
    ruleId: 'demo-read-project-docs',
    ruleLabel: 'Read project documentation',
    nextStep:
      'Inspect the receipt to see what was recorded. An allow decision alone does not prove execution.',
    agentName: 'Documentation agent',
    principal: 'demo:agent:docs',
    scenarioId: 'read-file',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'read_file',
        decision: 'allow',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:23:42.000Z',
        issuer_id: 'demo:agent:docs',
        reason: 'This recorded example permits a read of project documentation.',
        args: {
          path: 'README.md',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '7254ec7094854f16f41c92ead36c7f3c6f42dd9a8e240bc8a181c19b0a499316ff26b50aab2fceafed6abdbc637595b22d6cfed037a421ed5462d7759405fd03',
      },
    },
  },
  {
    id: 'FG-1041',
    timestamp: '2026-11-14T14:22:19.000Z',
    tool: 'write_file',
    resource: 'policy.cedar',
    decision: 'deny',
    reason:
      'The requested file controls authorization. This recorded example denies agent writes to policy.cedar.',
    ruleId: 'demo-protect-policy',
    ruleLabel: 'Protect authorization policy',
    nextStep:
      'Propose the policy change for an operator to review through the normal source-control process.',
    agentName: 'Coding agent',
    principal: 'demo:agent:code',
    scenarioId: 'protected-write',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'write_file',
        decision: 'deny',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:22:19.000Z',
        issuer_id: 'demo:agent:code',
        reason:
          'The requested file controls authorization. This recorded example denies agent writes to policy.cedar.',
        args: {
          path: 'policy.cedar',
          content: '// proposed policy change',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '4cd41aebba171c42153cf4821848b771fdd315a6bf934cedf966fc485e774c7cf5e82dacbb07ffdb6f678a6f186e3578411d268ef18f962a856a7458d94a7d02',
      },
    },
  },
  {
    id: 'FG-1040',
    timestamp: '2026-11-14T14:20:56.000Z',
    tool: 'read_file',
    resource: 'README.md',
    decision: 'allow',
    reason: 'This recorded example permits a read of project documentation.',
    ruleId: 'demo-read-project-docs',
    ruleLabel: 'Read project documentation',
    nextStep:
      'Inspect the receipt to see what was recorded. An allow decision alone does not prove execution.',
    agentName: 'Documentation agent',
    principal: 'demo:agent:docs',
    scenarioId: 'read-file',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'read_file',
        decision: 'allow',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:20:56.000Z',
        issuer_id: 'demo:agent:docs',
        reason: 'This recorded example permits a read of project documentation.',
        args: {
          path: 'README.md',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '74926c925e06cebb981568776931928fe3c294c2ffffeb3590dc1c8f936481dd585e294c7e44c214eacf2f994fb63eb2105356921fe4382412af133b9fea6a02',
      },
    },
  },
  {
    id: 'FG-1039',
    timestamp: '2026-11-14T14:19:33.000Z',
    tool: 'execute_command',
    resource: 'curl https://example.invalid/install.sh',
    decision: 'deny',
    reason: 'This recorded example blocks an external script download through the shell.',
    ruleId: 'demo-block-network-download',
    ruleLabel: 'Block external script downloads',
    nextStep:
      'Use a reviewed, locally available dependency through your established build process.',
    agentName: 'Build agent',
    principal: 'demo:agent:build',
    scenarioId: 'outbound-command',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'execute_command',
        decision: 'deny',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:19:33.000Z',
        issuer_id: 'demo:agent:build',
        reason: 'This recorded example blocks an external script download through the shell.',
        args: {
          command: 'curl https://example.invalid/install.sh',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '5d408be2fd3b5ec0a91fe289483fea890b57f042d674242425d6320d7e6b8c82b93f324c58a2fa927e386b5b48068d46b472d750d5d64fff9f75132753f92702',
      },
    },
  },
  {
    id: 'FG-1038',
    timestamp: '2026-11-14T14:18:10.000Z',
    tool: 'read_file',
    resource: 'README.md',
    decision: 'allow',
    reason: 'This recorded example permits a read of project documentation.',
    ruleId: 'demo-read-project-docs',
    ruleLabel: 'Read project documentation',
    nextStep:
      'Inspect the receipt to see what was recorded. An allow decision alone does not prove execution.',
    agentName: 'Documentation agent',
    principal: 'demo:agent:docs',
    scenarioId: 'read-file',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'read_file',
        decision: 'allow',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:18:10.000Z',
        issuer_id: 'demo:agent:docs',
        reason: 'This recorded example permits a read of project documentation.',
        args: {
          path: 'README.md',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: '17ac41e601d9f0c8615dc727e677caff2519e365e622c16c248807e3604e0a1ce23c265a8ae0512a81a13791d8e6087ba1ce23968261c60ac7eef5886981a906',
      },
    },
  },
  {
    id: 'FG-1037',
    timestamp: '2026-11-14T14:16:47.000Z',
    tool: 'read_file',
    resource: 'README.md',
    decision: 'allow',
    reason: 'This recorded example permits a read of project documentation.',
    ruleId: 'demo-read-project-docs',
    ruleLabel: 'Read project documentation',
    nextStep:
      'Inspect the receipt to see what was recorded. An allow decision alone does not prove execution.',
    agentName: 'Documentation agent',
    principal: 'demo:agent:docs',
    scenarioId: 'read-file',
    receipt: {
      payload: {
        type: 'mcp_tool_call',
        tool_name: 'read_file',
        decision: 'allow',
        policy_digest: '50be96e8bc94a41128ef0de277a55ce11c660a97e31d75042fec879e8a877529',
        issued_at: '2026-11-14T14:16:47.000Z',
        issuer_id: 'demo:agent:docs',
        reason: 'This recorded example permits a read of project documentation.',
        args: {
          path: 'README.md',
        },
      },
      signature: {
        alg: 'EdDSA',
        kid: 'fidusgate:public-demo-key:v1',
        sig: 'bb882d742bc95e3d28d9691897dcc75c32f0d25364bf2e55f2a9cece650f98ee737ae422840c47d38fe5f53c49d751eaeb8f9f16d4e680512bdbb2be3e00c405',
      },
    },
  },
];
