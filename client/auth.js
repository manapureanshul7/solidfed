// // auth.js
// const { Session } = require('@inrupt/solid-client-authn-node');
// const readline = require('readline/promises');
// const { stdin: input, stdout: output } = require('process');

// async function promptCredentials() {
//   const rl = readline.createInterface({ input, output });
//   const clientId     = await rl.question('Enter your Token Identifier: ');
//   const clientSecret = await rl.question('Enter your Token Secret: ');
//   rl.close();
//   return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
// }

// /**
//  * Logs in via Client Credentials grant (no browser redirect).
//  * @returns {Promise<Session>} an authenticated Session
//  */
// async function loginWithClientCreds() {
//   const { clientId, clientSecret } = await promptCredentials();
//   const session = new Session();

//   await session.login({
//     oidcIssuer:   'https://solidcommunity.net',
//     clientId,
//     clientSecret,
//   });

//   if (!session.info.isLoggedIn) {
//     throw new Error('Login failed');
//   }
//   console.log(`✅ Logged in as ${session.info.webId}`);
//   return session;
// }

// module.exports = { loginWithClientCreds };

// client/auth.js
require('dotenv').config();

const { Session } = require('@inrupt/solid-client-authn-node');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');

async function promptCredentials() {
  const rl = readline.createInterface({ input, output });
  const clientId     = await rl.question('Enter your Token Identifier: ');
  const clientSecret = await rl.question('Enter your Token Secret: ');
  rl.close();
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

/**
 * Logs in via Client Credentials grant (no browser redirect).
 * Falls back to interactive prompt if env vars are missing.
 */
async function loginWithClientCreds() {
  // 1) Try loading from .env
  let clientId     = process.env.SOLID_CLIENT_ID;
  let clientSecret = process.env.SOLID_CLIENT_SECRET;
  const oidcIssuer = process.env.SOLID_OIDC_ISSUER || 'https://solidcommunity.net';

  // 2) If either is missing, prompt the user
  if (!clientId || !clientSecret) {
    console.log('🔑 Client ID/Secret not found in .env, please enter manually:');
    const creds = await promptCredentials();
    clientId     = creds.clientId;
    clientSecret = creds.clientSecret;
  }

  // 3) Perform the login
  const session = new Session();
  await session.login({
    oidcIssuer,
    clientId,
    clientSecret,
  });

  if (!session.info.isLoggedIn) {
    throw new Error('Login failed');
  }
  console.log(`✅ Logged in as ${session.info.webId}`);
  return session;
}

module.exports = { loginWithClientCreds };
