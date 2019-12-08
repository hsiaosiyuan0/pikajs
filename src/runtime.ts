import { Env } from "./env";
import { FnObj } from "./fn";
import { installBuiltin } from "./builtin";

export interface CallFrame {
  fnObj: FnObj | Function;
  // callee 在栈上的位置
  getBP: () => number;
  getPC: () => number;
  incPC: () => void;
}

export function makeFrame(fnObj: FnObj | Function, bp = 0): CallFrame {
  let pc = 0;
  return {
    fnObj,
    getBP() {
      return bp;
    },
    getPC() {
      return pc;
    },
    incPC() {
      pc++;
    }
  };
}

export function runtime() {
  const _stack: any[] = [];
  let _top: any;
  function stack() {
    return _stack;
  }
  function push(value: any) {
    _stack.push(value);
    _top = value;
  }
  function pop() {
    const ret = _stack.pop();
    _top = _stack[_stack.length - 1];
    return ret;
  }
  function top() {
    return _top;
  }
  function topPos() {
    return _stack.length;
  }

  let _env = new Env();
  function enterEnv() {
    return (_env = new Env(_env));
  }
  function exitEnv() {
    _env = _env.outer!;
  }
  function env() {
    return _env;
  }
  installBuiltin(_env);

  const _callStack: CallFrame[] = [];
  let _topFrame: CallFrame | undefined;
  function pushFrame(frame: CallFrame) {
    _callStack.push(frame);
    _topFrame = frame;
  }
  function popFrame() {
    const ret = _callStack.pop();
    _topFrame = _callStack[_callStack.length - 1];
    return ret;
  }
  function topFrame() {
    return _topFrame;
  }
  function callStack() {
    return _callStack;
  }

  return {
    stack,
    push,
    pop,
    top,
    topPos,
    enterEnv,
    exitEnv,
    env,
    pushFrame,
    popFrame,
    topFrame,
    callStack
  };
}

export type Runtime = ReturnType<typeof runtime>;