import { Env } from "./env";
import { Scope } from "./fn";
import assert from "assert";

export function installBuiltin(env: Env) {
  env.def("print", (...args: any) => console.log(...args));
  env.def("assert", (a: any, b: any) => assert.deepEqual(a, b));
  env.def("require", (m: string) => require(m));
}

export function regBuiltin(scope: Scope) {
  scope.def("print");
  scope.def("assert");
  scope.def("require");
}
