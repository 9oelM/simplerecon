import { unlink, writeFileSync } from "fs";
import { exec, spawn } from "child_process";
import path from "path";
import { exit } from "process";

const ASSET_FINDER = `assetfinder`;
const AMASS = `amass`;
const SUBLIS3R = `sublist3r`;
const SUBFINDER = `subfinder`;
const SORT = `sort`;
const EYEWITNESS = `eyewitness`;
const SED = `sed`;
const CAT = `cat`;

// https://stackoverflow.com/questions/4351521/how-do-i-pass-command-line-arguments-to-a-node-js-program
/**
Simple + ES6 + no-dependency + supports boolean flags
const process = require( 'process' );

If invoked with node app.js then argv('foo') will return null

If invoked with node app.js --foo then argv('foo') will return true

If invoked with node app.js --foo= then argv('foo') will return ''

If invoked with node app.js --foo=bar then argv('foo') will return 'bar'
 */
function argv(key: string): boolean | null | string {
  // Return true if the key exists and a value is defined
  if (process.argv.includes(`--${key}`)) return true;

  const value = process.argv.find((element) => element.startsWith(`--${key}=`));

  // Return null if the key does not exist and a value is not defined
  if (!value) return null;

  return value.replace(`--${key}=`, "");
}

type TcResult<Data, Throws = Error> = [null, Data] | [Throws];
type SubdomainFile = `${string}.${
  | `assetfinder`
  | `sublist3r`
  | `subfinder`}.lst`;

enum Progress {
  JUST_STARTED = `JUST_STARTED`,
  CHECKING_COMMANDS_EXISTENCE = `CHECKING_COMMANDS_EXISTENCE`,
  COLLECTING_SUBDOMAINS = `COLLECTING_SUBDOMAINS`,
  PROCESSING_SUBDOMAIN_FILES = `PROCESSING_SUBDOMAIN_FILES`,
  CLEANING_UP_SUBDOMAIN_FILES = `CLEANING_UP_SUBDOMAIN_FILES`,
  RUNNING_EYEWITNESS = `RUNNING_EYEWITNESS`,
}

interface ProgressRef {
  ref: Progress;
}

async function tcAsync<T, Throws = Error>(
  promise: Promise<T>
): Promise<TcResult<T, Throws>> {
  try {
    const response: T = await promise;

    return [null, response];
  } catch (error) {
    return [error] as [Throws];
  }
}

function completelyKillProgram(exitCode: number): void {
  process.kill(process.pid);
  process.exit(exitCode);
}

function panic(err?: Error | null) {
  console.log(`An error occured. Exiting.`);
  if (err) console.error(err);
  exit(1);
}

const VALID_DOMAIN_REGEX =
  /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
function isValidDomain(domain: string): boolean {
  return VALID_DOMAIN_REGEX.test(domain);
}

function toLocalCwd(filepath: string) {
  return path.resolve(process.cwd(), filepath);
}

const logElaspedTime = (progress: ProgressRef) => {
  let elapsedSeconds = 0;
  setInterval(() => {
    elapsedSeconds += 2;
    const seconds = elapsedSeconds % 60;
    const minutes = Math.floor(elapsedSeconds / 60);
    console.log(
      `[LOG] Elapsed: ${minutes < 10 ? `0${minutes}` : minutes}:${
        seconds < 10 ? `0${seconds}` : seconds
      } Current progress: ${progress.ref}`
    );
  }, 2000);
};

const checkCommandsExistence = async () => {
  const allCommandsExistPromise = [
    ASSET_FINDER,
    AMASS,
    SUBLIS3R,
    SORT,
    SED,
    CAT,
    SUBFINDER,
    ...(argv(`eyewitness`) ? [EYEWITNESS] : []),
  ].map((command) => {
    return new Promise((resolve, reject) => {
      exec(`which ${command}`, (error) => {
        if (error) {
          reject(`${command} not found`);
        }
        resolve(`${command} found`);
      });
    });
  });

  const [allCommandsExistError] = await tcAsync(
    Promise.all(allCommandsExistPromise)
  );
  if (allCommandsExistError) {
    console.error(`Not all commands exist: ${allCommandsExistError}`);
    exit(1);
  }
};

const findSubdomainsUsingPrograms = async (domain: string) => {
  let assetFinderSubdomains = ``;
  const allCommandsWithArgs = [
    `${SUBLIS3R} -v -d ${domain} -o ${toLocalCwd(`${domain}.sublist3r.lst`)}`,
    `${ASSET_FINDER} -subs-only ${domain}`,
    `${SUBFINDER} -d ${domain} -o ${toLocalCwd(`${domain}.subfinder.lst`)}`,
  ];
  const allCommandsPromises = allCommandsWithArgs.map((command) => {
    console.log(`running ${command}`);

    const childProcess = spawn(command, [], { shell: true });
    childProcess.stdout.on(`data`, (chunk: Buffer) => {
      console.log(chunk.toString());
      if (command.startsWith(ASSET_FINDER)) {
        assetFinderSubdomains += `${chunk.toString()}\n`;
      }
    });
    childProcess.stdout.on(`error`, (error: Buffer) => {
      console.error(error.toString());
    });

    return new Promise((resolve) => {
      childProcess.on(`exit`, () => {
        console.log(`[LOG] finished running ${command}`);

        if (command.startsWith(ASSET_FINDER)) {
          // write it to where the script was called
          writeFileSync(
            toLocalCwd(`${domain}.assetfinder.lst`),
            assetFinderSubdomains
          );
        }
        resolve(`finished running ${command}`);
      });
    });
  });

  await Promise.all(allCommandsPromises);
};

async function getAllUniqueSubdomainsFromFiles(
  subdomainFiles: string[]
): Promise<string> {
  const subdomainFileUniqueContentsWithNoWildcardDomainProcess = spawn(
    `${CAT} ${subdomainFiles.join(` `)} | ${SORT} -u | ${SED} '/\*/d'`,
    [],
    { shell: true }
  );
  let uniqueSubdomains = ``;
  subdomainFileUniqueContentsWithNoWildcardDomainProcess.stdout.on(
    `data`,
    (chunk: Buffer) => {
      uniqueSubdomains += chunk.toString();
    }
  );
  const allUniqueSubdomains: string = await new Promise((resolve) => {
    subdomainFileUniqueContentsWithNoWildcardDomainProcess.on(`exit`, () => {
      resolve(uniqueSubdomains);
    });
  });
  console.log(allUniqueSubdomains);
  return allUniqueSubdomains;
}

async function saveAllUniqueSubdomainsToFile(
  domain: string,
  allUniqueSubdomains: string,
  subdomainFiles: string[]
) {
  writeFileSync(toLocalCwd(`${domain}.lst`), allUniqueSubdomains);
  console.log(`[LOG] Finished collecting subdomains`);
  return Promise.all(
    subdomainFiles.map((filename) => {
      return new Promise((resolve, reject) => {
        try {
          unlink(filename, () => {
            console.log(`[LOG] deleted ${filename}`);
            resolve(`deleted ${filename}`);
          });
        } catch {
          reject(`error while deleting ${filename}`);
        }
      });
    })
  );
}

const runEyewitness = async (domain: string) => {
  if (!argv(`eyewitness`)) {
    console.log(
      `[LOG] Not running eyewitness on ${domain} due to no --eyewitness flag specified`
    );
    return;
  }
  // give a generous timeout
  const eyewitnessProcess = spawn(
    `${EYEWITNESS} -f ${domain}.lst --web --timeout 20 --delay 10 --no-prompt --resolve`,
    [],
    {
      shell: true,
      // run eyewitness process from where this command was called
      cwd: process.cwd(),
    }
  );
  eyewitnessProcess.stdout.on(`data`, (chunk: Buffer) =>
    console.log(chunk.toString())
  );
  await new Promise((resolve) => {
    eyewitnessProcess.on(`exit`, () => resolve(``));
  });
};

const runReconOnSingleDomain = async (domain: string) => {
  if (!isValidDomain(domain)) {
    console.error(`${domain} is not a valid domain name. Skipping.`);
    return;
  }

  const progress: ProgressRef = { ref: Progress.JUST_STARTED };
  logElaspedTime(progress);

  progress.ref = Progress.CHECKING_COMMANDS_EXISTENCE;
  const [err0] = await tcAsync(checkCommandsExistence());
  if (err0) panic(err0);

  progress.ref = Progress.COLLECTING_SUBDOMAINS;
  const [err1] = await tcAsync(findSubdomainsUsingPrograms(domain));
  if (err1) panic(err1);

  progress.ref = Progress.PROCESSING_SUBDOMAIN_FILES;
  const subdomainFiles = [
    `${domain}.sublist3r.lst`,
    `${domain}.assetfinder.lst`,
    `${domain}.subfinder.lst`,
  ].map(toLocalCwd);
  const [err2, allUniqueSubdomains] = await tcAsync(
    getAllUniqueSubdomainsFromFiles(subdomainFiles)
  );
  if (err2 || !allUniqueSubdomains) {
    panic(err2);

    // for our stupid TS
    return;
  }

  progress.ref = Progress.CLEANING_UP_SUBDOMAIN_FILES;
  const [err3] = await tcAsync(
    saveAllUniqueSubdomainsToFile(domain, allUniqueSubdomains, subdomainFiles)
  );
  if (err3) panic(err3);

  progress.ref = Progress.RUNNING_EYEWITNESS;
  const [err4] = await tcAsync(runEyewitness(domain));
  if (err4) panic(err4);
};

const runProgram = async () => {
  const help = argv("h") || argv("help");
  if (help) {
    console.log(`
simplerecon

usage:
--h|--help: print this message
--domains: [required] list of root domains delimited by comma (example: --domains=example.com,example2.com)
--eyewitness: [optional, default false] run eyewitness after collecting all subdomains

example:
simplerecon --domains=example.com,example222.com
`);
    completelyKillProgram(0);
    return;
  }
  const domains = argv("domains");
  if (
    domains === null ||
    typeof domains === "boolean" ||
    domains.trim().length === 0
  ) {
    console.error(`--domains flag should be a list of domains delimited by comma.
${domains} does not match the format. try again.`);
    completelyKillProgram(0);
    return;
  }
  const allValidRootDomains = domains
    .split(`,`)
    .map((maybeValidDomain) => maybeValidDomain.trim())
    .filter((maybeValidDomain) => {
      if (!isValidDomain(maybeValidDomain)) {
        console.error(
          `${maybeValidDomain} is not a valid domain. Skipping a recon on this domain.`
        );
        return false;
      }
      return true;
    });

  for (const validRootDomain of allValidRootDomains) {
    // @todo multithreading
    const [err] = await tcAsync(runReconOnSingleDomain(validRootDomain));
    if (err) console.error(err);
  }
  completelyKillProgram(0);
};

runProgram();
