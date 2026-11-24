import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROXIED_SERVICES, PROXY_PREFIX, type ProxiedService } from '../proxiedServices';

// Checks that the container's nginx (which can't import the service list) forwards exactly the services
// the app uses. The patterns below expect nginx.conf's usual format: `location /proxy/<name>/ {` with
// single spaces. A different format fails these tests loudly.
const nginxConf = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8'); // tests run from the project folder
const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');
const services = Object.keys(PROXIED_SERVICES) as ProxiedService[];

/** The body of nginx's `location <path> { … }` block (nested blocks included), or undefined if there is none. */
const locationBlock = (path: string) => {
  const start = nginxConf.indexOf(`location ${path} {`);
  if (start === -1) return undefined;
  let depth = 0;
  for (let i = nginxConf.indexOf('{', start); i < nginxConf.length; i++) {
    if (nginxConf[i] === '{') depth++;
    if (nginxConf[i] === '}' && --depth === 0) return nginxConf.slice(nginxConf.indexOf('{', start) + 1, i);
  }
  return undefined;
};

describe('nginx forwards the services the app uses', () => {
  it.each(services.filter(service => PROXIED_SERVICES[service]))('%s goes to its target', service => {
    const block = locationBlock(`/${PROXY_PREFIX}${service}/`);
    expect(block, `nginx.conf has no "location /${PROXY_PREFIX}${service}/"`).toBeDefined();
    expect(block).toContain(`rewrite ^/${PROXY_PREFIX}${service}/(.*)$ /$1 break;`);
    expect(block).toContain(new URL(PROXIED_SERVICES[service]!).host);
  });

  it('every service without a fixed target (the engine) has its own forward or the JSON 503 for not-yet-connected services', () => {
    const catchAll = locationBlock(`/${PROXY_PREFIX}`);
    for (const service of services.filter(service => !PROXIED_SERVICES[service])) {
      const own = locationBlock(`/${PROXY_PREFIX}${service}/`);
      expect(own ?? catchAll, `nothing in nginx.conf answers /${PROXY_PREFIX}${service}/`).toBeDefined();
      if (!own) expect(catchAll).toMatch(/return 503[\s\S]*application\/json|application\/json[\s\S]*return 503/);
    }
  });

  it('forwards the engine to the address and key it is given when it starts, and answers 503 without an address', () => {
    const engine = locationBlock(`/${PROXY_PREFIX}engine/`)!;
    expect(engine).toContain('set $engine_url "$ENGINE_URL";');
    expect(engine).toMatch(/if \(\$engine_url = ""\) \{\s*return 503 '\{"error":"unavailable"/);
    expect(engine).toContain(`rewrite ^/${PROXY_PREFIX}engine/(.*)$ /$1 break;`);
    expect(engine).toContain('proxy_pass $engine_url;');
    expect(engine).toContain('proxy_set_header Authorization "Bearer $ENGINE_API_KEY";');
    expect(engine).toContain('proxy_ssl_trusted_certificate $ENGINE_CA_FILE;');
    // Longer than the engine's own limit of about 21 minutes.
    expect(engine).toContain('proxy_read_timeout 25m;');
  });

  it.each(services)('keeps the login session and the user\'s CID from %s', service => {
    const block = locationBlock(`/${PROXY_PREFIX}${service}/`)!;
    expect(block).toContain('proxy_set_header Cookie "";');
    expect(block).toContain('proxy_set_header X-Ace-User "";');
  });

  it('has defaults for the engine settings, so nginx starts without them, and no address or key in the image', () => {
    // nginx's image only fills in variables that exist; an unset one would stay as `$ENGINE_URL` and stop nginx.
    expect(dockerfile).toMatch(/ENGINE_URL=""/);
    expect(dockerfile).toMatch(/ENGINE_API_KEY=""/);
    expect(dockerfile).toMatch(/ENGINE_CA_FILE=\/etc\/ssl\/certs\/ca-certificates\.crt/);
    // No IP address or Bearer key written into either file.
    for (const file of [nginxConf, dockerfile]) {
      expect(file).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(file).not.toMatch(/Bearer [^$"]/);
    }
  });

  it('nginx forwards nothing under the proxy prefix that the app doesn\'t know about', () => {
    const forwarded = [...nginxConf.matchAll(new RegExp(`location /${PROXY_PREFIX}([a-z]+)/ \\{`, 'g'))].map(match => match[1]);
    expect(forwarded.every(name => (services as string[]).includes(name)), `unknown nginx forwards: ${forwarded}`).toBe(true);
  });
});
