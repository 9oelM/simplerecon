import { unlink, writeFileSync } from "fs";
import { exec, spawn } from "child_process";
import path from "path"
import { exit } from "process";

const ASSET_FINDER = `assetfinder`
const AMASS = `amass`
const SUBLIS3R = `sublist3r`
const SUBFINDER = `subfinder`
const SORT = `sort`
const EYEWITNESS = `eyewitness`
const SED = `sed`
const CAT = `cat`

const DOMAIN = process.argv[2]
const NO_EYEWITNESS = process.argv[3]

type TcResult<Data, Throws = Error> = [null, Data] | [Throws]
type SubdomainFile = `${string}.${`assetfinder`|`sublist3r`|`subfinder`}.lst`

enum Progress {
    JUST_STARTED = `JUST_STARTED`,
    CHECKING_COMMANDS_EXISTENCE = `CHECKING_COMMANDS_EXISTENCE`,
    COLLECTING_SUBDOMAINS = `COLLECTING_SUBDOMAINS`,
    PROCESSING_SUBDOMAIN_FILES = `PROCESSING_SUBDOMAIN_FILES`,
    CLEANING_UP_SUBDOMAIN_FILES = `CLEANING_UP_SUBDOMAIN_FILES`,
    RUNNING_EYEWITNESS = `RUNNING_EYEWITNESS`,
}

interface ProgressRef { ref: Progress } 

async function tcAsync<T, Throws = Error>(
  promise: Promise<T>
): Promise<TcResult<T, Throws>> {
  try {
    const response: T = await promise

    return [null, response]
  } catch (error) {
    return [error] as [Throws]
  }
}

function panic(err?: Error | null) {
    console.log(`An error occured. Exiting.`)
    if (err) console.error(err)
    exit(1)
}

function toLocalCwd(filepath: string) {
    return path.resolve(process.cwd(), filepath)
}

const logElaspedTime = (progress: ProgressRef) => {
    let elapsedSeconds = 0
    setInterval(() => {
        elapsedSeconds += 2
        const seconds = elapsedSeconds % 60
        const minutes = Math.floor(elapsedSeconds / 60)
        console.log(`[LOG] Elapsed: ${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds} Current progress: ${progress.ref}`)
    }, 2000)
}

const checkCommandsExistence = async () => {
    const allCommandsExistPromise = [ASSET_FINDER, AMASS, SUBLIS3R, SORT, SED, EYEWITNESS, CAT, SUBFINDER].map((command) => {
        return new Promise((resolve, reject) => {
            exec(`which ${command}`, (error) => {
                if (error) {
                    reject(`${command} not found`)
                }
                resolve(`${command} found`)
            })
        })
    })
    
    const [allCommandsExistError] = await tcAsync(Promise.all(allCommandsExistPromise))
    if (allCommandsExistError) {
        console.error(`Not all commands exist: ${allCommandsExistError}`)
        exit(1)
    }
}

const runRecon = async () => {
    let assetFinderSubdomains = ``
    const allCommandsWithArgs = [
        `${SUBLIS3R} -v -d ${DOMAIN} -o ${toLocalCwd(`${DOMAIN}.sublist3r.lst`)}`,
        `${ASSET_FINDER} -subs-only ${DOMAIN}`,
        `${SUBFINDER} -d ${DOMAIN} -o ${toLocalCwd(`${DOMAIN}.subfinder.lst`)}`
    ]
    const allCommandsPromises = allCommandsWithArgs.map((command) => {
        console.log(`running ${command}`)

        const childProcess = spawn(command, [], { shell: true })
        childProcess.stdout.on(`data`, (chunk: Buffer) => {
            console.log(chunk.toString())
            if (command.startsWith(ASSET_FINDER)) {
                assetFinderSubdomains += `${chunk.toString()}\n`
            }
        })
        childProcess.stdout.on(`error`, (error: Buffer) => {
            console.error(error.toString())
        })

        return new Promise((resolve) => {
            childProcess.on(`exit`, () => {
                console.log(`[LOG] finished running ${command}`)
                
                if (command.startsWith(ASSET_FINDER)) {
                    // write it to where the script was called
                    writeFileSync(toLocalCwd(`${DOMAIN}.assetfinder.lst`) , assetFinderSubdomains);
                }
                resolve(`finished running ${command}`)
            })
        })
    })

    await Promise.all(allCommandsPromises)
}

async function getAllUniqueSubdomainsFromFiles(subdomainFiles: string[]): Promise<string> {
    const subdomainFileUniqueContentsWithNoWildcardDomainProcess = spawn(`${CAT} ${subdomainFiles.join(` `)} | ${SORT} -u | ${SED} '/\*/d'`, [], { shell: true })
    let uniqueSubdomains = ``
    subdomainFileUniqueContentsWithNoWildcardDomainProcess.stdout.on(`data`, (chunk: Buffer) => {
        uniqueSubdomains += chunk.toString()
    })
    const allUniqueSubdomains: string = await new Promise((resolve) => {
        subdomainFileUniqueContentsWithNoWildcardDomainProcess.on(`exit`, () => {
            resolve(uniqueSubdomains)
        })
    })
    console.log(allUniqueSubdomains)
    return allUniqueSubdomains
}

async function saveAllUniqueSubdomainsToFile(allUniqueSubdomains: string, subdomainFiles: string[]) {
    writeFileSync(toLocalCwd(`${DOMAIN}.lst`), allUniqueSubdomains)
    console.log(`[LOG] Finished collecting subdomains`)
    return Promise.all(subdomainFiles.map((filename) => {
        return new Promise((resolve, reject) => {
            try {
                unlink(filename, () => {
                    console.log(`[LOG] deleted ${filename}`)
                    resolve(`deleted ${filename}`)
                })
            } catch {
                reject(`error while deleting ${filename}`)
            }
        })
    }))
}

const runEyewitness = async () => {
    if (NO_EYEWITNESS) {
    	console.log(`[LOG] Exiting with no eyewitness due to flag specified`)
        process.exit(0)
    }
    // give a generous timeout 
    const eyewitnessProcess = spawn(`${EYEWITNESS} -f ${DOMAIN}.lst --web --timeout 20 --delay 10 --no-prompt --resolve`, [], { 
        shell: true,
        // run eyewitness process from where this command was called 
        cwd: process.cwd()
    })
    eyewitnessProcess.stdout.on(`data`, (chunk: Buffer) => console.log(chunk.toString()))
    await new Promise((resolve) => {
          eyewitnessProcess.on(`exit`, () => resolve(``))
        
    })
}

const run = async () => {
    if (!DOMAIN) {
        console.error(`You need to input a domain as the first argument. 
Specify N for the second argument if you don't want to run eyewitness on the subdomains found.

Usage example: simplerecon example.com N`)
        process.exit(1)
    }
    const progress: ProgressRef = { ref: Progress.JUST_STARTED } 
    logElaspedTime(progress)

    progress.ref = Progress.CHECKING_COMMANDS_EXISTENCE
    const [err0] = await tcAsync(checkCommandsExistence())
    if (err0) panic(err0)

    progress.ref = Progress.COLLECTING_SUBDOMAINS
    const [err1] = await tcAsync(runRecon())
    if (err1) panic(err1)

    progress.ref = Progress.PROCESSING_SUBDOMAIN_FILES
    const subdomainFiles = [`${DOMAIN}.sublist3r.lst`, `${DOMAIN}.assetfinder.lst`, `${DOMAIN}.subfinder.lst`].map(toLocalCwd)
    const [err2, allUniqueSubdomains] = await tcAsync(getAllUniqueSubdomainsFromFiles(subdomainFiles))
    if (err2 || !allUniqueSubdomains) {
        panic(err2)

        // for our stupid TS
        return;
    }

    progress.ref = Progress.CLEANING_UP_SUBDOMAIN_FILES
    const [err3] = await tcAsync(saveAllUniqueSubdomainsToFile(allUniqueSubdomains, subdomainFiles))
    if (err3) panic(err3)

    progress.ref = Progress.RUNNING_EYEWITNESS
    const [err4] = await tcAsync(runEyewitness())
    if (err4) panic(err4)
    process.exit(0)
}

run()
