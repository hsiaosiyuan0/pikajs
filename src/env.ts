export class Env {
  outer?: Env;
  bindings: Map<string, any>;

  constructor(outer?: Env) {
    this.outer = outer;
    this.bindings = new Map();
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
  }

  update(name: string, v: any) {
    const { env } = this.resolve(name);
    if (!env)
      throw new Error(`Uncaught ReferenceError: ${name} is not defined`);
    env.bindings.set(name, v);
  }
}
