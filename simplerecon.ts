import { unlink, unlinkSync } from "fs";

const { exec, spawn } = require("child_process");
const { writeFileSync, readFile } = require('fs')

const ASSET_FINDER = `assetfinder`
const AMASS = `amass`
const SUBLIS3R = `sublist3r`
const SUBFINDER = `subfinder`
const SORT = `sort`
const EYEWITNESS = `eyewitness`
const SED = `sed`
const CAT = `cat`

const DOMAIN = process.argv[2]

export type TcResult<Data, Throws = Error> = [null, Data] | [Throws]

export async function tcAsync<T, Throws = Error>(
  promise: Promise<T>
): Promise<TcResult<T, Throws>> {
  try {
    const response: T = await promise

    return [null, response]
  } catch (error) {
    return [error] as [Throws]
  }
}

enum Progress {
    JUST_STARTED = `JUST_STARTED`,
    CHECKING_COMMANDS_EXISTENCE = `CHECKING_COMMANDS_EXISTENCE`,
    COLLECTING_SUBDOMAINS = `COLLECTING_SUBDOMAINS`,
    PROCESSING_SUBDOMAIN_FILES = `PROCESSING_SUBDOMAIN_FILES`,
    CLEANING_UP_SUBDOMAIN_FILES = `CLEANING_UP_SUBDOMAIN_FILES`,
    TESTING_HTTP_SERVICES = `TESTING_HTTP_SERVICES`,
}

const run = async () => {
    let progress = Progress.JUST_STARTED
    let elapsedSeconds = 0
    setInterval(() => {
        elapsedSeconds += 2
        const seconds = elapsedSeconds % 60
        const minutes = Math.floor(elapsedSeconds / 60)
        console.log(`[LOG] Elapsed: ${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds} Current progress: ${progress}`)
    }, 2000)

    if (!DOMAIN) {
        console.error(`You need to input a domain as the first argument`)
        return 
    }

    progress = Progress.CHECKING_COMMANDS_EXISTENCE
    const allCommandsExistPromise = [ASSET_FINDER, AMASS, SUBLIS3R, SORT, SED, EYEWITNESS, CAT, SUBFINDER].map((command) => {
        return new Promise((resolve, reject) => {
            exec(`which ${command}`, (error: Error) => {
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
        return;
    }
    const runRecon = async () => {
        let assetFinderSubdomains = ``
        const allCommandsWithArgs = [
            // `${AMASS} enum -d ${DOMAIN} -timeout 5 -o ${DOMAIN}.amass.lst`,
            `${SUBLIS3R} -v -d ${DOMAIN} -o ${DOMAIN}.sublist3r.lst`,
            `${ASSET_FINDER} -subs-only ${DOMAIN}`,
            `${SUBFINDER} -d ${DOMAIN} -o ${DOMAIN}.subfinder.lst`
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
                        writeFileSync(`${DOMAIN}.assetfinder.lst`, assetFinderSubdomains);
                    }
                    resolve(`finished running ${command}`)
                })
            })
        })

        await Promise.all(allCommandsPromises)
    }
    progress = Progress.COLLECTING_SUBDOMAINS
    await runRecon()
    progress = Progress.PROCESSING_SUBDOMAIN_FILES
    const subdomainFiles = [`${DOMAIN}.amass.lst`, `${DOMAIN}.sublist3r.lst`, `${DOMAIN}.assetfinder.lst`, `${DOMAIN}.subfinder.lst`]
    const subdomainFileUniqueContentsWithNoWildcardDomainProcess = spawn(`${CAT} ${subdomainFiles.join(` `)} | ${SORT} -u | ${SED} '/\*/d'`, [], { shell: true })
    let uniqueSubdomains = ``
    subdomainFileUniqueContentsWithNoWildcardDomainProcess.stdout.on(`data`, (chunk: Buffer) => {
        uniqueSubdomains += chunk.toString()
    })
    const allUniqueSubdomains = await new Promise((resolve) => {
        subdomainFileUniqueContentsWithNoWildcardDomainProcess.on(`exit`, () => {
            resolve(uniqueSubdomains)
        })
    })
    progress = Progress.CLEANING_UP_SUBDOMAIN_FILES
    console.log(allUniqueSubdomains)
    writeFileSync(`${DOMAIN}.lst`, allUniqueSubdomains)
    await Promise.all(subdomainFiles.map((filename) => {
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
    console.log(`[LOG] Finished collecting subdomains`)
    progress = Progress.TESTING_HTTP_SERVICES
    // give a generous timeout 
    const eyewitnessProcess = spawn(`${EYEWITNESS} -f ${DOMAIN}.lst --web --timeout 20 --delay 20`, [], { 
        shell: true,
        // run eyewitness process from  
        cwd: process.cwd()
    })
    eyewitnessProcess.stdout.on(`data`, (chunk: Buffer) => console.log(chunk.toString()))
    await new Promise((resolve) => {
          eyewitnessProcess.on(`exit`, () => resolve(``))
    })
    process.exit(0)
}

run()