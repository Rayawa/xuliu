interface SessionCookie { name: string; value: string; path: string; expiresAt: number; }

/** A single-origin, memory-only jar. Callers never forward these cookies to image hosts. */
export class SessionCookies {
  private cookies: SessionCookie[] = [];

  header(path: string): string {
    const requestPath = path.split('?')[0];
    this.cookies = this.cookies.filter((cookie) => cookie.expiresAt > Date.now());
    return this.cookies.filter((cookie) => requestPath === cookie.path || requestPath.startsWith(cookie.path.endsWith('/') ? cookie.path : `${cookie.path}/`))
      .sort((left, right) => right.path.length - left.path.length).map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  }

  accept(values: string[], requestPath: string, host: string): void {
    for (const value of values) {
      // NetworkKit can return an array or a combined Set-Cookie header. Expires contains a comma, but no cookie assignment.
      for (const raw of value.split(/,(?=\s*[!#$%&'*+.^_`|~0-9A-Za-z-]+=)/)) this.acceptOne(raw, requestPath, host);
    }
  }

  private acceptOne(raw: string, requestPath: string, host: string): void {
    if (raw.length > 8192 || /[\r\n]/.test(raw)) return;
    const parts = raw.split(';').map((part) => part.trim()); const pair = parts.shift() ?? ''; const equal = pair.indexOf('=');
    if (equal <= 0) return;
    const name = pair.slice(0, equal); const value = pair.slice(equal + 1);
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(name) || /[\x00-\x20\x7f;,]/.test(value)) return;
    const pathname = requestPath.split('?')[0]; const lastSlash = pathname.lastIndexOf('/');
    let path = lastSlash > 0 ? pathname.slice(0, lastSlash) : '/'; let expiresAt = Number.MAX_SAFE_INTEGER; let maxAge: number | undefined;
    for (const attribute of parts) {
      const index = attribute.indexOf('='); const key = (index < 0 ? attribute : attribute.slice(0, index)).toLowerCase();
      const content = index < 0 ? '' : attribute.slice(index + 1);
      if (key === 'domain' && content.replace(/^\./, '').toLowerCase() !== host.toLowerCase()) return;
      if (key === 'path' && content.startsWith('/') && content.length <= 1000 && !/[\x00-\x20\x7f]/.test(content)) path = content;
      if (key === 'expires' && Number.isFinite(Date.parse(content))) expiresAt = Date.parse(content);
      if (key === 'max-age' && /^-?\d+$/.test(content)) maxAge = Number(content);
    }
    if (maxAge !== undefined) expiresAt = maxAge <= 0 ? 0 : Math.min(Number.MAX_SAFE_INTEGER, Date.now() + maxAge * 1000);
    this.cookies = this.cookies.filter((cookie) => cookie.expiresAt > Date.now() && !(cookie.name === name && cookie.path === path));
    if (expiresAt > Date.now() && this.cookies.length < 32) this.cookies.push({ name, value, path, expiresAt });
  }

  clearPath(path: string): void { this.cookies = this.cookies.filter((cookie) => cookie.path !== path && !cookie.path.startsWith(`${path}/`)); }
  clear(): void { this.cookies = []; }
}
