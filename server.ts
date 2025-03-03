// tslint:disable: no-console ish-ordered-imports force-jsdoc-comments ban-specific-imports
import 'zone.js/node';

import * as express from 'express';
import { join } from 'path';
import * as robots from 'express-robots-txt';
import * as fs from 'fs';
import * as proxy from 'express-http-proxy';
import { AppServerModule, ICM_WEB_URL, HYBRID_MAPPING_TABLE, environment, APP_BASE_HREF } from './src/main.server';
import { ngExpressEngine } from '@nguniversal/express-engine';
import { getDeployURLFromEnv, setDeployUrlInFile } from './src/ssr/deploy-url';

const PORT = process.env.PORT || 4200;

const DEPLOY_URL = getDeployURLFromEnv();

const DIST_FOLDER = join(process.cwd(), 'dist');

const BROWSER_FOLDER = process.env.BROWSER_FOLDER || join(process.cwd(), 'dist', 'browser');

// uncomment this block to prevent ssr issues with third-party libraries regarding window, document, HTMLElement and navigator
// tslint:disable-next-line: no-commented-out-code
/*
const domino = require('domino');
const template = fs.readFileSync(join(BROWSER_FOLDER, 'index.html')).toString();
const win = domino.createWindow(template);

// tslint:disable:no-string-literal
global['window'] = win;
global['document'] = win.document;
global['HTMLElement'] = win.HTMLElement;
global['navigator'] = win.navigator;
// tslint:enable:no-string-literal
*/
// The Express app is exported so that it can be used by serverless Functions.
// not-dead-code
export function app() {
  const logging = /on|1|true|yes/.test(process.env.LOGGING?.toLowerCase());

  const ICM_BASE_URL = process.env.ICM_BASE_URL || environment.icmBaseURL;

  if (!ICM_BASE_URL) {
    console.error('ICM_BASE_URL not set');
    process.exit(1);
  }

  if (process.env.TRUST_ICM) {
    // trust https certificate if self-signed
    // see also https://medium.com/nodejs-tips/ssl-certificate-explained-fc86f8aa43d4
    // and https://github.com/angular/universal/issues/856#issuecomment-436364729
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.warn("ignoring all TLS verification as 'TRUST_ICM' variable is set - never use this in production!");
  } else {
    const [icmProtocol, icmBase] = ICM_BASE_URL.split('://');
    // check for ssl certificate should be done, if https is used
    if (icmProtocol === 'https') {
      const https = require('https');

      const [, icmHost, icmPort] = /^(.*?):?([0-9]+)?[\/]*$/.exec(icmBase);

      const options = {
        host: icmHost,
        port: icmPort || '443',
        method: 'get',
        path: '/',
      };

      const req = https.request(options, (res: { socket: { authorized: boolean } }) => {
        console.log('Certificate for', ICM_BASE_URL, 'authorized:', res.socket.authorized);
      });

      const certErrorCodes = [
        'CERT_SIGNATURE_FAILURE',
        'CERT_NOT_YET_VALID',
        'CERT_HAS_EXPIRED',
        'ERROR_IN_CERT_NOT_BEFORE_FIELD',
        'ERROR_IN_CERT_NOT_AFTER_FIELD',
        'DEPTH_ZERO_SELF_SIGNED_CERT',
        'SELF_SIGNED_CERT_IN_CHAIN',
        'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        'CERT_CHAIN_TOO_LONG',
        'CERT_REVOKED',
        'INVALID_CA',
        'INVALID_PURPOSE',
        'CERT_UNTRUSTED',
        'CERT_REJECTED',
        'HOSTNAME_MISMATCH',
      ];

      req.on('error', (e: { code: string }) => {
        if (certErrorCodes.includes(e.code)) {
          console.log(
            e.code,
            ': The given ICM_BASE_URL',
            ICM_BASE_URL,
            "has a certificate problem. Please set 'TRUST_ICM' variable to avoid further errors for all requests to the ICM_BASE_URL - never use this in production!"
          );
        } else {
          console.error(e);
        }
      });

      req.end();
    }
  }

  // Express server
  const server = express();

  // Our Universal express-engine (found @ https://github.com/angular/universal/tree/master/modules/express-engine)
  server.engine(
    'html',
    ngExpressEngine({
      bootstrap: AppServerModule,
      providers: [{ provide: 'SSR_HYBRID', useValue: !!process.env.SSR_HYBRID }],
      inlineCriticalCss: false,
    })
  );

  server.set('view engine', 'html');
  server.set('views', BROWSER_FOLDER);

  if (logging) {
    server.use(
      require('morgan')('tiny', {
        skip: (req: express.Request) => req.originalUrl.startsWith('/INTERSHOP/static'),
      })
    );
  }

  // seo robots.txt
  const pathToRobotsTxt = join(DIST_FOLDER, 'robots.txt');
  if (fs.existsSync(pathToRobotsTxt)) {
    server.use(robots(pathToRobotsTxt));
  } else {
    server.use(
      robots({
        UserAgent: '*',
        Disallow: [
          '/error',
          '/account',
          '/compare',
          '/recently',
          '/basket',
          '/checkout',
          '/register',
          '/login',
          '/logout',
          '/forgotPassword',
          '/contact',
        ],
      })
    );
  }

  // Serve static files from browser folder
  server.get(/\/.*\.(js|css)$/, (req, res) => {
    const path = req.originalUrl.substring(1);
    fs.readFile(join(BROWSER_FOLDER, path), { encoding: 'utf-8' }, (err, data) => {
      if (err) {
        res.sendStatus(404);
      } else {
        res.set('Content-Type', (path.endsWith('css') ? 'text/css' : 'application/javascript') + '; charset=UTF-8');
        res.send(setDeployUrlInFile(DEPLOY_URL, path, data));
      }
    });
  });
  server.get(
    '*.*',
    express.static(BROWSER_FOLDER, {
      setHeaders: (res, path) => {
        if (/\.[0-9a-f]{20,}\./.test(path)) {
          // file was output-hashed -> 1y
          res.set('Cache-Control', 'public, max-age=31557600');
        } else {
          // file should be re-checked more frequently -> 5m
          res.set('Cache-Control', 'public, max-age=300');
        }
        // add cors headers for required resources
        if (
          DEPLOY_URL.startsWith('http') &&
          ['manifest.webmanifest', 'woff2', 'woff', 'json'].some(match => path.endsWith(match))
        ) {
          res.set('access-control-allow-origin', '*');
        }
      },
    })
  );

  const icmProxy = proxy(ICM_BASE_URL, {
    // preserve original path
    proxyReqPathResolver: (req: express.Request) => req.originalUrl,
    // tslint:disable-next-line: no-any
    proxyReqOptDecorator: (options: any) => {
      if (process.env.TRUST_ICM) {
        // https://github.com/villadora/express-http-proxy#q-how-to-ignore-self-signed-certificates-
        options.rejectUnauthorized = false;
      }
      return options;
    },
    // fool ICM so it thinks it's running here
    // https://www.npmjs.com/package/express-http-proxy#preservehosthdr
    preserveHostHdr: true,
  });

  const angularUniversal = (req: express.Request, res: express.Response) => {
    if (logging) {
      console.log(`SSR ${req.originalUrl}`);
    }

    if (req.originalUrl.startsWith('/assets/')) {
      if (logging) {
        console.log(`RES 404 ${req.originalUrl} - cannot serve static assets with Angular Universal`);
      }
      return res.sendStatus(404);
    }

    if (req.headers.accept) {
      const accept = req.headers.accept.toLowerCase();
      if (!accept.includes('html') && ['css', 'image', 'json', 'javascript'].some(inc => accept.includes(inc))) {
        if (logging) {
          console.log(`RES 404 ${req.originalUrl} - accept header mismatch '${accept}'`);
        }
        return res.sendStatus(404);
      }
    }

    // find last baseHref parameter
    const regex = /baseHref=([^;\?\#]*)/g;
    let baseHref = '/';
    for (let match: RegExpExecArray; (match = regex.exec(req.originalUrl)); ) {
      baseHref = match[1].replace(/%25/g, '%').replace(/%2F/g, '/');
    }

    res.render(
      'index',
      {
        req,
        res,
        providers: [{ provide: APP_BASE_HREF, useValue: baseHref }],
      },
      (err, html) => {
        if (html) {
          let newHtml = html;
          if (process.env.PROXY_ICM && req.get('host')) {
            newHtml = newHtml.replace(
              new RegExp(ICM_BASE_URL, 'g'),
              process.env.PROXY_ICM.startsWith('http') ? process.env.PROXY_ICM : `${req.protocol}://${req.get('host')}`
            );
          }
          newHtml = newHtml.replace(/<base href="[^>]*>/, `<base href="${baseHref}" />`);

          newHtml = setDeployUrlInFile(DEPLOY_URL, req.originalUrl, newHtml);

          res.status(res.statusCode).send(newHtml);
        } else {
          res.status(500).send(err.message);
        }
        if (logging) {
          console.log(`RES ${res.statusCode} ${req.originalUrl}`);
          if (err) {
            console.log(err);
          }
        }
      }
    );
  };

  const hybridRedirect = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const url = req.originalUrl;
    let newUrl: string;
    for (const entry of HYBRID_MAPPING_TABLE) {
      const icmUrlRegex = new RegExp(entry.icm);
      const pwaUrlRegex = new RegExp(entry.pwa);
      if (icmUrlRegex.exec(url) && entry.handledBy === 'pwa') {
        newUrl = url.replace(icmUrlRegex, '/' + entry.pwaBuild);
        break;
      } else if (pwaUrlRegex.exec(url) && entry.handledBy === 'icm') {
        const config: { [is: string]: string } = {};
        if (/;lang=[\w_]+/.test(url)) {
          const [, lang] = /;lang=([\w_]+)/.exec(url);
          config.lang = lang;
        }
        if (!config.lang) {
          config.lang = environment.defaultLocale;
        }

        if (/;currency=[\w_]+/.test(url)) {
          const [, currency] = /;currency=([\w_]+)/.exec(url);
          config.currency = currency;
        }

        if (/;channel=[^;]*/.test(url)) {
          config.channel = /;channel=([^;]*)/.exec(url)[1];
        } else {
          config.channel = environment.icmChannel;
        }

        if (/;application=[^;]*/.test(url)) {
          config.application = /;application=([^;]*)/.exec(url)[1];
        } else {
          config.application = environment.icmApplication || '-';
        }

        const build = [ICM_WEB_URL, entry.icmBuild]
          .join('/')
          .replace(/\$<(\w+)>/g, (match, group) => config[group] || match);
        newUrl = url.replace(pwaUrlRegex, build).replace(/;.*/g, '');
        break;
      }
    }
    if (newUrl) {
      if (logging) {
        console.log('RED', newUrl);
      }
      res.redirect(301, newUrl);
    } else {
      next();
    }
  };

  if (process.env.SSR_HYBRID) {
    server.use('*', hybridRedirect);
  }

  if (process.env.PROXY_ICM || process.env.SSR_HYBRID) {
    console.log("making ICM available for all requests to '/INTERSHOP'");
    server.use('/INTERSHOP', icmProxy);
  }

  if (/^(on|1|true|yes)$/i.test(process.env.PROMETHEUS)) {
    const axios = require('axios');
    const onFinished = require('on-finished');

    server.use((req, res, next) => {
      const start = Date.now();
      onFinished(res, () => {
        const duration = Date.now() - start;
        axios
          .post('http://localhost:9113/report', {
            theme: THEME,
            method: req.method,
            status: res.statusCode,
            duration,
            url: req.originalUrl,
          })
          .then((reportRes: { status: number; statusText: string; data: unknown }) => {
            if (reportRes.status !== 204) {
              console.error(
                'ERROR unexpected return from Prometheus:',
                reportRes.status,
                reportRes.statusText,
                reportRes.data
              );
            }
          })
          .catch((error: Error) => {
            console.error('ERROR reporting to Prometheus:', error.message);
          });
      });
      next();
    });
  }

  // All regular routes use the Universal engine
  server.use('*', angularUniversal);

  console.log('ICM_BASE_URL is', ICM_BASE_URL);

  return server;
}

function run() {
  if (process.env.SSL) {
    const https = require('https');
    const privateKey = fs.readFileSync(join(DIST_FOLDER, 'server.key'), 'utf8');
    const certificate = fs.readFileSync(join(DIST_FOLDER, 'server.crt'), 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    https.createServer(credentials, app()).listen(PORT);

    console.log(`Node Express server listening on https://${require('os').hostname()}:${PORT}`);
  } else {
    const http = require('http');

    http.createServer(app()).listen(PORT);

    console.log(`Node Express server listening on http://${require('os').hostname()}:${PORT}`);
  }
  console.log('serving static files from', BROWSER_FOLDER);
}

// Webpack will replace 'require' with '__webpack_require__'
// '__non_webpack_require__' is a proxy to Node 'require'
// The below code is to ensure that the server is run only when not requiring the bundle.
declare const __non_webpack_require__: NodeRequire;

const mainModule = __non_webpack_require__.main;

const moduleFilename = (mainModule && mainModule.filename) || '';

if (moduleFilename === __filename || moduleFilename.includes('iisnode')) {
  run();
}

export * from './src/main.server';
