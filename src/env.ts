import { FnObj } from "./fn";

export class CaptureRecord {
  fnObj: FnObj;
  names: string[];

  constructor(fnObj: FnObj, names: string[] = []) {
    this.fnObj = fnObj;
    this.names = names;
  }
}

export class Env {
  outer?: Env;
  bindings: Map<string, any>;
  captures: Map<string, FnObj[]>;

  constructor(outer?: Env) {
    this.outer = outer;
    this.bindings = new Map();
    this.captures = new Map();
  }

  hasLocal(name: string) {
    return this.bindings.has(name);
  }

  get(name: string) {
    return this.bindings.get(name);
  }

  resolve(name: string) {
    let outer: Env | undefined = this;
    while (outer) {
      if (outer.hasLocal(name)) break;
      outer = outer.outer;
    }
    return {
      env: outer,
      value: outer && outer.get(name)
    };
  }

  deref(name: string) {
    const { env, value } = this.resolve(name);
    if (!env)
      throw new Error(`Uncaught ReferenceError: ${name} is not defined`);
    return value;
  }

  def(name: string, v?: any) {
    if (this.hasLocal(name))
      throw new Error(
        `Uncaught SyntaxError: Identifier '${name}' has already been declared`
      );
    this.bindings.set(name, v);
    return this;
  }

  update(name: string, v: any) {
    const { env } = this.resolve(name);
    if (!env)
      throw new Error(`Uncaught ReferenceError: ${name} is not defined`);
    env.bindings.set(name, v);
  }

  // regCapture(fn: FnObj) {
  //   this.captures.push({ fn, names: [...fn.captured.keys()] });
  // }

  // capture() {
  //   this.captures.forEach(({ env, names }) =>
  //     names.forEach(name => fn.captured.set(name, this.deref(name)))
  //   );
  // }

  registerCapture(fn: FnObj) {
    for (const name of fn.fn.outlets) {
      const { env } = this.resolve(name);
      if (!env) continue;
      const list = env.captures.get(name) || [];
      list.push(fn);
      env.captures.set(name, list);
    }
    return this;
  }

  close() {
    for (const [k, fns] of this.captures) {
      const v = this.deref(k);
      fns.forEach(fn => fn.captured.set(k, v));
    }
  }
}
