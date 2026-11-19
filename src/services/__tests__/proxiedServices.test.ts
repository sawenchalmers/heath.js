import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROXIED_SERVICES, PROXY_PREFIX, type ProxiedService } from '../proxiedServices';

// Checks that the container's nginx (which can't import the service list) forwards exactly the services
// the app uses. The patterns below expect nginx.conf's usual format: `location /proxy/<name>/ {` with
// single spaces, and no `}` inside a location block. A different format fails these tests loudly.
const nginxConf = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8'); // tests run from the project folder
const services = Object.keys(PROXIED_SERVICES) as ProxiedService[];

/** The body of nginx's `location <path> { … }` block, or undefined if there is none. */
const locationBlock = (path: string) =>
  new RegExp(`location ${path.replace(/[.*+?^${}()|[\]\/]/g, '\$&')} \{([^}]*)\}`).exec(nginxConf)?.[1];

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

  it('nginx forwards nothing under the proxy prefix that the app doesn\'t know about', () => {
    const forwarded = [...nginxConf.matchAll(new RegExp(`location /${PROXY_PREFIX}([a-z]+)/ \{`, 'g'))].map(match => match[1]);
    expect(forwarded.every(name => (services as string[]).includes(name)), `unknown nginx forwards: ${forwarded}`).toBe(true);
  });
});
