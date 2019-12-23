import {
  Statement,
  isIdentifier,
  isObjectMember,
  isMemberExpression,
  isAssignmentExpression,
  program,
  file,
  Expression,
  expressionStatement,
  isV8IntrinsicIdentifier,
  isExpression,
  isFunctionExpression,
  isArrowFunctionExpression,
  V8IntrinsicIdentifier,
  CallExpression,
  NewExpression,
  isNewExpression,
  Node
} from "@babel/types";
import {
  analyzeFns,
  FnObj,
  Fn,
  fnExprName,
  FnTypes,
  isFun,
  isNativeFun
} from "./fn";
import traverse, { TraverseOptions, NodePath } from "@babel/traverse";
import generate from "@babel/generator";
import { runtime, makeFrame, Runtime } from "./runtime";
import { parse } from "@babel/parser";
import { fatal } from "./util";

class RuntimeError extends Error {}

export const wrapFn2Native = (fn: FnObj, runtime: Runtime) => {
  if (fn.native) return fn.native;
  fn.native = function(...args: any[]) {
    const { pushFrame } = runtime;
    const frame = makeFrame(fn, args);
    pushFrame(frame);
    execFrame(runtime);
  };
  return fn.native;
};

const resolveFn = (path: NodePath<FnTypes>, runtime: Runtime) => {
  const { env, topFnObj, push } = runtime;
  const node = path.node;
  let name: string;
  let fo: FnObj;
  const fnObj = topFnObj() as FnObj;
  if (isFunctionExpression(node) || isArrowFunctionExpression(node)) {
    name = fnExprName(node);
    fo = fnObj.fn.subs.get(name)!.newObj();
    env().registerCapture(fo);
    push(fo);
  } else {
    name = node.id!.name;
    fo = fnObj.fn.subs.get(name)!.newObj();
    env()
      .registerCapture(fo)
      .def(name, fo);
  }
  path.skip();
};

export const kProto = "__proto__";

export const getProto = (obj: any, key: string) => {
  if (obj === null)
    throw new RuntimeError(`Cannot read property '${key}' of null`);
  if (obj === undefined)
    throw new RuntimeError(`Cannot read property '${key}' of undefined`);
  if (obj.hasOwnProperty(key)) return obj[key];
  if (obj[kProto]) return getProto(obj[kProto], key);
  return undefined;
};

export const node2str = (node: Node) => {
  const { code } = generate(node);
  return code;
};

function execExpr(expr: Expression | V8IntrinsicIdentifier, runtime: Runtime) {
  if (isV8IntrinsicIdentifier(expr)) {
    throw new RuntimeError("Unsupported expr type: " + expr);
  }

  const { push, pop, env, pushFrame } = runtime;

  const literal: TraverseOptions = {
    NullLiteral() {
      push(null);
    },
    StringLiteral(path) {
      push(path.node.value);
    },
    BooleanLiteral(path) {
      push(path.node.value);
    },
    NumericLiteral(path) {
      push(path.node.value);
    },
    ObjectExpression: {
      enter() {
        push({});
      }
    },
    ObjectProperty: {
      exit() {
        const v = pop();
        const k = pop();
        const obj = pop();
        obj[k] = v;
        push(obj);
      }
    },
    ArrayExpression: {
      exit(path) {
        const node = path.node;
        const arr: any[] = [];
        let i = node.elements.length;
        while (i) {
          arr.push(pop());
          i--;
        }
        push(arr.reverse());
      }
    }
  };

  const simpleExpr: TraverseOptions = {
    Identifier(path) {
      const node = path.node;
      const parent = path.parent;
      if (
        isAssignmentExpression(parent) &&
        parent.left === node &&
        parent.operator === "="
      ) {
        push(node.name);
        return;
      }
      if (isObjectMember(parent) && parent.key === node) {
        push(node.name);
        return;
      }
      if (isMemberExpression(parent) && parent.property === node) {
        push(node.name);
        return;
      }
      push(env().deref(node.name));
    },
    BinaryExpression: {
      exit(path) {
        const node = path.node;
        const b = pop();
        const a = pop();
        switch (node.operator) {
          case "+": {
            push(a + b);
            break;
          }
          default:
            throw new RuntimeError("Unsupported operator: " + node.operator);
        }
      }
    },
    AssignmentExpression(path) {
      const node = path.node;
      const op = node.operator[0];
      execExpr(node.right, runtime);
      const rhs = pop();
      let v = rhs;
      const ops = {
        "+": (l: any, r: any) => l + r,
        "-": (l: any, r: any) => l - r,
        "*": (l: any, r: any) => l * r,
        "/": (l: any, r: any) => l / r
      };
      const supports = Object.keys(ops);
      if (supports.includes(op)) {
        const lhs = rhs;
        v = supports[op](lhs, pop());
      }
      const left = node.left;
      if (isIdentifier(left)) {
        env().update(left.name, v);
      } else if (isMemberExpression(left)) {
        execExpr(left.object, runtime);
        if (isIdentifier(left.property)) push(left.property.name);
        else execExpr(left.property, runtime);
        const key = pop();
        const obj = pop();
        obj[key] = v;
      }
      push(v);
    },
    MemberExpression: {
      exit(path) {
        const parent = path.parent;
        if (isAssignmentExpression(parent) && parent.left === path.node) return;
        const key = pop();
        const obj = pop();
        const v = getProto(obj, key);
        if (isFun(v) || isNativeFun(v)) v.thisObj = obj;
        push(v);
      }
    }
  };

  const fnExpr: TraverseOptions = {
    FunctionExpression(path) {
      resolveFn(path, runtime);
    },
    ArrowFunctionExpression(path) {
      resolveFn(path, runtime);
    }
  };

  const fnCall = function(path: NodePath<NewExpression | CallExpression>) {
    const node = path.node;
    execExpr(node.callee, runtime);
    const fn = pop();
    if (!isFun(fn) && !isNativeFun(fn)) {
      throw new RuntimeError(`${node2str(node.callee)} is not a function`);
    }
    const isNew = isNewExpression(node);
    if (isNew) {
      const obj = {
        [kProto]: fn["prototype"]
      };
      fn.thisObj = obj;
    }
    let args: any[] = [];
    node.arguments.forEach(arg => {
      if (!isExpression(arg))
        throw new RuntimeError("Unsupported argument type: " + arg);
      execExpr(arg, runtime);
      args.push(pop());
    });
    if (isNativeFun(fn)) {
      args = args.map(arg => (isFun(arg) ? wrapFn2Native(arg, runtime) : arg));
    }
    const frame = makeFrame(fn, args, isNew);
    frame.fnObj = fn;
    pushFrame(frame);
    execFrame(runtime);
    path.skip();
  };

  const thisExpr: TraverseOptions = {
    ThisExpression() {
      const { topFnObj } = runtime;
      const fn = topFnObj() as FnObj;
      push(fn.thisObj);
    }
  };

  const newExpr: TraverseOptions = {
    NewExpression: fnCall
  };

  const callExpr: TraverseOptions = {
    CallExpression: fnCall
  };

  traverse(file(program([expressionStatement(expr)]), null, null), {
    ...literal,
    ...simpleExpr,
    ...callExpr,
    ...fnExpr,
    ...thisExpr,
    ...newExpr
  });
}

function execStmt(stmt: Statement, runtime: Runtime) {
  const { push, pop, enterEnv, exitEnv, env } = runtime;
  const exprStmt: TraverseOptions = {
    ExpressionStatement(path) {
      execExpr(path.node.expression, runtime);
      path.skip();
    }
  };

  const retStmt: TraverseOptions = {
    ReturnStatement(path) {
      const node = path.node;
      const { topFrame, topFnObj } = runtime;
      const frame = topFrame()!;
      const { isNew } = frame;
      if (isNew()) push((topFnObj() as FnObj).thisObj);
      else if (node.argument) execExpr(node.argument, runtime);
      else push(undefined);
      frame.isTerminated = true;
      exitEnv();
      path.skip();
    }
  };

  const varDecStmt: TraverseOptions = {
    VariableDeclarator(path) {
      const node = path.node;
      if (!isIdentifier(node.id)) {
        throw new RuntimeError(
          "Unsupported id type in VariableDeclarator: " + node.id
        );
      }
      const name = node.id.name;
      if (node.init) execExpr(node.init, runtime);
      const init = node.init ? pop() : undefined;
      env().def(name, init);
      path.skip();
    }
  };

  const funDecStmt: TraverseOptions = {
    FunctionDeclaration(path) {
      resolveFn(path, runtime);
    }
  };

  const blockStmt: TraverseOptions = {
    BlockStatement: {
      enter() {
        enterEnv();
      },
      exit() {
        exitEnv();
      }
    }
  };

  const ifStmt: TraverseOptions = {
    IfStatement(path) {
      const node = path.node;
      execExpr(node.test, runtime);
      const test = pop();
      if (test) {
        execStmt(node.consequent, runtime);
      } else if (node.alternate) {
        execStmt(node.alternate, runtime);
      }
      path.skip();
    }
  };

  traverse(file(program([stmt]), null, null), {
    ...exprStmt,
    ...varDecStmt,
    ...funDecStmt,
    ...blockStmt,
    ...retStmt,
    ...ifStmt
  });
}

function execFrame(runtime: Runtime) {
  const { enterEnv, push, popFrame, topFrame } = runtime;
  const frame = topFrame()!;
  const { fnObj, args, getPC, incPC } = frame;
  const pc = getPC();

  // native
  if (typeof fnObj === "function") {
    const thisObj = (fnObj as any).thisObj;
    const ret = fnObj.apply(thisObj, args);
    push(ret);
    popFrame();
    return;
  }

  if (pc === 0) {
    const _env = enterEnv();
    fnObj.captured.forEach((v, k) => _env.def(k, v));
    _env.registerCapture(fnObj);
    fnObj.fn.params.forEach((name, i) => _env.def(name, args[i]));
  }
  const stmts = fnObj.fn.body;
  while (!frame.isTerminated) {
    execStmt(stmts[getPC()], runtime);
    incPC();
  }
  popFrame();
}

export function exec(code: string) {
  let fn: Fn;
  try {
    const ast = parse(code);
    fn = analyzeFns(ast);
  } catch (e) {
    fatal("Unexpected error when preparing: " + e.stack);
  }
  const rt = runtime();
  const { pushFrame, topFrame } = rt;
  pushFrame(makeFrame(fn!.newObj()));
  try {
    while (topFrame()) {
      execFrame(rt);
    }
  } catch (err) {
    if (err instanceof RuntimeError) fatal("Runtime error: " + err.stack);
    throw err;
  }
}
