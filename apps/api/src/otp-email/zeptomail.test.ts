import { describe, expect, it } from 'vitest';
import { parseEmailFrom, zeptoMailOtpSender } from './zeptomail';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(response: Response = new Response('{}', { status: 201 })) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response;
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const message = { email: 'ania@example.com', otp: '123456', type: 'sign-in' as const, locale: 'en' as const };

describe('zeptoMailOtpSender', () => {
  it('sends the code through the ZeptoMail Send Mail API', async () => {
    const { calls, fetch } = fakeFetch();
    const sender = zeptoMailOtpSender({ token: 'secret-token', fetch });

    await sender.send(message);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe('https://api.zeptomail.eu/v1.1/email');
    expect(call!.init.method).toBe('POST');
    const headers = new Headers(call!.init.headers);
    expect(headers.get('authorization')).toBe('Zoho-enczapikey secret-token');
    expect(headers.get('content-type')).toBe('application/json');
    const body = JSON.parse(String(call!.init.body));
    expect(body.from).toEqual({ address: 'no-reply@kwitz.app', name: 'Kwitz' });
    expect(body.to).toEqual([{ email_address: { address: 'ania@example.com' } }]);
    expect(body.subject).toBe('Your Kwitz sign-in code: 123456');
    expect(body.htmlbody).toContain('123456');
    expect(body.textbody).toContain('123456');
    expect(body.textbody).toContain('5 minutes');
  });

  it('uses the configured API host and sender, and writes in the message locale', async () => {
    const { calls, fetch } = fakeFetch();
    const sender = zeptoMailOtpSender({
      token: 'Zoho-enczapikey secret-token',
      apiUrl: 'https://api.zeptomail.example/',
      from: 'Kwitz Staging <stage@kwitz.app>',
      fetch,
    });

    await sender.send({ ...message, locale: 'pl' });

    const [call] = calls;
    expect(call!.url).toBe('https://api.zeptomail.example/v1.1/email');
    // A token pasted with its scheme from the console is not doubled.
    expect(new Headers(call!.init.headers).get('authorization')).toBe('Zoho-enczapikey secret-token');
    const body = JSON.parse(String(call!.init.body));
    expect(body.from).toEqual({ address: 'stage@kwitz.app', name: 'Kwitz Staging' });
    expect(body.subject).toBe('Twój kod logowania do Kwitz: 123456');
  });

  it('rejects a non-2xx response without the email, code, token or response body', async () => {
    const response = new Response('{"error":{"details":[{"target":"ania@example.com"}]}}', { status: 401 });
    const { fetch } = fakeFetch(response);
    const sender = zeptoMailOtpSender({ token: 'secret-token', fetch });

    const error: unknown = await sender.send(message).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    const text = String((error as Error).message);
    expect(text).toContain('401');
    for (const secret of ['ania@example.com', '123456', 'secret-token']) expect(text).not.toContain(secret);
  });

  it('rejects when the request fails', async () => {
    const fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;
    const sender = zeptoMailOtpSender({ token: 'secret-token', fetch });

    await expect(sender.send(message)).rejects.toThrow('ZeptoMail request failed');
  });
});

describe('parseEmailFrom', () => {
  it('reads a display name and address', () => {
    expect(parseEmailFrom('Kwitz <no-reply@kwitz.app>')).toEqual({ name: 'Kwitz', address: 'no-reply@kwitz.app' });
  });

  it('reads a bare address', () => {
    expect(parseEmailFrom('no-reply@kwitz.app')).toEqual({ address: 'no-reply@kwitz.app' });
  });

  it('rejects something that is not an address', () => {
    expect(() => parseEmailFrom('Kwitz')).toThrow();
  });
});
