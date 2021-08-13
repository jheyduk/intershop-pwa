const express = require('express');
const pm2 = require('pm2');

let ports = require('./ecosystem-ports').ports;

if (process.env.ACTIVE_THEMES) {
  const active = process.env.ACTIVE_THEMES.split(',');
  ports = Object.entries(ports)
    .filter(([theme]) => active.includes(theme))
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
}

const DEBUG = /^(on|1|true|yes)$/i.test(process.env.DEBUG);

const client = require('prom-client');
const requestCounts = new client.Gauge({
  name: 'http_request_counts',
  help: 'counter for requests labeled with: method, status_code, theme, base_href, path',
  labelNames: ['method', 'status_code', 'theme', 'base_href', 'path'],
});
const statusCodeCounts = new client.Gauge({
  name: 'http_request_status_code_counts',
  help: 'counter for requests labeled with: status_code',
  labelNames: ['method', 'status_code', 'theme', 'base_href', 'path'],
});
const requestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'duration histogram of http responses labeled with: status_code, theme',
  buckets: [0.1, 0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30],
  labelNames: ['status_code', 'theme', 'base_href', 'path'],
});

const up = new client.Gauge({
  name: 'up',
  help: '1 = up, 0 = not up',
});
up.set({}, 1);

const pm2Processes = new client.Gauge({
  name: 'pm2_processes',
  help: 'counter for pm2 processes',
  labelNames: ['name'],
});

const pm2ProcessUptime = new client.Gauge({
  name: 'pm2_process_uptime',
  help: 'uptime for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessCreated = new client.Gauge({
  name: 'pm2_process_create',
  help: 'creation timestamp for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessRestarts = new client.Gauge({
  name: 'pm2_process_restarts',
  help: 'restarts of pm2 process',
  labelNames: ['name', 'pid'],
});

const pm2ProcessUnstableRestarts = new client.Gauge({
  name: 'pm2_process_unstable_restarts',
  help: 'unstable restarts for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessMemory = new client.Gauge({
  name: 'pm2_process_memory',
  help: 'memory usage for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessMemoryArrayBuffers = new client.Gauge({
  name: 'pm2_process_memory_array_buffers',
  help: 'array buffers for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessMemoryExternal = new client.Gauge({
  name: 'pm2_process_memory_external',
  help: 'memory external usage for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessMemoryHeapUsed = new client.Gauge({
  name: 'pm2_process_memory_heap_used',
  help: 'memory heap used for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessMemoryHeapTotal = new client.Gauge({
  name: 'pm2_process_memory_heap_total',
  help: 'memory heap total for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessMemoryRSS = new client.Gauge({
  name: 'pm2_process_memory_rss',
  help: 'memory rss usage for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessCPU = new client.Gauge({
  name: 'pm2_process_cpu',
  help: 'cpu usage for pm2 processes',
  labelNames: ['name', 'pid'],
});

const pm2ProcessStatusOnline = new client.Gauge({
  name: 'pm2_process_status_online',
  help: 'status for pm2 process is online',
  labelNames: ['name'],
});

const pm2ProcessStatusLaunching = new client.Gauge({
  name: 'pm2_process_status_launching',
  help: 'status for pm2 process is launching',
  labelNames: ['name'],
});

const pm2ProcessStatusStopped = new client.Gauge({
  name: 'pm2_process_status_stopped',
  help: 'status for pm2 process is stopped',
  labelNames: ['name'],
});

const pm2ProcessStatusErrored = new client.Gauge({
  name: 'pm2_process_status_errored',
  help: 'status for pm2 process is errored',
  labelNames: ['name'],
});

const app = express();

app.post('/report', (req, res) => {
  req.on('data', data => {
    if (DEBUG) {
      console.log(data.toString());
    }
    const json = JSON.parse(data);
    const { method, status: status_code, duration, theme, url } = json;
    const matched = /;baseHref=([^;?]*)/.exec(url);
    let base_href = matched?.[1] ? decodeURIComponent(decodeURIComponent(matched[1])) + '/' : '/';
    let cleanUrl = url.replace(/[;?].*/g, '');
    let path = cleanUrl.replace(base_href, '');

    requestCounts.inc({ method, status_code, theme, base_href, path });
    statusCodeCounts.inc({ status_code });
    requestDuration.labels({ status_code, theme, base_href, path }).observe(duration / 1000);
  });
  res.status(204).send();
});

app.get('/metrics', async (_, res) => {
  const metrics = await client.register.metrics();
  if (DEBUG) {
    console.log(metrics);
  }
  res.set('Content-Type', client.register.contentType);
  res.send(metrics);

  pm2.connect(err1 => {
    if (!err1) {
      pm2.list((err2, list) => {
        if (!err2) {
          console.log(list);
          Object.entries(ports).map(([theme]) =>
            list
              .filter(item => item.name === theme)
              .map(element =>
                pm2.sendDataToProcessId(element.pm2_env.pm_id, {
                  type: 'process:msg',
                  data: {},
                  topic: 'process memory',
                })
              )
          );

          pm2.launchBus(function (err, pm2_bus) {
            if (!err) {
              pm2_bus.on('process:memory', function (packet) {
                pm2ProcessMemoryArrayBuffers
                  .labels({ name: packet.process.name, pid: packet.process.pm_id })
                  .set(packet.data.memoryUsage.arrayBuffers);
                pm2ProcessMemoryExternal
                  .labels({ name: packet.process.name, pid: packet.process.pm_id })
                  .set(packet.data.memoryUsage.external);
                pm2ProcessMemoryHeapUsed
                  .labels({ name: packet.process.name, pid: packet.process.pm_id })
                  .set(packet.data.memoryUsage.heapUsed);
                pm2ProcessMemoryHeapTotal
                  .labels({ name: packet.process.name, pid: packet.process.pm_id })
                  .set(packet.data.memoryUsage.heapTotal);
                pm2ProcessMemoryRSS
                  .labels({ name: packet.process.name, pid: packet.process.pm_id })
                  .set(packet.data.memoryUsage.rss);
              });
            }
          });

          const pm2ProcessCounts = list.reduce((acc, p) => ({ ...acc, [p.name]: (acc[p.name] || 0) + 1 }), {});
          Object.entries(pm2ProcessCounts).forEach(([name, value]) => {
            pm2Processes.labels({ name }).set(value);

            pm2ProcessStatusOnline.labels({ name }).set(0);
            pm2ProcessStatusLaunching.labels({ name }).set(0);
            pm2ProcessStatusStopped.labels({ name }).set(0);
            pm2ProcessStatusErrored.labels({ name }).set(0);
          });

          const pm2ProcessDetails = list.reduce(
            (acc, p) => ({
              ...acc,
              [p.pm_id]: {
                name: p.name,
                uptime: p.pm2_env.pm_uptime,
                created: p.pm2_env.created_at,
                restart_time: p.pm2_env.restart_time,
                unstable_restarts: p.pm2_env.unstable_restarts,
                memory: p.monit.memory,
                cpu: p.monit.cpu,
                status: p.pm2_env.status,
              },
            }),
            {}
          );

          Object.entries(pm2ProcessDetails).forEach(([pid, value]) => {
            pm2ProcessUptime.labels({ name: value.name, pid }).set(value.uptime);
            pm2ProcessCreated.labels({ name: value.name, pid }).set(value.created);
            pm2ProcessRestarts.labels({ name: value.name, pid }).set(value.restart_time);
            pm2ProcessUnstableRestarts.labels({ name: value.name, pid }).set(value.unstable_restarts);
            pm2ProcessMemory.labels({ name: value.name, pid }).set(value.memory);
            pm2ProcessCPU.labels({ name: value.name, pid }).set(value.cpu);

            if (value.status === 'online') {
              pm2ProcessStatusOnline.labels({ name: value.name }).inc();
            } else if (value.status === 'launching') {
              pm2ProcessStatusLaunching.labels({ name: value.name }).inc();
            } else if (value.status === 'stopped') {
              pm2ProcessStatusStopped.labels({ name: value.name }).inc();
            } else if (value.status === 'errored') {
              pm2ProcessStatusErrored.labels({ name: value.name }).inc();
            }
          });
        }
      });
    }
  });
});

app.listen(9113, () => {
  console.log('Prometheus reporter listening');
});
