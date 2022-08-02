export interface HttpError extends Error {
  status: number;
  response: {
    status: number;
    url: string;
    headers: { [key: string]: string },
    data: any,
  },
  request: {
    method: string;
    url: string;
    headers: { [key: string]: string };
    body: string;
  }
}

export function RequestError(err: Error | unknown): HttpError | Error | unknown {
  if (err !== null && typeof err === 'object' && 'response' in err) {
    return err as HttpError;
  }
  return err;
}
