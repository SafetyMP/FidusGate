import * as fs from 'node:fs';

// AST Node definitions
export type ASTNode =
  | { type: 'AND'; left: ASTNode; right: ASTNode }
  | { type: 'OR'; left: ASTNode; right: ASTNode }
  | { type: 'NOT'; operand: ASTNode }
  | { type: 'HAS'; path: string; prop: string }
  | { type: 'IN'; path: string; values: string[] }
  | { type: 'LIKE'; path: string; pattern: string }
  | { type: 'CONTAINS'; path: string; substring: string }
  | { type: 'EQUALS'; path: string; value: string };

export interface ParsedRule {
  effect: 'permit' | 'forbid';
  conditionStr: string;
  ast: ASTNode;
}

export class CedarEvaluator {
  private rules: ParsedRule[] = [];

  constructor(policyPathOrText?: string) {
    if (policyPathOrText) {
      if (fs.existsSync(policyPathOrText)) {
        const text = fs.readFileSync(policyPathOrText, 'utf-8');
        this.parse(text);
      } else {
        this.parse(policyPathOrText);
      }
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
        console.error(`[CedarEvaluator] Error parsing rule when-condition: "${conditionStr}". Error: ${err.message}`);
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
        while (i < expr.length && !' \t\n\r&|!()[]"'.includes(expr[i])) {
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

      throw new Error(`Unexpected token sequence near '${path} ${next || ''}'`);
    }

    return parseOr();
  }

  /**
   * Evaluates the parsed Cedar policy rules against the incoming request attributes.
   */
  public isAuthorized(principal: string, toolName: string, args: Record<string, any>): 'allow' | 'deny' {
    const evalContext = {
      principal,
      resource: {
        tool_name: toolName,
        args: args || {}
      }
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
        // Fall through, skip failed evaluations
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
      case 'LIKE': {
        const val = getPathValue(context, node.path);
        return typeof val === 'string' && globMatch(val, node.pattern);
      }
      case 'CONTAINS': {
        const val = getPathValue(context, node.path);
        return typeof val === 'string' && val.includes(node.substring);
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
}
