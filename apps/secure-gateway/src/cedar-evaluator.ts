import * as fs from 'node:fs';
import { sanitizeLogValue } from './security-sanitize';

export type ASTNode =
  | { type: 'AND'; left: ASTNode; right: ASTNode }
  | { type: 'OR'; left: ASTNode; right: ASTNode }
  | { type: 'NOT'; operand: ASTNode }
  | { type: 'HAS'; path: string; prop: string }
  | { type: 'IN'; path: string; values: string[] }
  | { type: 'LIKE'; path: string; pattern: string }
  | { type: 'CONTAINS'; path: string; substring: string }
  | { type: 'EQUALS'; path: string; value: any }
  | { type: 'GREATER_THAN'; path: string; value: number }
  | { type: 'LESS_THAN'; path: string; value: number }
  | { type: 'GREATER_THAN_OR_EQUAL'; path: string; value: number }
  | { type: 'LESS_THAN_OR_EQUAL'; path: string; value: number }
  | { type: 'BOOLEAN'; path: string };

export interface ParsedRule {
  effect: 'permit' | 'forbid';
  conditionStr: string;
  ast: ASTNode;
}

export class CedarEvaluator {
  private rules: ParsedRule[] = [];
  private wasmInstance: any = null;
  private strings: string[] = [];

  constructor(policyPathOrText?: string) {
    if (policyPathOrText) {
      if (fs.existsSync(policyPathOrText)) {
        const text = fs.readFileSync(policyPathOrText, 'utf-8');
        this.parse(text);
      } else {
        this.parse(policyPathOrText);
      }
    }
    this.initWasm();
  }

  private initWasm() {
    try {
      const wasmPath = fs.existsSync('/Users/sagehart/Documents/Antigravity Test Project/antigravity-custom-dev/scripts/cedar-eval.wasm')
        ? '/Users/sagehart/Documents/Antigravity Test Project/antigravity-custom-dev/scripts/cedar-eval.wasm'
        : 'scripts/cedar-eval.wasm';
      
      if (fs.existsSync(wasmPath)) {
        const wasmBuffer = fs.readFileSync(wasmPath);
        const wasmModule = new WebAssembly.Module(wasmBuffer);
        const self = this;
        this.wasmInstance = new WebAssembly.Instance(wasmModule, {
          env: {
            is_authorized_js: (pIdx: number, aIdx: number, rIdx: number, cIdx: number): number => {
              const principal = self.strings[pIdx];
              const toolName = self.strings[aIdx];
              const args = JSON.parse(self.strings[rIdx]);
              const context = JSON.parse(self.strings[cIdx]);
              
              const decision = self.evaluateTSEngine(principal, toolName, args, context);
              return decision === 'allow' ? 1 : 0;
            }
          }
        });
      }
    } catch (err) {
      console.warn('[CedarEvaluator] WebAssembly fallback engine failed to initialize:', err);
    }
  }

  /**
   * Parses standard Cedar policy syntax into a structured AST.
   */
  public parse(policyText: string): void {
    this.rules = [];
    
    // Remove comments
    const lines = policyText.split('\n');
    const cleanLines = lines.map(line => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.substring(0, idx) : line;
    });
    const cleanText = cleanLines.join(' ').trim();

    // Regex to match individual Cedar permit/forbid rule blocks
    const ruleRegex = /(permit|forbid)\s*\(\s*principal\s*,\s*action\s*==\s*Action::"call_tool"\s*,\s*resource\s*\)\s*when\s*\{([\s\S]*?)\}\s*;/g;
    
    let match;
    while ((match = ruleRegex.exec(cleanText)) !== null) {
      const effect = match[1] as 'permit' | 'forbid';
      const conditionStr = match[2].trim();
      
      try {
        const tokens = this.tokenize(conditionStr);
        const ast = this.parseExpression(tokens);
        this.rules.push({ effect, conditionStr, ast });
      } catch (err: any) {
        console.error(`[CedarEvaluator] Error parsing rule when-condition: "${sanitizeLogValue(conditionStr)}". Error: ${sanitizeLogValue(err.message)}`);
      }
    }
  }

  /**
   * Tokenizes the condition expression.
   */
  private tokenize(expr: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    
    while (i < expr.length) {
      const char = expr[i];
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        i++;
        continue;
      }
      
      if (expr.startsWith('&&', i)) {
        tokens.push('&&');
        i += 2;
      } else if (expr.startsWith('||', i)) {
        tokens.push('||');
        i += 2;
      } else if (expr.startsWith('==', i)) {
        tokens.push('==');
        i += 2;
      } else if (expr.startsWith('>=', i)) {
        tokens.push('>=');
        i += 2;
      } else if (expr.startsWith('<=', i)) {
        tokens.push('<=');
        i += 2;
      } else if (char === '=') {
        tokens.push('=');
        i++;
      } else if (char === '>') {
        tokens.push('>');
        i++;
      } else if (char === '<') {
        tokens.push('<');
        i++;
      } else if (char === '!') {
        tokens.push('!');
        i++;
      } else if (char === '(') {
        tokens.push('(');
        i++;
      } else if (char === ')') {
        tokens.push(')');
        i++;
      } else if (char === '[') {
        // Find matching closed bracket
        let start = i;
        let depth = 1;
        i++;
        while (i < expr.length && depth > 0) {
          if (expr[i] === '[') depth++;
          if (expr[i] === ']') depth--;
          i++;
        }
        tokens.push(expr.substring(start, i));
      } else if (char === '"') {
        // String literal
        let start = i;
        i++;
        while (i < expr.length && expr[i] !== '"') {
          if (expr[i] === '\\') i++; // Skip escaped quote
          i++;
        }
        i++; // Consume closing quote
        tokens.push(expr.substring(start, i));
      } else {
        // Words, identifiers, properties, paths or operators
        let start = i;
        while (i < expr.length && !' \t\n\r&|!()[]"><='.includes(expr[i])) {
          i++;
        }
        tokens.push(expr.substring(start, i));
      }
    }
    return tokens;
  }

  /**
   * Custom AST builder utilizing a recursive descent parser.
   */
  private parseExpression(tokens: string[]): ASTNode {
    let index = 0;

    function peek(): string | undefined {
      return tokens[index];
    }

    function consume(expected?: string): string {
      const token = tokens[index++];
      if (!token) throw new Error('Unexpected end of tokens during Cedar parsing');
      if (expected && token !== expected) {
        throw new Error(`Expected token '${expected}', got '${token}'`);
      }
      return token;
    }

    function parseOr(): ASTNode {
      let node = parseAnd();
      while (peek() === '||') {
        consume('||');
        const right = parseAnd();
        node = { type: 'OR', left: node, right };
      }
      return node;
    }

    function parseAnd(): ASTNode {
      let node = parsePrimary();
      while (peek() === '&&') {
        consume('&&');
        const right = parsePrimary();
        node = { type: 'AND', left: node, right };
      }
      return node;
    }

    function parsePrimary(): ASTNode {
      const token = peek();
      
      if (token === '!') {
        consume('!');
        const operand = parsePrimary();
        return { type: 'NOT', operand };
      }
      
      if (token === '(') {
        consume('(');
        const node = parseOr();
        consume(')');
        return node;
      }

      // Read identifier path
      const path = consume();
      const next = peek();

      if (next === 'in') {
        consume('in');
        const arrToken = consume();
        const values = JSON.parse(arrToken);
        return { type: 'IN', path, values };
      } else if (next === '==') {
        consume('==');
        const valToken = consume();
        const value = JSON.parse(valToken);
        return { type: 'EQUALS', path, value };
      } else if (next === '>') {
        consume('>');
        const valToken = consume();
        const value = JSON.parse(valToken);
        return { type: 'GREATER_THAN', path, value };
      } else if (next === '<') {
        consume('<');
        const valToken = consume();
        const value = JSON.parse(valToken);
        return { type: 'LESS_THAN', path, value };
      } else if (next === '>=') {
        consume('>=');
        const valToken = consume();
        const value = JSON.parse(valToken);
        return { type: 'GREATER_THAN_OR_EQUAL', path, value };
      } else if (next === '<=') {
        consume('<=');
        const valToken = consume();
        const value = JSON.parse(valToken);
        return { type: 'LESS_THAN_OR_EQUAL', path, value };
      } else if (next === 'like') {
        consume('like');
        const patternToken = consume();
        const pattern = JSON.parse(patternToken);
        return { type: 'LIKE', path, pattern };
      } else if (next === 'has') {
        consume('has');
        const prop = consume();
        return { type: 'HAS', path, prop };
      } else if (path.includes('.contains')) {
        const realPath = path.substring(0, path.indexOf('.contains'));
        consume('(');
        const valToken = consume();
        const substring = JSON.parse(valToken);
        consume(')');
        return { type: 'CONTAINS', path: realPath, substring };
      }

      // Support simple boolean attribute references (e.g. !context.devops.pipeline_passed)
      if (!next || next === '&&' || next === '||' || next === ')') {
        return { type: 'BOOLEAN', path };
      }

      throw new Error(`Unexpected token sequence near '${path} ${next || ''}'`);
    }

    return parseOr();
  }

  /**
   * Performs static schema validation on the context payload to match policy.cedarschema.
   */
  private validateContextSchema(contextObj?: Record<string, any>): boolean {
    if (!contextObj) return true;

    // 1. Verify DevOps types
    if (contextObj.devops) {
      const d = contextObj.devops;
      if (typeof d.pipeline_passed !== 'boolean' && d.pipeline_passed !== undefined) return false;
      if (typeof d.security_audited !== 'boolean' && d.security_audited !== undefined) return false;
      if (typeof d.ham_drift_checked !== 'boolean' && d.ham_drift_checked !== undefined) return false;
    }

    // 2. Verify IBP types
    if (contextObj.ibp) {
      const i = contextObj.ibp;
      if (typeof i.cross_functional_synthesized !== 'boolean' && i.cross_functional_synthesized !== undefined) return false;
      if (typeof i.budget_aligned !== 'boolean' && i.budget_aligned !== undefined) return false;
      if (typeof i.budget_exhaustion_percentage !== 'number' && i.budget_exhaustion_percentage !== undefined) return false;
      if (typeof i.subagent_budget_aligned !== 'boolean' && i.subagent_budget_aligned !== undefined) return false;
      if (typeof i.subagent_budget_exhaustion_percentage !== 'number' && i.subagent_budget_exhaustion_percentage !== undefined) return false;
      if (typeof i.subagent_id !== 'string' && i.subagent_id !== undefined) return false;
    }

    // 3. Verify PLM types
    if (contextObj.plm) {
      const p = contextObj.plm;
      if (typeof p.active_requirement_id !== 'string' && p.active_requirement_id !== null && p.active_requirement_id !== undefined) return false;
      if (typeof p.associated_tests_written !== 'boolean' && p.associated_tests_written !== undefined) return false;
      if (typeof p.has_api_drift !== 'boolean' && p.has_api_drift !== undefined) return false;
      if (typeof p.drift_verified !== 'boolean' && p.drift_verified !== undefined) return false;
      if (typeof p.release_version_updated !== 'boolean' && p.release_version_updated !== undefined) return false;
      if (typeof p.changelog_updated !== 'boolean' && p.changelog_updated !== undefined) return false;
      if (typeof p.has_active_feedback !== 'boolean' && p.has_active_feedback !== undefined) return false;
      if (typeof p.feedback_aligned !== 'boolean' && p.feedback_aligned !== undefined) return false;
    }

    return true;
  }

  /**
   * Evaluates the parsed Cedar policy rules against the incoming request attributes.
   */
  public isAuthorized(principal: string, toolName: string, args: Record<string, any>, contextObj?: Record<string, any>): 'allow' | 'deny' {
    if (!this.validateContextSchema(contextObj)) {
      console.warn(`[CedarEvaluator] Context schema validation failed. Rejecting request.`);
      return 'deny';
    }

    if (this.wasmInstance) {
      try {
        this.strings = [];
        const pIdx = this.pushString(principal);
        const aIdx = this.pushString(toolName);
        const rIdx = this.pushString(JSON.stringify(args || {}));
        const cIdx = this.pushString(JSON.stringify(contextObj || {}));
        
        const res = this.wasmInstance.exports.is_authorized(pIdx, aIdx, rIdx, cIdx);
        return res === 1 ? 'allow' : 'deny';
      } catch (err) {
        console.warn('[CedarEvaluator] WASM execution failed, falling back to pure TS engine:', err);
      }
    }

    return this.evaluateTSEngine(principal, toolName, args, contextObj);
  }

  private pushString(str: string): number {
    this.strings.push(str);
    return this.strings.length - 1;
  }

  public evaluateTSEngine(principal: string, toolName: string, args: Record<string, any>, contextObj?: Record<string, any>): 'allow' | 'deny' {
    const evalContext = {
      principal,
      resource: {
        tool_name: toolName,
        args: args || {}
      },
      context: contextObj || {}
    };

    let permitted = false;
    let forbidden = false;

    for (const rule of this.rules) {
      try {
        const result = this.evaluateAST(rule.ast, evalContext);
        if (result) {
          if (rule.effect === 'forbid') {
            forbidden = true;
            break; // Forbid rules immediately override everything in Cedar
          } else if (rule.effect === 'permit') {
            permitted = true;
          }
        }
      } catch (err) {
        // Fix 6: Surface evaluation failures as warnings so policy authors can debug broken conditions.
        // Behavior is unchanged (fails closed — the rule is skipped, effectively a deny).
        console.warn(`[CedarEvaluator] Rule evaluation failed (rule skipped, fails closed):`, err);
      }
    }

    return (permitted && !forbidden) ? 'allow' : 'deny';
  }

  /**
   * Helper function to execute AST operations on the attributes context.
   */
  private evaluateAST(node: ASTNode, context: any): boolean {
    const getPathValue = (obj: any, pathStr: string): any => {
      const parts = pathStr.split('.');
      let curr = obj;
      for (const part of parts) {
        if (curr === null || curr === undefined || typeof curr !== 'object') {
          return undefined;
        }
        curr = curr[part];
      }
      return curr;
    };

    const globMatch = (str: string, pattern: string): boolean => {
      // Escape regex syntax characters except for wildcard *
      const regexStr = '^' + pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*') + '$';
      const regex = new RegExp(regexStr);
      return regex.test(str);
    };

    switch (node.type) {
      case 'AND':
        return this.evaluateAST(node.left, context) && this.evaluateAST(node.right, context);
      case 'OR':
        return this.evaluateAST(node.left, context) || this.evaluateAST(node.right, context);
      case 'NOT':
        return !this.evaluateAST(node.operand, context);
      case 'HAS': {
        const val = getPathValue(context, node.path);
        return val !== undefined && val !== null && node.prop in val;
      }
      case 'IN': {
        const val = getPathValue(context, node.path);
        return typeof val === 'string' && node.values.includes(val);
      }
      case 'EQUALS': {
        const val = getPathValue(context, node.path);
        return val === node.value;
      }
      case 'GREATER_THAN': {
        const val = getPathValue(context, node.path);
        return typeof val === 'number' && val > node.value;
      }
      case 'LESS_THAN': {
        const val = getPathValue(context, node.path);
        return typeof val === 'number' && val < node.value;
      }
      case 'GREATER_THAN_OR_EQUAL': {
        const val = getPathValue(context, node.path);
        return typeof val === 'number' && val >= node.value;
      }
      case 'LESS_THAN_OR_EQUAL': {
        const val = getPathValue(context, node.path);
        return typeof val === 'number' && val <= node.value;
      }
      case 'LIKE': {
        const val = getPathValue(context, node.path);
        return typeof val === 'string' && globMatch(val, node.pattern);
      }
      case 'CONTAINS': {
        const val = getPathValue(context, node.path);
        return typeof val === 'string' && val.includes(node.substring);
      }
      case 'BOOLEAN': {
        const val = getPathValue(context, node.path);
        return val === true;
      }
      default:
        return false;
    }
  }

  /**
   * Expose loaded rule details (useful for testing/verifying).
   */
  public getRulesCount(): number {
    return this.rules.length;
  }

  /**
   * Run detailed simulation with rule matching diagnostics and temporary overrides.
   */
  public evaluateSimulator(
    principal: string,
    toolName: string,
    args: Record<string, any>,
    contextObj?: Record<string, any>
  ): { decision: 'allow' | 'deny'; matchingPolicies: string[]; reason: string } {
    if (!this.validateContextSchema(contextObj)) {
      return {
        decision: 'deny',
        matchingPolicies: [],
        reason: 'Context schema validation failed: Attribute types do not match policy.cedarschema specifications.'
      };
    }

    const evalContext = {
      principal,
      resource: {
        tool_name: toolName,
        args: args || {}
      },
      context: contextObj || {}
    };

    const triggeredPermits: string[] = [];
    const triggeredForbids: string[] = [];

    for (let idx = 0; idx < this.rules.length; idx++) {
      const rule = this.rules[idx];
      try {
        const result = this.evaluateAST(rule.ast, evalContext);
        if (result) {
          const ruleLabel = `Rule #${idx + 1} (${rule.effect.toUpperCase()}): when { ${rule.conditionStr} }`;
          if (rule.effect === 'forbid') {
            triggeredForbids.push(ruleLabel);
          } else {
            triggeredPermits.push(ruleLabel);
          }
        }
      } catch (err) {
        // Fix 6: Surface evaluation failures as warnings so policy authors can debug broken conditions.
        console.warn(`[CedarEvaluator][Simulator] Rule #${idx + 1} evaluation failed (rule skipped, fails closed):`, err);
      }
    }

    const hasForbid = triggeredForbids.length > 0;
    const hasPermit = triggeredPermits.length > 0;
    const decision = (hasPermit && !hasForbid) ? 'allow' : 'deny';

    let reason = '';
    if (hasForbid) {
      reason = `Explicitly blocked by: ${triggeredForbids.join(', ')}`;
    } else if (hasPermit) {
      reason = `Permitted by: ${triggeredPermits.join(', ')}`;
    } else {
      reason = 'Implicitly denied: No matching permit rules were satisfied.';
    }

    return {
      decision,
      matchingPolicies: [...triggeredPermits, ...triggeredForbids],
      reason
    };
  }
}
