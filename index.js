const fs = require('fs');
const path = require('path');
const lodash = require('lodash');
const cliArg = process.argv.slice(2);
const homedir = require('os').homedir();


const pathToHydra = `${homedir}/Code/Procore/procore/hydra_clients`;

fs.readdir(pathToHydra, function(err, filenames) {
  const gatherBugsnags = filenames.map((filename) => {
    var path = `${pathToHydra}/${filename}/package.json`

    return new Promise((resolve) => {
      fs.readFile(path, 'utf8', function (err, data) {
        if (err) throw err;
        var obj = JSON.parse(data);

        resolve({
          hydraClient: filename,
          hasBugsnag: false,
        });
      });
    });
  });

  const gatherTests = filenames.map((filename) => {
    var path = `${pathToHydra}/${filename}/package.json`

    return new Promise((resolve) => {
      fs.readFile(path, 'utf8', function (err, data) {
        if (err) throw err;
        var obj = JSON.parse(data);

        var hasTests = obj.scripts.test !== 'true';
        resolve({
          hydraClient: filename,
          hasTests,
        });
      });
    });
  });

  Promise.all([...gatherTests, ...gatherBugsnags]).then((allFiles) => {
    const grouped = lodash.groupBy(allFiles, 'hydraClient');

    const final = Object.keys(grouped).map(key => {
      const withoutName = grouped[key].reduce((acc, g) => {
        const { hydraClient: currHC, ...currRest } = g;
        const { hydraClient: accHC, ...accRest } = acc;

        return {
          ...accRest,
          ...currRest,
        };
      });

      return {
        [key]: withoutName,
      }
    });

    console.log(JSON.stringify(final, null, 2))
  }).catch(e => console.log(e));
});
