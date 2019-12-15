import {
  Statement,
  isIdentifier,
  isObjectMember,
  isMemberExpression,
  isAssignmentExpression,
  program,
  file,
  Expression,
  expressionStatement
} from "@babel/types";
import traverse, { TraverseOptions } from "@babel/traverse";
import { analyzeFns, FnObj, Fn, fnExprName } from "./fn";
import { runtime, makeFrame, CallFrame, Runtime } from "./runtime";
import { parse } from "@babel/parser";
import { fatal } from "./util";

class RuntimeError extends Error {}

function execExpr(expr: Expression, runtime: Runtime) {
  const { stack, push, pop, topPos, env, pushFrame, topFnObj } = runtime;

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
        // 如果 identifier 作为赋值语句的左值，且操作符为直接赋值，则将标识符的名称压入栈中
        push(node.name);
        return;
      }
      if (isObjectMember(parent) && parent.key === node) {
        // 如果 identifer 出现在对象字面量中，且作为 key 的部分，则将标识符的名称压入栈中
        push(node.name);
        return;
      }
      if (isMemberExpression(parent) && parent.property === node) {
        // 如果 identifier 出现在成员访问表达式中，且作为属性部分，则将标识符的名称压入栈中
        push(node.name);
        return;
      }
      // 其他情况我们将 identifier 绑定的值压入栈中
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
    AssignmentExpression: {
      exit(path) {
        const node = path.node;
        const op = node.operator[0];
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
          env().update(pop(), v);
        } else if (isMemberExpression(left)) {
          const key = pop();
          const obj = pop();
          obj[key] = v;
        }
        push(v);
      }
    },
    MemberExpression: {
      exit(path) {
        if (isAssignmentExpression(path.parent)) return;
        const key = pop();
        const obj = pop();
        push(obj[key]);
      }
    }
  };

  const fnExpr: TraverseOptions = {
    FunctionExpression(path) {
      const name = fnExprName(path.node);
      const fnObj = topFnObj() as FnObj;
      push(fnObj.fn.subs.get(name));
      path.skip();
    },
    ArrowFunctionExpression(path) {
      const name = fnExprName(path.node);
      const fnObj = topFnObj() as FnObj;
      push(fnObj.fn.subs.get(name));
      path.skip();
    }
  };

  const frames: CallFrame[] = [];
  const callExpr: TraverseOptions = {
    CallExpression: {
      enter() {
        const frame = makeFrame(null as any, topPos());
        frames.push(frame);
      },
      exit() {
        const frame = frames.pop()!;
        const bp = frame.getBP();
        const s = stack();
        const fn = s[bp];
        if (fn instanceof Fn) {
          frame.fnObj = fn.newObj();
        } else {
          // native
          frame.fnObj = fn;
        }
        pushFrame(frame);
        execFrame(frame, runtime);
      }
    }
  };

  traverse(file(program([expressionStatement(expr)]), null, null), {
    ...literal,
    ...simpleExpr,
    ...callExpr,
    ...fnExpr
  });
}

function execStmt(stmt: Statement, runtime: Runtime) {
  const {
    push,
    pop,
    topPos,
    enterEnv,
    exitEnv,
    env,
    popFrame,
    topFrame,
    topFnObj
  } = runtime;

  const exprStmt: TraverseOptions = {
    ExpressionStatement(path) {
      execExpr(path.node.expression, runtime);
    }
  };

  const retStmt: TraverseOptions = {
    ReturnStatement(path) {
      const node = path.node;
      let hasRet = false;
      if (node.argument) {
        hasRet = true;
        execExpr(node.argument, runtime);
      }
      const { getBP } = topFrame()!;
      const bp = getBP();
      const ret = hasRet ? pop() : undefined;
      let i = topPos();
      while (i > bp) {
        pop();
        i--;
      }
      push(ret);
      popFrame();
      exitEnv();
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
      const node = path.node;
      const fnObj = topFnObj() as FnObj;
      const name = node.id!.name;
      env().def(name, fnObj.fn.subs.get(name));
      path.skip();
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

function execFrame(frame: CallFrame, runtime: Runtime) {
  const { fnObj, getPC, incPC, getBP } = frame;
  const { enterEnv, stack, topPos, pop, push, popFrame } = runtime;
  const pc = getPC();
  const bp = getBP();

  if (typeof fnObj === "function") {
    const args = stack().slice(bp + 1);
    const ret = fnObj(...args);
    let i = topPos();
    while (i > bp) {
      pop();
      i--;
    }
    push(ret);
    popFrame();
    return;
  }
  if (pc === 0) {
    const args = stack().slice(bp + 1);
    const env = enterEnv();
    fnObj.fn.params.forEach((name, i) => env.def(name, args[i]));
  }
  const stmts = fnObj.fn.body;
  execStmt(stmts[pc], runtime);
  incPC();
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
  let frame: CallFrame | undefined;
  try {
    while ((frame = topFrame())) {
      execFrame(frame, rt);
    }
  } catch (err) {
    if (err instanceof RuntimeError) fatal("Runtime error: " + err.stack);
    throw err;
  }
}
