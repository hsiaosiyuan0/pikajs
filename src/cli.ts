import { exists, readFile, createWriteStream } from "fs";
import { exec } from "./exec";
import { promisify } from "util";
import { go, fatal } from "./util";
import http from "http";
import https from "https";
import tempfile from "tempfile";
import url from "url";

export const existsAsync = promisify(exists);
export const readFileAsync = promisify(readFile);

export function isRemoteFile(file: string) {
  try {
    const u = url.parse(file);
    return [/https?/.test(u.protocol || ""), null];
  } catch (e) {
    return [null, e];
  }
}

export async function retrieveLocal(file: string) {
  const [resp, err] = await go(existsAsync(file));
  if (err) fatal("Unexpected Error: " + err);
  if (!resp) fatal("Source file does not exist");
  const [resp1, err1] = await go(readFileAsync(file));
  if (err1) fatal("Unable to read file: " + err);
  return resp1!.toString();
}

export async function download(file: string) {
  const tmp = tempfile(".js");
  const tmpFile = createWriteStream(tmp);
  return new Promise<[string, null] | [null, Error]>(resolve => {
    try {
      const manner = file.startsWith("https://") ? https : http;
      const req = manner.get(file, function(response) {
        response.pipe(tmpFile);
        tmpFile.on("finish", () => resolve([tmp, null]));
        tmpFile.on("error", err => resolve([null, err]));
      });
      req.on("error", err => resolve([null, err]));
    } catch (e) {
      resolve([null, e]);
    }
  });
}

export async function retrieveRemote(file: string) {
  const [resp, err] = await download(file);
  if (err) fatal("Unable to download remote file: " + err);
  return retrieveLocal(resp!);
}

export async function run() {
  const srcFile = process.argv[2];
  if (!srcFile) fatal("Please specify a source file");
  const [resp, err] = isRemoteFile(srcFile);
  if (err) fatal("Deformed file path: " + srcFile);
  let code: string;
  if (resp) {
    code = await retrieveRemote(srcFile);
  } else {
    code = await retrieveLocal(srcFile);
  }
  exec(code);
}
