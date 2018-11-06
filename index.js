const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const npm = require("npm");
const mkdirp = require("mkdirp");
const lodash = require("lodash");
const cliArg = process.argv.slice(2);
const homedir = require("os").homedir();

const pathToHydra = `${homedir}/Code/Procore/procore/hydra_clients`;
const pathToSrc = `${process.cwd()}/.tmp/hydra_clients`;

mkdirp(pathToSrc, err => {
  if (err) {
    console.log(err);
  } else {
    fs.readdir(pathToHydra, function(err, filenames) {
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
        // const gatherAudit = allFiles.map(file => {
        // TODO: Move below promises into this mapping function
        // });

        const file1 = new Promise((resolve, reject) => {
          const first = allFiles[0];
          console.log("installing:", first);
          process.chdir(path.dirname(first));
          exec("yarn audit --json", (err, stdout, stderr) => {
            console.log(stderr);
            const formatted = stdout.trim().split(/\r?\n/);
            resolve({ one: formatted });
          });
        });

        const file2 = new Promise((resolve, reject) => {
          const second = allFiles[1];
          console.log("installing:", second);
          process.chdir(path.dirname(second));
          exec("yarn audit --json", (err, stdout, stderr) => {
            console.log(stderr);
            const formatted = stdout.trim().split(/\r?\n/);
            resolve({ two: formatted });
          });
        });

        Promise.all([file1, file2])
          .then(af => {
            console.log(af);
          })
          .catch(e => console.log("bad clients:", e));
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
  }
});
