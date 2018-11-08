const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const npm = require("npm");
const mkdirp = require("mkdirp");
const lodash = require("lodash");
const cliArg = process.argv.slice(2);
const homedir = require("os").homedir();

const pathToHydra = `${homedir}/Code/Procore/procore/hydra_clients`;
const pathToTmp = `${process.cwd()}/.tmp`;
const pathToSrc = `${pathToTmp}/hydra_clients`;
const TEN_MEGA_BYTE = 1024 * 1024 * 10;
const execOptions = {
  maxBuffer: TEN_MEGA_BYTE
};

mkdirp(pathToSrc, mkSrcErr => {
  if (mkSrcErr) throw mkSrcErr;
  fs.readdir(pathToHydra, (readHydraErr, filenames) => {
    if (readHydraErr) throw readHydraErr;
    const copyFiles = filenames.map(filename => {
      const oldHydraClientPath = `${pathToHydra}/${filename}`;
      const oldLockPath = `${oldHydraClientPath}/yarn.lock`;
      const oldPackagePath = `${oldHydraClientPath}/package.json`;
      const newHydraClientFolder = `${pathToSrc}/${filename}`;
      const newHydraClientPackagePath = `${newHydraClientFolder}/package.json`;
      const newHydraClientLockPath = `${newHydraClientFolder}/yarn.lock`;

      return new Promise(resolve => {
        mkdirp(newHydraClientFolder, mkdirErr => {
          if (mkdirErr) throw mkdirErr;
          fs.copyFile(oldLockPath, newHydraClientLockPath, cpLockErr => {
            if (cpLockErr) throw cpLockErr;
            fs.copyFile(oldPackagePath, newHydraClientPackagePath, cpErr => {
              if (cpErr) throw cpErr;

              let newHydraClientPackageFile = require(newHydraClientPackagePath);
              newHydraClientPackageFile.devDependencies = {};
              fs.writeFile(
                newHydraClientPackagePath,
                JSON.stringify(newHydraClientPackageFile, null, 2),
                err => {
                  if (err) throw err;

                  resolve(newHydraClientPackagePath);
                }
              );
            });
          });
        });
      });
    });

    Promise.all([...copyFiles]).then(allFiles => {
      const gatherChecks = allFiles.map(file => {
        const directoryPath = path.dirname(file);

        const checkTests = new Promise(resolve => {
          fs.readFile(file, "utf8", function(err, data) {
            if (err) throw err;
            var obj = JSON.parse(data);

            var hasTests = obj.scripts.test !== "true";
            resolve({ tests: hasTests });
          });
        });

        const runOutdated = new Promise((resolve, reject) => {
          console.log("checking outdated packages...", file);
          process.chdir(directoryPath);
          exec(
            "yarn outdated --json",
            execOptions,
            (yarnErr, stdout, stderr) => {
              console.log(yarnErr);
              console.log(stderr);
              let formatted = [];
              try {
                formatted = stdout
                  .trim()
                  .split(/\r?\n/)
                  .map(f => JSON.parse(f));
              } catch (e) {
                throw e;
              }

              resolve({ outdated: formatted });
            }
          );
        });

        const runAudit = new Promise((resolve, reject) => {
          console.log("auditing dependencies...", file);
          process.chdir(directoryPath);
          exec("yarn audit --json", execOptions, (yarnErr, stdout, stderr) => {
            console.log(yarnErr);
            console.log(stderr);
            let formatted = [];
            try {
              formatted = stdout
                .trim()
                .split(/\r?\n/)
                .map(f => JSON.parse(f));
            } catch (e) {
              console.log(e);
            }

            formatted = formatted.filter(f => f.type === "auditSummary");

            resolve({ audit: formatted });
          });
        });

        return Promise.all([runAudit, runOutdated, checkTests]).then(
          allChecks => {
            const directoryName = path.basename(directoryPath);

            const flattened = allChecks.reduce((a, c) => ({ ...a, ...c }));

            return {
              hydra_client: directoryName,
              checks: flattened
            };
          }
        );
      });

      Promise.all(gatherChecks)
        .then(finalResults => {
          const resultFile = `${pathToTmp}/results.json`;
          fs.writeFile(
            resultFile,
            JSON.stringify(finalResults, null, 2),
            auditResultErr => {
              if (auditResultErr) throw auditResultErr;
              console.log(`Output saved to ${resultFile}!`);
            }
          );
        })
        .catch(auditError => {
          throw auditError;
        });
    });
  });
});
