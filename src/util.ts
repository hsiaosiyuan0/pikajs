import chalk from "chalk";

export async function go<T>(p: Promise<T>): Promise<[T, null] | [null, Error]> {
  return p
    .then(res => Promise.resolve([res, null] as any))
    .catch(err => Promise.resolve([null, err]));
}

export const fatal = (msg: string) => {
  console.log(chalk.red(msg));
  return process.exit(1);
};
