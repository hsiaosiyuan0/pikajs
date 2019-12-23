import { Env } from "./env";
import { FnObj } from "./fn";
import { installBuiltin } from "./builtin";

export interface CallFrame {
  fnObj: FnObj | Function;
  args: any[];
  getPC: () => number;
  incPC: () => void;
  isNew: () => boolean;
  isTerminated: boolean;
}

export function makeFrame(
  fnObj: FnObj | Function,
  args: any[] = [],
  isNew = false
): CallFrame {
  let pc = 0;
  return {
    fnObj,
    args,
    getPC() {
      return pc;
    },
    incPC() {
      pc++;
    },
    isNew: () => isNew,
    isTerminated: false
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
    _env.close();
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
  function topFnObj() {
    if (!_topFrame) return;
    return _topFrame.fnObj;
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
    topFnObj,
    callStack
  };
}

export type Runtime = ReturnType<typeof runtime>;
