const fs = require('fs')
const { exec } = require('child_process')
const path = require('path')
const mkdirp = require('mkdirp')
const lodash = require('lodash')
const cliArg = process.argv.slice(2)
const homedir = require('os').homedir()

const pathToHydra = cliArg[0]
const pathToTmp = path.resolve(process.cwd(), '.tmp')
const pathToSrc = path.resolve(pathToTmp, 'hydra_clients')
const TEN_MEGA_BYTE = 1024 * 1024 * 10
const execOptions = {
  maxBuffer: TEN_MEGA_BYTE,
}

mkdirp(pathToSrc, mkSrcErr => {
  if (mkSrcErr) throw mkSrcErr
  fs.readdir(pathToHydra, (readHydraErr, filenames) => {
    if (readHydraErr) throw readHydraErr
    const foldersOnly = filenames.filter(filename => {
      const folderPath = path.resolve(pathToHydra, filename)
      const stats = fs.statSync(folderPath)
      if (!stats.isDirectory()) return false
      return fs.existsSync(path.resolve(folderPath, 'package.json'))
    })
    const copyFiles = foldersOnly.map(filename => {
      const oldHydraClientPath = path.resolve(pathToHydra, filename)
      const oldLockPath = path.resolve(oldHydraClientPath, 'yarn.lock')
      const oldPackagePath = path.resolve(oldHydraClientPath, 'package.json')
      const newHydraClientFolder = path.resolve(pathToSrc, filename)
      const newHydraClientPackagePath = path.resolve(
        newHydraClientFolder,
        'package.json'
      )
      const newHydraClientLockPath = path.resolve(
        newHydraClientFolder,
        'yarn.lock'
      )

      return new Promise(resolve => {
        mkdirp(newHydraClientFolder, mkdirErr => {
          if (mkdirErr) throw mkdirErr
          fs.copyFile(oldLockPath, newHydraClientLockPath, cpLockErr => {
            if (cpLockErr) throw cpLockErr
            fs.copyFile(oldPackagePath, newHydraClientPackagePath, cpErr => {
              if (cpErr) throw cpErr

              let newHydraClientPackageFile = require(newHydraClientPackagePath)
              newHydraClientPackageFile.devDependencies = {}
              fs.writeFile(
                newHydraClientPackagePath,
                JSON.stringify(newHydraClientPackageFile, null, 2),
                err => {
                  if (err) throw err

                  resolve(newHydraClientPackagePath)
                }
              )
            })
          })
        })
      })
    })

    Promise.all([...copyFiles]).then(allFiles => {
      const gatherChecks = allFiles.map(file => {
        const directoryPath = path.dirname(file)

        const checkTests = new Promise(resolve => {
          fs.readFile(file, 'utf8', function(err, data) {
            if (err) throw err
            var obj = JSON.parse(data)

            var hasTests = obj.scripts.test !== 'true'
            resolve({ tests: hasTests })
          })
        })

        const runOutdated = new Promise((resolve, reject) => {
          console.log('checking outdated packages...', file)
          process.chdir(directoryPath)
          exec(
            'yarn outdated --json',
            execOptions,
            (yarnErr, stdout, stderr) => {
              console.log(yarnErr)
              console.log(stderr)
              let formatted = []
              try {
                formatted = stdout
                  .trim()
                  .split(/\r?\n/)
                  .map(f => JSON.parse(f))
              } catch (e) {
                throw e
              }

              resolve({ outdated: formatted })
            }
          )
        })

        const runAudit = new Promise((resolve, reject) => {
          console.log('auditing dependencies...', file)
          process.chdir(directoryPath)
          exec('yarn audit --json', execOptions, (yarnErr, stdout, stderr) => {
            console.log(yarnErr)
            console.log(stderr)
            let formatted = []
            try {
              formatted = stdout
                .trim()
                .split(/\r?\n/)
                .map(f => JSON.parse(f))
            } catch (e) {
              console.log(e)
            }

            const advisoriesOnly = formatted.filter(
              f => f.type === 'auditAdvisory'
            )
            const set = new Set()
            const uniqueAdvisories = advisoriesOnly
              .map(ao => {
                return {
                  module_name: ao.data.advisory.module_name,
                  advisory: ao.data.advisory,
                }
              })
              .filter(value => {
                if (set.has(value.module_name)) {
                  return false
                }
                set.add(value.module_name)
                return true
              })
            const summariesOnly = formatted.filter(
              f => f.type === 'auditSummary'
            )
            const final = [
              ...summariesOnly,
              { type: 'uniqueAdvisories', data: uniqueAdvisories },
            ]

            resolve({ audit: final })
          })
        })

        return Promise.all([runAudit, runOutdated, checkTests]).then(
          allChecks => {
            const directoryName = path.basename(directoryPath)

            const flattened = allChecks.reduce((a, c) => ({ ...a, ...c }))

            return {
              hydra_client: directoryName,
              checks: flattened,
            }
          }
        )
      })

      Promise.all(gatherChecks)
        .then(finalResults => {
          const resultFile = `${pathToTmp}/results.json`
          fs.writeFile(
            resultFile,
            JSON.stringify(finalResults, null, 2),
            auditResultErr => {
              if (auditResultErr) throw auditResultErr
              console.log(`Output saved to ${resultFile}!`)
            }
          )
        })
        .catch(auditError => {
          throw auditError
        })
    })
  })
})
