const fs = require("fs");
const { promisify } = require("util");
const path = require("path");
const { retrieveLocal } = require("../lib/bin");
const chalk = require("chalk");
const { exec } = require("../lib/exec");
const ui = require("cliui")();

const readdirAsync = promisify(fs.readdir);

const self = path.parse(__filename).base;

async function listTests() {
  return (await readdirAsync(__dirname))
    .filter(f => /^[^.][a-zA-z0-9-]+\.test\.js/.test(f))
    .map(f => ({
      name: f.split(".")[0],
      path: path.resolve(__dirname, f)
    }));
}

async function runTest({ name, path }) {
  const code = await retrieveLocal(path);
  let ok = false;
  let err;
  const log = () => {};
  const old = console.log;
  console.log = log;
  try {
    exec(code);
    ok = true;
  } catch (e) {
    err = e;
  }
  console.log = old;
  if (ok) {
    ui.div({ text: chalk.cyan(name), width: 20 }, { text: chalk.green("ok") });
    return;
  }
  console.log(chalk.red(`Failed on ${chalk.bold(name)}`));
  console.log(chalk.red(err.stack));
  ui.div({ text: chalk.cyan(name), width: 20 }, { text: chalk.red("fail") });
  return { name, ok };
}

(async () => {
  const cases = await listTests();
  const tasks = cases.map(runTest);
  await Promise.all(tasks);
  const succeed = tasks.fill(t => t.ok);
  ui.div({
    text: "-".repeat(30)
  });
  ui.div(
    { text: `All: ${tasks.length}`, width: 10 },
    { text: `OK: ${succeed.length}`, width: 10 },
    { text: `Fail: ${tasks.length - succeed.length}`, width: 10 }
  );
  console.log(ui.toString());
})();
