#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import chalk from "chalk";
import { parse } from "@babel/parser";
import { exec } from "./exec";

const fatal = (msg: string) => {
  console.log(chalk.red(msg));
  process.exit(1);
};
const srcFile = process.argv[2];
if (!srcFile) fatal("Please specify a source file");
if (!existsSync(srcFile)) fatal("Source file does not exist");

const src = readFileSync(srcFile).toString();
const ast = parse(src);

exec(ast);
