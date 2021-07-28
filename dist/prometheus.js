const express = require('express');
const pm2 = require('pm2');

const DEBUG = /^(on|1|true|yes)$/i.test(process.env.DEBUG);

const client = require('prom-client');
const requestCounts = new client.Gauge({
  name: 'http_request_counts',
  help: 'counter for requests labeled with: method, status_code, theme, base_href, path',
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
const pm2ProcessRestarts = new client.Gauge({
  name: 'pm2_process_restarts',
  help: 'counter for pm2 process restarts',
  labelNames: ['name'],
});
const pm2Memory = new client.Gauge({
  name: 'pm2_memory',
  help: 'counter for pm2 memory',
  labelNames: ['name'],
});

const pm2CPUHistogram = new client.Histogram({
  name: 'pm2_cpu_histogram',
  help: 'average cpu usage histogram for pm2 processes',
  buckets: [0.01, 0.03, 0.05, 0.07, 0.09, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  labelNames: ['name'],
});

const pm2AverageCPU = new client.Gauge({
  name: 'pm2_cpu',
  help: 'average cpu usage for pm2 processes',
  labelNames: ['name'],
});

const pm2StatusCount = new client.Gauge({
  name: 'pm2_status_count',
  help: 'counted status of pm2 processes',
  labelNames: ['name'],
});

const pm2UnstableRestarts = new client.Gauge({
  name: 'pm2_unstable_restarts',
  help: 'counter for unstable restarts of pm2 processes',
  labelNames: ['name'],
});

const pm2ProcessUptime = new client.Gauge({
  name: 'pm2_process_uptime',
  help: 'uptime for pm2 processes',
  labelNames: ['name'],
});

const pm2ProcessCreated = new client.Gauge({
  name: 'pm2_process_create',
  help: 'creation timestamp for pm2 processes',
  labelNames: ['name'],
});

const pm2ProcessRestartTime = new client.Gauge({
  name: 'pm2_process_restart_time',
  help: 'restart time for pm2 processes',
  labelNames: ['name'],
});

const pm2ProcessUnstableRestarts = new client.Gauge({
  name: 'pm2_process_unstable_restarts',
  help: 'unstable restarts for pm2 processes',
  labelNames: ['name'],
});

const pm2ProcessMemory = new client.Gauge({
  name: 'pm2_process_memory',
  help: 'memory usage for pm2 processes',
  labelNames: ['name'],
});

const pm2ProcessCPU = new client.Gauge({
  name: 'pm2_process_cpu',
  help: 'cpu usage for pm2 processes',
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
          const pm2ProcessCounts = list.reduce((acc, p) => ({ ...acc, [p.name]: (acc[p.name] || 0) + 1 }), {});
          Object.entries(pm2ProcessCounts).forEach(([name, value]) => {
            pm2Processes.labels({ name }).set(value);
          });
          const pm2ProcessMemoryCounts = list.reduce(
            (acc, p) => ({ ...acc, [p.name]: (acc[p.name] || 0) + p.monit?.memory || 0 }),
            {}
          );
          Object.entries(pm2ProcessMemoryCounts).forEach(([name, value]) => {
            pm2Memory.labels({ name }).set(value);
          });
          const pm2Restarts = list.reduce(
            (acc, p) => ({ ...acc, [p.name]: (acc[p.name] || 0) + p.pm2_env.restart_time || 0 }),
            {}
          );
          Object.entries(pm2Restarts).forEach(([name, value]) => {
            pm2ProcessRestarts.labels({ name }).set(value);
          });

          const pm2CPUs = list.reduce(
            (acc, p) => ({
              ...acc,
              [p.name]: { sum: (acc[p.name]?.sum || 0) + p.monit.cpu, count: (acc[p.name]?.count || 0) + 1 },
            }),
            {}
          );
          Object.entries(pm2CPUs).forEach(([name, value]) => {
            pm2CPUHistogram.labels({ name }).observe(value.sum / (value.count * 100));
            pm2AverageCPU.labels({ name }).set(value.sum / (value.count * 100));
          });

          const pm2StatusCounts = list.reduce(
            (acc, p) => ({ ...acc, [p.pm2_env.status]: (acc[p.pm2_env.status] || 0) + 1 }),
            {}
          );
          Object.entries(pm2StatusCounts).forEach(([name, value]) => {
            pm2StatusCount.labels({ name }).set(value);
          });

          const pm2UnstableRestartsCounts = list.reduce(
            (acc, p) => ({ ...acc, [p.name]: (acc[p.name] || 0) + p.pm2_env.unstable_restarts }),
            {}
          );
          Object.entries(pm2UnstableRestartsCounts).forEach(([name, value]) => {
            pm2UnstableRestarts.labels({ name }).set(value);
          });

          const pm2ProcessDetails = list.reduce(
            (acc, p) => ({
              ...acc,
              [`${p.name}_${p.pid}`]: {
                uptime: p.pm2_env.pm_uptime,
                created: p.pm2_env.created_at,
                restart_time: p.pm2_env.restart_time,
                unstable_restarts: p.pm2_env.unstable_restarts,
                memory: p.monit.memory,
                cpu: p.monit.cpu,
              },
            }),
            {}
          );

          Object.entries(pm2ProcessDetails).forEach(([name, value]) => {
            pm2ProcessUptime.labels(name).set(value.uptime);
            pm2ProcessCreated.labels(name).set(value.created);
            pm2ProcessRestartTime.labels(name).set(value.restart_time);
            pm2ProcessUnstableRestarts.labels(name).set(value.unstable_restarts);
            pm2ProcessMemory.labels(name).set(value.memory);
            pm2ProcessCPU.labels(name).set(value.cpu);
          });
        }
      });
    }
  });
});

app.listen(9113, () => {
  console.log('Prometheus reporter listening');
});
