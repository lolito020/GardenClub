import Cookies from 'js-cookie';

const COOKIE_NAME = 'gcp_token';

export class AuthClient {
  static async authenticatedFetch(url: string, options: RequestInit = {}) {
    const token = Cookies.get(COOKIE_NAME);

    // Normalizamos headers sin perder los que vengan en options
    const headers = new Headers(options.headers || {});
    const body: any = options.body;

    const isForm =
      typeof FormData !== 'undefined' && body instanceof FormData;

    const isUrlEncoded =
      typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;

    // Si es FormData/URLSearchParams, NO seteamos Content-Type (lo hace el navegador).
    // Si no lo es, y no vino seteado, usamos application/json por defecto.
    if (isForm || isUrlEncoded) {
      if (headers.has('Content-Type')) headers.delete('Content-Type');
    } else if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(url, {
      ...options,
      headers,
      // útil si usas cookies de sesión; no interfiere con tokens
      credentials: options.credentials ?? 'include',
    });
  }

  static getToken(): string | undefined {
    return Cookies.get(COOKIE_NAME);
  }

  static removeToken(): void {
    Cookies.remove(COOKIE_NAME);
  }

  static isAuthenticated(): boolean {
    return !!this.getToken();
  }
}
