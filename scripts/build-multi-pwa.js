const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const configurations = (process.env.npm_config_active_themes || process.env.npm_package_config_active_themes)
  .split(',')
  .map((theme, index) => ({ theme, port: 4000 + index }));

const builds = [];

if (process.argv.length === 2 || process.argv[2] === 'client')
  builds.push(
    ...configurations.map(
      ({ theme }) =>
        `build client --configuration=${theme},production -- --output-path=dist/${theme}/browser --progress=false`
    )
  );

if (process.argv.length === 2 || process.argv[2] === 'server')
  builds.push(
    ...configurations.map(
      ({ theme }) =>
        `build server --configuration=${theme},production -- --output-path=dist/${theme}/server --progress=false`
    )
  );

const cores = Math.round(require('os').cpus().length / 3) || 1;
const parallel = cores === 1 ? [] : ['--max-parallel', cores, '--parallel'];
if (parallel) {
  console.log(`Using ${cores} cores for multi compile.`);
}

const result = cp.spawnSync(
  path.join('node_modules', '.bin', 'npm-run-all' + (process.platform === 'win32' ? '.cmd' : '')),
  ['ngcc', ...parallel, ...builds],
  {
    stdio: 'inherit',
  }
);
if (result.status !== 0) {
  process.exit(result.status);
}

fs.writeFileSync(
  'dist/ecosystem-ports.js',
  `exports.ports = {
${configurations.map(config => `    '${config.theme}': ${config.port},`).join('\n')}
}
`
);

configurations.forEach(({ theme }) => {
  fs.writeFileSync(
    `dist/${theme}/run-standalone.js`,
    `const path = require('path');
process.env.BROWSER_FOLDER = path.join(__dirname, 'browser');
require('child_process').fork(path.join(__dirname, 'server', 'main'));
`
  );
});
