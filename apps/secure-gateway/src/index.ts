import express from 'express';
import cors from 'cors';
import { VeritasDatabase } from '@veritas/database';
import { verifyReceipt } from '@veritas/crypto-utils';
import { Transaction, AuditReceipt, SecurityFinding } from '@veritas/core-types';

const app = express();
const port = process.env.PORT || 3001;
const db = new VeritasDatabase();

app.use(cors());
app.use(express.json());

// Logger helper with security tagging
function log(level: 'info' | 'warn' | 'error' | 'security', message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '');
}

// ==========================================
// Recommendation #5: Real-time Incident Alerting
// ==========================================
async function dispatchWebhookAlert(type: 'blocked_action' | 'finding', data: any) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  
  try {
    let payload = {};
    
    if (type === 'blocked_action') {
      const { receipt } = data;
      payload = {
        text: `🚨 *VeritasAudit Security Alert: Blocked AI Agent Action!*`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚨 *VeritasAudit Security Alert: Blocked AI Agent Action!*\nAn autonomous coding agent attempted to execute a high-risk tool call that was programmatically blocked by Cedar policy controls.`
            }
          },
          {
            type: "divider"
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*🔧 Tool Attempted:*\n\`${receipt.payload.tool_name}\`` },
              { type: "mrkdwn", text: `*🛡️ Decision:*\n\`${receipt.payload.decision.toUpperCase()}\`` },
              { type: "mrkdwn", text: `*🎖️ Risk Tier:*\n\`Tier ${receipt.payload.claimed_issuer_tier}\`` },
              { type: "mrkdwn", text: `*✍️ Signed Issuer:*\n\`${receipt.payload.issuer_id}\`` }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*📋 Audit Reason:* ${receipt.payload.reason}`
            }
          }
        ]
      };
    } else if (type === 'finding') {
      const { finding } = data;
      payload = {
        text: `⚠️ *VeritasAudit Security Finding: CI Pipeline Vulnerability!*`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⚠️ *VeritasAudit Security Finding: Pipeline Vulnerability Scanned!*\nThe static CI/CD workflow security auditor has detected a potential prompt injection vulnerability in your GitHub Actions configurations.`
            }
          },
          {
            type: "divider"
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*🎯 Vector ID:*\n\`${finding.vector}\`` },
              { type: "mrkdwn", text: `*🔴 Severity:*\n*${finding.severity.toUpperCase()}*` },
              { type: "mrkdwn", text: `*📂 Target File:*\n\`${finding.file}\`` },
              { type: "mrkdwn", text: `*⚙️ Workflow Step:*\n\`${finding.step}\`` }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*💥 Critical Impact:* ${finding.impact}\n\n*🛡️ Recommended Remediation:* ${finding.remediation}`
            }
          }
        ]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      log('info', `Security notification successfully dispatched to Slack webhook.`);
    } else {
      log('warn', `Slack webhook returned non-200 status: ${response.status}`);
    }
  } catch (err: any) {
    log('error', `Failed to dispatch Slack webhook notification alert:`, err.message);
  }
}

// ==========================================
// REST API Routes
// ==========================================

// 1. GET /api/transactions - Retrieve list of transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const list = await db.getTransactions();
    res.json(list);
  } catch (error) {
    log('error', 'Failed to retrieve transactions', error);
    res.status(500).json({ error: 'Failed to retrieve transactions' });
  }
});

// Helper to mask sensitive information (PII)
function maskPII(text: string): string {
  if (text.includes('@')) {
    const parts = text.split('@');
    const name = parts[0];
    const domain = parts[1];
    return `${name.substring(0, 1)}***@${domain.substring(0, 1)}***`;
  }
  
  const words = text.split(' ');
  if (words.length > 1) {
    return words.map(w => `${w.substring(0, 1)}***`).join(' ');
  }
  
  return `${text.substring(0, 2)}***`;
}

// 2. POST /api/transactions - Create a new transaction with automatic PII filtering
app.post('/api/transactions', async (req, res) => {
  try {
    const { sender, recipient, amount, currency } = req.body;
    
    if (!sender || !recipient || amount === undefined || !currency) {
       res.status(400).json({ error: 'Missing required parameters: sender, recipient, amount, currency' });
       return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isSenderPii = emailRegex.test(sender) || sender.toLowerCase().includes(' wallet') || sender.split(' ').length > 2;
    const isRecipientPii = emailRegex.test(recipient) || recipient.toLowerCase().includes(' wallet') || recipient.split(' ').length > 2;
    const requiresMasking = isSenderPii || isRecipientPii;
    
    const processedSender = requiresMasking ? maskPII(sender) : sender;
    const processedRecipient = requiresMasking ? maskPII(recipient) : recipient;
    
    const isSuspicious = sender.toLowerCase().includes('tor') || recipient.toLowerCase().includes('tor') || amount > 1000000;
    const status = isSuspicious ? 'flagged' : 'completed';
    
    const newTx: Transaction = {
      id: `tx_${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      sender: processedSender,
      recipient: processedRecipient,
      amount: Number(amount),
      currency,
      status,
      maskedPii: requiresMasking
    };
    
    await db.addTransaction(newTx);
    log('info', `Transaction registered successfully: ${newTx.id}`, { id: newTx.id, status });
    res.status(201).json(newTx);
  } catch (error) {
    log('error', 'Failed to create transaction', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// 3. GET /api/receipts - Retrieve list of signed audit receipts
app.get('/api/receipts', async (req, res) => {
  try {
    const receipts = await db.getAuditReceipts();
    res.json(receipts);
  } catch (error) {
    log('error', 'Failed to retrieve audit receipts', error);
    res.status(500).json({ error: 'Failed to retrieve receipts' });
  }
});

// 4. POST /api/receipts - Verify and record an Ed25519 signed receipt
app.post('/api/receipts', async (req, res) => {
  try {
    const receipt: AuditReceipt = req.body;
    const { payload, signature } = receipt;
    
    if (!payload || !signature || !signature.sig || !signature.kid) {
       res.status(400).json({ error: 'Malformed receipt structure. Missing payload or signature.' });
       return;
    }
    
    const PUBLIC_KEY_MAP: Record<string, string> = {
      'sb:issuer:de073ae64e43': '302a300506032b6570032100df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83'
    };
    
    const publicKeyHex = PUBLIC_KEY_MAP[signature.kid] || signature.kid;
    const isValid = verifyReceipt(receipt, publicKeyHex);
    
    if (!isValid) {
      log('security', 'CRITICAL SECURITY ALERT: Tampered or invalid audit receipt signature detected!', {
        tool_name: payload.tool_name,
        kid: signature.kid
      });
       res.status(400).json({
        error: 'Invalid receipt signature. Verification failed. The audit trail may have been tampered with!',
        verified: false
      });
       return;
    }
    
    await db.addAuditReceipt(receipt);
    log('security', `Cryptographically verified receipt logged: ${payload.tool_name} -> ${payload.decision}`, {
      tool_name: payload.tool_name,
      decision: payload.decision,
      kid: signature.kid
    });
    
    // Slack Alert on Blocked Action
    if (payload.decision === 'deny') {
      dispatchWebhookAlert('blocked_action', { receipt });
    }
    
    res.status(201).json({ message: 'Receipt verified and logged successfully', verified: true });
  } catch (error) {
    log('error', 'Failed to process receipt verification', error);
    res.status(500).json({ error: 'Failed to process receipt' });
  }
});

// 4b. POST /api/receipts/verify - Verify an Ed25519 signed receipt without storing it
app.post('/api/receipts/verify', (req, res) => {
  try {
    const receipt: AuditReceipt = req.body;
    const { payload, signature } = receipt;
    
    if (!payload || !signature || !signature.sig || !signature.kid) {
       res.status(400).json({ error: 'Malformed receipt structure. Missing payload or signature.' });
       return;
    }
    
    const PUBLIC_KEY_MAP: Record<string, string> = {
      'sb:issuer:de073ae64e43': '302a300506032b6570032100df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83'
    };
    
    const publicKeyHex = PUBLIC_KEY_MAP[signature.kid] || signature.kid;
    const isValid = verifyReceipt(receipt, publicKeyHex);
    
    res.json({ verified: isValid });
  } catch (error) {
    log('error', 'Failed to perform standalone verification', error);
    res.status(500).json({ error: 'Failed to verify receipt' });
  }
});

// 5. GET /api/findings - Retrieve static analysis security findings
app.get('/api/findings', async (req, res) => {
  try {
    const list = await db.getFindings();
    res.json(list);
  } catch (error) {
    log('error', 'Failed to retrieve findings', error);
    res.status(500).json({ error: 'Failed to retrieve findings' });
  }
});

// 6. POST /api/findings - Push a set of static analysis findings (called by the auditor CI job)
app.post('/api/findings', async (req, res) => {
  try {
    const findings: SecurityFinding[] = req.body;
    if (!Array.isArray(findings)) {
       res.status(400).json({ error: 'Invalid findings format. Expected a JSON array.' });
       return;
    }
    
    await db.setFindings(findings);
    log('security', `CI Security Auditor reported ${findings.length} findings.`, { count: findings.length });
    
    // Slack Alert on Scanned Findings
    findings.forEach(f => {
      if (f.severity === 'High') {
        dispatchWebhookAlert('finding', { finding: f });
      }
    });
    
    res.json({ message: 'Findings updated successfully', count: findings.length });
  } catch (error) {
    log('error', 'Failed to update findings', error);
    res.status(500).json({ error: 'Failed to update findings' });
  }
});

// 7. POST /api/reset - Clear database to initial state
app.post('/api/reset', async (req, res) => {
  try {
    await db.clearDatabase();
    log('warn', 'Database reset to initial template state.');
    res.json({ message: 'Database reset successfully' });
  } catch (error) {
    log('error', 'Failed to reset database', error);
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

app.listen(port, () => {
  log('info', `VeritasAudit Security Gateway API listening on Port ${port}`);
});
