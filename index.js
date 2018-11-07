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

mkdirp(pathToSrc, mkSrcErr => {
  if (mkSrcErr) throw mkSrcErr;
  fs.readdir(pathToHydra, (readHydraErr, filenames) => {
    if (readHydraErr) throw readHydraErr;
    const copyFiles = filenames.map(filename => {
      const packagePath = `${pathToHydra}/${filename}/package.json`;
      const newHydraClientFolder = `${pathToSrc}/${filename}`;
      const newHydraClientPackagePath = `${newHydraClientFolder}/package.json`;

      return new Promise(resolve => {
        mkdirp(newHydraClientFolder, mkdirErr => {
          if (mkdirErr) throw mkdirErr;
          fs.copyFile(packagePath, newHydraClientPackagePath, cpErr => {
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

    Promise.all([...copyFiles]).then(allFiles => {
      const gatherAudit = allFiles.slice(0, 4).map(file => {
        return new Promise((resolve, reject) => {
          console.log("installing:", file);
          const directoryPath = path.dirname(file);
          const directoryName = path.basename(directoryPath);
          process.chdir(directoryPath);
          exec("yarn audit --json", (yarnErr, stdout, stderr) => {
            console.log(yarnErr);
            console.log(stderr);
            const formatted = stdout
              .trim()
              .split(/\r?\n/)
              .map(f => JSON.parse(f));
            const final = [{ type: "name", data: directoryName }, ...formatted];
            resolve(final);
          });
        });
      });

      Promise.all(gatherAudit)
        .then(auditResults => {
          const resultFile = `${pathToTmp}/results.json`;
          fs.writeFile(
            resultFile,
            JSON.stringify(auditResults, null, 2),
            auditResultErr => {
              if (auditResultErr) throw auditResultErr;
              console.log(`Output saved to ${resultFile}!`);
            }
          );
          // console.log(auditResults);
          // auditResults.map(result => {
          //   // console.log("result", result);
          // });
          // console.log(af);

          // af[0].one.map(s => console.log("hi", JSON.parse(s)));
        })
        .catch(auditError => {
          throw auditError;
        });
    });

    // const gatherBugsnags = filenames.map((filename) => {
    //   var path = `${pathToHydra}/${filename}/package.json`
    //   return new Promise((resolve) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //       if (err) throw err;
    //       var obj = JSON.parse(data);

    //       resolve({
    //         hydraClient: filename,
    //         hasBugsnag: false,
    //       });
    //     });
    //   });
    // });

    // const gatherTests = filenames.map((filename) => {
    //   var path = `${pathToHydra}/${filename}/package.json`

    //   return new Promise((resolve) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //       if (err) throw err;
    //       var obj = JSON.parse(data);

    //       var hasTests = obj.scripts.test !== 'true';
    //       resolve({
    //         hydraClient: filename,
    //         hasTests,
    //       });
    //     });
    //   });
    // });

    // Promise.all([...gatherTests, ...gatherBugsnags]).then((allFiles) => {
    //   const grouped = lodash.groupBy(allFiles, 'hydraClient');
    //   const final = Object.keys(grouped).map(key => {
    //     const withoutName = grouped[key].reduce((acc, g) => {
    //       const { hydraClient: currHC, ...currRest } = g;
    //       const { hydraClient: accHC, ...accRest } = acc;

    //       return {
    //         ...accRest,
    //         ...currRest,
    //       };
    //     });

    //     return {
    //       [key]: withoutName,
    //     }
    //   });

    //   console.log(JSON.stringify(final, null, 2))
    // }).catch(e => console.log(e));
  });
});
