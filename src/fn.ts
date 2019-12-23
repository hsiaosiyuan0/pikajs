import {
  Statement,
  Node,
  isIdentifier,
  isVariableDeclarator,
  isObjectMember,
  isMemberExpression,
  isFunctionDeclaration,
  isReturnStatement,
  returnStatement,
  FunctionExpression,
  FunctionDeclaration,
  ArrowFunctionExpression,
  isBlockStatement,
  isExpression
} from "@babel/types";
import traverse, { TraverseOptions, VisitNodeObject } from "@babel/traverse";
import { regBuiltin } from "./builtin";

export class Scope {
  outer?: Scope;
  bindings: Map<string, any>;

  constructor(outer?: Scope) {
    this.outer = outer;
    this.bindings = new Map();
  }

  hasLocal(name: string) {
    return this.bindings.has(name);
  }

  hasOuter(name: string) {
    let outer = this.outer;
    while (outer) {
      if (outer.hasLocal(name)) return true;
      outer = outer.outer;
    }
    return false;
  }

  def(name: string) {
    this.bindings.set(name, 1);
  }

  tryDef(name: string) {
    if (this.hasLocal(name))
      throw new Error(`Identifier '${name}' has already been declared`);
    this.def(name);
  }
}

export class FnObj {
  fn: Fn;
  captured: Map<string, any>;
  thisObj: any;

  constructor(fn: Fn) {
    this.fn = fn;
    this.captured = new Map();
  }
}

export function fnExprName(node: FunctionExpression | ArrowFunctionExpression) {
  return `__line${node.loc!.start.line}__`;
}

export class Fn {
  name?: string;
  params: string[];
  body: Statement[];
  subs: Map<string, Fn>;
  outlets: Set<string>;

  _outer?: Fn;
  _scope?: Scope;

  constructor(name = "", params: string[] = [], body: Statement[] = []) {
    this.name = name;
    this.params = params;
    this.body = body;
    this.subs = new Map();
    this.outlets = new Set();
  }

  hasOutlet(name: string) {
    return this.outlets.has(name);
  }

  addOutlet(name: string) {
    let outer: Fn | undefined = this._outer;
    while (outer) {
      if (outer.hasOutlet(name) || outer._scope!.hasLocal(name)) break;
      outer.outlets.add(name);
      outer = outer._outer;
    }
    if (!outer) throw new Error(`${name} is not defined`);
    this.outlets.add(name);
  }

  shouldCapture(name: string) {
    return !this._scope!.hasLocal(name);
  }

  newObj() {
    return new FnObj(this);
  }

  ensureRet() {
    const last = this.body[this.body.length - 1];
    if (last && isReturnStatement(last)) return;
    this.body.push(returnStatement());
  }
}

export type FnTypes =
  | FunctionExpression
  | FunctionDeclaration
  | ArrowFunctionExpression;

export function analyzeFns(node: Node) {
  let fn = new Fn();
  let scope = new Scope();
  regBuiltin(scope);

  function enterScope() {
    scope = new Scope(scope);
  }
  function exitScope() {
    scope = scope.outer!;
  }

  const fnHandler: VisitNodeObject<Node, FnTypes> = {
    enter(path) {
      const node = path.node;
      const params = node.params.map(p => {
        if (isIdentifier(p)) return p.name;
        throw new Error("Unsupported param type: " + p);
      });
      enterScope();
      params.forEach(p => scope.def(p));

      let name: string;
      if (isFunctionDeclaration(node)) {
        name = node.id!.name;
      } else {
        name = fnExprName(node);
      }
      const fun = new Fn(
        name,
        params,
        isBlockStatement(node.body)
          ? node.body.body
          : [isExpression(node.body) ? returnStatement(node.body) : node.body]
      );
      fun._outer = fn;
      fun._scope = scope;
      fn.subs.set(name, fun);
      fn = fun;
    },
    exit() {
      exitScope();
      fn.ensureRet();
      const outer = fn._outer;
      delete fn._outer;
      delete fn._scope;
      fn = outer!;
    }
  };

  const visitor: TraverseOptions = {
    Program: {
      enter(path) {
        fn.body = path.node.body;
        fn._scope = scope;
      },
      exit() {
        fn.ensureRet();
        delete fn._outer;
        delete fn._scope;
      }
    },
    BlockStatement: {
      enter(path) {
        const parent = path.parent;
        if (isFunctionDeclaration(parent)) return;
        enterScope();
      },
      exit(path) {
        const parent = path.parent;
        if (isFunctionDeclaration(parent)) return;
        exitScope();
      }
    },
    FunctionDeclaration: fnHandler,
    FunctionExpression: fnHandler,
    ArrowFunctionExpression: fnHandler,
    Identifier(path) {
      const parent = path.parent;
      const node = path.node;
      const name = path.node.name;
      if (isObjectMember(parent) && parent.key === node) return;
      if (isMemberExpression(parent) && parent.property === node) return;
      if (isVariableDeclarator(parent)) {
        scope.tryDef(name);
        return;
      }
      if (isFunctionDeclaration(parent)) {
        if (parent.id === node) {
          scope.outer!.tryDef(name);
          return;
        }
        if (parent.params.includes(node)) return;
      }
      if (fn.shouldCapture(name)) fn.addOutlet(name);
    }
  };
  traverse(node, visitor);
  return fn;
}

export function isFun(obj: any): obj is FnObj {
  return obj instanceof FnObj;
}

export function isNativeFun(obj: any): obj is Function {
  return obj instanceof Function;
}
