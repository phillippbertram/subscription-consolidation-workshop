// The URL scheme that Auth0 redirects back to. It is also declared as `scheme`
// in app.config.ts. The callback URL registered in Auth0 has the form
// `premiumpass://<domain>/<platform>/<application id>/callback`; the device
// info panel derives its expected value from this constant.
export const authScheme = 'premiumpass';
