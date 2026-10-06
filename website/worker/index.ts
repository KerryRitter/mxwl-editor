interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url);
    if (
      url.hostname === 'mxwl.work' ||
      (url.hostname === 'www.mxwl.work' && url.protocol === 'http:')
    ) {
      url.protocol = 'https:';
      if (url.hostname === 'mxwl.work') url.hostname = 'www.mxwl.work';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
